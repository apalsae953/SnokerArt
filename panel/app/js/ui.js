// Utilidades del panel: creación de elementos, llamadas a la API, avisos,
// confirmaciones y controles de formulario reutilizables.

export const $ = (selector, raiz = document) => raiz.querySelector(selector);
export const $$ = (selector, raiz = document) => [...raiz.querySelectorAll(selector)];

// Crea elementos sin innerHTML para que ningún texto pueda inyectar código.
export function h(etiqueta, props = {}, ...hijos) {
  const el = document.createElement(etiqueta);
  for (const [clave, valor] of Object.entries(props || {})) {
    if (valor === undefined || valor === null || valor === false) continue;
    if (clave === 'class') el.className = valor;
    else if (clave === 'text') el.textContent = valor;
    else if (clave === 'value') el.value = valor;
    else if (clave === 'checked') el.checked = !!valor;
    else if (clave === 'dataset') Object.assign(el.dataset, valor);
    else if (clave === 'vars') for (const [v, x] of Object.entries(valor)) el.style.setProperty(v, x);
    else if (clave.startsWith('on') && typeof valor === 'function') el.addEventListener(clave.slice(2).toLowerCase(), valor);
    else if (valor === true) el.setAttribute(clave, '');
    else el.setAttribute(clave, valor);
  }
  for (const hijo of hijos.flat(Infinity)) {
    if (hijo === null || hijo === undefined || hijo === false) continue;
    el.append(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
  }
  return el;
}

export const icono = (nombre) => h('i', { 'data-lucide': nombre, 'aria-hidden': 'true' });
export function pintarIconos() {
  window.lucide?.createIcons({ attrs: { 'aria-hidden': 'true' } });
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export class ErrorApi extends Error {}

export async function api(ruta, { metodo = 'GET', datos } = {}) {
  const opciones = { method: metodo, headers: { Accept: 'application/json' } };
  if (datos !== undefined) {
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(datos);
  }
  let respuesta;
  try {
    respuesta = await fetch(`/api/panel${ruta}`, opciones);
  } catch {
    throw new ErrorApi('No hay conexión con el servidor. Comprueba que sigue en marcha.');
  }
  // Sesión caducada: se recarga y el servidor muestra la pantalla de acceso.
  if (respuesta.status === 401) {
    location.reload();
    throw new ErrorApi('La sesión ha caducado.');
  }
  const cuerpo = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) throw new ErrorApi(cuerpo.error || `Error ${respuesta.status}`);
  return cuerpo;
}

// Subida de archivos con barra de progreso (fetch no informa del progreso).
export function subirArchivo(ruta, formulario, alProgreso, metodo = 'POST') {
  return new Promise((resolver, rechazar) => {
    const xhr = new XMLHttpRequest();
    xhr.open(metodo, `/api/panel${ruta}`);
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) alProgreso?.(e.loaded / e.total);
    });
    xhr.addEventListener('load', () => {
      let cuerpo = {};
      try {
        cuerpo = JSON.parse(xhr.responseText);
      } catch {
        /* respuesta vacía */
      }
      if (xhr.status === 401) location.reload();
      if (xhr.status >= 200 && xhr.status < 300) resolver(cuerpo);
      else rechazar(new ErrorApi(cuerpo.error || `Error ${xhr.status}`));
    });
    xhr.addEventListener('error', () => rechazar(new ErrorApi('Se ha cortado la conexión durante la subida.')));
    xhr.send(formulario);
  });
}

// ---------------------------------------------------------------------------
// Avisos y confirmaciones
// ---------------------------------------------------------------------------

export function aviso(texto, tipo = 'ok') {
  const el = h('div', { class: `aviso ${tipo === 'error' ? 'error' : ''}` }, icono(tipo === 'error' ? 'info' : 'circle-check'), h('span', { text: texto }));
  $('#avisos').append(el);
  pintarIconos();
  setTimeout(() => {
    el.classList.add('saliendo');
    setTimeout(() => el.remove(), 220);
  }, tipo === 'error' ? 5000 : 2600);
}

// Muestra un aviso de error a partir de cualquier excepción.
export const avisoError = (error) => aviso(error?.message || 'Algo ha fallado.', 'error');

export function confirmar({ titulo, texto, boton = 'Borrar', peligro = true }) {
  const dialogo = $('#confirmar');
  $('#confirmar-titulo').textContent = titulo;
  $('#confirmar-texto').textContent = texto;
  const si = $('#confirmar-si');
  si.textContent = boton;
  si.className = `boton ${peligro ? 'boton-peligro' : 'boton-acento'}`;
  dialogo.returnValue = 'no';
  dialogo.showModal();
  return new Promise((resolver) => {
    dialogo.addEventListener('close', () => resolver(dialogo.returnValue === 'si'), { once: true });
  });
}

// ---------------------------------------------------------------------------
// Formato
// ---------------------------------------------------------------------------

export const NOMBRES_TECNICA = { 'pixel-art': 'Pixel art', '2d': '2D', '3d': '3D', otra: 'Otra' };

export const numero = (n) => new Intl.NumberFormat('es-ES').format(n || 0);

export function formatoPeso(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1).replace('.', ',')} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1).replace('.', ',')} MB`;
  return `${(bytes / 1073741824).toFixed(2).replace('.', ',')} GB`;
}

export function fechaRelativa(iso) {
  const fecha = new Date(iso);
  const segundos = (Date.now() - fecha.getTime()) / 1000;
  if (segundos < 60) return 'ahora mismo';
  if (segundos < 3600) return `hace ${Math.floor(segundos / 60)} min`;
  if (segundos < 86400) return `hace ${Math.floor(segundos / 3600)} h`;
  if (segundos < 172800) return 'ayer';
  if (segundos < 604800) return `hace ${Math.floor(segundos / 86400)} días`;
  return fecha.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function tamanoNativo(obra) {
  const e = obra.escala || 1;
  return { ancho: Math.round(obra.ancho / e), alto: Math.round(obra.alto / e) };
}

// Convierte "pocion_turquesa-v2.png" en "Pocion turquesa v2".
export function tituloDesdeArchivo(nombre) {
  const base = nombre.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : 'Sin título';
}

// ---------------------------------------------------------------------------
// Componentes
// ---------------------------------------------------------------------------

// Miniatura de una obra (fondo de cuadros si tiene transparencia).
export function miniatura(obra, lado = 48) {
  const img = h('img', {
    src: obra.miniatura || obra.url,
    alt: '',
    loading: 'lazy',
    class: obra.pixelado ? 'pixelado' : '',
    draggable: 'false',
  });
  // El pixel art se amplía por un número entero para que se vea nítido.
  if (obra.pixelado) {
    const { ancho, alto } = tamanoNativo(obra);
    const k = Math.floor((lado * 0.86) / Math.max(ancho, alto));
    if (k >= 1) {
      img.width = ancho * k;
      img.height = alto * k;
    }
  }
  return h(
    'span',
    { class: `miniatura ${obra.transparente ? 'cuadricula' : 'opaca'}`, vars: { '--lado': `${lado}px` } },
    img
  );
}

export function interruptor({ nombre, etiqueta, ayuda, marcado = false, alCambiar }) {
  const input = h('input', { type: 'checkbox', name: nombre, checked: marcado });
  if (alCambiar) input.addEventListener('change', () => alCambiar(input.checked));
  return h(
    'label',
    { class: 'interruptor' },
    input,
    h('span', { class: 'interruptor-pista', 'aria-hidden': 'true' }),
    h('span', { class: 'interruptor-texto' }, h('strong', { text: etiqueta }), ayuda ? h('small', { text: ayuda }) : null)
  );
}

export function segmentado({ nombre, opciones, valor, etiqueta }) {
  return h(
    'div',
    { class: 'segmentado', role: 'radiogroup', 'aria-label': etiqueta },
    opciones.map(([v, texto]) =>
      h('label', {}, h('input', { type: 'radio', name: nombre, value: v, checked: v === valor }), h('span', { text: texto }))
    )
  );
}

export function selectorCategoria({ nombre = 'categoria_id', categorias, valor, id }) {
  return h(
    'select',
    { name: nombre, id },
    h('option', { value: '', text: 'Sin categoría' }),
    categorias.map((c) => {
      const opcion = h('option', { value: String(c.id), text: c.nombre });
      if (String(valor ?? '') === String(c.id)) opcion.selected = true;
      return opcion;
    })
  );
}

export function selectorTecnica({ nombre = 'tecnica', valor = 'pixel-art', id }) {
  return h(
    'select',
    { name: nombre, id },
    Object.entries(NOMBRES_TECNICA).map(([v, texto]) => {
      const opcion = h('option', { value: v, text: texto });
      if (v === valor) opcion.selected = true;
      return opcion;
    })
  );
}

// Campo de etiquetas: se escriben y se añaden con Intro o coma.
export function chipsEntrada({ valores = [], id, alCambiar }) {
  let lista = [...valores];
  const input = h('input', { type: 'text', id, placeholder: 'Añadir etiqueta', autocomplete: 'off' });
  const contenedor = h('div', { class: 'chips-entrada', onclick: () => input.focus() });

  const pintar = () => {
    contenedor.replaceChildren(
      ...lista.map((valor, i) =>
        h(
          'span',
          { class: 'chip' },
          valor,
          h(
            'button',
            {
              type: 'button',
              'aria-label': `Quitar etiqueta ${valor}`,
              onclick: (e) => {
                e.stopPropagation();
                lista.splice(i, 1);
                pintar();
                alCambiar?.(lista);
                input.focus();
              },
            },
            icono('x')
          )
        )
      ),
      input
    );
    pintarIconos();
  };

  const anadir = () => {
    const nuevas = input.value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const etiqueta of nuevas) {
      if (lista.length < 12 && !lista.some((l) => l.toLowerCase() === etiqueta.toLowerCase())) lista.push(etiqueta.slice(0, 30));
    }
    input.value = '';
    pintar();
    alCambiar?.(lista);
    input.focus();
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (input.value.trim()) anadir();
    } else if (e.key === 'Backspace' && !input.value && lista.length) {
      lista.pop();
      pintar();
      alCambiar?.(lista);
      input.focus();
    }
  });
  input.addEventListener('blur', () => input.value.trim() && anadir());

  pintar();
  contenedor.obtener = () => {
    if (input.value.trim()) anadir();
    return [...lista];
  };
  return contenedor;
}

export function campo({ etiqueta, control, ayuda, id, contador }) {
  const idAyuda = ayuda && id ? `${id}-ayuda` : null;
  if (idAyuda) control.setAttribute('aria-describedby', idAyuda);
  const cabecera = h('div', { class: 'campo-cabecera' }, h('label', { for: id, text: etiqueta }));
  if (contador && control.maxLength > 0) {
    const cuenta = h('span', { class: 'contador' });
    const actualizar = () => (cuenta.textContent = `${control.value.length}/${control.maxLength}`);
    control.addEventListener('input', actualizar);
    actualizar();
    cabecera.append(cuenta);
  }
  return h('div', { class: 'campo' }, cabecera, control, ayuda ? h('p', { class: 'ayuda', id: idAyuda, text: ayuda }) : null);
}

// Ordenar filas arrastrando del asa (ratón y táctil). Llama a alSoltar con el
// nuevo orden de ids cuando termina el arrastre.
export function ordenable(contenedor, { selectorFila, selectorAsa = '.asa', alSoltar }) {
  let fila = null;
  let destino = null;
  let posicion = null;

  const limpiar = () => {
    contenedor.querySelectorAll('.destino-arriba, .destino-abajo').forEach((f) => f.classList.remove('destino-arriba', 'destino-abajo'));
  };

  contenedor.addEventListener('pointerdown', (e) => {
    const asa = e.target.closest(selectorAsa);
    if (!asa || asa.classList.contains('desactivada')) return;
    fila = asa.closest(selectorFila);
    if (!fila) return;
    e.preventDefault();
    asa.setPointerCapture(e.pointerId);
    fila.classList.add('arrastrando');
  });

  contenedor.addEventListener('pointermove', (e) => {
    if (!fila) return;
    const bajo = document.elementFromPoint(e.clientX, e.clientY)?.closest(selectorFila);
    limpiar();
    if (!bajo || bajo === fila || !contenedor.contains(bajo)) {
      destino = null;
      return;
    }
    const caja = bajo.getBoundingClientRect();
    posicion = e.clientY < caja.top + caja.height / 2 ? 'antes' : 'despues';
    bajo.classList.add(posicion === 'antes' ? 'destino-arriba' : 'destino-abajo');
    destino = bajo;
  });

  const terminar = () => {
    if (!fila) return;
    fila.classList.remove('arrastrando');
    if (destino) {
      if (posicion === 'antes') destino.before(fila);
      else destino.after(fila);
      alSoltar([...contenedor.querySelectorAll(selectorFila)].map((f) => Number(f.dataset.id)));
    }
    limpiar();
    fila = null;
    destino = null;
  };
  contenedor.addEventListener('pointerup', terminar);
  contenedor.addEventListener('pointercancel', terminar);

  // Alternativa con teclado: flechas arriba/abajo sobre el asa.
  contenedor.addEventListener('keydown', (e) => {
    const asa = e.target.closest(selectorAsa);
    if (!asa || asa.classList.contains('desactivada') || !['ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const actual = asa.closest(selectorFila);
    const vecino = e.key === 'ArrowUp' ? actual.previousElementSibling : actual.nextElementSibling;
    if (!vecino || !vecino.matches(selectorFila)) return;
    if (e.key === 'ArrowUp') vecino.before(actual);
    else vecino.after(actual);
    asa.focus();
    alSoltar([...contenedor.querySelectorAll(selectorFila)].map((f) => Number(f.dataset.id)));
  });
}
