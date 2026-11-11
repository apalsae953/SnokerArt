// Vista "Resumen": cifras principales, subidas recientes y reparto por
// técnica y categoría.
import { h, api, icono, miniatura, numero, formatoPeso, fechaRelativa, NOMBRES_TECNICA } from '../ui.js';

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

export async function montar({ contenedor, acciones, contexto }) {
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

  // Cifras principales
  const enBlob = contexto.info?.almacen === 'blob';
  const cifras = [
    ['Obras publicadas', numero(totales.publicadas), 'Visibles en la web'],
    ['Borradores', numero(totales.borradores), 'Solo los ves tú'],
    ['Destacadas', numero(totales.destacadas), 'En la portada y en Destacadas'],
    ['Espacio usado', formatoPeso(datos.espacio), enBlob ? 'En Vercel Blob (1 GB gratis)' : 'En este PC'],
  ];
  contenedor.append(
    h(
      'dl',
      { class: 'cifras' },
      cifras.map(([dt, dd, nota]) => h('div', { class: 'cifra' }, h('dt', { text: dt }), h('dd', { text: dd }), h('span', { class: 'cifra-nota', text: nota })))
    )
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
    h('div', { class: 'bloque-cabecera' }, h('h2', { class: 'bloque-titulo', text: 'Reparto' })),
    h('h3', { class: 'bloque-nota', text: 'Por técnica' }),
    h('div', { vars: { 'margin-block': '10px 22px' } }, barrasHorizontales(porTecnica)),
    porCategoria.length
      ? [h('h3', { class: 'bloque-nota', text: 'Por categoría' }), h('div', { vars: { 'margin-top': '10px' } }, barrasHorizontales(porCategoria))]
      : null
  );

  contenedor.append(h('div', { class: 'rejilla-resumen', vars: { 'margin-top': '20px' } }, bloqueRecientes, bloqueReparto));
}
