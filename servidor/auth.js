// Autenticación del panel privado: una sola persona (la dueña de la web) con
// contraseña. Las contraseñas se guardan con scrypt y las sesiones con un token
// aleatorio cuyo hash vive en la base de datos.
import crypto from 'node:crypto';
import { db, ahora } from './db.js';
import { config } from './config.js';

const NOMBRE_COOKIE = 'snoker_sesion';
const PARAMS_SCRYPT = { N: 16384, r: 8, p: 1 };
export const LONGITUD_MINIMA = 10;

// ---------------------------------------------------------------------------
// Contraseñas
// ---------------------------------------------------------------------------

export function hashearPassword(password) {
  const sal = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, sal, 64, PARAMS_SCRYPT);
  return `scrypt$${sal.toString('base64')}$${hash.toString('base64')}`;
}

export function verificarPassword(password, guardado) {
  const [tipo, salB64, hashB64] = String(guardado || '').split('$');
  if (tipo !== 'scrypt' || !salB64 || !hashB64) return false;
  const esperado = Buffer.from(hashB64, 'base64');
  const calculado = crypto.scryptSync(String(password), Buffer.from(salB64, 'base64'), esperado.length, PARAMS_SCRYPT);
  return crypto.timingSafeEqual(esperado, calculado);
}

export function adminConfigurado() {
  return !!db.prepare('SELECT 1 FROM admin WHERE id = 1').get();
}

export function guardarPasswordAdmin(password) {
  db.prepare(
    `INSERT INTO admin (id, hash, actualizado) VALUES (1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET hash = excluded.hash, actualizado = excluded.actualizado`
  ).run(hashearPassword(password), ahora());
}

export function hashAdmin() {
  return db.prepare('SELECT hash FROM admin WHERE id = 1').get()?.hash;
}

export function validarPasswordNueva(password) {
  if (typeof password !== 'string' || password.length < LONGITUD_MINIMA) {
    return `La contraseña debe tener al menos ${LONGITUD_MINIMA} caracteres.`;
  }
  if (password.length > 200) return 'La contraseña es demasiado larga.';
  return null;
}

// ---------------------------------------------------------------------------
// Código de configuración inicial
// Mientras no haya contraseña, el servidor genera un código de un solo uso y lo
// muestra en la consola. Solo quien tenga acceso a la consola puede crear la
// cuenta, aunque la web ya esté publicada.
// ---------------------------------------------------------------------------

let codigoConfiguracion = null;

export function obtenerCodigoConfiguracion() {
  if (adminConfigurado()) return null;
  if (!codigoConfiguracion) {
    codigoConfiguracion = crypto.randomBytes(4).toString('hex').toUpperCase();
  }
  return codigoConfiguracion;
}

export function comprobarCodigoConfiguracion(codigo) {
  const actual = obtenerCodigoConfiguracion();
  if (!actual) return false;
  const recibido = Buffer.from(String(codigo || '').trim().toUpperCase());
  const esperado = Buffer.from(actual);
  return recibido.length === esperado.length && crypto.timingSafeEqual(recibido, esperado);
}

export function consumirCodigoConfiguracion() {
  codigoConfiguracion = null;
}

// ---------------------------------------------------------------------------
// Sesiones
// ---------------------------------------------------------------------------

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

function leerCookie(req, nombre) {
  const cabecera = req.headers.cookie || '';
  for (const parte of cabecera.split(';')) {
    const [clave, ...resto] = parte.trim().split('=');
    if (clave === nombre) return decodeURIComponent(resto.join('='));
  }
  return null;
}

function escribirCookie(res, valor, maxAgeSegundos) {
  const partes = [
    `${NOMBRE_COOKIE}=${encodeURIComponent(valor)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAgeSegundos}`,
  ];
  if (config.cookieSegura) partes.push('Secure');
  res.append('Set-Cookie', partes.join('; '));
}

export function crearSesion(req, res) {
  const token = crypto.randomBytes(32).toString('base64url');
  const segundos = config.diasSesion * 24 * 60 * 60;
  const expira = new Date(Date.now() + segundos * 1000).toISOString();
  db.prepare(
    'INSERT INTO sesiones (token_hash, creado, expira, ultimo_uso, ip, agente) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(hashToken(token), ahora(), expira, ahora(), req.ip || '', String(req.headers['user-agent'] || '').slice(0, 200));
  escribirCookie(res, token, segundos);
}

export function cerrarSesion(req, res) {
  const token = leerCookie(req, NOMBRE_COOKIE);
  if (token) db.prepare('DELETE FROM sesiones WHERE token_hash = ?').run(hashToken(token));
  escribirCookie(res, '', 0);
}

// Devuelve el hash de la sesión válida o null. Limpia las sesiones caducadas.
export function sesionActual(req) {
  const token = leerCookie(req, NOMBRE_COOKIE);
  if (!token) return null;
  const hash = hashToken(token);
  const fila = db.prepare('SELECT token_hash, expira, ultimo_uso FROM sesiones WHERE token_hash = ?').get(hash);
  if (!fila) return null;
  if (new Date(fila.expira) < new Date()) {
    db.prepare('DELETE FROM sesiones WHERE token_hash = ?').run(hash);
    return null;
  }
  // Actualiza el último uso como mucho una vez por minuto para no escribir en cada petición.
  if (Date.now() - new Date(fila.ultimo_uso).getTime() > 60_000) {
    db.prepare('UPDATE sesiones SET ultimo_uso = ? WHERE token_hash = ?').run(ahora(), hash);
  }
  return hash;
}

export function listarSesiones(hashActual) {
  db.prepare('DELETE FROM sesiones WHERE expira < ?').run(ahora());
  return db
    .prepare('SELECT token_hash, creado, ultimo_uso, ip, agente FROM sesiones ORDER BY ultimo_uso DESC')
    .all()
    .map((s) => ({
      id: s.token_hash.slice(0, 12),
      actual: s.token_hash === hashActual,
      creado: s.creado,
      ultimo_uso: s.ultimo_uso,
      ip: s.ip,
      agente: s.agente,
    }));
}

export function cerrarOtrasSesiones(hashActual) {
  return db.prepare('DELETE FROM sesiones WHERE token_hash != ?').run(hashActual || '').changes;
}

// ---------------------------------------------------------------------------
// Middlewares
// ---------------------------------------------------------------------------

// Protege las rutas de la API privada: responde 401 si no hay sesión válida.
export function requiereSesion(req, res, next) {
  const hash = sesionActual(req);
  if (!hash) return res.status(401).json({ error: 'Necesitas iniciar sesión.' });
  req.sesion = hash;
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
      if (new URL(origen).host !== req.headers.host) {
        return res.status(403).json({ error: 'Petición bloqueada por seguridad.' });
      }
    } catch {
      return res.status(403).json({ error: 'Petición bloqueada por seguridad.' });
    }
  }
  next();
}

// Limita los intentos de inicio de sesión fallidos por IP: 5 fallos seguidos
// bloquean esa IP durante 15 minutos.
const intentos = new Map();
const MAX_FALLOS = 5;
const BLOQUEO_MS = 15 * 60 * 1000;

export function ipBloqueada(ip) {
  const registro = intentos.get(ip);
  if (!registro) return 0;
  if (registro.hasta && registro.hasta > Date.now()) return Math.ceil((registro.hasta - Date.now()) / 60000);
  if (registro.hasta && registro.hasta <= Date.now()) intentos.delete(ip);
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

export function limpiarFallos(ip) {
  intentos.delete(ip);
}
