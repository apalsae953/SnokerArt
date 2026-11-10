// Secciones de texto: sobre mí, contacto y pie. Todo sale de los ajustes
// que se editan en el panel.
import { $, $$, h, icono, pintarIconos, NOMBRES_TECNICA } from './util.js';
import { ajustarAlCambiar } from './heroe.js';

export const NOMBRES_REDES = {
  artstation: 'ArtStation',
  itchio: 'itch.io',
  instagram: 'Instagram',
  x: 'X',
  bluesky: 'Bluesky',
  youtube: 'YouTube',
  github: 'GitHub',
  web: 'Web',
};

// Rellena todos los elementos con data-campo="clave" con el texto del ajuste.
export function rellenarTextos(sitio) {
  for (const el of $$('[data-campo]')) {
    const valor = sitio[el.dataset.campo];
    if (typeof valor === 'string') {
      el.textContent = valor;
      if (!valor && !el.closest('.sr')) el.hidden = true;
    }
  }
}

// URL corta y legible: "https://www.artstation.com/snoker/" -> "artstation.com/snoker"
function urlCorta(url) {
  try {
    const u = new URL(url);
    return (u.host.replace(/^www\./, '') + u.pathname).replace(/\/$/, '');
  } catch {
    return url;
  }
}

export function pintarSobre({ sitio, obras }) {
  const datos = [];
  if (sitio.ubicacion) datos.push(['Desde', sitio.ubicacion]);
  if (sitio.desde) datos.push(['Dibujando desde', sitio.desde]);
  if (sitio.tecnicas.length) {
    datos.push(['Técnicas', sitio.tecnicas.map((t) => NOMBRES_TECNICA[t.tecnica] || t.tecnica).join(', ')]);
  }
  datos.push(['Obras publicadas', String(sitio.total_obras)]);

  const dl = $('#sobre-datos');
  dl.replaceChildren(...datos.map(([dt, dd]) => h('div', {}, h('dt', { text: dt }), h('dd', { text: dd }))));
  if (sitio.abierto_encargos) {
    dl.append(h('div', { class: 'encargos' }, h('dt', { text: 'Encargos' }), h('dd', { text: 'Abierto a encargos' })));
  }

  // Avatar: la obra elegida en el panel o el primer sprite destacado.
  const avatar =
    obras.find((o) => String(o.id) === sitio.obra_avatar) ||
    obras.find((o) => o.destacada && o.pixelado && o.ancho / o.alto < 1.4);
  if (avatar) {
    const img = $('#sobre-avatar-img');
    img.src = avatar.url;
    img.classList.toggle('pixelado', avatar.pixelado);
    $('#sobre-avatar').hidden = false;
    $('#sobre-avatar').classList.toggle('cuadricula', avatar.transparente);
  }
}

export function pintarContacto({ sitio }) {
  const filas = [];
  if (sitio.email) {
    filas.push({ texto: sitio.email, etiqueta: 'Email', href: `mailto:${sitio.email}`, nueva: false });
  }
  for (const [red, url] of Object.entries(sitio.redes || {})) {
    filas.push({ texto: urlCorta(url), etiqueta: NOMBRES_REDES[red] || red, href: url, nueva: true });
  }

  if (filas.length === 0) {
    // Sin datos de contacto la sección no se muestra (ni sus enlaces).
    $('#contacto').hidden = true;
    $$('[data-si="contacto"]').forEach((el) => (el.hidden = true));
    return;
  }
  $('#contacto').hidden = false;

  const lista = filas.map(({ texto, etiqueta, href, nueva }) =>
    h(
      'li',
      {},
      h(
        'a',
        {
          class: 'fila-contacto',
          href,
          ...(nueva ? { target: '_blank', rel: 'noopener noreferrer' } : {}),
          'aria-label': `${etiqueta}: ${texto}`,
        },
        h('span', { class: 'fila-texto', text: texto }),
        h('span', { class: 'fila-red', text: etiqueta }),
        h('span', { class: 'flecha' }, icono('arrow-up-right'))
      )
    )
  );

  if (sitio.email) {
    lista.push(
      h(
        'li',
        {},
        h(
          'a',
          {
            class: 'fila-contacto fila-saludo',
            href: `mailto:${sitio.email}?subject=${encodeURIComponent(`Hola desde ${sitio.nombre_sitio}`)}`,
          },
          h('span', { class: 'fila-texto', text: sitio.abierto_encargos ? '¿Hablamos de tu juego?' : '¿Hablamos?' }),
          h('span', { class: 'flecha' }, icono('arrow-right'))
        )
      )
    );
  }
  $('#contacto-filas').replaceChildren(...lista);

  // Redes también en el pie.
  const redes = Object.entries(sitio.redes || {});
  if (redes.length) {
    $('#pie-redes').replaceChildren(
      ...redes.map(([red, url]) =>
        h('li', {}, h('a', { href: url, target: '_blank', rel: 'noopener noreferrer', text: NOMBRES_REDES[red] || red }))
      )
    );
    $('#pie-redes-col').hidden = false;
  }
  pintarIconos();
}

export function pintarPie({ sitio }) {
  $('#pie-copy').textContent = `© ${new Date().getFullYear()} ${sitio.nombre_sitio}. Todo el arte es obra original de su autor.`;
  const marca = $('#pie-marca');
  // Se mide como una sola "línea" con un único hijo de texto.
  const envoltorio = $('.pie-marca');
  ajustarAlCambiar(() => {
    envoltorio.style.setProperty('--tam-pie', '100px');
    marca.style.display = 'inline-block';
    const ancho = marca.getBoundingClientRect().width;
    marca.style.display = '';
    const disponible = envoltorio.getBoundingClientRect().width;
    if (ancho) envoltorio.style.setProperty('--tam-pie', `${Math.floor(((100 * disponible) / ancho) * 0.99)}px`);
  });
}
