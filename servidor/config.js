// Configuración central del servidor. Todo lo ajustable se lee de variables de
// entorno (archivo .env) para no tener que tocar el código al desplegar.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Normaliza la ruta del panel: siempre empieza por "/", sin barra final y solo
// con caracteres seguros. Si el valor no es válido se usa "/panel".
function normalizarRutaPanel(valor) {
  const limpia = String(valor || '').trim().replace(/\/+$/, '');
  if (!/^\/[a-z0-9_-]+(\/[a-z0-9_-]+)*$/i.test(limpia)) return '/panel';
  if (limpia.startsWith('/api') || limpia.startsWith('/subidas')) return '/panel';
  return limpia;
}

const produccion = process.env.NODE_ENV === 'production';

export const config = {
  raiz,
  produccion,
  puerto: Number(process.env.PUERTO || process.env.PORT || 3000),
  host: process.env.HOST || '0.0.0.0',
  // Ruta secreta del panel privado. Cámbiala en .env para que no sea fácil de adivinar.
  rutaPanel: normalizarRutaPanel(process.env.RUTA_PANEL || '/panel'),
  // Cookies solo por HTTPS. Actívalo cuando la web esté publicada con certificado.
  cookieSegura: process.env.COOKIE_SEGURA === '1' || produccion,
  // Si la web va detrás de un proxy (Render, Railway, Nginx...) para leer la IP real.
  confiarProxy: process.env.CONFIAR_PROXY === '1',
  dirDatos: path.join(raiz, 'datos'),
  dirSubidas: path.join(raiz, 'subidas'),
  dirPublico: path.join(raiz, 'publico'),
  dirPanel: path.join(raiz, 'panel'),
  maxBytesSubida: Number(process.env.MAX_MB_SUBIDA || 25) * 1024 * 1024,
  diasSesion: 14,
};
