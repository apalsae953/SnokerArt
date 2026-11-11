// Almacén de la web: dónde se guardan las imágenes y el archivo contenido.json
// (títulos, categorías, ajustes...). No hay base de datos.
//
// Hay dos versiones con la misma forma de uso:
//  - En Vercel (o si existe BLOB_READ_WRITE_TOKEN): todo va a Vercel Blob
//    (las imágenes a un almacén público y contenido.json a uno privado).
//  - En tu PC sin token: archivos normales en las carpetas datos/ y subidas/.
//
// Para que dos guardados seguidos nunca se pisen, cada lectura devuelve una
// "etiqueta de versión" (ETag) y al guardar se comprueba que nadie lo haya
// cambiado mientras tanto. Si alguien lo cambió, se lanza ConflictoAlmacen y
// quien guarda vuelve a leer y lo intenta otra vez.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { put, get, head, del, list, BlobPreconditionFailedError } from '@vercel/blob';
import { config } from './config.js';

export class ConflictoAlmacen extends Error {}

const hash = (texto) => crypto.createHash('sha1').update(texto).digest('hex');

// ---------------------------------------------------------------------------
// Versión local: archivos en el disco
// ---------------------------------------------------------------------------
function almacenLocal() {
  const archivoContenido = path.join(config.dirDatos, 'contenido.json');

  // En local hay un solo proceso: las lecturas y escrituras del contenido se
  // ponen en fila para que comprobar la versión y guardar ocurra de una vez
  // (y para que Windows no bloquee el archivo mientras otro lo lee).
  let fila = Promise.resolve();
  const enFila = (tarea) => {
    const resultado = fila.then(tarea, tarea);
    fila = resultado.catch(() => {});
    return resultado;
  };

  async function leerTexto() {
    try {
      return await fs.readFile(archivoContenido, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }

  return {
    tipo: 'local',
    datosPrivados: true,

    // En disco siempre se lee la última versión (no hay caché que saltarse).
    leerContenido() {
      return enFila(async () => {
        const texto = await leerTexto();
        if (texto === null) return null;
        return { datos: JSON.parse(texto), etag: hash(texto) };
      });
    },

    guardarContenido(datos, etagEsperado) {
      return enFila(async () => {
        const actual = await leerTexto();
        const etagActual = actual === null ? null : hash(actual);
        if (etagActual !== (etagEsperado ?? null)) throw new ConflictoAlmacen('El contenido ha cambiado.');
        const texto = JSON.stringify(datos, null, 2);
        await fs.mkdir(config.dirDatos, { recursive: true });
        // Se escribe en un archivo temporal y se renombra: nunca queda a medias.
        const temporal = `${archivoContenido}.${crypto.randomBytes(6).toString('hex')}.tmp`;
        await fs.writeFile(temporal, texto);
        await fs.rename(temporal, archivoContenido);
        return hash(texto);
      });
    },

    async subirArchivo(nombre, buffer) {
      await fs.mkdir(config.dirSubidas, { recursive: true });
      await fs.writeFile(path.join(config.dirSubidas, nombre), buffer);
      return `/subidas/${nombre}`;
    },

    async borrarArchivo(url) {
      if (!url?.startsWith('/subidas/')) return;
      const nombre = path.basename(url);
      await fs.rm(path.join(config.dirSubidas, nombre), { force: true });
    },

    // En local no hay versión anterior que pasar a ningún sitio.
    async leerContenidoAnterior() {
      return null;
    },
    async borrarContenidoAnterior() {},
  };
}

// ---------------------------------------------------------------------------
// Versión Vercel Blob
// ---------------------------------------------------------------------------
//
// Las imágenes van al almacén PÚBLICO (variables BLOB_...), porque la web las
// enseña directamente.
//
// contenido.json va, si existe, a un segundo almacén PRIVADO conectado con el
// prefijo DATOS (variables DATOS_...). Hace falta porque Vercel sirve los
// archivos públicos desde su caché y, después de sobrescribirlos, puede seguir
// dando la versión antigua hasta un minuto: el panel leería datos viejos y
// cada guardado chocaría con el anterior. En un almacén privado se puede pedir
// siempre la última versión (useCache: false) y, además, nadie de fuera puede
// leer el archivo (que incluye los borradores).
function almacenDeDatos() {
  if (process.env.DATOS_READ_WRITE_TOKEN) {
    return { privado: true, acceso: { access: 'private', token: process.env.DATOS_READ_WRITE_TOKEN } };
  }
  if (process.env.DATOS_STORE_ID) {
    return { privado: true, acceso: { access: 'private', storeId: process.env.DATOS_STORE_ID } };
  }
  return { privado: false, acceso: { access: 'public' } };
}

const PREFIJO_CONTENIDO = 'datos/contenido-';

// Busca el contenido.json más reciente de un almacén (null si no hay).
async function buscarContenido(opciones) {
  const { blobs } = await list({ prefix: PREFIJO_CONTENIDO, limit: 10, ...opciones });
  if (!blobs.length) return null;
  blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  return blobs;
}

function almacenBlob() {
  const { privado, acceso } = almacenDeDatos();
  // Opciones para list()/head()/del() del almacén de datos (sin "access").
  const { access, ...credenciales } = acceso;

  // El contenido se guarda con un nombre aleatorio para que nadie pueda
  // adivinar su dirección. Se localiza con list(), que requiere permiso, y se
  // recuerda mientras la función siga viva.
  let rutaContenido = null;
  // Última versión que guardó esta misma función. Si no hay almacén privado,
  // permite trabajar con la versión al día aunque la caché pública aún dé la
  // anterior (se comprueba con head(), que siempre está al día).
  let ultimoGuardado = null;

  async function localizarContenido() {
    if (rutaContenido) return rutaContenido;
    const blobs = await buscarContenido(credenciales);
    rutaContenido = blobs ? blobs[0].pathname : null;
    return rutaContenido;
  }

  async function leerUltimoGuardado(ruta) {
    if (privado || !ultimoGuardado || ultimoGuardado.ruta !== ruta) return null;
    try {
      const { etag } = await head(ruta, credenciales);
      if (etag !== ultimoGuardado.etag) return null;
      return { datos: JSON.parse(ultimoGuardado.texto), etag };
    } catch {
      return null;
    }
  }

  return {
    tipo: 'blob',
    datosPrivados: privado,

    // fresco: true pide la última versión (para el panel y para guardar).
    async leerContenido({ fresco = false } = {}) {
      const ruta = await localizarContenido();
      if (!ruta) return null;
      if (fresco) {
        const recordado = await leerUltimoGuardado(ruta);
        if (recordado) return recordado;
      }
      // En el almacén privado, la etiqueta de versión (ETag) se pide a la API
      // con head(), como recomienda Vercel: la lectura sin caché la devuelve
      // "débil" (W/"abc...") y put({ ifMatch }) solo acepta la normal ("abc..."),
      // así que con ella todos los guardados se rechazaban. Se pide ANTES de
      // leer el archivo, así el archivo nunca es más antiguo que la etiqueta
      // (si alguien guarda entre medias, el guardado falla y se repite, sin
      // perder nada).
      let versionApi = null;
      if (fresco && privado) {
        try {
          versionApi = (await head(ruta, credenciales)).etag;
        } catch {
          rutaContenido = null;
          return null;
        }
      }
      // Con almacén privado, useCache: false lee siempre la última versión.
      // (Con almacén público Vercel ignora esta opción.)
      const resultado = await get(ruta, { ...acceso, useCache: !fresco });
      if (!resultado || resultado.statusCode !== 200) {
        rutaContenido = null;
        return null;
      }
      const texto = await new Response(resultado.stream).text();
      const etag = versionApi || resultado.blob.etag;
      if (!etag) throw new Error('Vercel Blob no ha devuelto la versión de contenido.json.');
      return { datos: JSON.parse(texto), etag };
    },

    async guardarContenido(datos, etagEsperado) {
      // Solo se crea el archivo cuando se pide expresamente (etag null).
      const creando = etagEsperado == null;
      let ruta = await localizarContenido();
      if (creando && ruta) throw new ConflictoAlmacen('El contenido ya existe.');
      if (!ruta) ruta = `${PREFIJO_CONTENIDO}${crypto.randomBytes(16).toString('hex')}.json`;
      const texto = JSON.stringify(datos);
      try {
        const resultado = await put(ruta, texto, {
          ...acceso,
          addRandomSuffix: false,
          allowOverwrite: !creando,
          contentType: 'application/json',
          cacheControlMaxAge: 60,
          ...(creando ? {} : { ifMatch: etagEsperado }),
        });
        rutaContenido = ruta;
        ultimoGuardado = { ruta, etag: resultado.etag, texto };
        return resultado.etag;
      } catch (error) {
        if (error instanceof BlobPreconditionFailedError) {
          console.warn('[almacen] Vercel rechaza el guardado: la versión ha cambiado.', error.message);
          throw new ConflictoAlmacen('El contenido ha cambiado.');
        }
        // Al crear: si otro proceso lo creó a la vez, también es un conflicto.
        if (creando && /exist/i.test(error.message)) throw new ConflictoAlmacen('El contenido ya existe.');
        throw error;
      }
    },

    // Contenido que quedó en el almacén público de una versión anterior de la
    // web (antes de tener almacén privado). Se usa una sola vez para pasarlo
    // al privado; luego se borra con borrarContenidoAnterior().
    async leerContenidoAnterior() {
      if (!privado) return null;
      const blobs = await buscarContenido({});
      if (!blobs) return null;
      const resultado = await get(blobs[0].pathname, { access: 'public' });
      if (!resultado || resultado.statusCode !== 200) return null;
      return JSON.parse(await new Response(resultado.stream).text());
    },

    async borrarContenidoAnterior() {
      if (!privado) return;
      const blobs = await buscarContenido({});
      if (blobs) await del(blobs.map((b) => b.url));
    },

    async subirArchivo(nombre, buffer, tipo) {
      const resultado = await put(`obras/${nombre}`, buffer, {
        access: 'public',
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: tipo,
        // Los nombres son únicos, así que se pueden cachear un año.
        cacheControlMaxAge: 31536000,
      });
      return resultado.url;
    },

    async borrarArchivo(url) {
      if (!url?.includes('.blob.vercel-storage.com/')) return;
      await del(url);
    },
  };
}

export const usandoBlob = !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
export const almacen = usandoBlob ? almacenBlob() : almacenLocal();
