// Vista "Subir obras": arrastrar y soltar (o pegar con Ctrl+V), revisar los
// datos de cada imagen y subirlas todas con su barra de progreso.
import {
  h,
  api,
  icono,
  pintarIconos,
  aviso,
  avisoError,
  campo,
  interruptor,
  selectorCategoria,
  selectorTecnica,
  subirArchivo,
  formatoPeso,
  tituloDesdeArchivo,
} from '../ui.js';

const TIPOS = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

export async function montar({ contenedor, contexto }) {
  const categorias = await api('/categorias');
  const maxBytes = contexto.info?.max_bytes_subida || 25 * 1048576;
  const cola = [];
  let subiendo = false;

  // ------------------------------------------------------------ zona de subida
  const selector = h('input', { type: 'file', accept: TIPOS.join(','), multiple: true, hidden: true });
  const zona = h(
    'div',
    {
      class: 'zona-subida',
      role: 'button',
      tabindex: '0',
      'aria-describedby': 'ayuda-subida',
      'aria-label': 'Elegir imágenes para subir',
    },
    h('span', { class: 'icono-grande' }, icono('cloud-upload')),
    h('strong', { text: 'Arrastra tus dibujos aquí o haz clic para elegirlos' }),
    h('p', {
      class: 'ayuda',
      id: 'ayuda-subida',
      text: `PNG, JPG, WEBP o GIF, hasta ${Math.round(maxBytes / 1048576)} MB cada uno. También puedes pegar una imagen copiada con Ctrl+V.`,
    })
  );
  zona.addEventListener('click', () => selector.click());
  zona.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      selector.click();
    }
  });
  selector.addEventListener('change', () => {
    anadir([...selector.files]);
    selector.value = '';
  });
  ['dragenter', 'dragover'].forEach((tipo) =>
    zona.addEventListener(tipo, (e) => {
      e.preventDefault();
      zona.classList.add('encima');
    })
  );
  ['dragleave', 'drop'].forEach((tipo) => zona.addEventListener(tipo, () => zona.classList.remove('encima')));
  zona.addEventListener('drop', (e) => {
    e.preventDefault();
    anadir([...e.dataTransfer.files]);
  });

  // Pegar imágenes desde el portapapeles (por ejemplo, copiadas en Aseprite).
  const alPegar = (e) => {
    if (e.target.matches?.('input, textarea')) return;
    const archivos = [...(e.clipboardData?.files || [])].filter((f) => TIPOS.includes(f.type));
    if (archivos.length) {
      e.preventDefault();
      anadir(archivos.map((f, i) => new File([f], f.name && f.name !== 'image.png' ? f.name : `pegada-${Date.now()}-${i}.png`, { type: f.type })));
    }
  };
  document.addEventListener('paste', alPegar);

  // ------------------------------------------------------------ opciones del lote
  const catDefecto = selectorCategoria({ categorias, id: 'lote-categoria' });
  const tecDefecto = selectorTecnica({ id: 'lote-tecnica' });
  const publicarDefecto = interruptor({ nombre: 'lote-publicar', etiqueta: 'Publicar al subir', ayuda: 'Si lo desactivas se guardan como borrador', marcado: true });
  // Cambiar las opciones del lote las aplica a las imágenes que aún no se han subido.
  catDefecto.addEventListener('change', () => cola.filter((i) => i.estado === 'pendiente').forEach((i) => (i.campos.categoria.value = catDefecto.value)));
  tecDefecto.addEventListener('change', () => cola.filter((i) => i.estado === 'pendiente').forEach((i) => (i.campos.tecnica.value = tecDefecto.value)));

  const bloqueLote = h(
    'section',
    { class: 'bloque', 'aria-labelledby': 'titulo-lote' },
    h('div', { class: 'bloque-cabecera' }, h('h2', { class: 'bloque-titulo', id: 'titulo-lote', text: 'Opciones para todas' })),
    h(
      'div',
      { class: 'opciones-lote' },
      campo({ etiqueta: 'Categoría', control: catDefecto, id: 'lote-categoria' }),
      campo({ etiqueta: 'Técnica', control: tecDefecto, id: 'lote-tecnica' }),
      publicarDefecto
    )
  );

  const listaCola = h('div', { class: 'cola', 'aria-live': 'polite' });
  const botonSubir = h('button', { type: 'button', class: 'boton boton-acento boton-grande' }, icono('cloud-upload'), h('span'));
  const botonVaciar = h('button', { type: 'button', class: 'boton boton-fantasma' }, 'Vaciar lista');
  const resumen = h('div', { class: 'resumen-subida' }, h('p', { class: 'texto-apagado' }), h('div', { class: 'acciones-fila' }, botonVaciar, botonSubir));

  contenedor.append(zona, selector, h('div', { vars: { height: '20px' } }), bloqueLote, h('div', { vars: { height: '20px' } }), listaCola, resumen);

  // ------------------------------------------------------------ cola
  function anadir(archivos) {
    let rechazados = 0;
    for (const archivo of archivos) {
      if (!TIPOS.includes(archivo.type)) {
        rechazados++;
        continue;
      }
      if (archivo.size > maxBytes) {
        aviso(`"${archivo.name}" pesa ${formatoPeso(archivo.size)} y el máximo es ${formatoPeso(maxBytes)}.`, 'error');
        continue;
      }
      cola.push(crearItem(archivo));
    }
    if (rechazados) aviso(`${rechazados} archivo(s) no son imágenes PNG, JPG, WEBP o GIF.`, 'error');
    pintarCola();
  }

  function crearItem(archivo) {
    const url = URL.createObjectURL(archivo);
    const item = { archivo, url, estado: 'pendiente', progreso: 0, error: '', obra: null };
    const id = `c${Math.random().toString(36).slice(2, 8)}`;

    const img = h('img', { src: url, alt: '' });
    const info = h('div', { class: 'item-cola-info' }, h('span', { text: archivo.name }), h('span', { text: formatoPeso(archivo.size) }));
    // Se miden las dimensiones para sugerir si es pixel art.
    img.addEventListener('load', () => {
      const pequena = Math.max(img.naturalWidth, img.naturalHeight) <= 1024;
      info.append(h('span', { text: `${img.naturalWidth} × ${img.naturalHeight} px` }));
      if (pequena) {
        img.classList.add('pixelado');
        const k = Math.floor(96 / Math.max(img.naturalWidth, img.naturalHeight));
        if (k >= 1) {
          img.width = img.naturalWidth * k;
          img.height = img.naturalHeight * k;
        }
      }
    });

    item.campos = {
      titulo: h('input', { type: 'text', id: `${id}-titulo`, value: tituloDesdeArchivo(archivo.name), maxlength: '120' }),
      categoria: selectorCategoria({ categorias, valor: catDefecto.value, id: `${id}-cat` }),
      tecnica: selectorTecnica({ valor: tecDefecto.value, id: `${id}-tec` }),
      descripcion: h('input', { type: 'text', id: `${id}-desc`, maxlength: '2000', placeholder: 'Opcional' }),
    };
    item.opciones = {
      destacada: interruptor({ nombre: 'destacada', etiqueta: 'Destacada' }),
      descargable: interruptor({ nombre: 'descargable', etiqueta: 'Permitir descarga' }),
    };
    item.barra = h('span');
    item.estadoTexto = h('p', { class: 'item-cola-estado' });

    item.el = h(
      'article',
      { class: 'item-cola' },
      h('span', { class: 'miniatura cuadricula', vars: { '--lado': '112px' } }, img),
      h(
        'div',
        { class: 'item-cola-campos' },
        campo({ etiqueta: 'Título', control: item.campos.titulo, id: `${id}-titulo` }),
        campo({ etiqueta: 'Categoría', control: item.campos.categoria, id: `${id}-cat` }),
        campo({ etiqueta: 'Técnica', control: item.campos.tecnica, id: `${id}-tec` }),
        h('div', { class: 'ancho-total' }, campo({ etiqueta: 'Descripción', control: item.campos.descripcion, id: `${id}-desc` })),
        h('div', { class: 'item-cola-opciones' }, item.opciones.destacada, item.opciones.descargable),
        info,
        h('div', { class: 'progreso', 'aria-hidden': 'true' }, item.barra),
        item.estadoTexto
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'boton-icono peligro',
          'aria-label': `Quitar ${archivo.name} de la lista`,
          onclick: () => {
            if (item.estado === 'subiendo') return;
            cola.splice(cola.indexOf(item), 1);
            URL.revokeObjectURL(url);
            pintarCola();
          },
        },
        icono('x')
      )
    );
    return item;
  }

  function pintarEstado(item) {
    item.el.classList.toggle('hecho', item.estado === 'hecho');
    item.el.classList.toggle('fallo', item.estado === 'error');
    item.barra.style.setProperty('--avance', `${Math.round(item.progreso * 100)}%`);
    const textos = {
      pendiente: '',
      subiendo: item.progreso < 1 ? `Subiendo... ${Math.round(item.progreso * 100)}%` : 'Procesando la imagen...',
      hecho: `Subida${item.obra?.pixelado ? ` · pixel art detectado${item.obra.escala > 1 ? ` (exportado a x${item.obra.escala})` : ''}` : ''}`,
      error: item.error,
    };
    item.estadoTexto.textContent = textos[item.estado];
    const bloquear = item.estado === 'subiendo' || item.estado === 'hecho';
    Object.values(item.campos).forEach((c) => (c.disabled = bloquear));
    item.el.querySelectorAll('.item-cola-opciones input').forEach((c) => (c.disabled = bloquear));
  }

  function pintarCola() {
    listaCola.replaceChildren(...cola.map((i) => i.el));
    cola.forEach(pintarEstado);
    const pendientes = cola.filter((i) => i.estado === 'pendiente' || i.estado === 'error').length;
    const hechas = cola.filter((i) => i.estado === 'hecho').length;
    resumen.hidden = cola.length === 0;
    bloqueLote.hidden = cola.length === 0;
    botonSubir.lastChild.textContent = pendientes === 1 ? 'Subir 1 obra' : `Subir ${pendientes} obras`;
    botonSubir.disabled = pendientes === 0 || subiendo;
    botonVaciar.disabled = subiendo;
    resumen.firstChild.textContent = hechas
      ? `${hechas} de ${cola.length} subidas.`
      : `${cola.length} ${cola.length === 1 ? 'imagen lista' : 'imágenes listas'} para subir. Revisa los títulos antes de continuar.`;
    if (hechas && pendientes === 0) {
      resumen.firstChild.replaceChildren(`Todo subido (${hechas}). `, h('a', { href: '#obras', text: 'Ver en Obras' }));
    }
    pintarIconos();
  }

  async function subirTodo() {
    subiendo = true;
    pintarCola();
    const publicar = publicarDefecto.querySelector('input').checked;
    let correctas = 0;
    for (const item of cola.filter((i) => i.estado === 'pendiente' || i.estado === 'error')) {
      item.estado = 'subiendo';
      item.progreso = 0;
      pintarEstado(item);
      const datos = new FormData();
      datos.append('archivo', item.archivo);
      datos.append('titulo', item.campos.titulo.value.trim() || tituloDesdeArchivo(item.archivo.name));
      datos.append('descripcion', item.campos.descripcion.value.trim());
      datos.append('categoria_id', item.campos.categoria.value);
      datos.append('tecnica', item.campos.tecnica.value);
      datos.append('publicada', publicar ? '1' : '0');
      datos.append('destacada', item.opciones.destacada.querySelector('input').checked ? '1' : '0');
      datos.append('descargable', item.opciones.descargable.querySelector('input').checked ? '1' : '0');
      try {
        item.obra = await subirArchivo('/obras', datos, (p) => {
          item.progreso = p;
          pintarEstado(item);
        });
        item.estado = 'hecho';
        item.progreso = 1;
        correctas++;
      } catch (error) {
        item.estado = 'error';
        item.error = error.message;
      }
      pintarEstado(item);
    }
    subiendo = false;
    pintarCola();
    contexto.actualizarContador();
    if (correctas) aviso(correctas === 1 ? 'Obra subida' : `${correctas} obras subidas`);
    const fallos = cola.filter((i) => i.estado === 'error').length;
    if (fallos) avisoError(new Error(`${fallos} no se pudieron subir. Revisa el motivo en cada una.`));
  }

  botonSubir.addEventListener('click', subirTodo);
  botonVaciar.addEventListener('click', () => {
    cola.splice(0).forEach((i) => URL.revokeObjectURL(i.url));
    pintarCola();
  });

  pintarCola();

  return {
    limpiar: () => {
      document.removeEventListener('paste', alPegar);
      cola.forEach((i) => URL.revokeObjectURL(i.url));
    },
    // Avisa si se intenta salir con imágenes sin subir o subiendo.
    puedeSalir: () => !cola.some((i) => i.estado === 'pendiente' || i.estado === 'subiendo'),
  };
}
