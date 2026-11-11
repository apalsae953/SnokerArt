// API pública: lo que necesita la web para mostrar la galería.
// Solo devuelve obras publicadas; los borradores nunca salen de aquí.
import path from 'node:path';
import { Router } from 'express';
import { leerContenido, obrasOrdenadas, categoriasConCuenta } from '../contenido.js';
import { config } from '../config.js';

export const rutasPublicas = Router();

// Datos públicos de la web: textos, redes y contadores.
function datosSitio(datos) {
  const { ajustes } = datos;
  const publicadas = datos.obras.filter((o) => o.publicada);
  const tecnicas = [...new Set(publicadas.map((o) => o.tecnica))]
    .map((tecnica) => ({ tecnica, total: publicadas.filter((o) => o.tecnica === tecnica).length }))
    .sort((a, b) => b.total - a.total);
  // Solo se muestran las redes que tienen enlace.
  const redes = Object.fromEntries(Object.entries(ajustes.redes || {}).filter(([, url]) => url));
  return {
    nombre_sitio: ajustes.nombre_sitio,
    lema: ajustes.lema,
    descripcion: ajustes.descripcion,
    sobre_mi: ajustes.sobre_mi,
    sobre_mi_extra: ajustes.sobre_mi_extra,
    ubicacion: ajustes.ubicacion,
    desde: ajustes.desde,
    email: ajustes.email,
    abierto_encargos: ajustes.abierto_encargos,
    redes,
    obra_portada: ajustes.obra_portada,
    obra_avatar: ajustes.obra_avatar,
    texto_pie: ajustes.texto_pie,
    total_obras: publicadas.length,
    tecnicas,
  };
}

// Todo lo que la portada necesita en una sola petición. En Vercel la
// respuesta se guarda unos segundos en su CDN, así la web vuela y casi no se
// lee el almacén; los cambios del panel aparecen en unos 10 segundos.
rutasPublicas.get('/publico', async (req, res) => {
  const datos = await leerContenido();
  const obras = obrasOrdenadas(datos, { soloPublicadas: true }).map(({ publicada, orden, ...resto }) => resto);
  const categorias = categoriasConCuenta(datos, { soloConPublicadas: true }).map(({ total, ...c }) => c);
  res.set('Cache-Control', 'public, max-age=0, s-maxage=10, stale-while-revalidate=60');
  res.json({ sitio: datosSitio(datos), obras, categorias });
});

// Descarga del archivo original, solo si la obra lo permite.
rutasPublicas.get('/obras/:slug/descargar', async (req, res) => {
  const datos = await leerContenido();
  const obra = datos.obras.find((o) => o.slug === String(req.params.slug));
  if (!obra || !obra.publicada || !obra.descargable) {
    return res.status(404).json({ error: 'Esta obra no se puede descargar.' });
  }
  const nombre = `${obra.slug}.${obra.formato}`;
  // En Vercel Blob la imagen está en otra dirección: se redirige a ella.
  if (/^https?:\/\//.test(obra.archivo)) return res.redirect(302, `${obra.archivo}?download=1`);
  const carpeta = obra.archivo.startsWith('/semilla/') ? config.dirSemilla : config.dirSubidas;
  const relativo = obra.archivo.replace(/^\/(semilla|subidas)\//, '');
  res.download(path.join(carpeta, path.normalize(relativo).replace(/^(\.\.[/\\])+/, '')), nombre);
});
