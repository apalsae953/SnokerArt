// Procesado de imágenes subidas desde el panel:
//  - valida que de verdad sea una imagen (no se fía de la extensión),
//  - detecta si es pixel art escalado (por ejemplo un sprite de 32x32 exportado a x4),
//  - extrae la paleta de colores,
//  - genera una miniatura ligera solo cuando la imagen es grande.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { config } from './config.js';

const FORMATOS = { png: 'png', jpeg: 'jpg', webp: 'webp', gif: 'gif' };
const MAX_LADO = 12000;
const LADO_MINIATURA = 1400;

export class ErrorImagen extends Error {}

// Busca el mayor factor entero k tal que la imagen esté hecha de bloques k×k
// de un solo color. Un sprite de 32x32 exportado a 128x128 devuelve 4.
function detectarEscala(datos, ancho, alto) {
  const candidatos = [32, 24, 20, 16, 12, 10, 8, 6, 5, 4, 3, 2];
  const igual = (a, b) =>
    datos[a] === datos[b] && datos[a + 1] === datos[b + 1] && datos[a + 2] === datos[b + 2] && datos[a + 3] === datos[b + 3];

  for (const k of candidatos) {
    if (ancho % k !== 0 || alto % k !== 0 || ancho / k < 4 || alto / k < 4) continue;
    let ok = true;
    for (let y = 0; y < alto && ok; y++) {
      const filaBase = y - (y % k);
      for (let x = 0; x < ancho; x++) {
        const i = (y * ancho + x) * 4;
        const j = (filaBase * ancho + (x - (x % k))) * 4;
        // Los píxeles totalmente transparentes cuentan como iguales aunque su RGB difiera.
        if (datos[i + 3] === 0 && datos[j + 3] === 0) continue;
        if (!igual(i, j)) {
          ok = false;
          break;
        }
      }
    }
    if (ok) return k;
  }
  return 1;
}

const aHex = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

// Cuenta los colores exactos (ignorando los transparentes). Si hay pocos, la
// paleta son esos colores; si hay muchos, se agrupan para sacar los dominantes.
function extraerPaleta(datos) {
  const cuenta = new Map();
  let transparente = false;
  for (let i = 0; i < datos.length; i += 4) {
    if (datos[i + 3] < 250) transparente = true;
    if (datos[i + 3] < 128) continue;
    const clave = (datos[i] << 16) | (datos[i + 1] << 8) | datos[i + 2];
    cuenta.set(clave, (cuenta.get(clave) || 0) + 1);
  }

  const numColores = cuenta.size;
  if (numColores <= 32) {
    const paleta = [...cuenta.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([c]) => aHex((c >> 16) & 255, (c >> 8) & 255, c & 255));
    return { paleta, numColores, transparente };
  }

  // Agrupa en cubos de 4 bits por canal y se queda con los más frecuentes,
  // evitando colores casi idénticos entre sí.
  const cubos = new Map();
  for (const [c, n] of cuenta) {
    const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
    const clave = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const cubo = cubos.get(clave) || { n: 0, r: 0, g: 0, b: 0 };
    cubo.n += n;
    cubo.r += r * n;
    cubo.g += g * n;
    cubo.b += b * n;
    cubos.set(clave, cubo);
  }
  const ordenados = [...cubos.values()]
    .sort((a, b) => b.n - a.n)
    .map((c) => [Math.round(c.r / c.n), Math.round(c.g / c.n), Math.round(c.b / c.n)]);

  const elegidos = [];
  for (const color of ordenados) {
    const parecido = elegidos.some(
      (e) => Math.hypot(e[0] - color[0], e[1] - color[1], e[2] - color[2]) < 40
    );
    if (!parecido) elegidos.push(color);
    if (elegidos.length === 10) break;
  }
  return { paleta: elegidos.map((c) => aHex(...c)), numColores, transparente };
}

// Procesa el buffer subido y guarda los archivos en /subidas.
// Devuelve los datos que se guardan en la base de datos.
export async function procesarImagen(buffer) {
  let meta;
  try {
    meta = await sharp(buffer, { animated: true }).metadata();
  } catch {
    throw new ErrorImagen('El archivo no es una imagen válida.');
  }

  const extension = FORMATOS[meta.format];
  if (!extension) throw new ErrorImagen('Formato no admitido. Usa PNG, JPG, WEBP o GIF.');

  const animado = (meta.pages || 1) > 1;
  const ancho = meta.width;
  const alto = animado ? meta.pageHeight || meta.height : meta.height;
  if (!ancho || !alto || ancho > MAX_LADO || alto > MAX_LADO) {
    throw new ErrorImagen(`La imagen es demasiado grande (máximo ${MAX_LADO} px por lado).`);
  }

  await fs.mkdir(config.dirSubidas, { recursive: true });
  const id = crypto.randomBytes(10).toString('hex');
  const archivo = `${id}.${extension}`;

  // Los JPG se vuelven a codificar para quitar datos EXIF (por ejemplo la
  // ubicación GPS de una foto de móvil). PNG, GIF y WEBP se guardan tal cual
  // para no tocar ni un píxel del dibujo.
  let original = buffer;
  if (meta.format === 'jpeg') {
    original = await sharp(buffer).rotate().jpeg({ quality: 92, mozjpeg: true }).toBuffer();
  }
  await fs.writeFile(path.join(config.dirSubidas, archivo), original);

  // Análisis de píxeles sobre el primer fotograma. Para imágenes enormes se
  // trabaja con una versión reducida (la escala pixel solo se busca si cabe).
  const pixeles = ancho * alto;
  let escala = 1;
  let analisis;
  if (pixeles <= 4_000_000) {
    const { data } = await sharp(buffer, { pages: 1 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    escala = detectarEscala(data, ancho, alto);
    analisis = extraerPaleta(data);
  } else {
    const { data } = await sharp(buffer, { pages: 1 })
      .resize(512, 512, { fit: 'inside' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    analisis = extraerPaleta(data);
  }

  // Se considera pixel art si está escalado a bloques o si tiene pocos colores
  // y un tamaño modesto (los sprites a tamaño real).
  const pixelado = escala > 1 || (analisis.numColores <= 96 && Math.max(ancho, alto) <= 1024);

  // Miniatura solo si la imagen es grande y no es animada.
  let miniatura = null;
  const limite = pixelado ? LADO_MINIATURA * 2 : LADO_MINIATURA;
  if (!animado && Math.max(ancho, alto) > limite) {
    miniatura = `${id}-mini.webp`;
    await sharp(buffer)
      .rotate()
      .resize(limite, limite, { fit: 'inside', kernel: pixelado ? 'nearest' : 'lanczos3' })
      .webp({ quality: 86 })
      .toFile(path.join(config.dirSubidas, miniatura));
  }

  return {
    archivo,
    miniatura,
    ancho,
    alto,
    formato: extension,
    peso: original.length,
    escala,
    pixelado,
    transparente: analisis.transparente,
    animado,
    paleta: analisis.paleta,
    num_colores: analisis.numColores,
  };
}

// Borra los archivos de una obra (original y miniatura). No falla si ya no existen.
export async function borrarArchivos(...nombres) {
  for (const nombre of nombres) {
    if (!nombre || nombre.includes('/') || nombre.includes('\\') || nombre.includes('..')) continue;
    await fs.rm(path.join(config.dirSubidas, nombre), { force: true });
  }
}

// Espacio total ocupado por las subidas, en bytes.
export async function espacioUsado() {
  try {
    const nombres = await fs.readdir(config.dirSubidas);
    let total = 0;
    for (const nombre of nombres) {
      const info = await fs.stat(path.join(config.dirSubidas, nombre));
      if (info.isFile()) total += info.size;
    }
    return total;
  } catch {
    return 0;
  }
}
