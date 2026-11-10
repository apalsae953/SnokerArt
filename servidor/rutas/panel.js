// API privada del panel. Todas las rutas exigen sesión iniciada y que la
// petición venga de la propia web.
import { Router } from 'express';
import multer from 'multer';
import {
  db,
  ahora,
  transaccion,
  listarObras,
  obtenerObra,
  filaObra,
  listarCategorias,
  leerAjustes,
  guardarAjustes,
  slugUnico,
} from '../db.js';
import {
  requiereSesion,
  mismoOrigen,
  verificarPassword,
  hashAdmin,
  validarPasswordNueva,
  guardarPasswordAdmin,
  listarSesiones,
  cerrarOtrasSesiones,
} from '../auth.js';
import { procesarImagen, borrarArchivos, espacioUsado, ErrorImagen } from '../imagenes.js';
import { config } from '../config.js';

export const rutasPanel = Router();
rutasPanel.use(requiereSesion, mismoOrigen);
rutasPanel.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

const subida = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxBytesSubida, files: 1, fields: 20 },
});

export const TECNICAS = ['pixel-art', '2d', '3d', 'otra'];

// ---------------------------------------------------------------------------
// Validación de campos
// ---------------------------------------------------------------------------

class ErrorValidacion extends Error {}

const comoBooleano = (v) => v === true || v === 1 || ['1', 'true', 'on', 'si', 'sí'].includes(String(v).toLowerCase());

function texto(valor, { campo, max, obligatorio = false }) {
  const limpio = String(valor ?? '').trim();
  if (obligatorio && !limpio) throw new ErrorValidacion(`Falta ${campo}.`);
  if (limpio.length > max) throw new ErrorValidacion(`${campo} no puede pasar de ${max} caracteres.`);
  return limpio;
}

function leerEtiquetas(valor) {
  let lista = valor;
  if (typeof valor === 'string') {
    try {
      lista = JSON.parse(valor);
    } catch {
      lista = valor.split(',');
    }
  }
  if (!Array.isArray(lista)) return [];
  const unicas = [];
  for (const etiqueta of lista) {
    const limpia = String(etiqueta).trim().slice(0, 30);
    if (limpia && !unicas.some((u) => u.toLowerCase() === limpia.toLowerCase())) unicas.push(limpia);
  }
  return unicas.slice(0, 12);
}

function leerCategoria(valor) {
  if (valor === null || valor === undefined || valor === '' || valor === 'null') return null;
  const id = Number(valor);
  if (!Number.isInteger(id) || !db.prepare('SELECT 1 FROM categorias WHERE id = ?').get(id)) {
    throw new ErrorValidacion('La categoría no existe.');
  }
  return id;
}

// Lee y valida los campos editables de una obra. En modo parcial solo
// devuelve los campos que vienen en la petición.
function camposObra(cuerpo, { parcial = false } = {}) {
  const c = {};
  const viene = (clave) => !parcial || Object.prototype.hasOwnProperty.call(cuerpo, clave);

  if (viene('titulo')) c.titulo = texto(cuerpo.titulo, { campo: 'El título', max: 120, obligatorio: true });
  if (viene('descripcion')) c.descripcion = texto(cuerpo.descripcion, { campo: 'La descripción', max: 2000 });
  if (viene('categoria_id')) c.categoria_id = leerCategoria(cuerpo.categoria_id);
  if (viene('tecnica')) {
    const tecnica = String(cuerpo.tecnica || 'pixel-art');
    if (!TECNICAS.includes(tecnica)) throw new ErrorValidacion('Técnica no válida.');
    c.tecnica = tecnica;
  }
  if (viene('etiquetas')) c.etiquetas = JSON.stringify(leerEtiquetas(cuerpo.etiquetas ?? []));
  for (const clave of ['publicada', 'destacada', 'descargable']) {
    if (viene(clave)) c[clave] = comoBooleano(cuerpo[clave]) ? 1 : 0;
  }
  // "pixelado" es opcional: si no se indica al subir, se usa lo detectado.
  if (Object.prototype.hasOwnProperty.call(cuerpo, 'pixelado') && cuerpo.pixelado !== '') {
    c.pixelado = comoBooleano(cuerpo.pixelado) ? 1 : 0;
  }
  return c;
}

function idValido(valor) {
  const id = Number(valor);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// Datos de configuración que el panel necesita conocer.
rutasPanel.get('/info', (req, res) => {
  res.json({
    max_bytes_subida: config.maxBytesSubida,
    ruta_panel: config.rutaPanel,
    tecnicas: TECNICAS,
    formatos: ['png', 'jpg', 'jpeg', 'webp', 'gif'],
  });
});

// ---------------------------------------------------------------------------
// Resumen (estadísticas del inicio del panel)
// ---------------------------------------------------------------------------

rutasPanel.get('/resumen', async (req, res) => {
  const totales = db
    .prepare(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(publicada), 0) AS publicadas,
              COALESCE(SUM(destacada), 0) AS destacadas,
              COALESCE(SUM(vistas), 0) AS vistas
       FROM obras`
    )
    .get();

  // Vistas de los últimos 30 días, rellenando con 0 los días sin visitas.
  const dias = 30;
  const inicio = new Date(Date.now() - (dias - 1) * 86400000).toISOString().slice(0, 10);
  const porDia = new Map(
    db
      .prepare('SELECT fecha, SUM(total) AS total FROM vistas_diarias WHERE fecha >= ? GROUP BY fecha')
      .all(inicio)
      .map((f) => [f.fecha, f.total])
  );
  const vistas30 = [];
  for (let i = dias - 1; i >= 0; i--) {
    const fecha = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    vistas30.push({ fecha, total: porDia.get(fecha) || 0 });
  }

  const obras = listarObras();
  const masVistas = [...obras].sort((a, b) => b.vistas - a.vistas).slice(0, 5);
  const recientes = [...obras].sort((a, b) => b.creado.localeCompare(a.creado)).slice(0, 6);
  const porTecnica = TECNICAS.map((t) => ({ tecnica: t, total: obras.filter((o) => o.tecnica === t).length }));

  res.json({
    totales: { ...totales, borradores: totales.total - totales.publicadas },
    vistas30,
    vistas_periodo: vistas30.reduce((s, d) => s + d.total, 0),
    mas_vistas: masVistas,
    recientes,
    por_tecnica: porTecnica,
    categorias: listarCategorias(),
    espacio: await espacioUsado(),
  });
});

// ---------------------------------------------------------------------------
// Obras
// ---------------------------------------------------------------------------

rutasPanel.get('/obras', (req, res) => {
  res.json(listarObras());
});

rutasPanel.post('/obras', subida.single('archivo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se ha recibido ninguna imagen.' });
  const cuerpo = { ...req.body };
  if (!cuerpo.titulo) cuerpo.titulo = 'Sin título';
  const campos = camposObra(cuerpo);
  const imagen = await procesarImagen(req.file.buffer);

  // Las obras nuevas aparecen las primeras en la galería.
  const { minimo } = db.prepare('SELECT COALESCE(MIN(orden), 0) AS minimo FROM obras').get();
  const momento = ahora();
  const datos = {
    ...campos,
    slug: slugUnico('obras', campos.titulo),
    archivo: imagen.archivo,
    miniatura: imagen.miniatura,
    ancho: imagen.ancho,
    alto: imagen.alto,
    formato: imagen.formato,
    peso: imagen.peso,
    escala: imagen.escala,
    pixelado: campos.pixelado ?? (imagen.pixelado ? 1 : 0),
    transparente: imagen.transparente ? 1 : 0,
    animado: imagen.animado ? 1 : 0,
    paleta: JSON.stringify(imagen.paleta),
    num_colores: imagen.num_colores,
    orden: minimo - 1,
    creado: momento,
    actualizado: momento,
  };
  const columnas = Object.keys(datos);
  const resultado = db
    .prepare(`INSERT INTO obras (${columnas.join(', ')}) VALUES (${columnas.map(() => '?').join(', ')})`)
    .run(...Object.values(datos));

  res.status(201).json(obtenerObra(Number(resultado.lastInsertRowid)));
});

rutasPanel.patch('/obras/:id', (req, res) => {
  const id = idValido(req.params.id);
  const fila = id && filaObra(id);
  if (!fila) return res.status(404).json({ error: 'Obra no encontrada.' });

  const campos = camposObra(req.body || {}, { parcial: true });
  if (campos.titulo && campos.titulo !== fila.titulo) campos.slug = slugUnico('obras', campos.titulo, id);
  if (Object.keys(campos).length === 0) return res.json(obtenerObra(id));

  campos.actualizado = ahora();
  const sets = Object.keys(campos).map((k) => `${k} = ?`).join(', ');
  db.prepare(`UPDATE obras SET ${sets} WHERE id = ?`).run(...Object.values(campos), id);
  res.json(obtenerObra(id));
});

// Sustituye la imagen de una obra manteniendo sus textos, vistas y orden.
rutasPanel.put('/obras/:id/archivo', subida.single('archivo'), async (req, res) => {
  const id = idValido(req.params.id);
  const fila = id && filaObra(id);
  if (!fila) return res.status(404).json({ error: 'Obra no encontrada.' });
  if (!req.file) return res.status(400).json({ error: 'No se ha recibido ninguna imagen.' });

  const imagen = await procesarImagen(req.file.buffer);
  db.prepare(
    `UPDATE obras SET archivo = ?, miniatura = ?, ancho = ?, alto = ?, formato = ?, peso = ?, escala = ?,
       pixelado = ?, transparente = ?, animado = ?, paleta = ?, num_colores = ?, actualizado = ?
     WHERE id = ?`
  ).run(
    imagen.archivo,
    imagen.miniatura,
    imagen.ancho,
    imagen.alto,
    imagen.formato,
    imagen.peso,
    imagen.escala,
    imagen.pixelado ? 1 : 0,
    imagen.transparente ? 1 : 0,
    imagen.animado ? 1 : 0,
    JSON.stringify(imagen.paleta),
    imagen.num_colores,
    ahora(),
    id
  );
  await borrarArchivos(fila.archivo, fila.miniatura);
  res.json(obtenerObra(id));
});

rutasPanel.delete('/obras/:id', async (req, res) => {
  const id = idValido(req.params.id);
  const fila = id && filaObra(id);
  if (!fila) return res.status(404).json({ error: 'Obra no encontrada.' });

  db.prepare('DELETE FROM obras WHERE id = ?').run(id);
  // Si era la portada o el avatar, se deja vacío para que la web use otra.
  const ajustes = leerAjustes();
  const cambios = {};
  if (ajustes.obra_portada === String(id)) cambios.obra_portada = '';
  if (ajustes.obra_avatar === String(id)) cambios.obra_avatar = '';
  if (Object.keys(cambios).length) guardarAjustes(cambios);

  await borrarArchivos(fila.archivo, fila.miniatura);
  res.json({ ok: true });
});

// Recibe la lista de ids en el orden deseado.
function reordenar(tabla, ids) {
  if (!Array.isArray(ids) || ids.some((id) => !idValido(id))) {
    throw new ErrorValidacion('Lista de orden no válida.');
  }
  const actualizar = db.prepare(`UPDATE ${tabla} SET orden = ? WHERE id = ?`);
  transaccion(() => ids.forEach((id, i) => actualizar.run(i, Number(id))));
}

rutasPanel.put('/orden/obras', (req, res) => {
  reordenar('obras', req.body?.ids);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Categorías
// ---------------------------------------------------------------------------

rutasPanel.get('/categorias', (req, res) => {
  res.json(listarCategorias());
});

rutasPanel.post('/categorias', (req, res) => {
  const nombre = texto(req.body?.nombre, { campo: 'El nombre', max: 40, obligatorio: true });
  const descripcion = texto(req.body?.descripcion, { campo: 'La descripción', max: 200 });
  const { maximo } = db.prepare('SELECT COALESCE(MAX(orden), -1) AS maximo FROM categorias').get();
  db.prepare('INSERT INTO categorias (nombre, slug, descripcion, orden, creado) VALUES (?, ?, ?, ?, ?)').run(
    nombre,
    slugUnico('categorias', nombre),
    descripcion,
    maximo + 1,
    ahora()
  );
  res.status(201).json(listarCategorias());
});

rutasPanel.patch('/categorias/:id', (req, res) => {
  const id = idValido(req.params.id);
  if (!id || !db.prepare('SELECT 1 FROM categorias WHERE id = ?').get(id)) {
    return res.status(404).json({ error: 'Categoría no encontrada.' });
  }
  if (req.body?.nombre !== undefined) {
    const nombre = texto(req.body.nombre, { campo: 'El nombre', max: 40, obligatorio: true });
    db.prepare('UPDATE categorias SET nombre = ?, slug = ? WHERE id = ?').run(nombre, slugUnico('categorias', nombre, id), id);
  }
  if (req.body?.descripcion !== undefined) {
    const descripcion = texto(req.body.descripcion, { campo: 'La descripción', max: 200 });
    db.prepare('UPDATE categorias SET descripcion = ? WHERE id = ?').run(descripcion, id);
  }
  res.json(listarCategorias());
});

rutasPanel.delete('/categorias/:id', (req, res) => {
  const id = idValido(req.params.id);
  const cambios = id ? db.prepare('DELETE FROM categorias WHERE id = ?').run(id).changes : 0;
  if (!cambios) return res.status(404).json({ error: 'Categoría no encontrada.' });
  res.json(listarCategorias());
});

rutasPanel.put('/orden/categorias', (req, res) => {
  reordenar('categorias', req.body?.ids);
  res.json(listarCategorias());
});

// ---------------------------------------------------------------------------
// Ajustes de la web
// ---------------------------------------------------------------------------

const REDES = ['artstation', 'itchio', 'instagram', 'x', 'bluesky', 'youtube', 'github', 'web'];

function validarUrl(valor, nombre) {
  const limpio = String(valor || '').trim();
  if (!limpio) return '';
  try {
    const url = new URL(limpio);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    if (limpio.length > 300) throw new Error();
    return url.toString();
  } catch {
    throw new ErrorValidacion(`El enlace de ${nombre} no es válido. Debe empezar por https://`);
  }
}

function validarObraReferencia(valor) {
  const limpio = String(valor ?? '').trim();
  if (!limpio) return '';
  const id = idValido(limpio);
  if (!id || !filaObra(id)) throw new ErrorValidacion('La obra elegida no existe.');
  return String(id);
}

rutasPanel.get('/ajustes', (req, res) => {
  res.json(leerAjustes());
});

rutasPanel.put('/ajustes', (req, res) => {
  const b = req.body || {};
  const cambios = {};
  const textos = {
    nombre_sitio: ['El nombre de la web', 60, true],
    lema: ['El lema', 120],
    descripcion: ['La descripción', 300],
    sobre_mi: ['El texto sobre ti', 1500],
    sobre_mi_extra: ['El segundo párrafo', 800],
    ubicacion: ['La ubicación', 80],
    desde: ['El año de inicio', 20],
    texto_pie: ['El texto del pie', 200],
  };
  for (const [clave, [campo, max, obligatorio]] of Object.entries(textos)) {
    if (b[clave] !== undefined) cambios[clave] = texto(b[clave], { campo, max, obligatorio });
  }
  if (b.email !== undefined) {
    const email = texto(b.email, { campo: 'El email', max: 120 });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ErrorValidacion('El email no es válido.');
    cambios.email = email;
  }
  if (b.abierto_encargos !== undefined) cambios.abierto_encargos = comoBooleano(b.abierto_encargos) ? '1' : '0';
  if (b.redes !== undefined) {
    const redes = {};
    for (const red of REDES) redes[red] = validarUrl(b.redes?.[red], red);
    cambios.redes = JSON.stringify(redes);
  }
  if (b.obra_portada !== undefined) cambios.obra_portada = validarObraReferencia(b.obra_portada);
  if (b.obra_avatar !== undefined) cambios.obra_avatar = validarObraReferencia(b.obra_avatar);

  guardarAjustes(cambios);
  res.json(leerAjustes());
});

// ---------------------------------------------------------------------------
// Seguridad
// ---------------------------------------------------------------------------

rutasPanel.put('/password', (req, res) => {
  const { actual, nueva } = req.body || {};
  if (typeof actual !== 'string' || !verificarPassword(actual, hashAdmin())) {
    return res.status(400).json({ error: 'La contraseña actual no es correcta.' });
  }
  const problema = validarPasswordNueva(nueva);
  if (problema) return res.status(400).json({ error: problema });
  guardarPasswordAdmin(nueva);
  const cerradas = cerrarOtrasSesiones(req.sesion);
  res.json({ ok: true, sesiones_cerradas: cerradas });
});

rutasPanel.get('/sesiones', (req, res) => {
  res.json(listarSesiones(req.sesion));
});

rutasPanel.delete('/sesiones/otras', (req, res) => {
  res.json({ ok: true, cerradas: cerrarOtrasSesiones(req.sesion) });
});

// ---------------------------------------------------------------------------
// Errores de esta API con mensajes claros
// ---------------------------------------------------------------------------

rutasPanel.use((error, req, res, next) => {
  if (error instanceof ErrorValidacion || error instanceof ErrorImagen) {
    return res.status(400).json({ error: error.message });
  }
  if (error instanceof multer.MulterError) {
    const mensaje =
      error.code === 'LIMIT_FILE_SIZE'
        ? `La imagen pesa demasiado (máximo ${Math.round(config.maxBytesSubida / 1048576)} MB).`
        : 'No se pudo leer el archivo subido.';
    return res.status(400).json({ error: mensaje });
  }
  next(error);
});
