// Arranque del panel: menú, navegación entre vistas y cierre de sesión.
import { $, $$, h, api, pintarIconos, avisoError, confirmar } from './ui.js';

const VISTAS = {
  resumen: { titulo: 'Resumen', cargar: () => import('./vistas/resumen.js') },
  obras: { titulo: 'Obras', cargar: () => import('./vistas/obras.js') },
  subir: { titulo: 'Subir obras', cargar: () => import('./vistas/subir.js') },
  categorias: { titulo: 'Categorías', cargar: () => import('./vistas/categorias.js') },
  ajustes: { titulo: 'Ajustes de la web', cargar: () => import('./vistas/ajustes.js') },
  seguridad: { titulo: 'Seguridad', cargar: () => import('./vistas/seguridad.js') },
};

const contenedor = $('#vista');
const acciones = $('#acciones-vista');
let vistaActual = null;
let hashActual = location.hash;
let ignorarCambio = false;

// Información compartida entre vistas (límite de subida, ruta del panel...).
export const contexto = { info: null, actualizarContador };

async function actualizarContador() {
  try {
    const obras = await api('/obras');
    $('#cuenta-obras').textContent = obras.length ? String(obras.length) : '';
  } catch {
    /* no es importante */
  }
}

async function navegar() {
  if (ignorarCambio) {
    ignorarCambio = false;
    return;
  }
  // Si la vista tiene cambios sin guardar, se pregunta antes de salir.
  if (vistaActual?.puedeSalir && !vistaActual.puedeSalir()) {
    const salir = await confirmar({
      titulo: 'Hay cambios sin guardar',
      texto: 'Si sales ahora se perderán los cambios que no has guardado.',
      boton: 'Salir sin guardar',
    });
    if (!salir) {
      ignorarCambio = true;
      location.hash = hashActual;
      return;
    }
  }
  vistaActual?.limpiar?.();
  vistaActual = null;
  hashActual = location.hash;

  const [nombre, ...resto] = location.hash.replace(/^#/, '').split('/');
  const clave = VISTAS[nombre] ? nombre : 'resumen';
  const definicion = VISTAS[clave];

  $$('.lateral-nav a').forEach((a) => a.setAttribute('aria-current', a.dataset.vista === clave ? 'page' : 'false'));
  $('#titulo-vista').textContent = definicion.titulo;
  document.title = `${definicion.titulo} · Panel`;
  acciones.replaceChildren();
  contenedor.setAttribute('aria-busy', 'true');
  contenedor.replaceChildren(h('div', { class: 'cargando' }), h('div', { class: 'cargando' }));
  cerrarMenu();

  try {
    const modulo = await definicion.cargar();
    contenedor.replaceChildren();
    contenedor.classList.remove('entrando');
    vistaActual = (await modulo.montar({ contenedor, acciones, parametros: resto, contexto })) || {};
    void contenedor.offsetWidth;
    contenedor.classList.add('entrando');
  } catch (error) {
    console.error(error);
    contenedor.replaceChildren(
      h('div', { class: 'vacio' }, h('h2', { text: 'No se ha podido cargar esta sección' }), h('p', { text: error.message }))
    );
  }
  contenedor.setAttribute('aria-busy', 'false');
  pintarIconos();
  contenedor.focus({ preventScroll: true });
  window.scrollTo({ top: 0 });
}

// Menú lateral en móvil
function abrirMenu() {
  $('#lateral').classList.add('abierto');
  $('#velo').hidden = false;
  $('#abrir-menu').setAttribute('aria-expanded', 'true');
  $('.lateral-nav a')?.focus();
}
function cerrarMenu() {
  $('#lateral').classList.remove('abierto');
  $('#velo').hidden = true;
  $('#abrir-menu').setAttribute('aria-expanded', 'false');
}

async function iniciar() {
  $('#abrir-menu').addEventListener('click', abrirMenu);
  $('#cerrar-menu').addEventListener('click', cerrarMenu);
  $('#velo').addEventListener('click', cerrarMenu);
  document.addEventListener('keydown', (e) => e.key === 'Escape' && cerrarMenu());

  $('#salir').addEventListener('click', async () => {
    try {
      await fetch('/api/acceso/salir', { method: 'POST' });
    } finally {
      location.reload();
    }
  });

  // Aviso del navegador al cerrar la pestaña con cambios sin guardar.
  window.addEventListener('beforeunload', (e) => {
    if (vistaActual?.puedeSalir && !vistaActual.puedeSalir()) e.preventDefault();
  });

  try {
    const [info, ajustes] = await Promise.all([api('/info'), api('/ajustes')]);
    contexto.info = info;
    $('#marca-nombre').textContent = ajustes.nombre_sitio;
    if (info.en_vercel && info.almacen !== 'blob') {
      avisoError(new Error('Falta conectar Vercel Blob al proyecto: podrás ver el panel, pero no guardar cambios.'));
    }
  } catch (error) {
    avisoError(error);
  }

  window.addEventListener('hashchange', navegar);
  actualizarContador();
  pintarIconos();
  navegar();
}

iniciar();
