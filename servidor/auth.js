// Acceso al panel privado sin base de datos:
//  - La contraseña es la variable de entorno CLAVE_PANEL (en Vercel se pone en
//    Settings > Environment Variables; en tu PC, en el archivo .env).
//  - La sesión es una cookie firmada: contiene la fecha de caducidad y está
//    firmada con una clave derivada de CLAVE_PANEL, así que nadie puede
//    fabricarla. Si cambias la contraseña, todas las sesiones dejan de valer.
//  - "Cerrar sesión en todos los dispositivos" sube un número de versión
//    guardado en el contenido y las cookies antiguas dejan de servir.
import crypto from 'node:crypto';
import { config } from './config.js';
import { leerContenido } from './contenido.js';

const NOMBRE_COOKIE = 'snoker_sesion';

const clave = () => String(process.env.CLAVE_PANEL || '');

// Estado de la configuración de la contraseña (para avisar en la pantalla de acceso).
export function estadoClave() {
  const valor = clave();
  if (!valor) return 'falta';
  if (valor.length < config.longitudMinimaClave) return 'corta';
  return 'ok';
}

// Compara la contraseña escrita con la configurada sin revelar nada por el
// tiempo que tarda la comparación.
export function comprobarClave(intento) {
  if (estadoClave() !== 'ok' || typeof intento !== 'string') return false;
  const a = crypto.createHash('sha256').update(intento).digest();
  const b = crypto.createHash('sha256').update(clave()).digest();
  return crypto.timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// Cookies firmadas
// ---------------------------------------------------------------------------

const claveFirma = () => crypto.createHmac('sha256', 'snoker-art:firma-de-sesiones').update(clave()).digest();
const firmar = (texto) => crypto.createHmac('sha256', claveFirma()).update(texto).digest('base64url');

function leerCookie(req) {
  for (const parte of (req.headers.cookie || '').split(';')) {
    const [nombre, ...resto] = parte.trim().split('=');
    if (nombre === NOMBRE_COOKIE) return decodeURIComponent(resto.join('='));
  }
  return null;
}

function escribirCookie(res, valor, segundos) {
  const partes = [`${NOMBRE_COOKIE}=${encodeURIComponent(valor)}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${segundos}`];
  if (config.cookieSegura) partes.push('Secure');
  res.append('Set-Cookie', partes.join('; '));
}

export function crearSesion(res, versionSesion) {
  const segundos = config.diasSesion * 24 * 60 * 60;
  const datos = { c: Date.now() + segundos * 1000, v: versionSesion, n: crypto.randomBytes(8).toString('base64url') };
  const contenido = Buffer.from(JSON.stringify(datos)).toString('base64url');
  escribirCookie(res, `${contenido}.${firmar(contenido)}`, segundos);
}

export function cerrarSesion(res) {
  escribirCookie(res, '', 0);
}

// Devuelve true si la cookie es auténtica, no ha caducado y no se ha cerrado
// la sesión en todos los dispositivos.
export async function sesionValida(req) {
  if (estadoClave() !== 'ok') return false;
  const cookie = leerCookie(req);
  if (!cookie || !cookie.includes('.')) return false;
  const [contenido, firma] = cookie.split('.');
  const esperada = firmar(contenido);
  if (!firma || firma.length !== esperada.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(esperada))) return false;
  let datos;
  try {
    datos = JSON.parse(Buffer.from(contenido, 'base64url').toString('utf8'));
  } catch {
    return false;
  }
  if (!datos.c || datos.c < Date.now()) return false;
  const { ajustes } = await leerContenido();
  return datos.v === ajustes.version_sesion;
}

// ---------------------------------------------------------------------------
// Middlewares
// ---------------------------------------------------------------------------

// Protege la API privada: responde 401 si no hay sesión válida.
export async function requiereSesion(req, res, next) {
  if (!(await sesionValida(req))) return res.status(401).json({ error: 'Necesitas iniciar sesión.' });
  next();
}

// Bloquea peticiones que cambian datos si vienen de otra web (protección CSRF
// extra, además de la cookie SameSite=Strict).
export function mismoOrigen(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const sitio = req.headers['sec-fetch-site'];
  if (sitio && !['same-origin', 'none'].includes(sitio)) {
    return res.status(403).json({ error: 'Petición bloqueada por seguridad.' });
  }
  const origen = req.headers.origin;
  if (origen) {
    try {
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      if (new URL(origen).host !== host) return res.status(403).json({ error: 'Petición bloqueada por seguridad.' });
    } catch {
      return res.status(403).json({ error: 'Petición bloqueada por seguridad.' });
    }
  }
  next();
}

// Límite de intentos fallidos por IP: 5 fallos seguidos bloquean 15 minutos.
// (En Vercel cada servidor lleva su propia cuenta; por eso además cada fallo
// tarda casi un segundo en responder, para frenar a quien pruebe a lo loco.)
const intentos = new Map();
const MAX_FALLOS = 5;
const BLOQUEO_MS = 15 * 60 * 1000;

export function ipBloqueada(ip) {
  const registro = intentos.get(ip);
  if (!registro?.hasta) return 0;
  if (registro.hasta > Date.now()) return Math.ceil((registro.hasta - Date.now()) / 60000);
  intentos.delete(ip);
  return 0;
}

export function registrarFallo(ip) {
  const registro = intentos.get(ip) || { fallos: 0, hasta: 0 };
  registro.fallos += 1;
  if (registro.fallos >= MAX_FALLOS) {
    registro.hasta = Date.now() + BLOQUEO_MS;
    registro.fallos = 0;
  }
  intentos.set(ip, registro);
  return MAX_FALLOS - registro.fallos;
}

export const limpiarFallos = (ip) => intentos.delete(ip);
