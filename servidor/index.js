// Punto de entrada del servidor de Snoker Art.
// Sirve la web pública, la API, las imágenes subidas y el panel privado.
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { config } from './config.js';
import { leerAjustes, listarObras } from './db.js';
import { sesionActual, adminConfigurado, obtenerCodigoConfiguracion } from './auth.js';
import { rutasPublicas } from './rutas/publicas.js';
import { rutasAcceso } from './rutas/acceso.js';
import { rutasPanel } from './rutas/panel.js';

const app = express();
app.disable('x-powered-by');
if (config.confiarProxy) app.set('trust proxy', 1);

// ---------------------------------------------------------------------------
// Cabeceras de seguridad para todas las respuestas
// ---------------------------------------------------------------------------
app.use((req, res, next) => {
  res.set({
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; '),
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
// Archivos estáticos
// ---------------------------------------------------------------------------

// Las imágenes subidas tienen nombres únicos, así que se pueden cachear mucho tiempo.
app.use(
  '/subidas',
  express.static(config.dirSubidas, { maxAge: '365d', immutable: true, index: false, fallthrough: false })
);

// Iconos Lucide servidos desde node_modules (sin depender de CDNs externos).
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
// final (conservando la consulta, por ejemplo ?codigo=...) para que las rutas
// relativas del HTML funcionen.
app.get(rutaPanel, sinIndexar, (req, res) => {
  const [ruta, consulta = ''] = req.originalUrl.split('?');
  if (!ruta.endsWith('/')) return res.redirect(302, `${rutaPanel}/${consulta ? `?${consulta}` : ''}`);
  const pagina = sesionActual(req) ? 'app/index.html' : 'acceso/index.html';
  res.sendFile(path.join(config.dirPanel, pagina));
});

// Recursos de la pantalla de acceso: públicos (no contienen datos).
app.use(`${rutaPanel}/acceso`, sinIndexar, express.static(path.join(config.dirPanel, 'acceso'), { index: false }));

// Recursos del panel: solo con sesión iniciada. Sin sesión, ni siquiera se
// puede descargar el código del panel.
app.use(
  `${rutaPanel}/app`,
  sinIndexar,
  (req, res, next) => (sesionActual(req) ? next() : res.status(404).end()),
  express.static(path.join(config.dirPanel, 'app'), { index: false })
);

// ---------------------------------------------------------------------------
// Web pública
// ---------------------------------------------------------------------------

const escaparHtml = (texto) =>
  String(texto ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

let plantillaInicio = null;
function leerPlantilla() {
  if (!plantillaInicio || !config.produccion) {
    plantillaInicio = fs.readFileSync(path.join(config.dirPublico, 'index.html'), 'utf8');
  }
  return plantillaInicio;
}

// La portada se rellena en el servidor con el nombre y la descripción para que
// los buscadores y las redes sociales vean el título correcto.
app.get('/', (req, res) => {
  const ajustes = leerAjustes();
  const obras = listarObras({ soloPublicadas: true });
  const portada =
    obras.find((o) => String(o.id) === ajustes.obra_portada) || obras.find((o) => o.destacada) || obras[0];
  const origen = `${req.protocol}://${req.get('host')}`;
  const html = leerPlantilla()
    .replaceAll('%%TITULO%%', escaparHtml(`${ajustes.nombre_sitio} · ${ajustes.lema}`))
    .replaceAll('%%NOMBRE%%', escaparHtml(ajustes.nombre_sitio))
    .replaceAll('%%DESCRIPCION%%', escaparHtml(ajustes.descripcion))
    .replaceAll('%%OG_IMAGEN%%', escaparHtml(portada ? `${origen}${portada.url}` : ''));
  res.set('Cache-Control', 'no-cache');
  res.type('html').send(html);
});

app.use(express.static(config.dirPublico, { index: false, maxAge: config.produccion ? '1h' : 0 }));

// Página 404 con estilo de la web.
app.use((req, res) => {
  res.status(404).sendFile(path.join(config.dirPublico, '404.html'));
});

// Errores: se respeta su código (404 de un archivo que no existe, 400 de un
// JSON mal formado...) y solo los fallos internos se registran en la consola,
// sin dar detalles al visitante.
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

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------
app.listen(config.puerto, config.host, () => {
  const local = `http://localhost:${config.puerto}`;
  console.log('');
  console.log('  Snoker Art en marcha');
  console.log(`  Web pública:   ${local}/`);
  console.log(`  Panel privado: ${local}${rutaPanel}/`);
  if (!adminConfigurado()) {
    console.log('');
    const codigo = obtenerCodigoConfiguracion();
    console.log('  Primera vez: abre el panel y crea tu contraseña con este código:');
    console.log(`  Código de configuración: ${codigo}`);
    console.log(`  (o abre directamente ${local}${rutaPanel}/?codigo=${codigo})`);
  }
  console.log('');
});
