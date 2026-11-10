// Utilidades compartidas por la web pública.

// Crea elementos del DOM sin usar innerHTML (así ningún texto subido puede
// inyectar código). Ejemplo: h('p', { class: 'nota', text: 'Hola' })
export function h(etiqueta, props = {}, ...hijos) {
  const el = document.createElement(etiqueta);
  for (const [clave, valor] of Object.entries(props || {})) {
    if (valor === undefined || valor === null || valor === false) continue;
    if (clave === 'class') el.className = valor;
    else if (clave === 'text') el.textContent = valor;
    else if (clave === 'dataset') Object.assign(el.dataset, valor);
    else if (clave === 'vars') for (const [v, x] of Object.entries(valor)) el.style.setProperty(v, x);
    else if (clave.startsWith('on')) el.addEventListener(clave.slice(2).toLowerCase(), valor);
    else if (valor === true) el.setAttribute(clave, '');
    else el.setAttribute(clave, valor);
  }
  for (const hijo of hijos.flat()) {
    if (hijo === null || hijo === undefined || hijo === false) continue;
    el.append(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
  }
  return el;
}

export const $ = (selector, raiz = document) => raiz.querySelector(selector);
export const $$ = (selector, raiz = document) => [...raiz.querySelectorAll(selector)];

// Icono de Lucide. Hay que llamar a pintarIconos() después de añadirlo al DOM.
export const icono = (nombre) => h('i', { 'data-lucide': nombre, 'aria-hidden': 'true' });
export function pintarIconos() {
  window.lucide?.createIcons({ attrs: { 'aria-hidden': 'true' } });
}

export async function api(ruta, opciones = {}) {
  const respuesta = await fetch(ruta, {
    ...opciones,
    headers: { Accept: 'application/json', ...(opciones.headers || {}) },
  });
  if (!respuesta.ok) throw new Error(`Error ${respuesta.status} en ${ruta}`);
  return respuesta.json();
}

export const NOMBRES_TECNICA = {
  'pixel-art': 'Pixel art',
  '2d': '2D',
  '3d': '3D',
  otra: 'Otras',
};

// Tamaño real del dibujo (sin el escalado de exportación).
export function tamanoNativo(obra) {
  const escala = obra.escala || 1;
  return { ancho: Math.round(obra.ancho / escala), alto: Math.round(obra.alto / escala) };
}

// Calcula cómo mostrar una obra dentro de una caja. El pixel art se escala por
// números enteros para que cada píxel del dibujo ocupe los mismos píxeles de
// pantalla (sin bordes borrosos ni píxeles irregulares).
export function medidasEnCaja(obra, anchoCaja, altoCaja, ocupacion = 0.78) {
  const { ancho, alto } = tamanoNativo(obra);
  if (obra.pixelado) {
    const k = Math.floor(Math.min((anchoCaja * ocupacion) / ancho, (altoCaja * ocupacion) / alto));
    if (k >= 1) return { ancho: ancho * k, alto: alto * k, factor: k };
  }
  const f = Math.min((anchoCaja * ocupacion) / ancho, (altoCaja * ocupacion) / alto);
  return { ancho: Math.round(ancho * f), alto: Math.round(alto * f), factor: f };
}

export function formatoPeso(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace('.', ',')} KB`;
  return `${(bytes / 1048576).toFixed(1).replace('.', ',')} MB`;
}

export const reducirMovimiento = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Lectura y escritura segura en localStorage (puede fallar en modo privado).
export const almacen = {
  leer(clave) {
    try {
      return localStorage.getItem(clave);
    } catch {
      return null;
    }
  },
  guardar(clave, valor) {
    try {
      localStorage.setItem(clave, valor);
    } catch {
      /* sin almacenamiento: no pasa nada */
    }
  },
};

// Avisos breves en la parte inferior de la pantalla.
export function aviso(texto, { color } = {}) {
  const contenedor = $('#avisos');
  if (!contenedor) return;
  const el = h('div', { class: 'aviso' }, color ? h('span', { class: 'muestra-aviso', vars: { '--color': color } }) : null, texto);
  contenedor.append(el);
  setTimeout(() => {
    el.classList.add('saliendo');
    setTimeout(() => el.remove(), 220);
  }, 2200);
}

export async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    // Alternativa para navegadores sin permiso de portapapeles.
    const area = h('textarea', { 'aria-hidden': 'true' });
    area.value = texto;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

// Muestras de color de una paleta; al pulsar se copia el código.
export function pintarPaleta(contenedor, paleta, max = 16) {
  contenedor.replaceChildren(
    ...paleta.slice(0, max).map((hex) =>
      h('button', {
        type: 'button',
        class: 'muestra',
        'data-hex': hex,
        'aria-label': `Copiar el color ${hex}`,
        vars: { '--color': hex },
        onclick: async () => {
          if (await copiar(hex)) aviso(`Color ${hex} copiado`, { color: hex });
        },
      })
    )
  );
  contenedor.hidden = paleta.length === 0;
}

// Lista de datos técnicos de una obra (para la vitrina y el visor).
export function datosObra(obra) {
  const { ancho, alto } = tamanoNativo(obra);
  const filas = [['Tamaño', `${ancho} × ${alto} px`]];
  if (obra.escala > 1) filas.push(['Exportado', `x${obra.escala} (${obra.ancho} × ${obra.alto} px)`]);
  if (obra.pixelado && obra.num_colores) filas.push(['Colores', String(obra.num_colores)]);
  filas.push(['Técnica', NOMBRES_TECNICA[obra.tecnica] || obra.tecnica]);
  if (obra.categoria) filas.push(['Categoría', obra.categoria.nombre]);
  if (obra.animado) filas.push(['Tipo', 'Animación']);
  filas.push(['Archivo', `${obra.formato.toUpperCase()} · ${formatoPeso(obra.peso)}`]);
  return filas;
}

export function pintarDatos(dl, filas) {
  dl.replaceChildren(...filas.flatMap(([dt, dd]) => [h('dt', { text: dt }), h('dd', { text: dd })]));
}
