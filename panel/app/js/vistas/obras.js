// Vista "Obras": lista completa con filtros, cambio rápido de estado,
// orden arrastrando y acceso al editor.
import {
  h,
  api,
  icono,
  pintarIconos,
  miniatura,
  numero,
  aviso,
  avisoError,
  confirmar,
  ordenable,
  tamanoNativo,
  NOMBRES_TECNICA,
} from '../ui.js';
import { abrirEditor } from './editor.js';

export async function montar({ contenedor, acciones, parametros, contexto }) {
  acciones.append(
    h('a', { class: 'boton boton-acento', href: '#subir' }, icono('image-plus'), h('span', { class: 'texto-boton', text: 'Subir obras' }))
  );

  let [obras, categorias] = await Promise.all([api('/obras'), api('/categorias')]);
  const filtros = { texto: '', estado: 'todas', categoria: '', tecnica: '' };

  // ------------------------------------------------------------ barra de filtros
  const buscar = h('input', { type: 'search', class: 'entrada', placeholder: 'Buscar por título o etiqueta', 'aria-label': 'Buscar obras' });
  const estados = [
    ['todas', 'Todas'],
    ['publicadas', 'Publicadas'],
    ['borradores', 'Borradores'],
    ['destacadas', 'Destacadas'],
  ];
  const pestanas = h(
    'div',
    { class: 'pestanas-estado', role: 'group', 'aria-label': 'Filtrar por estado' },
    estados.map(([valor, texto]) =>
      h('button', {
        type: 'button',
        text: texto,
        'aria-pressed': String(valor === filtros.estado),
        onclick: (e) => {
          filtros.estado = valor;
          [...pestanas.children].forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget)));
          pintar();
        },
      })
    )
  );
  const selCategoria = h(
    'select',
    { class: 'selector', 'aria-label': 'Filtrar por categoría' },
    h('option', { value: '', text: 'Todas las categorías' }),
    h('option', { value: 'ninguna', text: 'Sin categoría' }),
    categorias.map((c) => h('option', { value: String(c.id), text: c.nombre }))
  );
  const selTecnica = h(
    'select',
    { class: 'selector', 'aria-label': 'Filtrar por técnica' },
    h('option', { value: '', text: 'Todas las técnicas' }),
    Object.entries(NOMBRES_TECNICA).map(([v, t]) => h('option', { value: v, text: t }))
  );
  buscar.addEventListener('input', () => {
    filtros.texto = buscar.value;
    pintar();
  });
  selCategoria.addEventListener('change', () => {
    filtros.categoria = selCategoria.value;
    pintar();
  });
  selTecnica.addEventListener('change', () => {
    filtros.tecnica = selTecnica.value;
    pintar();
  });

  contenedor.append(
    h('div', { class: 'barra-herramientas' }, h('label', { class: 'buscador' }, icono('search'), buscar), pestanas, selCategoria, selTecnica)
  );

  const tabla = h('div', { class: 'tabla-obras' });
  const nota = h('p', { class: 'nota-orden' });
  contenedor.append(tabla, nota);

  // ------------------------------------------------------------ datos
  const hayFiltros = () => filtros.texto.trim() || filtros.estado !== 'todas' || filtros.categoria || filtros.tecnica;

  function filtrar() {
    const texto = filtros.texto.trim().toLowerCase();
    return obras.filter((o) => {
      if (filtros.estado === 'publicadas' && !o.publicada) return false;
      if (filtros.estado === 'borradores' && o.publicada) return false;
      if (filtros.estado === 'destacadas' && !o.destacada) return false;
      if (filtros.categoria === 'ninguna' && o.categoria) return false;
      if (filtros.categoria && filtros.categoria !== 'ninguna' && String(o.categoria?.id) !== filtros.categoria) return false;
      if (filtros.tecnica && o.tecnica !== filtros.tecnica) return false;
      if (texto && ![o.titulo, ...o.etiquetas].join(' ').toLowerCase().includes(texto)) return false;
      return true;
    });
  }

  async function actualizar(obra, cambios, mensaje) {
    try {
      const nueva = await api(`/obras/${obra.id}`, { metodo: 'PATCH', datos: cambios });
      obras = obras.map((o) => (o.id === nueva.id ? nueva : o));
      pintar();
      if (mensaje) aviso(mensaje);
    } catch (error) {
      avisoError(error);
      pintar();
    }
  }

  async function borrar(obra) {
    const ok = await confirmar({
      titulo: `¿Borrar "${obra.titulo}"?`,
      texto: 'Se borrará la imagen y todos sus datos. No se puede deshacer.',
    });
    if (!ok) return false;
    try {
      await api(`/obras/${obra.id}`, { metodo: 'DELETE' });
      obras = obras.filter((o) => o.id !== obra.id);
      pintar();
      contexto.actualizarContador();
      aviso('Obra borrada');
      return true;
    } catch (error) {
      avisoError(error);
      return false;
    }
  }

  function editar(obra) {
    abrirEditor(obra, {
      categorias,
      alGuardar: (nueva) => {
        obras = obras.map((o) => (o.id === nueva.id ? nueva : o));
        pintar();
      },
      alBorrar: async () => {
        const ok = await borrar(obra);
        return ok;
      },
    });
  }

  // ------------------------------------------------------------ filas
  function fila(obra, ordenActivo) {
    const { ancho, alto } = tamanoNativo(obra);
    const publicada = h('input', {
      type: 'checkbox',
      checked: obra.publicada,
      'aria-label': `Publicar ${obra.titulo}`,
    });
    publicada.addEventListener('change', () =>
      actualizar(obra, { publicada: publicada.checked }, publicada.checked ? 'Publicada en la web' : 'Pasada a borrador')
    );

    return h(
      'div',
      { class: 'fila-obra', 'data-id': obra.id },
      h(
        'span',
        {
          class: `asa ${ordenActivo ? '' : 'desactivada'}`,
          tabindex: ordenActivo ? '0' : '-1',
          role: 'button',
          'aria-label': ordenActivo ? `Mover ${obra.titulo} (usa las flechas)` : 'Quita los filtros para ordenar',
          title: ordenActivo ? 'Arrastra para cambiar el orden' : 'Quita los filtros para ordenar',
        },
        icono('grip-vertical')
      ),
      miniatura(obra, 56),
      h(
        'div',
        { class: 'obra-nombre' },
        h('button', { type: 'button', text: obra.titulo, onclick: () => editar(obra) }),
        h('small', { text: `${ancho} × ${alto} px${obra.escala > 1 ? ` · x${obra.escala}` : ''}${obra.etiquetas.length ? ` · ${obra.etiquetas.join(', ')}` : ''}` })
      ),
      h('span', { class: 'celda-texto col-categoria', text: obra.categoria?.nombre || 'Sin categoría' }),
      h('span', { class: 'celda-texto col-tecnica', text: NOMBRES_TECNICA[obra.tecnica] }),
      h('span', { class: 'celda-numero col-vistas', text: numero(obra.vistas) }),
      h(
        'label',
        { class: 'interruptor col-estado' },
        publicada,
        h('span', { class: 'interruptor-pista', 'aria-hidden': 'true' }),
        h('span', { class: `estado ${obra.publicada ? 'estado-publicada' : 'estado-borrador'}`, text: obra.publicada ? 'Publicada' : 'Borrador' })
      ),
      h(
        'div',
        { class: 'acciones-fila' },
        h(
          'button',
          {
            type: 'button',
            class: `boton-icono ${obra.destacada ? 'activo' : ''}`,
            'aria-label': obra.destacada ? 'Quitar de destacadas' : 'Marcar como destacada',
            'aria-pressed': String(obra.destacada),
            title: obra.destacada ? 'Quitar de destacadas' : 'Destacar',
            onclick: () => actualizar(obra, { destacada: !obra.destacada }, obra.destacada ? 'Ya no es destacada' : 'Marcada como destacada'),
          },
          icono('star')
        ),
        h('button', { type: 'button', class: 'boton-icono', 'aria-label': `Editar ${obra.titulo}`, title: 'Editar', onclick: () => editar(obra) }, icono('pencil')),
        obra.publicada
          ? h('a', { class: 'boton-icono ocultar-movil', href: `/#obra/${obra.slug}`, target: '_blank', rel: 'noopener', 'aria-label': 'Ver en la web', title: 'Ver en la web' }, icono('external-link'))
          : null,
        h('button', { type: 'button', class: 'boton-icono peligro ocultar-movil', 'aria-label': `Borrar ${obra.titulo}`, title: 'Borrar', onclick: () => borrar(obra) }, icono('trash'))
      )
    );
  }

  function pintar() {
    const lista = filtrar();
    const ordenActivo = !hayFiltros();

    if (obras.length === 0) {
      tabla.replaceChildren(
        h(
          'div',
          { class: 'vacio' },
          icono('images'),
          h('h2', { text: 'Todavía no hay obras' }),
          h('p', { text: 'Sube tu primer dibujo para empezar.' }),
          h('a', { class: 'boton boton-acento', href: '#subir' }, icono('image-plus'), 'Subir obras')
        )
      );
      nota.hidden = true;
      pintarIconos();
      return;
    }

    const cabecera = h(
      'div',
      { class: 'cabecera-tabla', 'aria-hidden': 'true' },
      h('span'),
      h('span'),
      h('span', { text: 'Obra' }),
      h('span', { class: 'col-categoria', text: 'Categoría' }),
      h('span', { class: 'col-tecnica', text: 'Técnica' }),
      h('span', { class: 'col-vistas', text: 'Vistas' }),
      h('span', { class: 'col-estado', text: 'Estado' }),
      h('span')
    );
    const filas = h('div', { class: 'filas-obras' }, lista.map((o) => fila(o, ordenActivo)));
    tabla.replaceChildren(
      cabecera,
      lista.length ? filas : h('div', { class: 'vacio' }, h('p', { text: 'Ninguna obra coincide con los filtros.' }))
    );

    nota.hidden = false;
    nota.replaceChildren(
      icono(ordenActivo ? 'grip-vertical' : 'info'),
      ordenActivo
        ? 'Arrastra las filas desde el asa para cambiar el orden en que aparecen en la galería.'
        : 'Para cambiar el orden quita los filtros y la búsqueda.'
    );

    if (ordenActivo) {
      ordenable(filas, {
        selectorFila: '.fila-obra',
        alSoltar: async (ids) => {
          obras = ids.map((id) => obras.find((o) => o.id === id));
          try {
            await api('/orden/obras', { metodo: 'PUT', datos: { ids } });
            aviso('Orden guardado');
          } catch (error) {
            avisoError(error);
          }
        },
      });
    }
    pintarIconos();
  }

  pintar();

  // "#obras/12" abre directamente el editor de esa obra.
  const idDirecto = Number(parametros[0]);
  if (idDirecto) {
    const obra = obras.find((o) => o.id === idDirecto);
    if (obra) editar(obra);
    history.replaceState(null, '', '#obras');
  }
}
