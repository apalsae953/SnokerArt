// Base de datos SQLite usando el módulo nativo de Node (node:sqlite).
// Sin dependencias externas: el archivo vive en /datos/snoker.db.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

fs.mkdirSync(config.dirDatos, { recursive: true });

export const db = new DatabaseSync(path.join(config.dirDatos, 'snoker.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');

// Cada entrada es una migración. Se aplican en orden y la versión se guarda en
// PRAGMA user_version, así que nunca se ejecutan dos veces.
const migraciones = [
  `
  CREATE TABLE categorias (
    id          INTEGER PRIMARY KEY,
    nombre      TEXT NOT NULL,
    slug        TEXT NOT NULL UNIQUE,
    descripcion TEXT NOT NULL DEFAULT '',
    orden       INTEGER NOT NULL DEFAULT 0,
    creado      TEXT NOT NULL
  );

  CREATE TABLE obras (
    id           INTEGER PRIMARY KEY,
    slug         TEXT NOT NULL UNIQUE,
    titulo       TEXT NOT NULL,
    descripcion  TEXT NOT NULL DEFAULT '',
    categoria_id INTEGER REFERENCES categorias(id) ON DELETE SET NULL,
    tecnica      TEXT NOT NULL DEFAULT 'pixel-art',
    etiquetas    TEXT NOT NULL DEFAULT '[]',
    archivo      TEXT NOT NULL,
    miniatura    TEXT,
    ancho        INTEGER NOT NULL,
    alto         INTEGER NOT NULL,
    formato      TEXT NOT NULL,
    peso         INTEGER NOT NULL,
    escala       INTEGER NOT NULL DEFAULT 1,
    pixelado     INTEGER NOT NULL DEFAULT 0,
    transparente INTEGER NOT NULL DEFAULT 0,
    animado      INTEGER NOT NULL DEFAULT 0,
    paleta       TEXT NOT NULL DEFAULT '[]',
    num_colores  INTEGER NOT NULL DEFAULT 0,
    destacada    INTEGER NOT NULL DEFAULT 0,
    publicada    INTEGER NOT NULL DEFAULT 1,
    descargable  INTEGER NOT NULL DEFAULT 0,
    orden        INTEGER NOT NULL DEFAULT 0,
    vistas       INTEGER NOT NULL DEFAULT 0,
    creado       TEXT NOT NULL,
    actualizado  TEXT NOT NULL
  );
  CREATE INDEX obras_orden ON obras (orden, creado);

  CREATE TABLE ajustes (
    clave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
  );

  CREATE TABLE admin (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    hash        TEXT NOT NULL,
    actualizado TEXT NOT NULL
  );

  CREATE TABLE sesiones (
    token_hash TEXT PRIMARY KEY,
    creado     TEXT NOT NULL,
    expira     TEXT NOT NULL,
    ultimo_uso TEXT NOT NULL,
    ip         TEXT NOT NULL DEFAULT '',
    agente     TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE vistas_diarias (
    fecha   TEXT NOT NULL,
    obra_id INTEGER NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
    total   INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (fecha, obra_id)
  );
  `,
];

function migrar() {
  const { user_version: version } = db.prepare('PRAGMA user_version').get();
  for (let i = version; i < migraciones.length; i++) {
    transaccion(() => {
      db.exec(migraciones[i]);
      db.exec(`PRAGMA user_version = ${i + 1}`);
    });
  }
}

// Ejecuta una función dentro de una transacción. Si algo falla, deshace todo.
export function transaccion(fn) {
  db.exec('BEGIN');
  try {
    const resultado = fn();
    db.exec('COMMIT');
    return resultado;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export const ahora = () => new Date().toISOString();

// Valores iniciales de la web. Se pueden cambiar todos desde el panel.
const AJUSTES_POR_DEFECTO = {
  nombre_sitio: 'Snoker Art',
  lema: 'Pixel art, 2D y 3D para videojuegos',
  descripcion:
    'Sprites, objetos, escenarios y tilesets dibujados a mano para mundos de videojuego.',
  sobre_mi:
    'Dibujo el arte de mis videojuegos píxel a píxel: personajes, objetos, escenarios y tilesets, y también piezas en 2D y 3D. Aquí voy subiendo todo lo que creo, desde el primer boceto hasta el sprite final.',
  sobre_mi_extra:
    'Si buscas arte para tu juego o quieres colaborar en un proyecto, escríbeme y lo hablamos.',
  ubicacion: '',
  desde: '',
  email: '',
  abierto_encargos: '1',
  redes: JSON.stringify({
    artstation: '',
    itchio: '',
    instagram: '',
    x: '',
    bluesky: '',
    youtube: '',
    github: '',
    web: '',
  }),
  obra_portada: '',
  obra_avatar: '',
  texto_pie: '',
};

const CATEGORIAS_INICIALES = [
  ['Escenarios', 'escenarios', 'Niveles, fondos y escenas completas.'],
  ['Tilesets', 'tilesets', 'Piezas para montar mapas y niveles.'],
  ['Objetos', 'objetos', 'Pociones, armas, escudos y todo lo que se puede recoger.'],
  ['Personajes', 'personajes', 'Protagonistas, enemigos y criaturas.'],
  ['Iconos', 'iconos', 'Iconos de interfaz e inventario.'],
  ['Tipografía', 'tipografia', 'Letras, números y fuentes pixeladas.'],
];

function sembrar() {
  const insertarAjuste = db.prepare('INSERT OR IGNORE INTO ajustes (clave, valor) VALUES (?, ?)');
  for (const [clave, valor] of Object.entries(AJUSTES_POR_DEFECTO)) insertarAjuste.run(clave, valor);

  const { total } = db.prepare('SELECT COUNT(*) AS total FROM categorias').get();
  if (total === 0) {
    const insertar = db.prepare(
      'INSERT INTO categorias (nombre, slug, descripcion, orden, creado) VALUES (?, ?, ?, ?, ?)'
    );
    transaccion(() => {
      CATEGORIAS_INICIALES.forEach(([nombre, slug, desc], i) => insertar.run(nombre, slug, desc, i, ahora()));
    });
  }
}

migrar();
sembrar();

// ---------------------------------------------------------------------------
// Ajustes
// ---------------------------------------------------------------------------

export function leerAjustes() {
  const filas = db.prepare('SELECT clave, valor FROM ajustes').all();
  const ajustes = { ...AJUSTES_POR_DEFECTO };
  for (const { clave, valor } of filas) ajustes[clave] = valor;
  let redes = {};
  try {
    redes = JSON.parse(ajustes.redes || '{}');
  } catch {
    redes = {};
  }
  return { ...ajustes, redes, abierto_encargos: ajustes.abierto_encargos === '1' };
}

export function guardarAjustes(cambios) {
  const actualizar = db.prepare(
    'INSERT INTO ajustes (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor'
  );
  transaccion(() => {
    for (const [clave, valor] of Object.entries(cambios)) actualizar.run(clave, String(valor));
  });
}

export const CLAVES_AJUSTES = Object.keys(AJUSTES_POR_DEFECTO);

// ---------------------------------------------------------------------------
// Obras
// ---------------------------------------------------------------------------

const SELECT_OBRA = `
  SELECT o.*, c.nombre AS categoria_nombre, c.slug AS categoria_slug
  FROM obras o LEFT JOIN categorias c ON c.id = o.categoria_id
`;

// Convierte una fila de SQLite en un objeto limpio para la API.
export function formatearObra(fila) {
  if (!fila) return null;
  const json = (texto, defecto) => {
    try {
      return JSON.parse(texto);
    } catch {
      return defecto;
    }
  };
  return {
    id: fila.id,
    slug: fila.slug,
    titulo: fila.titulo,
    descripcion: fila.descripcion,
    categoria: fila.categoria_id
      ? { id: fila.categoria_id, nombre: fila.categoria_nombre, slug: fila.categoria_slug }
      : null,
    tecnica: fila.tecnica,
    etiquetas: json(fila.etiquetas, []),
    url: `/subidas/${fila.archivo}`,
    miniatura: fila.miniatura ? `/subidas/${fila.miniatura}` : `/subidas/${fila.archivo}`,
    ancho: fila.ancho,
    alto: fila.alto,
    formato: fila.formato,
    peso: fila.peso,
    escala: fila.escala,
    pixelado: !!fila.pixelado,
    transparente: !!fila.transparente,
    animado: !!fila.animado,
    paleta: json(fila.paleta, []),
    num_colores: fila.num_colores,
    destacada: !!fila.destacada,
    publicada: !!fila.publicada,
    descargable: !!fila.descargable,
    orden: fila.orden,
    vistas: fila.vistas,
    creado: fila.creado,
    actualizado: fila.actualizado,
  };
}

export function listarObras({ soloPublicadas = false } = {}) {
  const filtro = soloPublicadas ? 'WHERE o.publicada = 1' : '';
  return db
    .prepare(`${SELECT_OBRA} ${filtro} ORDER BY o.orden ASC, o.creado DESC`)
    .all()
    .map(formatearObra);
}

export function obtenerObra(id) {
  return formatearObra(db.prepare(`${SELECT_OBRA} WHERE o.id = ?`).get(id));
}

export function obtenerObraPorSlug(slug) {
  return formatearObra(db.prepare(`${SELECT_OBRA} WHERE o.slug = ?`).get(slug));
}

// Fila sin formatear (para saber los nombres de archivo al borrar o reemplazar).
export function filaObra(id) {
  return db.prepare('SELECT * FROM obras WHERE id = ?').get(id);
}

// ---------------------------------------------------------------------------
// Categorías
// ---------------------------------------------------------------------------

export function listarCategorias({ soloConPublicadas = false } = {}) {
  const filas = db
    .prepare(
      `SELECT c.*,
         (SELECT COUNT(*) FROM obras o WHERE o.categoria_id = c.id) AS total,
         (SELECT COUNT(*) FROM obras o WHERE o.categoria_id = c.id AND o.publicada = 1) AS publicadas
       FROM categorias c ORDER BY c.orden ASC, c.nombre ASC`
    )
    .all();
  const lista = filas.map((c) => ({
    id: c.id,
    nombre: c.nombre,
    slug: c.slug,
    descripcion: c.descripcion,
    orden: c.orden,
    total: c.total,
    publicadas: c.publicadas,
  }));
  return soloConPublicadas ? lista.filter((c) => c.publicadas > 0) : lista;
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

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

// Devuelve un slug que no exista aún en la tabla indicada (añade -2, -3...).
export function slugUnico(tabla, texto, idExcluido = 0) {
  const base = slugificar(texto);
  const existe = db.prepare(`SELECT 1 FROM ${tabla} WHERE slug = ? AND id != ?`);
  let candidato = base;
  let n = 2;
  while (existe.get(candidato, idExcluido)) candidato = `${base}-${n++}`;
  return candidato;
}
