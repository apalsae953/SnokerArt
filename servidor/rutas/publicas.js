// API pública: lo que necesita la web para mostrar la galería.
// Solo devuelve obras publicadas; los borradores nunca salen de aquí.
import path from 'node:path';
import { Router } from 'express';
import { db, leerAjustes, listarObras, listarCategorias, obtenerObraPorSlug, filaObra } from '../db.js';
import { config } from '../config.js';

export const rutasPublicas = Router();

// Datos públicos de la web (nombre, textos, redes...) y contadores.
export function datosSitio() {
  const ajustes = leerAjustes();
  const tecnicas = db
    .prepare('SELECT tecnica, COUNT(*) AS total FROM obras WHERE publicada = 1 GROUP BY tecnica ORDER BY total DESC')
    .all()
    .map((t) => ({ tecnica: t.tecnica, total: t.total }));
  const { total } = db.prepare('SELECT COUNT(*) AS total FROM obras WHERE publicada = 1').get();

  // Solo se exponen las redes que tienen enlace.
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
    total_obras: total,
    tecnicas,
  };
}

rutasPublicas.get('/sitio', (req, res) => {
  res.json(datosSitio());
});

rutasPublicas.get('/obras', (req, res) => {
  // Se quitan datos internos que el público no necesita.
  const obras = listarObras({ soloPublicadas: true }).map(({ publicada, orden, ...resto }) => resto);
  res.json(obras);
});

rutasPublicas.get('/categorias', (req, res) => {
  const categorias = listarCategorias({ soloConPublicadas: true }).map(({ total, ...c }) => c);
  res.json(categorias);
});

// Contador de visitas por obra. Se ignoran las visitas repetidas de la misma
// IP a la misma obra durante 30 minutos para que el número sea realista.
const vistasRecientes = new Map();
const VENTANA_VISTAS = 30 * 60 * 1000;

setInterval(() => {
  const limite = Date.now() - VENTANA_VISTAS;
  for (const [clave, momento] of vistasRecientes) if (momento < limite) vistasRecientes.delete(clave);
}, 10 * 60 * 1000).unref();

rutasPublicas.post('/obras/:id/vista', (req, res) => {
  const id = Number(req.params.id);
  const fila = Number.isInteger(id) ? filaObra(id) : null;
  if (!fila || !fila.publicada) return res.status(404).json({ error: 'Obra no encontrada.' });

  const clave = `${req.ip}:${id}`;
  const anterior = vistasRecientes.get(clave);
  if (anterior && Date.now() - anterior < VENTANA_VISTAS) return res.json({ ok: true, contada: false });
  vistasRecientes.set(clave, Date.now());

  const fecha = new Date().toISOString().slice(0, 10);
  db.prepare('UPDATE obras SET vistas = vistas + 1 WHERE id = ?').run(id);
  db.prepare(
    `INSERT INTO vistas_diarias (fecha, obra_id, total) VALUES (?, ?, 1)
     ON CONFLICT(fecha, obra_id) DO UPDATE SET total = total + 1`
  ).run(fecha, id);
  res.json({ ok: true, contada: true });
});

// Descarga del archivo original, solo si la obra lo permite.
rutasPublicas.get('/obras/:slug/descargar', (req, res) => {
  const obra = obtenerObraPorSlug(String(req.params.slug));
  if (!obra || !obra.publicada || !obra.descargable) {
    return res.status(404).json({ error: 'Esta obra no se puede descargar.' });
  }
  const archivo = path.join(config.dirSubidas, path.basename(obra.url));
  res.download(archivo, `${obra.slug}.${obra.formato}`);
});
