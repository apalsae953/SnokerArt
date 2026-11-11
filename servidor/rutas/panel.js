// API privada del panel. Todas las rutas exigen sesión iniciada y que la
// petición venga de la propia web. Los cambios se guardan en contenido.json
// con modificar(), que evita que dos guardados se pisen.
import { Router } from 'express';
import multer from 'multer';
import {
  ahora,
  modificar,
  leerContenido,
  obrasOrdenadas,
  categoriasConCuenta,
  formatearObra,
  siguienteId,
  slugUnico,
  TECNICAS,
  AJUSTES_POR_DEFECTO,
} from '../contenido.js';
import { requiereSesion, mismoOrigen, crearSesion } from '../auth.js';
import { guardarImagen, borrarImagenes, ErrorImagen } from '../imagenes.js';
import { usandoBlob, almacen } from '../almacen.js';
import { config } from '../config.js';

export const rutasPanel = Router();
rutasPanel.use(requiereSesion, mismoOrigen);
rutasPanel.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  // En Vercel el disco es de solo lectura: sin Vercel Blob no se puede guardar.
  if (config.enVercel && !usandoBlob && !['GET', 'HEAD'].includes(req.method)) {
    return res.status(503).json({
      error: 'Falta conectar el almacén Vercel Blob al proyecto (pestaña Storage en Vercel). Sin él no se pueden guardar cambios.',
    });
  }
  next();
});

const subida = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxBytesSubida, files: 1, fields: 20 },
});

// ---------------------------------------------------------------------------
// Validación de campos
// ---------------------------------------------------------------------------

class ErrorValidacion extends Error {}
class NoEncontrado extends Error {}

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

function idValido(valor) {
  const id = Number(valor);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// Lee y valida los campos editables de una obra. En modo parcial solo
// devuelve los campos que vienen en la petición.
function camposObra(cuerpo, categorias, { parcial = false } = {}) {
  const c = {};
  const viene = (clave) => !parcial || Object.prototype.hasOwnProperty.call(cuerpo, clave);

  if (viene('titulo')) c.titulo = texto(cuerpo.titulo, { campo: 'El título', max: 120, obligatorio: true });
  if (viene('descripcion')) c.descripcion = texto(cuerpo.descripcion, { campo: 'La descripción', max: 2000 });
  if (viene('categoria_id')) {
    const valor = cuerpo.categoria_id;
    if (valor === null || valor === undefined || valor === '' || valor === 'null') c.categoria_id = null;
    else {
      const id = idValido(valor);
      if (!id || !categorias.some((cat) => cat.id === id)) throw new ErrorValidacion('La categoría no existe.');
      c.categoria_id = id;
    }
  }
  if (viene('tecnica')) {
    const tecnica = String(cuerpo.tecnica || 'pixel-art');
    if (!TECNICAS.includes(tecnica)) throw new ErrorValidacion('Técnica no válida.');
    c.tecnica = tecnica;
  }
  if (viene('etiquetas')) c.etiquetas = leerEtiquetas(cuerpo.etiquetas ?? []);
  for (const clave of ['publicada', 'destacada', 'descargable']) {
    if (viene(clave)) c[clave] = comoBooleano(cuerpo[clave]);
  }
  // "pixelado" es opcional: si no se indica al subir, se usa lo detectado.
  if (Object.prototype.hasOwnProperty.call(cuerpo, 'pixelado') && cuerpo.pixelado !== '') {
    c.pixelado = comoBooleano(cuerpo.pixelado);
  }
  return c;
}

function buscarObra(datos, id) {
  const obra = datos.obras.find((o) => o.id === id);
  if (!obra) throw new NoEncontrado('Obra no encontrada.');
  return obra;
}

// ---------------------------------------------------------------------------
// Información y resumen
// ---------------------------------------------------------------------------

rutasPanel.get('/info', (req, res) => {
  res.json({
    max_bytes_subida: config.maxBytesSubida,
    ruta_panel: config.rutaPanel,
    almacen: usandoBlob ? 'blob' : 'local',
    datos_privados: almacen.datosPrivados,
    en_vercel: config.enVercel,
    tecnicas: TECNICAS,
  });
});

rutasPanel.get('/resumen', async (req, res) => {
  const datos = await leerContenido({ fresco: true });
  const obras = obrasOrdenadas(datos);
  const publicadas = obras.filter((o) => o.publicada).length;
  res.json({
    totales: {
      total: obras.length,
      publicadas,
      borradores: obras.length - publicadas,
      destacadas: obras.filter((o) => o.destacada).length,
    },
    recientes: [...obras].sort((a, b) => b.creado.localeCompare(a.creado)).slice(0, 6),
    por_tecnica: TECNICAS.map((t) => ({ tecnica: t, total: obras.filter((o) => o.tecnica === t).length })),
    categorias: categoriasConCuenta(datos),
    espacio: obras.reduce((suma, o) => suma + (o.peso || 0), 0),
  });
});

// ---------------------------------------------------------------------------
// Obras
// ---------------------------------------------------------------------------

rutasPanel.get('/obras', async (req, res) => {
  res.json(obrasOrdenadas(await leerContenido({ fresco: true })));
});

rutasPanel.post('/obras', subida.single('archivo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se ha recibido ninguna imagen.' });
  const cuerpo = { ...req.body };
  if (!cuerpo.titulo) cuerpo.titulo = 'Sin título';

  // Primero se valida con los datos actuales para no subir la imagen en balde.
  camposObra(cuerpo, (await leerContenido({ fresco: true })).categorias);
  const imagen = await guardarImagen(req.file.buffer);

  try {
    const obra = await modificar((datos) => {
      const campos = camposObra(cuerpo, datos.categorias);
      const momento = ahora();
      const nueva = {
        id: siguienteId(datos.obras),
        slug: slugUnico(datos.obras, campos.titulo),
        titulo: campos.titulo,
        descripcion: campos.descripcion,
        categoria_id: campos.categoria_id,
        tecnica: campos.tecnica,
        etiquetas: campos.etiquetas,
        ...imagen,
        pixelado: campos.pixelado ?? imagen.pixelado,
        destacada: campos.destacada,
        publicada: campos.publicada,
        descargable: campos.descargable,
        // Las obras nuevas aparecen las primeras en la galería.
        orden: datos.obras.reduce((min, o) => Math.min(min, o.orden), 0) - 1,
        creado: momento,
        actualizado: momento,
      };
      datos.obras.push(nueva);
      return formatearObra(nueva, datos.categorias);
    });
    res.status(201).json(obra);
  } catch (error) {
    // Si no se pudo guardar, la imagen subida sobra.
    await borrarImagenes(imagen.archivo, imagen.miniatura);
    throw error;
  }
});

rutasPanel.patch('/obras/:id', async (req, res) => {
  const id = idValido(req.params.id);
  const obra = await modificar((datos) => {
    const actual = buscarObra(datos, id);
    const campos = camposObra(req.body || {}, datos.categorias, { parcial: true });
    if (campos.titulo && campos.titulo !== actual.titulo) campos.slug = slugUnico(datos.obras, campos.titulo, id);
    Object.assign(actual, campos, { actualizado: ahora() });
    return formatearObra(actual, datos.categorias);
  });
  res.json(obra);
});

// Sustituye la imagen de una obra manteniendo sus textos y su orden.
rutasPanel.put('/obras/:id/archivo', subida.single('archivo'), async (req, res) => {
  const id = idValido(req.params.id);
  if (!req.file) return res.status(400).json({ error: 'No se ha recibido ninguna imagen.' });
  buscarObra(await leerContenido({ fresco: true }), id);
  const imagen = await guardarImagen(req.file.buffer);

  let anteriores = [];
  try {
    const obra = await modificar((datos) => {
      const actual = buscarObra(datos, id);
      anteriores = [actual.archivo, actual.miniatura];
      Object.assign(actual, imagen, { actualizado: ahora() });
      return formatearObra(actual, datos.categorias);
    });
    await borrarImagenes(...anteriores);
    res.json(obra);
  } catch (error) {
    await borrarImagenes(imagen.archivo, imagen.miniatura);
    throw error;
  }
});

rutasPanel.delete('/obras/:id', async (req, res) => {
  const id = idValido(req.params.id);
  let borrada;
  await modificar((datos) => {
    borrada = buscarObra(datos, id);
    datos.obras = datos.obras.filter((o) => o.id !== id);
    // Si era la portada o el avatar, se deja vacío para que la web elija otra.
    if (datos.ajustes.obra_portada === String(id)) datos.ajustes.obra_portada = '';
    if (datos.ajustes.obra_avatar === String(id)) datos.ajustes.obra_avatar = '';
  });
  await borrarImagenes(borrada.archivo, borrada.miniatura);
  res.json({ ok: true });
});

// Recibe la lista de ids en el orden deseado.
function validarOrden(ids) {
  if (!Array.isArray(ids) || ids.some((id) => !idValido(id))) throw new ErrorValidacion('Lista de orden no válida.');
  return ids.map(Number);
}

rutasPanel.put('/orden/obras', async (req, res) => {
  const ids = validarOrden(req.body?.ids);
  await modificar((datos) => {
    for (const obra of datos.obras) {
      const posicion = ids.indexOf(obra.id);
      if (posicion !== -1) obra.orden = posicion;
    }
  });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Categorías
// ---------------------------------------------------------------------------

rutasPanel.get('/categorias', async (req, res) => {
  res.json(categoriasConCuenta(await leerContenido({ fresco: true })));
});

rutasPanel.post('/categorias', async (req, res) => {
  const nombre = texto(req.body?.nombre, { campo: 'El nombre', max: 40, obligatorio: true });
  const descripcion = texto(req.body?.descripcion, { campo: 'La descripción', max: 200 });
  const lista = await modificar((datos) => {
    datos.categorias.push({
      id: siguienteId(datos.categorias),
      nombre,
      slug: slugUnico(datos.categorias, nombre),
      descripcion,
      orden: datos.categorias.reduce((max, c) => Math.max(max, c.orden), -1) + 1,
      creado: ahora(),
    });
    return categoriasConCuenta(datos);
  });
  res.status(201).json(lista);
});

rutasPanel.patch('/categorias/:id', async (req, res) => {
  const id = idValido(req.params.id);
  const cambios = {};
  if (req.body?.nombre !== undefined) cambios.nombre = texto(req.body.nombre, { campo: 'El nombre', max: 40, obligatorio: true });
  if (req.body?.descripcion !== undefined) cambios.descripcion = texto(req.body.descripcion, { campo: 'La descripción', max: 200 });
  const lista = await modificar((datos) => {
    const categoria = datos.categorias.find((c) => c.id === id);
    if (!categoria) throw new NoEncontrado('Categoría no encontrada.');
    if (cambios.nombre) cambios.slug = slugUnico(datos.categorias, cambios.nombre, id);
    Object.assign(categoria, cambios);
    return categoriasConCuenta(datos);
  });
  res.json(lista);
});

// Al borrar una categoría, sus obras se quedan sin categoría (no se borran).
rutasPanel.delete('/categorias/:id', async (req, res) => {
  const id = idValido(req.params.id);
  const lista = await modificar((datos) => {
    if (!datos.categorias.some((c) => c.id === id)) throw new NoEncontrado('Categoría no encontrada.');
    datos.categorias = datos.categorias.filter((c) => c.id !== id);
    for (const obra of datos.obras) if (obra.categoria_id === id) obra.categoria_id = null;
    return categoriasConCuenta(datos);
  });
  res.json(lista);
});

rutasPanel.put('/orden/categorias', async (req, res) => {
  const ids = validarOrden(req.body?.ids);
  const lista = await modificar((datos) => {
    for (const categoria of datos.categorias) {
      const posicion = ids.indexOf(categoria.id);
      if (posicion !== -1) categoria.orden = posicion;
    }
    return categoriasConCuenta(datos);
  });
  res.json(lista);
});

// ---------------------------------------------------------------------------
// Ajustes de la web
// ---------------------------------------------------------------------------

const REDES = Object.keys(AJUSTES_POR_DEFECTO.redes);

function validarUrl(valor, nombre) {
  const limpio = String(valor || '').trim();
  if (!limpio) return '';
  try {
    const url = new URL(limpio);
    if (!['http:', 'https:'].includes(url.protocol) || limpio.length > 300) throw new Error();
    return url.toString();
  } catch {
    throw new ErrorValidacion(`El enlace de ${nombre} no es válido. Debe empezar por https://`);
  }
}

rutasPanel.get('/ajustes', async (req, res) => {
  const { version_sesion, ...ajustes } = (await leerContenido({ fresco: true })).ajustes;
  res.json(ajustes);
});

rutasPanel.put('/ajustes', async (req, res) => {
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
  if (b.abierto_encargos !== undefined) cambios.abierto_encargos = comoBooleano(b.abierto_encargos);
  if (b.redes !== undefined) {
    cambios.redes = Object.fromEntries(REDES.map((red) => [red, validarUrl(b.redes?.[red], red)]));
  }

  const ajustes = await modificar((datos) => {
    // Las obras de portada y avatar deben existir.
    for (const clave of ['obra_portada', 'obra_avatar']) {
      if (b[clave] === undefined) continue;
      const valor = String(b[clave] ?? '').trim();
      if (valor && !datos.obras.some((o) => String(o.id) === valor)) throw new ErrorValidacion('La obra elegida no existe.');
      cambios[clave] = valor;
    }
    Object.assign(datos.ajustes, cambios);
    const { version_sesion, ...visibles } = datos.ajustes;
    return visibles;
  });
  res.json(ajustes);
});

// ---------------------------------------------------------------------------
// Seguridad: cerrar la sesión en todos los demás dispositivos
// ---------------------------------------------------------------------------

rutasPanel.post('/sesiones/cerrar-todas', async (req, res) => {
  const version = await modificar((datos) => {
    datos.ajustes.version_sesion = (Number(datos.ajustes.version_sesion) || 1) + 1;
    return datos.ajustes.version_sesion;
  });
  // Quien lo pide sigue dentro con una sesión nueva.
  crearSesion(res, version);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Errores de esta API con mensajes claros
// ---------------------------------------------------------------------------

rutasPanel.use((error, req, res, next) => {
  if (error instanceof ErrorValidacion || error instanceof ErrorImagen) {
    return res.status(400).json({ error: error.message });
  }
  if (error instanceof NoEncontrado) return res.status(404).json({ error: error.message });
  // Guardados que chocan una y otra vez: se explica en lugar de un error genérico.
  if (error.status === 409) return res.status(409).json({ error: error.message });
  if (error instanceof multer.MulterError) {
    const mensaje =
      error.code === 'LIMIT_FILE_SIZE'
        ? `La imagen pesa demasiado (máximo ${(config.maxBytesSubida / 1048576).toFixed(1).replace('.', ',')} MB).`
        : 'No se pudo leer el archivo subido.';
    return res.status(400).json({ error: mensaje });
  }
  next(error);
});
