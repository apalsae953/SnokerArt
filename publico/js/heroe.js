// Portada: el nombre gigante hace de plataforma de un nivel y los sprites
// destacados flotan encima como objetos que se pueden recoger.
import { $, h, tamanoNativo, reducirMovimiento, NOMBRES_TECNICA } from './util.js';

const MAX_OBJETOS = 4;

export function pintarHeroe({ sitio, obras, abrirObra }) {
  pintarHud(sitio, obras);
  pintarEscena(sitio, obras, abrirObra);
  const objetos = elegirObjetos(sitio, obras);
  construirMonumento(sitio.nombre_sitio, objetos, abrirObra);
}

// Contadores reales: obras, técnicas y colores distintos en todas las paletas.
function pintarHud(sitio, obras) {
  const hud = $('#hud');
  const colores = new Set(obras.flatMap((o) => (o.pixelado ? o.paleta : [])));
  const items = [['Obras', sitio.total_obras]];
  for (const t of sitio.tecnicas.slice(0, 3)) items.push([NOMBRES_TECNICA[t.tecnica] || t.tecnica, t.total]);
  if (colores.size) items.push(['Colores', colores.size]);
  hud.replaceChildren(...items.map(([dt, dd]) => h('div', {}, h('dt', { text: dt }), h('dd', { text: String(dd) }))));
  hud.hidden = obras.length === 0;
}

// La obra de portada (un escenario ancho) se muestra grande junto al texto.
function pintarEscena(sitio, obras, abrirObra) {
  const ancha = (o) => o.ancho / o.alto >= 1.4;
  const portada =
    obras.find((o) => String(o.id) === sitio.obra_portada) ||
    obras.find((o) => o.destacada && ancha(o)) ||
    obras.find(ancha);
  const figura = $('#heroe-escena');
  if (!portada) {
    figura.hidden = true;
    return;
  }
  const img = $('#heroe-escena-img');
  img.src = portada.url;
  img.alt = portada.titulo;
  img.width = portada.ancho;
  img.height = portada.alto;
  img.classList.toggle('pixelado', portada.pixelado);
  $('#heroe-escena-pie').replaceChildren(
    h('span', { text: portada.titulo }),
    h('span', { text: portada.categoria?.nombre || NOMBRES_TECNICA[portada.tecnica] })
  );
  $('#heroe-escena-boton').setAttribute('aria-label', `Abrir ${portada.titulo} en el visor`);
  $('#heroe-escena-boton').onclick = () => abrirObra(portada, obras);
  figura.hidden = false;

  // Pequeño paralaje con el ratón (solo en dispositivos con puntero fino).
  if (!reducirMovimiento() && window.matchMedia('(pointer: fine)').matches) {
    const heroe = $('#inicio');
    heroe.addEventListener('pointermove', (e) => {
      const x = (e.clientX / window.innerWidth - 0.5) * -14;
      const y = (e.clientY / window.innerHeight - 0.5) * -10;
      img.style.setProperty('--px', `${x.toFixed(1)}px`);
      img.style.setProperty('--py', `${y.toFixed(1)}px`);
    });
    heroe.addEventListener('pointerleave', () => {
      img.style.setProperty('--px', '0px');
      img.style.setProperty('--py', '0px');
    });
  }
}

// Sprites pequeños y destacados: son los que mejor quedan como objetos.
function elegirObjetos(sitio, obras) {
  const esSprite = (o) => {
    const { ancho, alto } = tamanoNativo(o);
    return o.pixelado && Math.max(ancho, alto) <= 96 && o.ancho / o.alto < 1.6 && String(o.id) !== sitio.obra_portada;
  };
  const destacados = obras.filter((o) => o.destacada && esSprite(o));
  const resto = obras.filter((o) => !o.destacada && esSprite(o));
  return [...destacados, ...resto].slice(0, MAX_OBJETOS);
}

function construirMonumento(nombre, objetos, abrirObra) {
  const contenedor = $('#monumento');
  const palabras = String(nombre || '').trim().split(/\s+/).filter(Boolean);
  const totalLetras = palabras.join('').length;

  // Reparte los objetos entre las letras de forma equilibrada.
  const posiciones = new Map();
  objetos.forEach((obra, j) => {
    const indice = Math.min(totalLetras - 1, Math.floor(((j + 0.5) * totalLetras) / objetos.length));
    posiciones.set(indice, obra);
  });

  let n = 0;
  const lineas = palabras.map((palabra) =>
    h(
      'span',
      { class: 'linea' },
      [...palabra].map((letra) => {
        const span = h('span', { class: 'letra', text: letra });
        const obra = posiciones.get(n++);
        if (obra) span.append(crearObjeto(obra, objetos, abrirObra, posiciones.size));
        return span;
      })
    )
  );
  contenedor.replaceChildren(...lineas);

  const ajustar = () => ajustarTexto(contenedor, '--tam-monumento', lineas);
  ajustarAlCambiar(ajustar);
}

// Contador de objetos recogidos (un pequeño guiño de videojuego).
const recogidos = new Set();

function crearObjeto(obra, lista, abrirObra, total) {
  const { ancho } = tamanoNativo(obra);
  // Tamaño en pantalla parecido en todas las obras, pero siempre múltiplo
  // entero del tamaño real para que los píxeles queden nítidos.
  const objetivo = Math.min(112, Math.max(56, window.innerWidth * 0.06));
  const factor = Math.max(1, Math.round(objetivo / ancho));

  const boton = h(
    'button',
    {
      type: 'button',
      class: 'pickup',
      'aria-label': `Recoger ${obra.titulo} y abrirlo en el visor`,
      title: obra.titulo,
      vars: { '--k': factor, '--nativo': ancho, '--retraso': `${(Math.random() * -1.1).toFixed(2)}s` },
    },
    h('img', { src: obra.url, alt: '', class: 'pixelado', width: obra.ancho, height: obra.alto, draggable: 'false' })
  );

  boton.addEventListener('click', () => {
    if (boton.classList.contains('recogido')) return;
    recogidos.add(obra.id);
    boton.classList.add('recogido');
    soltarChispas(boton, obra.paleta);
    actualizarContador(total);
    const espera = reducirMovimiento() ? 0 : 380;
    setTimeout(() => abrirObra(obra, lista), espera);
    // El objeto vuelve a aparecer al rato para poder abrirlo otra vez.
    setTimeout(() => boton.classList.remove('recogido'), 2600);
  });
  return boton;
}

function soltarChispas(boton, paleta) {
  if (reducirMovimiento()) return;
  const colores = paleta.length ? paleta.slice(0, 6) : ['#feae34'];
  for (let i = 0; i < 10; i++) {
    const angulo = (Math.PI * 2 * i) / 10;
    const distancia = 40 + Math.random() * 30;
    const chispa = h('span', {
      class: 'chispa',
      'aria-hidden': 'true',
      vars: {
        '--dx': `${Math.round(Math.cos(angulo) * distancia)}px`,
        '--dy': `${Math.round(Math.sin(angulo) * distancia - 30)}px`,
        '--chispa': colores[i % colores.length],
      },
    });
    boton.append(chispa);
    setTimeout(() => chispa.remove(), 650);
  }
}

function actualizarContador(total) {
  const el = $('#recogidos');
  el.hidden = false;
  el.textContent =
    recogidos.size >= total ? `Objetos ${recogidos.size}/${total} · colección completa` : `Objetos ${recogidos.size}/${total}`;
}

// Ajusta el tamaño de letra para que el nombre ocupe todo el ancho: en una
// sola fila (escritorio) o con una palabra por línea (móvil).
export function ajustarTexto(contenedor, variable, lineas) {
  contenedor.style.setProperty(variable, '100px');
  const estilo = getComputedStyle(contenedor);
  const enColumna = estilo.flexDirection === 'column';
  const anchoLinea = (linea) =>
    [...linea.children].reduce((suma, el) => suma + el.getBoundingClientRect().width, 0);
  const anchos = lineas.map(anchoLinea);
  const hueco = parseFloat(estilo.columnGap) || 0;
  const necesario = enColumna
    ? Math.max(...anchos)
    : anchos.reduce((a, b) => a + b, 0) + hueco * (lineas.length - 1);
  if (!necesario) return;
  const disponible = contenedor.clientWidth;
  contenedor.style.setProperty(variable, `${Math.floor(((100 * disponible) / necesario) * 0.995)}px`);
}

// Repite el ajuste cuando cargan las fuentes y al cambiar el tamaño de la ventana.
export function ajustarAlCambiar(fn) {
  fn();
  document.fonts?.ready.then(fn);
  let pendiente = false;
  window.addEventListener('resize', () => {
    if (pendiente) return;
    pendiente = true;
    requestAnimationFrame(() => {
      pendiente = false;
      fn();
    });
  });
}
