// Visor a pantalla completa con lupa de píxeles: zoom por múltiplos enteros,
// rejilla de píxeles, cambio de fondo, paleta y navegación con teclado.
import {
  $,
  h,
  pintarIconos,
  tamanoNativo,
  pintarPaleta,
  datosObra,
  pintarDatos,
  copiar,
  aviso,
  NOMBRES_TECNICA,
} from './util.js';

const FONDOS = ['fondo-cuadricula', 'fondo-oscuro', 'fondo-tierra', 'fondo-claro'];
const NOMBRES_FONDO = ['cuadros', 'oscuro', 'tierra', 'claro'];
const NIVELES_PIXEL = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 64];
const MARGEN = 64;

export function crearVisor({ alVer }) {
  const visor = $('#visor');
  const escenario = $('#visor-escenario');
  const lienzo = $('#visor-lienzo');
  const img = $('#visor-img');
  const rejilla = $('#visor-rejilla');
  const botonRejilla = $('#visor-rejilla-boton');

  const estado = { lista: [], indice: 0, obra: null, zoom: 1, ajuste: 1, fondo: 0, rejilla: false, origen: null };

  // ------------------------------------------------------------------ zoom
  function nivelesDisponibles() {
    const { ancho, alto } = tamanoNativo(estado.obra);
    if (estado.obra.pixelado) {
      return NIVELES_PIXEL.filter((k) => ancho * k <= 12000 && alto * k <= 12000);
    }
    const niveles = [];
    for (let z = 0.1; z <= 4.01; z *= 1.25) niveles.push(Number(z.toFixed(3)));
    return niveles;
  }

  function calcularAjuste() {
    const { ancho, alto } = tamanoNativo(estado.obra);
    const disponibleX = Math.max(80, escenario.clientWidth - MARGEN * 2);
    const disponibleY = Math.max(80, escenario.clientHeight - MARGEN * 2);
    const f = Math.min(disponibleX / ancho, disponibleY / alto);
    if (estado.obra.pixelado) return Math.max(1, Math.floor(f)) <= f ? Math.max(1, Math.floor(f)) : f;
    return Math.min(f, 2);
  }

  function aplicarZoom(zoom, ancla) {
    const { ancho, alto } = tamanoNativo(estado.obra);
    // Punto de la imagen que queda bajo el cursor, para mantenerlo al hacer zoom.
    let relX = 0.5;
    let relY = 0.5;
    const marco = img.getBoundingClientRect();
    if (ancla && marco.width) {
      relX = (ancla.x - marco.left) / marco.width;
      relY = (ancla.y - marco.top) / marco.height;
    }

    estado.zoom = zoom;
    img.style.width = `${Math.round(ancho * zoom)}px`;
    img.style.height = `${Math.round(alto * zoom)}px`;

    const entero = estado.obra.pixelado && Number.isInteger(zoom);
    $('#visor-zoom').textContent = estado.obra.pixelado
      ? entero
        ? `x${zoom}`
        : `${Math.round(zoom * 100)}%`
      : `${Math.round(zoom * 100)}%`;

    // La rejilla solo tiene sentido con píxeles grandes.
    const rejillaPosible = estado.obra.pixelado && entero && zoom >= 6;
    botonRejilla.disabled = !rejillaPosible;
    rejilla.hidden = !(rejillaPosible && estado.rejilla);
    rejilla.style.setProperty('--celda', `${zoom}px`);

    if (ancla) {
      const nuevo = img.getBoundingClientRect();
      lienzo.scrollLeft += nuevo.left + relX * nuevo.width - ancla.x;
      lienzo.scrollTop += nuevo.top + relY * nuevo.height - ancla.y;
    } else {
      lienzo.scrollLeft = (lienzo.scrollWidth - lienzo.clientWidth) / 2;
      lienzo.scrollTop = (lienzo.scrollHeight - lienzo.clientHeight) / 2;
    }
  }

  function cambiarZoom(direccion, ancla) {
    const niveles = nivelesDisponibles();
    const actual = estado.zoom;
    let siguiente;
    if (direccion > 0) siguiente = niveles.find((n) => n > actual + 0.001);
    else siguiente = [...niveles].reverse().find((n) => n < actual - 0.001);
    if (siguiente === undefined) return;
    aplicarZoom(siguiente, ancla);
  }

  function ajustar() {
    estado.ajuste = calcularAjuste();
    aplicarZoom(estado.ajuste);
  }

  // ------------------------------------------------------------------ contenido
  function pintar() {
    const obra = estado.obra;
    img.classList.toggle('pixelado', obra.pixelado);
    img.classList.remove('entrando');
    void img.offsetWidth;
    img.classList.add('entrando');
    img.alt = obra.titulo;
    img.src = obra.url;

    $('#visor-meta').textContent = [obra.categoria?.nombre, NOMBRES_TECNICA[obra.tecnica]].filter(Boolean).join(' · ');
    $('#visor-titulo').textContent = obra.titulo;
    $('#visor-desc').textContent = obra.descripcion;
    $('#visor-desc').hidden = !obra.descripcion;
    $('#visor-etiquetas').replaceChildren(...obra.etiquetas.map((e) => h('li', { text: e })));
    $('#visor-etiquetas').hidden = obra.etiquetas.length === 0;
    pintarDatos($('#visor-datos'), datosObra(obra));
    pintarPaleta($('#visor-paleta'), obra.paleta, 32);

    const descargar = $('#visor-descargar');
    descargar.hidden = !obra.descargable;
    descargar.href = `/api/obras/${encodeURIComponent(obra.slug)}/descargar`;

    const varias = estado.lista.length > 1;
    $('#visor-anterior').disabled = !varias;
    $('#visor-siguiente').disabled = !varias;

    history.replaceState(null, '', `#obra/${obra.slug}`);
    ajustar();
    alVer?.(obra);
  }

  // ------------------------------------------------------------------ abrir / cerrar
  function abrir(obra, lista) {
    estado.lista = lista?.length ? lista : [obra];
    estado.indice = Math.max(0, estado.lista.findIndex((o) => o.id === obra.id));
    estado.obra = obra;
    if (visor.hidden) {
      estado.origen = document.activeElement;
      visor.hidden = false;
      document.documentElement.style.overflow = 'hidden';
      document.addEventListener('keydown', teclado);
      pintarIconos();
    }
    pintar();
    $('#visor-cerrar').focus();
  }

  function cerrar() {
    visor.hidden = true;
    document.documentElement.style.overflow = '';
    document.removeEventListener('keydown', teclado);
    history.replaceState(null, '', location.pathname + location.search);
    if (estado.origen?.isConnected) estado.origen.focus();
  }

  function mover(paso) {
    if (estado.lista.length < 2) return;
    estado.indice = (estado.indice + paso + estado.lista.length) % estado.lista.length;
    estado.obra = estado.lista[estado.indice];
    pintar();
  }

  // ------------------------------------------------------------------ teclado
  function teclado(e) {
    if (e.target.matches?.('input, textarea, select')) return;
    switch (e.key) {
      case 'Escape':
        cerrar();
        break;
      case 'ArrowLeft':
        mover(-1);
        break;
      case 'ArrowRight':
        mover(1);
        break;
      case '+':
      case '=':
        cambiarZoom(1);
        break;
      case '-':
      case '_':
        cambiarZoom(-1);
        break;
      case '0':
        ajustar();
        break;
      case 'g':
      case 'G':
        alternarRejilla();
        break;
      case 'f':
      case 'F':
        cambiarFondo();
        break;
      case 'Tab':
        atraparFoco(e);
        return;
      default:
        return;
    }
    e.preventDefault();
  }

  // Mantiene el foco del teclado dentro del visor mientras está abierto.
  function atraparFoco(e) {
    const enfocables = [...visor.querySelectorAll('button:not([disabled]), a[href]:not([hidden]), [tabindex="0"]')].filter(
      (el) => el.offsetParent !== null
    );
    if (!enfocables.length) return;
    const primero = enfocables[0];
    const ultimo = enfocables[enfocables.length - 1];
    if (e.shiftKey && document.activeElement === primero) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primero.focus();
    }
  }

  function alternarRejilla() {
    if (botonRejilla.disabled) return;
    estado.rejilla = !estado.rejilla;
    botonRejilla.setAttribute('aria-pressed', String(estado.rejilla));
    aplicarZoom(estado.zoom);
  }

  function cambiarFondo() {
    escenario.classList.remove(FONDOS[estado.fondo]);
    estado.fondo = (estado.fondo + 1) % FONDOS.length;
    escenario.classList.add(FONDOS[estado.fondo]);
    $('#visor-fondo').setAttribute('aria-label', `Cambiar fondo (ahora: ${NOMBRES_FONDO[estado.fondo]})`);
  }

  // ------------------------------------------------------------------ ratón y táctil
  lienzo.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      cambiarZoom(e.deltaY < 0 ? 1 : -1, { x: e.clientX, y: e.clientY });
    },
    { passive: false }
  );

  // Arrastrar para moverse por la imagen ampliada.
  let arrastre = null;
  lienzo.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    arrastre = { x: e.clientX, y: e.clientY, izq: lienzo.scrollLeft, arriba: lienzo.scrollTop, movido: false };
    lienzo.setPointerCapture(e.pointerId);
    lienzo.classList.add('arrastrando');
  });
  lienzo.addEventListener('pointermove', (e) => {
    if (!arrastre) return;
    const dx = e.clientX - arrastre.x;
    const dy = e.clientY - arrastre.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) arrastre.movido = true;
    lienzo.scrollLeft = arrastre.izq - dx;
    lienzo.scrollTop = arrastre.arriba - dy;
  });
  const soltar = () => {
    arrastre = null;
    lienzo.classList.remove('arrastrando');
  };
  lienzo.addEventListener('pointerup', soltar);
  lienzo.addEventListener('pointercancel', soltar);

  // Doble clic: alterna entre ajustar y ampliar en ese punto.
  lienzo.addEventListener('dblclick', (e) => {
    if (estado.zoom > estado.ajuste + 0.001) ajustar();
    else {
      cambiarZoom(1, { x: e.clientX, y: e.clientY });
      cambiarZoom(1, { x: e.clientX, y: e.clientY });
    }
  });

  // ------------------------------------------------------------------ botones
  $('#visor-cerrar').addEventListener('click', cerrar);
  $('#visor-anterior').addEventListener('click', () => mover(-1));
  $('#visor-siguiente').addEventListener('click', () => mover(1));
  $('#visor-mas').addEventListener('click', () => cambiarZoom(1));
  $('#visor-menos').addEventListener('click', () => cambiarZoom(-1));
  $('#visor-ajustar').addEventListener('click', ajustar);
  $('#visor-fondo').addEventListener('click', cambiarFondo);
  botonRejilla.addEventListener('click', alternarRejilla);
  $('#visor-compartir').addEventListener('click', async () => {
    const enlace = `${location.origin}/#obra/${estado.obra.slug}`;
    if (await copiar(enlace)) aviso('Enlace copiado');
  });

  window.addEventListener('resize', () => {
    if (!visor.hidden && Math.abs(estado.zoom - estado.ajuste) < 0.001) ajustar();
  });

  return { abrir, cerrar, abierto: () => !visor.hidden };
}
