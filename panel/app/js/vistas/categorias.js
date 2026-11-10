// Vista "Categorías": crear, renombrar, ordenar y borrar categorías.
import { h, api, icono, pintarIconos, aviso, avisoError, confirmar, ordenable, numero } from '../ui.js';

export async function montar({ contenedor }) {
  let categorias = await api('/categorias');

  // ------------------------------------------------------------ nueva categoría
  const nombre = h('input', { type: 'text', class: 'entrada', placeholder: 'Nombre, por ejemplo Personajes', maxlength: '40', 'aria-label': 'Nombre de la nueva categoría', required: true });
  const descripcion = h('input', { type: 'text', class: 'entrada', placeholder: 'Descripción breve (opcional)', maxlength: '200', 'aria-label': 'Descripción de la nueva categoría' });
  const formNueva = h(
    'form',
    { class: 'barra-herramientas', vars: { 'margin-bottom': '0' } },
    h('div', { vars: { flex: '1 1 200px' } }, nombre),
    h('div', { vars: { flex: '2 1 260px' } }, descripcion),
    h('button', { type: 'submit', class: 'boton boton-acento' }, icono('plus'), 'Añadir categoría')
  );
  formNueva.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!nombre.value.trim()) {
      nombre.focus();
      return aviso('Escribe un nombre para la categoría.', 'error');
    }
    try {
      categorias = await api('/categorias', { metodo: 'POST', datos: { nombre: nombre.value, descripcion: descripcion.value } });
      nombre.value = '';
      descripcion.value = '';
      pintar();
      aviso('Categoría creada');
      nombre.focus();
    } catch (error) {
      avisoError(error);
    }
  });

  const lista = h('div', { class: 'lista-categorias' });
  contenedor.append(
    h(
      'section',
      { class: 'bloque' },
      h('div', { class: 'bloque-cabecera' }, h('h2', { class: 'bloque-titulo', text: 'Nueva categoría' })),
      formNueva
    ),
    h(
      'section',
      { class: 'bloque' },
      h(
        'div',
        { class: 'bloque-cabecera' },
        h('h2', { class: 'bloque-titulo', text: 'Tus categorías' }),
        h('span', { class: 'bloque-nota', text: 'Los cambios se guardan al salir de cada campo. Arrastra para ordenar.' })
      ),
      lista
    )
  );

  // ------------------------------------------------------------ edición en línea
  async function guardarCampo(categoria, clave, input) {
    const valor = input.value.trim();
    if (valor === categoria[clave]) return;
    if (clave === 'nombre' && !valor) {
      input.value = categoria.nombre;
      return aviso('El nombre no puede quedar vacío.', 'error');
    }
    try {
      categorias = await api(`/categorias/${categoria.id}`, { metodo: 'PATCH', datos: { [clave]: valor } });
      aviso('Categoría actualizada');
    } catch (error) {
      avisoError(error);
      input.value = categoria[clave];
    }
  }

  async function borrar(categoria) {
    const texto = categoria.total
      ? `Las ${categoria.total} obras de esta categoría quedarán sin categoría (no se borran).`
      : 'La categoría está vacía.';
    if (!(await confirmar({ titulo: `¿Borrar "${categoria.nombre}"?`, texto }))) return;
    try {
      categorias = await api(`/categorias/${categoria.id}`, { metodo: 'DELETE' });
      pintar();
      aviso('Categoría borrada');
    } catch (error) {
      avisoError(error);
    }
  }

  function fila(categoria) {
    const inputNombre = h('input', { type: 'text', class: 'entrada', value: categoria.nombre, maxlength: '40', 'aria-label': `Nombre de ${categoria.nombre}` });
    const inputDesc = h('input', { type: 'text', class: 'entrada col-desc', value: categoria.descripcion, maxlength: '200', placeholder: 'Sin descripción', 'aria-label': `Descripción de ${categoria.nombre}` });
    inputNombre.addEventListener('change', () => guardarCampo(categoria, 'nombre', inputNombre));
    inputDesc.addEventListener('change', () => guardarCampo(categoria, 'descripcion', inputDesc));
    [inputNombre, inputDesc].forEach((i) => i.addEventListener('keydown', (e) => e.key === 'Enter' && i.blur()));

    return h(
      'div',
      { class: 'fila-categoria', 'data-id': categoria.id },
      h('span', { class: 'asa', tabindex: '0', role: 'button', 'aria-label': `Mover ${categoria.nombre} (usa las flechas)`, title: 'Arrastra para ordenar' }, icono('grip-vertical')),
      inputNombre,
      inputDesc,
      h('span', { class: 'celda-numero col-total', text: `${numero(categoria.total)} ${categoria.total === 1 ? 'obra' : 'obras'}` }),
      h('button', { type: 'button', class: 'boton-icono peligro', 'aria-label': `Borrar ${categoria.nombre}`, title: 'Borrar', onclick: () => borrar(categoria) }, icono('trash'))
    );
  }

  function pintar() {
    if (!categorias.length) {
      lista.replaceChildren(h('div', { class: 'vacio' }, icono('tags'), h('p', { text: 'No hay categorías. Crea la primera arriba.' })));
    } else {
      lista.replaceChildren(...categorias.map(fila));
    }
    pintarIconos();
  }

  ordenable(lista, {
    selectorFila: '.fila-categoria',
    alSoltar: async (ids) => {
      try {
        categorias = await api('/orden/categorias', { metodo: 'PUT', datos: { ids } });
        aviso('Orden guardado');
      } catch (error) {
        avisoError(error);
      }
    },
  });

  pintar();
}
