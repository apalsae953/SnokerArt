// Almacén de la web: dónde se guardan las imágenes y el archivo contenido.json
// (títulos, categorías, ajustes...). No hay base de datos.
//
// Hay dos versiones con la misma forma de uso:
//  - En Vercel (o si existe BLOB_READ_WRITE_TOKEN): todo va a Vercel Blob.
//  - En tu PC sin token: archivos normales en las carpetas datos/ y subidas/.
//
// Para que dos guardados seguidos nunca se pisen, cada lectura devuelve una
// "etiqueta de versión" (ETag) y al guardar se comprueba que nadie lo haya
// cambiado mientras tanto. Si alguien lo cambió, se lanza ConflictoAlmacen y
// quien guarda vuelve a leer y lo intenta otra vez.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { put, get, del, list, BlobPreconditionFailedError } from '@vercel/blob';
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
  };
}

// ---------------------------------------------------------------------------
// Versión Vercel Blob
// ---------------------------------------------------------------------------
function almacenBlob() {
  // El contenido se guarda con un nombre aleatorio para que nadie pueda
  // adivinar su dirección (incluye los borradores). Se localiza con list(),
  // que requiere el token, y se recuerda mientras la función siga viva.
  let rutaContenido = null;

  async function localizarContenido() {
    if (rutaContenido) return rutaContenido;
    const { blobs } = await list({ prefix: 'datos/contenido-', limit: 10 });
    if (!blobs.length) return null;
    // Si por algún motivo hubiera varios, manda el más reciente.
    blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
    rutaContenido = blobs[0].pathname;
    return rutaContenido;
  }

  return {
    tipo: 'blob',

    async leerContenido() {
      const ruta = await localizarContenido();
      if (!ruta) return null;
      // useCache: false lee directamente del almacén, nunca una copia antigua.
      const resultado = await get(ruta, { access: 'public', useCache: false });
      if (!resultado || resultado.statusCode !== 200) {
        rutaContenido = null;
        return null;
      }
      const texto = await new Response(resultado.stream).text();
      return { datos: JSON.parse(texto), etag: resultado.blob.etag };
    },

    async guardarContenido(datos, etagEsperado) {
      const creando = !etagEsperado;
      let ruta = await localizarContenido();
      if (creando && ruta) throw new ConflictoAlmacen('El contenido ya existe.');
      if (!ruta) ruta = `datos/contenido-${crypto.randomBytes(16).toString('hex')}.json`;
      try {
        const resultado = await put(ruta, JSON.stringify(datos), {
          access: 'public',
          addRandomSuffix: false,
          allowOverwrite: !creando,
          contentType: 'application/json',
          cacheControlMaxAge: 60,
          ...(creando ? {} : { ifMatch: etagEsperado }),
        });
        rutaContenido = ruta;
        return resultado.etag;
      } catch (error) {
        if (error instanceof BlobPreconditionFailedError) throw new ConflictoAlmacen('El contenido ha cambiado.');
        // Al crear: si otro proceso lo creó a la vez, también es un conflicto.
        if (creando && /exist/i.test(error.message)) throw new ConflictoAlmacen('El contenido ya existe.');
        throw error;
      }
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
