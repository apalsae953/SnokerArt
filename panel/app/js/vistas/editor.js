// Editor de una obra en un panel lateral: textos, categoría, técnica,
// etiquetas, opciones de publicación y reemplazo de la imagen.
import {
  $,
  h,
  api,
  icono,
  pintarIconos,
  miniatura,
  aviso,
  avisoError,
  confirmar,
  campo,
  interruptor,
  segmentado,
  selectorCategoria,
  chipsEntrada,
  subirArchivo,
  tamanoNativo,
  formatoPeso,
  fechaRelativa,
  numero,
  NOMBRES_TECNICA,
} from '../ui.js';

export function abrirEditor(obraInicial, { categorias, alGuardar, alBorrar }) {
  const cajon = $('#cajon');
  let obra = obraInicial;
  let sucio = false;

  const titulo = h('input', { type: 'text', id: 'ed-titulo', name: 'titulo', value: obra.titulo, maxlength: '120', required: true });
  const descripcion = h('textarea', { id: 'ed-descripcion', name: 'descripcion', maxlength: '2000', rows: '4' });
  descripcion.value = obra.descripcion;
  const categoria = selectorCategoria({ categorias, valor: obra.categoria?.id, id: 'ed-categoria' });
  const tecnica = segmentado({ nombre: 'tecnica', opciones: Object.entries(NOMBRES_TECNICA), valor: obra.tecnica, etiqueta: 'Técnica' });
  const etiquetas = chipsEntrada({ valores: obra.etiquetas, id: 'ed-etiquetas', alCambiar: () => (sucio = true) });

  const opciones = h(
    'div',
    { class: 'formulario', vars: { gap: '4px' } },
    interruptor({ nombre: 'publicada', etiqueta: 'Publicada', ayuda: 'Visible en la galería de la web', marcado: obra.publicada }),
    interruptor({ nombre: 'destacada', etiqueta: 'Destacada', ayuda: 'Aparece en la portada y en la sección Destacadas', marcado: obra.destacada }),
    interruptor({ nombre: 'descargable', etiqueta: 'Permitir descarga', ayuda: 'Los visitantes pueden descargar el archivo original', marcado: obra.descargable }),
    interruptor({ nombre: 'pixelado', etiqueta: 'Escalar sin suavizado', ayuda: 'Actívalo en pixel art para que los píxeles se vean nítidos', marcado: obra.pixelado })
  );

  // Vista previa con datos técnicos y paleta
  const previa = h('div', { class: 'vista-previa' });
  const archivo = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', hidden: true });

  function pintarPrevia() {
    const { ancho, alto } = tamanoNativo(obra);
    previa.replaceChildren(
      miniatura(obra, 200),
      h(
        'div',
        { class: 'vista-previa-datos' },
        h(
          'dl',
          { class: 'datos-tecnicos' },
          h('dt', { text: 'Tamaño' }),
          h('dd', { text: `${ancho} × ${alto} px` }),
          obra.escala > 1 ? [h('dt', { text: 'Exportado' }), h('dd', { text: `x${obra.escala} (${obra.ancho} × ${obra.alto})` })] : null,
          h('dt', { text: 'Colores' }),
          h('dd', { text: numero(obra.num_colores) }),
          h('dt', { text: 'Archivo' }),
          h('dd', { text: `${obra.formato.toUpperCase()} · ${formatoPeso(obra.peso)}` }),
          h('dt', { text: 'Subida' }),
          h('dd', { text: fechaRelativa(obra.creado) })
        ),
        obra.paleta.length
          ? h('div', { class: 'paleta-mini', 'aria-label': 'Paleta' }, obra.paleta.slice(0, 24).map((c) => h('span', { title: c, vars: { '--color': c } })))
          : null,
        h(
          'div',
          { class: 'acciones-imagen' },
          h('button', { type: 'button', class: 'boton boton-tono', onclick: () => archivo.click() }, icono('refresh-cw'), 'Reemplazar imagen'),
          h('button', { type: 'button', class: 'boton boton-fantasma', onclick: () => usarComo('obra_portada', 'portada') }, icono('pin'), 'Usar de portada'),
          h('button', { type: 'button', class: 'boton boton-fantasma', onclick: () => usarComo('obra_avatar', 'avatar') }, icono('user'), 'Usar de avatar')
        )
      )
    );
    pintarIconos();
  }

  async function usarComo(clave, nombre) {
    try {
      await api('/ajustes', { metodo: 'PUT', datos: { [clave]: String(obra.id) } });
      aviso(`Ahora es la ${nombre} de la web`);
    } catch (error) {
      avisoError(error);
    }
  }

  archivo.addEventListener('change', async () => {
    const fichero = archivo.files[0];
    if (!fichero) return;
    const datos = new FormData();
    datos.append('archivo', fichero);
    try {
      aviso('Subiendo la nueva imagen...');
      obra = await subirArchivo(`/obras/${obra.id}/archivo`, datos, null, 'PUT');
      pintarPrevia();
      // El interruptor de pixel art se actualiza con lo detectado.
      formulario.elements.pixelado.checked = obra.pixelado;
      alGuardar?.(obra);
      aviso('Imagen reemplazada');
    } catch (error) {
      avisoError(error);
    }
    archivo.value = '';
  });

  const formulario = h(
    'form',
    { class: 'cajon-form', novalidate: true },
    h(
      'div',
      { class: 'cajon-cabecera' },
      h('h2', { id: 'cajon-titulo', text: `Editar: ${obra.titulo}` }),
      h('a', { class: 'boton-icono', href: `/#obra/${obra.slug}`, target: '_blank', rel: 'noopener', 'aria-label': 'Ver en la web', title: 'Ver en la web' }, icono('external-link')),
      h('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Cerrar editor', onclick: () => cerrar() }, icono('x'))
    ),
    h(
      'div',
      { class: 'cajon-cuerpo' },
      previa,
      archivo,
      campo({ etiqueta: 'Título', control: titulo, id: 'ed-titulo', contador: true }),
      campo({ etiqueta: 'Descripción', control: descripcion, id: 'ed-descripcion', contador: true, ayuda: 'Aparece en el visor de la web, bajo el título.' }),
      h('div', { class: 'campos-2' }, campo({ etiqueta: 'Categoría', control: categoria, id: 'ed-categoria' }), h('div', { class: 'campo' }, h('span', { class: 'etiqueta-campo', text: 'Técnica' }), tecnica)),
      campo({ etiqueta: 'Etiquetas', control: etiquetas, id: 'ed-etiquetas', ayuda: 'Pulsa Intro o escribe una coma para añadir cada etiqueta. Sirven para la búsqueda de la web.' }),
      opciones
    ),
    h(
      'div',
      { class: 'cajon-pie' },
      h('button', { type: 'button', class: 'boton boton-peligro-suave', onclick: borrar }, icono('trash'), 'Borrar'),
      h('button', { type: 'button', class: 'boton boton-tono', onclick: () => cerrar() }, 'Cancelar'),
      h('button', { type: 'submit', class: 'boton boton-acento' }, icono('check'), 'Guardar cambios')
    )
  );

  formulario.addEventListener('input', () => (sucio = true));
  formulario.addEventListener('change', () => (sucio = true));

  formulario.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!titulo.value.trim()) {
      titulo.closest('.campo').classList.add('con-error');
      titulo.focus();
      aviso('El título no puede estar vacío.', 'error');
      return;
    }
    const f = formulario.elements;
    const datos = {
      titulo: titulo.value.trim(),
      descripcion: descripcion.value.trim(),
      categoria_id: categoria.value || null,
      tecnica: formulario.querySelector('input[name="tecnica"]:checked')?.value || obra.tecnica,
      etiquetas: etiquetas.obtener(),
      publicada: f.publicada.checked,
      destacada: f.destacada.checked,
      descargable: f.descargable.checked,
      pixelado: f.pixelado.checked,
    };
    const boton = formulario.querySelector('button[type="submit"]');
    boton.disabled = true;
    try {
      obra = await api(`/obras/${obra.id}`, { metodo: 'PATCH', datos });
      alGuardar?.(obra);
      sucio = false;
      aviso('Cambios guardados');
      cerrar(true);
    } catch (error) {
      avisoError(error);
    }
    boton.disabled = false;
  });

  async function borrar() {
    const borrada = await alBorrar?.();
    if (borrada) cerrar(true);
  }

  async function cerrar(forzar = false) {
    if (!forzar && sucio) {
      const salir = await confirmar({ titulo: 'Hay cambios sin guardar', texto: '¿Cerrar el editor y descartar los cambios?', boton: 'Descartar' });
      if (!salir) return;
    }
    cajon.close();
  }

  // Escape: se intercepta para preguntar si hay cambios sin guardar.
  cajon.oncancel = (e) => {
    e.preventDefault();
    cerrar();
  };
  // Clic fuera del panel (en el fondo oscuro) también lo cierra.
  cajon.onclick = (e) => {
    if (e.target === cajon) cerrar();
  };

  cajon.replaceChildren(formulario);
  pintarPrevia();
  pintarIconos();
  cajon.showModal();
  titulo.focus();
}
