// La aplicación Express de Snoker Art. Se usa igual en tu PC (servidor/index.js)
// y en Vercel (api/index.js), donde cada petición la atiende una función.
import path from 'node:path';
import express from 'express';
import { config } from './config.js';
import { sesionValida } from './auth.js';
import { rutasPublicas } from './rutas/publicas.js';
import { rutasAcceso } from './rutas/acceso.js';
import { rutasPanel } from './rutas/panel.js';

const app = express();
app.disable('x-powered-by');
if (config.confiarProxy) app.set('trust proxy', true);

// ---------------------------------------------------------------------------
// Cabeceras de seguridad (en Vercel, las de los archivos estáticos están en
// vercel.json porque esos archivos no pasan por aquí)
// ---------------------------------------------------------------------------
export const POLITICA_CONTENIDO = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://*.public.blob.vercel-storage.com",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

app.use((req, res, next) => {
  res.set({
    'Content-Security-Policy': POLITICA_CONTENIDO,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  });
  next();
});

app.use(express.json({ limit: '200kb' }));

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------
app.use('/api', rutasPublicas);
app.use('/api/acceso', rutasAcceso);
app.use('/api/panel', rutasPanel);
app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));

// ---------------------------------------------------------------------------
// Imágenes
// ---------------------------------------------------------------------------

// Imágenes subidas en modo local (en Vercel están en Vercel Blob).
app.use('/subidas', express.static(config.dirSubidas, { maxAge: '365d', immutable: true, index: false }));

// Imágenes iniciales que vienen con el proyecto.
app.use('/semilla/imagenes', express.static(path.join(config.dirSemilla, 'imagenes'), { maxAge: '1d', index: false }));

// Iconos Lucide (en Vercel se copian a publico/vendor al desplegar).
app.get('/vendor/lucide.js', (req, res) => {
  res.set('Cache-Control', 'public, max-age=604800');
  res.sendFile(path.join(config.raiz, 'node_modules', 'lucide', 'dist', 'umd', 'lucide.min.js'));
});

// ---------------------------------------------------------------------------
// Panel privado
// ---------------------------------------------------------------------------
const rutaPanel = config.rutaPanel;
const sinIndexar = (req, res, next) => {
  res.set('X-Robots-Tag', 'noindex, nofollow');
  res.set('Cache-Control', 'no-store');
  next();
};

// Express trata "/panel" y "/panel/" como la misma ruta. Se fuerza la barra
// final para que las rutas relativas del HTML funcionen.
app.get(rutaPanel, sinIndexar, async (req, res) => {
  const [ruta, consulta = ''] = req.originalUrl.split('?');
  if (!ruta.endsWith('/')) return res.redirect(302, `${rutaPanel}/${consulta ? `?${consulta}` : ''}`);
  const pagina = (await sesionValida(req)) ? 'app/index.html' : 'acceso/index.html';
  res.sendFile(path.join(config.dirPanel, pagina));
});

// Recursos de la pantalla de acceso: públicos (no contienen datos).
app.use(`${rutaPanel}/acceso`, sinIndexar, express.static(path.join(config.dirPanel, 'acceso'), { index: false }));

// Recursos del panel: solo con sesión iniciada. Sin sesión, ni siquiera se
// puede descargar el código del panel.
app.use(
  `${rutaPanel}/app`,
  sinIndexar,
  async (req, res, next) => ((await sesionValida(req)) ? next() : res.status(404).end()),
  express.static(path.join(config.dirPanel, 'app'), { index: false })
);

// ---------------------------------------------------------------------------
// Web pública (en Vercel la sirve directamente su CDN desde publico/)
// ---------------------------------------------------------------------------
app.use(express.static(config.dirPublico, { maxAge: config.produccion ? '1h' : 0 }));

app.use((req, res) => {
  res.status(404).sendFile(path.join(config.dirPublico, '404.html'));
});

// Errores: se respeta su código (404 de un archivo que no existe, 400 de un
// JSON mal formado...) y solo los fallos internos se registran, sin dar
// detalles al visitante.
app.use((error, req, res, next) => {
  const estado = Number(error.status || error.statusCode) || 500;
  if (estado >= 500) console.error('[error]', error);
  if (res.headersSent) return next(error);
  const mensajes = { 400: 'Petición no válida.', 404: 'No encontrado.', 413: 'La petición es demasiado grande.' };
  const mensaje = mensajes[estado] || 'Error interno del servidor.';
  if (req.path.startsWith('/api')) return res.status(estado).json({ error: mensaje });
  if (estado === 404) return res.status(404).sendFile(path.join(config.dirPublico, '404.html'));
  res.status(estado).send(mensaje);
});

export default app;
