// Vista "Resumen": cifras principales, visitas de los últimos 30 días y
// las obras más vistas y más recientes.
import { h, api, icono, miniatura, numero, formatoPeso, fechaRelativa, NOMBRES_TECNICA } from '../ui.js';

const SVG = 'http://www.w3.org/2000/svg';
const s = (etiqueta, atributos = {}, ...hijos) => {
  const el = document.createElementNS(SVG, etiqueta);
  for (const [k, v] of Object.entries(atributos)) el.setAttribute(k, v);
  for (const hijo of hijos) el.append(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
  return el;
};

const fechaCorta = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

// Gráfico de barras de las visitas diarias, dibujado en SVG.
function grafico(dias, ancho) {
  const alto = 220;
  const margen = { arriba: 12, abajo: 26, izquierda: 32, derecha: 4 };
  const maximo = Math.max(4, ...dias.map((d) => d.total));
  const techo = Math.ceil(maximo / 4) * 4;
  const anchoUtil = ancho - margen.izquierda - margen.derecha;
  const altoUtil = alto - margen.arriba - margen.abajo;
  const paso = anchoUtil / dias.length;
  const barra = Math.max(2, paso * 0.68);

  const svg = s('svg', { class: 'grafico', viewBox: `0 0 ${ancho} ${alto}`, role: 'img', 'aria-label': 'Visitas por día en los últimos 30 días' });

  // Líneas de referencia y valores del eje vertical
  for (const valor of [0, techo / 2, techo]) {
    const y = margen.arriba + altoUtil - (valor / techo) * altoUtil;
    svg.append(s('line', { class: 'linea-base', x1: margen.izquierda, x2: ancho - margen.derecha, y1: y, y2: y }));
    svg.append(s('text', { x: margen.izquierda - 8, y: y + 4, 'text-anchor': 'end' }, numero(valor)));
  }

  dias.forEach((dia, i) => {
    const x = margen.izquierda + i * paso + (paso - barra) / 2;
    const altura = (dia.total / techo) * altoUtil;
    const y = margen.arriba + altoUtil - altura;
    const rect = s('rect', {
      class: dia.total ? 'barra-dato' : 'barra-vacia',
      x: x.toFixed(1),
      y: dia.total ? y.toFixed(1) : margen.arriba + altoUtil - 2,
      width: barra.toFixed(1),
      height: dia.total ? Math.max(2, altura).toFixed(1) : 2,
      rx: 2,
    });
    rect.append(s('title', {}, `${fechaCorta(dia.fecha)}: ${dia.total} ${dia.total === 1 ? 'vista' : 'vistas'}`));
    svg.append(rect);
    // Etiqueta de fecha cada 7 días y en el último
    if (i % 7 === 0 || i === dias.length - 1) {
      svg.append(s('text', { x: (x + barra / 2).toFixed(1), y: alto - 6, 'text-anchor': 'middle' }, fechaCorta(dia.fecha)));
    }
  });
  return svg;
}

function barrasHorizontales(filas) {
  const maximo = Math.max(1, ...filas.map((f) => f.total));
  return h(
    'div',
    { class: 'barras-h' },
    filas.map((f) =>
      h(
        'div',
        { class: 'barra-h' },
        h('span', { text: f.nombre }),
        h('span', { class: 'barra-h-pista' }, h('span', { class: 'barra-h-relleno', vars: { width: `${(f.total / maximo) * 100}%` } })),
        h('span', { class: 'numero', text: numero(f.total) })
      )
    )
  );
}

function listaObras(obras, dato) {
  if (!obras.length) return h('p', { class: 'bloque-nota', text: 'Todavía no hay obras.' });
  return h(
    'ul',
    { class: 'lista-compacta' },
    obras.map((obra) =>
      h(
        'li',
        {},
        h(
          'button',
          { type: 'button', class: 'fila-compacta', onclick: () => (location.hash = `#obras/${obra.id}`) },
          miniatura(obra, 40),
          h('span', { class: 'titulo', text: obra.titulo }),
          h('span', { class: 'dato', text: dato(obra) })
        )
      )
    )
  );
}

export async function montar({ contenedor, acciones }) {
  acciones.append(
    h('a', { class: 'boton boton-acento', href: '#subir' }, icono('image-plus'), h('span', { class: 'texto-boton', text: 'Subir obras' }))
  );

  const datos = await api('/resumen');
  const { totales } = datos;

  if (totales.total === 0) {
    contenedor.append(
      h(
        'div',
        { class: 'bloque vacio' },
        icono('image-plus'),
        h('h2', { text: 'Tu galería está vacía' }),
        h('p', { text: 'Sube tus primeros dibujos y aparecerán en la web al momento.' }),
        h('a', { class: 'boton boton-acento boton-grande', href: '#subir' }, icono('image-plus'), 'Subir obras')
      )
    );
    return;
  }

  // Cifras
  const cifras = [
    ['Obras publicadas', numero(totales.publicadas), `${numero(totales.destacadas)} destacadas`],
    ['Borradores', numero(totales.borradores), 'No se ven en la web'],
    ['Vistas totales', numero(totales.vistas), 'Desde que se subió cada obra'],
    ['Vistas en 30 días', numero(datos.vistas_periodo), 'Visitas a obras en el visor'],
  ];
  contenedor.append(
    h(
      'dl',
      { class: 'cifras' },
      cifras.map(([dt, dd, nota]) => h('div', { class: 'cifra' }, h('dt', { text: dt }), h('dd', { text: dd }), h('span', { class: 'cifra-nota', text: nota })))
    )
  );

  // Gráfico de visitas
  const zonaGrafico = h('div');
  const hayVisitas = datos.vistas30.some((d) => d.total > 0);
  const bloqueGrafico = h(
    'section',
    { class: 'bloque col-8' },
    h('div', { class: 'bloque-cabecera' }, h('h2', { class: 'bloque-titulo', text: 'Visitas de los últimos 30 días' })),
    zonaGrafico
  );
  if (!hayVisitas) {
    zonaGrafico.append(
      h('div', { class: 'grafico-vacio' }, h('p', { text: 'Todavía no hay visitas. Cuando alguien abra una obra en el visor de la web, aparecerá aquí.' }))
    );
  }

  // Más vistas y recientes
  const masVistas = datos.mas_vistas.filter((o) => o.vistas > 0);
  const bloqueTop = h(
    'section',
    { class: 'bloque col-4' },
    h('div', { class: 'bloque-cabecera' }, h('h2', { class: 'bloque-titulo', text: 'Las más vistas' })),
    masVistas.length ? listaObras(masVistas, (o) => `${numero(o.vistas)} vistas`) : h('p', { class: 'bloque-nota', text: 'Aún no hay vistas registradas.' })
  );

  const bloqueRecientes = h(
    'section',
    { class: 'bloque col-6' },
    h(
      'div',
      { class: 'bloque-cabecera' },
      h('h2', { class: 'bloque-titulo', text: 'Subidas recientes' }),
      h('a', { class: 'boton boton-fantasma', href: '#obras' }, 'Ver todas', icono('arrow-right'))
    ),
    listaObras(datos.recientes, (o) => `${o.publicada ? '' : 'Borrador · '}${fechaRelativa(o.creado)}`)
  );

  const porTecnica = datos.por_tecnica.filter((t) => t.total > 0).map((t) => ({ nombre: NOMBRES_TECNICA[t.tecnica], total: t.total }));
  const porCategoria = datos.categorias.filter((c) => c.total > 0).map((c) => ({ nombre: c.nombre, total: c.total }));
  const bloqueReparto = h(
    'section',
    { class: 'bloque col-6' },
    h('div', { class: 'bloque-cabecera' }, h('h2', { class: 'bloque-titulo', text: 'Reparto' }), h('span', { class: 'bloque-nota', text: `${formatoPeso(datos.espacio)} usados en imágenes` })),
    h('h3', { class: 'bloque-nota', text: 'Por técnica' }),
    h('div', { vars: { 'margin-block': '10px 22px' } }, barrasHorizontales(porTecnica)),
    porCategoria.length ? [h('h3', { class: 'bloque-nota', text: 'Por categoría' }), h('div', { vars: { 'margin-top': '10px' } }, barrasHorizontales(porCategoria))] : null
  );

  contenedor.append(h('div', { class: 'rejilla-resumen', vars: { 'margin-top': '20px' } }, bloqueGrafico, bloqueTop, bloqueRecientes, bloqueReparto));

  // El gráfico se dibuja según el ancho disponible y se redibuja al cambiar.
  let observador;
  if (hayVisitas) {
    const dibujar = () => {
      const ancho = Math.max(280, zonaGrafico.clientWidth);
      zonaGrafico.replaceChildren(grafico(datos.vistas30, ancho));
    };
    observador = new ResizeObserver(dibujar);
    observador.observe(zonaGrafico);
  }
  return { limpiar: () => observador?.disconnect() };
}
