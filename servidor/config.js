// Configuración central del servidor. Todo lo ajustable se lee de variables de
// entorno (archivo .env en tu PC, o "Environment Variables" en Vercel).
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Normaliza la ruta del panel: siempre empieza por "/", sin barra final y solo
// con caracteres seguros. Si el valor no es válido se usa "/panel".
function normalizarRutaPanel(valor) {
  const limpia = String(valor || '').trim().replace(/\/+$/, '');
  if (!/^\/[a-z0-9_-]+(\/[a-z0-9_-]+)*$/i.test(limpia)) return '/panel';
  if (['/api', '/subidas', '/semilla', '/vendor'].some((r) => limpia.startsWith(r))) return '/panel';
  return limpia;
}

const enVercel = !!process.env.VERCEL;
const produccion = process.env.NODE_ENV === 'production' || enVercel;

export const config = {
  raiz,
  enVercel,
  produccion,
  puerto: Number(process.env.PUERTO || process.env.PORT || 3000),
  host: process.env.HOST || '0.0.0.0',
  // Ruta secreta del panel privado. Cámbiala para que no sea fácil de adivinar.
  rutaPanel: normalizarRutaPanel(process.env.RUTA_PANEL || '/panel'),
  // Cookies solo por HTTPS (Vercel siempre usa HTTPS).
  cookieSegura: process.env.COOKIE_SEGURA === '1' || produccion,
  // Si la web va detrás de un proxy (Vercel, Render, Nginx...) para leer la IP real.
  confiarProxy: process.env.CONFIAR_PROXY === '1' || enVercel,
  dirDatos: path.join(raiz, 'datos'),
  dirSubidas: path.join(raiz, 'subidas'),
  dirSemilla: path.join(raiz, 'semilla'),
  dirPublico: path.join(raiz, 'publico'),
  dirPanel: path.join(raiz, 'panel'),
  // Vercel no admite peticiones de más de 4,5 MB; en local el límite es mayor.
  // (Multer exige un número entero de bytes.)
  maxBytesSubida: Math.floor(enVercel ? 4.3 * 1024 * 1024 : Number(process.env.MAX_MB_SUBIDA || 25) * 1024 * 1024),
  diasSesion: 14,
  longitudMinimaClave: 10,
};
