// Todo el contenido de la web (obras, categorías y ajustes) vive en un único
// archivo contenido.json dentro del almacén. Este módulo lo lee, lo guarda de
// forma segura y ofrece funciones para trabajar con él.
import fs from 'node:fs/promises';
import path from 'node:path';
import { almacen, ConflictoAlmacen } from './almacen.js';
import { config } from './config.js';

export const TECNICAS = ['pixel-art', '2d', '3d', 'otra'];

// Valores iniciales de la web. Se pueden cambiar todos desde el panel.
export const AJUSTES_POR_DEFECTO = {
  nombre_sitio: 'Snoker Art',
  lema: 'Pixel art, 2D y 3D para videojuegos',
  descripcion: 'Sprites, objetos, escenarios y tilesets dibujados a mano para mundos de videojuego.',
  sobre_mi:
    'Dibujo el arte de mis videojuegos píxel a píxel: personajes, objetos, escenarios y tilesets, y también piezas en 2D y 3D. Aquí voy subiendo todo lo que creo, desde el primer boceto hasta el sprite final.',
  sobre_mi_extra: 'Si buscas arte para tu juego o quieres colaborar en un proyecto, escríbeme y lo hablamos.',
  ubicacion: '',
  desde: '',
  email: '',
  abierto_encargos: true,
  redes: { artstation: '', itchio: '', instagram: '', x: '', bluesky: '', youtube: '', github: '', web: '' },
  obra_portada: '',
  obra_avatar: '',
  texto_pie: '',
  // Al subir este número se cierran todas las sesiones abiertas del panel.
  version_sesion: 1,
};

const CATEGORIAS_INICIALES = [
  ['Escenarios', 'escenarios', 'Niveles, fondos y escenas completas.'],
  ['Tilesets', 'tilesets', 'Piezas para montar mapas y niveles.'],
  ['Objetos', 'objetos', 'Pociones, armas, escudos y todo lo que se puede recoger.'],
  ['Personajes', 'personajes', 'Protagonistas, enemigos y criaturas.'],
  ['Iconos', 'iconos', 'Iconos de interfaz e inventario.'],
  ['Tipografía', 'tipografia', 'Letras, números y fuentes pixeladas.'],
];

export const ahora = () => new Date().toISOString();
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// Completa los datos con lo que falte (por ejemplo, ajustes nuevos que se
// añadan en versiones futuras de la web).
function normalizar(datos) {
  const d = datos && typeof datos === 'object' ? datos : {};
  return {
    version: 1,
    ajustes: { ...AJUSTES_POR_DEFECTO, ...(d.ajustes || {}), redes: { ...AJUSTES_POR_DEFECTO.redes, ...(d.ajustes?.redes || {}) } },
    categorias: Array.isArray(d.categorias) ? d.categorias : [],
    obras: Array.isArray(d.obras) ? d.obras : [],
  };
}

function contenidoVacio() {
  return normalizar({
    categorias: CATEGORIAS_INICIALES.map(([nombre, slug, descripcion], i) => ({
      id: i + 1,
      nombre,
      slug,
      descripcion,
      orden: i,
      creado: ahora(),
    })),
  });
}

// ---------------------------------------------------------------------------
// Semilla: el contenido inicial que va dentro del proyecto (carpeta semilla/)
// ---------------------------------------------------------------------------

async function leerSemilla() {
  try {
    const texto = await fs.readFile(path.join(config.dirSemilla, 'contenido.json'), 'utf8');
    return JSON.parse(texto);
  } catch {
    return null;
  }
}

// Mientras el almacén está vacío, la web pública muestra la semilla tal cual
// (sus imágenes se sirven desde /semilla/). Así nunca se ve una web vacía.
async function semillaDeLectura() {
  const semilla = await leerSemilla();
  if (!semilla) return contenidoVacio();
  const datos = normalizar(semilla);
  datos.obras = datos.obras.map((o) => ({ ...o, archivo: `/semilla/${o.archivo}`, miniatura: null }));
  return datos;
}

// Contenido de una versión anterior de la web que todavía no se ha pasado al
// almacén privado (null si no hay o no se puede leer).
async function contenidoAnterior() {
  try {
    const anterior = await almacen.leerContenidoAnterior();
    return anterior ? normalizar(anterior) : null;
  } catch (error) {
    console.error('[contenido] No se ha podido leer el contenido anterior:', error);
    return null;
  }
}

// Primer guardado con el almacén vacío: se parte del contenido anterior si lo
// hay (y se borra su copia antigua) o, si no, de la semilla.
async function importarInicial() {
  const anterior = await contenidoAnterior();
  if (!anterior) return importarSemilla();
  try {
    await almacen.guardarContenido(anterior, null);
  } catch (error) {
    // Si otro proceso lo pasó al mismo tiempo, no pasa nada.
    if (!(error instanceof ConflictoAlmacen)) throw error;
  }
  try {
    await almacen.borrarContenidoAnterior();
  } catch (error) {
    console.error('[contenido] No se ha podido borrar la copia anterior:', error);
  }
}

// Copia la semilla al almacén la primera vez que se guarda algo.
async function importarSemilla() {
  const semilla = await leerSemilla();
  const datos = semilla ? normalizar(semilla) : contenidoVacio();
  for (const obra of datos.obras) {
    if (!obra.archivo || /^(https?:)?\//.test(obra.archivo)) continue;
    const buffer = await fs.readFile(path.join(config.dirSemilla, obra.archivo));
    const extension = path.extname(obra.archivo);
    const tipo = { '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' }[extension];
    // Nombre fijo por obra: si dos procesos importan a la vez, no se duplica nada.
    obra.archivo = await almacen.subirArchivo(`semilla-${obra.slug}${extension}`, buffer, tipo);
    obra.miniatura = null;
  }
  try {
    await almacen.guardarContenido(datos, null);
  } catch (error) {
    // Si otro proceso la importó al mismo tiempo, no pasa nada.
    if (!(error instanceof ConflictoAlmacen)) throw error;
  }
}

// ---------------------------------------------------------------------------
// Lectura y escritura
// ---------------------------------------------------------------------------

// Copia en memoria para no leer el almacén en cada visita.
let cache = null;
const DURACION_CACHE = 8000;

// fresco: true lee la última versión guardada (el panel lo usa siempre).
export async function leerContenido({ fresco = false } = {}) {
  if (!fresco && cache && Date.now() - cache.momento < DURACION_CACHE) return cache.datos;
  const leido = await almacen.leerContenido({ fresco });
  const datos = leido ? normalizar(leido.datos) : (await contenidoAnterior()) || (await semillaDeLectura());
  cache = { datos, momento: Date.now() };
  return datos;
}

// Modifica el contenido de forma segura: lee la última versión, aplica los
// cambios y guarda. Si mientras tanto otro guardado se adelantó, lo repite
// con los datos nuevos. La función "cambiar" no debe tener efectos fuera de
// los datos (subir o borrar archivos se hace antes o después).
export async function modificar(cambiar) {
  for (let intento = 0; intento < 5; intento++) {
    const leido = await almacen.leerContenido({ fresco: true });
    if (!leido) {
      await importarInicial();
      continue;
    }
    const datos = normalizar(structuredClone(leido.datos));
    const resultado = await cambiar(datos);
    try {
      await almacen.guardarContenido(datos, leido.etag);
      cache = { datos, momento: Date.now() };
      return resultado;
    } catch (error) {
      if (!(error instanceof ConflictoAlmacen)) throw error;
      await esperar(200 * (intento + 1));
    }
  }
  const error = new Error('No se han podido guardar los cambios porque se estaba guardando otra cosa a la vez. Inténtalo de nuevo en unos segundos.');
  error.status = 409;
  throw error;
}

// ---------------------------------------------------------------------------
// Utilidades para obras y categorías
// ---------------------------------------------------------------------------

// Obra lista para la API: añade su categoría y las direcciones de la imagen.
export function formatearObra(obra, categorias) {
  const categoria = categorias.find((c) => c.id === obra.categoria_id);
  return {
    ...obra,
    categoria: categoria ? { id: categoria.id, nombre: categoria.nombre, slug: categoria.slug } : null,
    url: obra.archivo,
    miniatura: obra.miniatura || obra.archivo,
  };
}

export function obrasOrdenadas(datos, { soloPublicadas = false } = {}) {
  return datos.obras
    .filter((o) => !soloPublicadas || o.publicada)
    .sort((a, b) => a.orden - b.orden || b.creado.localeCompare(a.creado))
    .map((o) => formatearObra(o, datos.categorias));
}

export function categoriasConCuenta(datos, { soloConPublicadas = false } = {}) {
  const lista = [...datos.categorias]
    .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es'))
    .map((c) => ({
      ...c,
      total: datos.obras.filter((o) => o.categoria_id === c.id).length,
      publicadas: datos.obras.filter((o) => o.categoria_id === c.id && o.publicada).length,
    }));
  return soloConPublicadas ? lista.filter((c) => c.publicadas > 0) : lista;
}

export const siguienteId = (lista) => lista.reduce((max, el) => Math.max(max, el.id), 0) + 1;

// Convierte un texto en un identificador para URLs: "Poción Turquesa" -> "pocion-turquesa".
export function slugificar(texto) {
  const base = String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return base || 'obra';
}

// Devuelve un slug que no use ningún otro elemento de la lista (añade -2, -3...).
export function slugUnico(lista, texto, idExcluido = 0) {
  const base = slugificar(texto);
  let candidato = base;
  let n = 2;
  while (lista.some((el) => el.slug === candidato && el.id !== idExcluido)) candidato = `${base}-${n++}`;
  return candidato;
}
