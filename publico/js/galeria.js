// Galería con filtros por técnica y categoría, búsqueda y orden.
import { $, h, icono, pintarIconos, medidasEnCaja, tamanoNativo, NOMBRES_TECNICA, reducirMovimiento } from './util.js';

export function crearGaleria({ obras, categorias, alAbrir }) {
  const rejilla = $('#rejilla');
  const vacio = $('#vacio');
  const cuenta = $('#galeria-cuenta');
  const buscar = $('#buscar');
  const orden = $('#orden');

  const filtros = { tecnica: 'todas', categoria: 'todas', texto: '', orden: 'artista' };
  let visibles = [];
  let primeraVez = true;

  // Redimensiona las imágenes de pixel art cuando cambia el tamaño de su caja.
  const observador = new ResizeObserver((entradas) => {
    for (const entrada of entradas) colocarImagen(entrada.target);
  });

  // ------------------------------------------------------------------ filtros
  function pintarFiltrosTecnica() {
    const presentes = Object.keys(NOMBRES_TECNICA).filter((t) => obras.some((o) => o.tecnica === t));
    const opciones = [['todas', 'Todo', obras.length], ...presentes.map((t) => [t, NOMBRES_TECNICA[t], obras.filter((o) => o.tecnica === t).length])];
    $('#filtro-tecnica').replaceChildren(
      ...opciones.map(([valor, texto, total]) =>
        h(
          'button',
          {
            type: 'button',
            class: 'chip',
            'aria-pressed': String(filtros.tecnica === valor),
            onclick: () => {
              filtros.tecnica = valor;
              pintarFiltrosTecnica();
              pintar();
            },
          },
          texto,
          h('span', { class: 'cuenta', text: String(total) })
        )
      )
    );
    // Si solo hay una técnica no tiene sentido filtrar por ella.
    $('#filtro-tecnica').hidden = presentes.length < 2;
  }

  function pintarFiltrosCategoria() {
    const opciones = [['todas', 'Todas'], ...categorias.map((c) => [c.slug, c.nombre])];
    $('#filtro-categoria').replaceChildren(
      ...opciones.map(([valor, texto]) =>
        h('button', {
          type: 'button',
          class: 'chip',
          text: texto,
          'aria-pressed': String(filtros.categoria === valor),
          onclick: () => {
            filtros.categoria = valor;
            pintarFiltrosCategoria();
            pintar();
          },
        })
      )
    );
    $('#filtro-categoria').hidden = categorias.length < 2;
  }

  // ------------------------------------------------------------------ datos
  function filtrar() {
    const texto = filtros.texto.trim().toLowerCase();
    const normalizar = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const buscado = normalizar(texto);
    let lista = obras.filter((o) => {
      if (filtros.tecnica !== 'todas' && o.tecnica !== filtros.tecnica) return false;
      if (filtros.categoria !== 'todas' && o.categoria?.slug !== filtros.categoria) return false;
      if (buscado) {
        const pajar = normalizar([o.titulo, o.descripcion, o.categoria?.nombre || '', ...o.etiquetas].join(' '));
        if (!pajar.includes(buscado)) return false;
      }
      return true;
    });
    const ordenes = {
      artista: () => 0,
      recientes: (a, b) => b.creado.localeCompare(a.creado),
      vistas: (a, b) => b.vistas - a.vistas,
      titulo: (a, b) => a.titulo.localeCompare(b.titulo, 'es'),
    };
    lista = [...lista].sort(ordenes[filtros.orden] || ordenes.artista);
    return lista;
  }

  // ------------------------------------------------------------------ tarjetas
  function tarjeta(obra, indice) {
    const { ancho, alto } = tamanoNativo(obra);
    const ancha = obra.ancho / obra.alto >= 1.7;
    const img = h('img', {
      src: obra.miniatura,
      alt: obra.titulo,
      loading: indice < 8 ? 'eager' : 'lazy',
      decoding: 'async',
      width: obra.ancho,
      height: obra.alto,
      class: obra.pixelado ? 'pixelado' : 'suave',
      draggable: 'false',
    });
    const lienzo = h(
      'button',
      {
        type: 'button',
        class: `obra-lienzo ${obra.transparente ? 'cuadricula' : 'opaca'} ${obra.pixelado ? 'pixel' : ''}`,
        'aria-label': `Abrir ${obra.titulo}`,
        onclick: () => alAbrir(obra, visibles),
      },
      img,
      obra.destacada ? h('span', { class: 'obra-estrella', title: 'Destacada' }, icono('star')) : null
    );
    lienzo._obra = obra;

    const meta = obra.pixelado ? `${ancho} × ${alto}` : NOMBRES_TECNICA[obra.tecnica];
    const articulo = h(
      'article',
      { class: `obra${ancha ? ' ancha' : ''}` },
      lienzo,
      h(
        'div',
        { class: 'obra-pie' },
        h('h3', { text: obra.titulo, title: obra.titulo }),
        h('p', { text: [obra.categoria?.nombre, meta].filter(Boolean).join(' · ') })
      )
    );
    return articulo;
  }

  // Coloca la imagen dentro de su caja con escalado entero si es pixel art.
  function colocarImagen(lienzo) {
    const obra = lienzo._obra;
    const img = lienzo.querySelector('img');
    if (!obra || !img) return;
    if (!obra.pixelado) return;
    const caja = lienzo.getBoundingClientRect();
    if (!caja.width) return;
    const ancha = obra.ancho / obra.alto >= 1.7;
    const medidas = medidasEnCaja(obra, caja.width, caja.height, ancha ? 0.92 : 0.7);
    img.style.width = `${medidas.ancho}px`;
    img.style.height = `${medidas.alto}px`;
  }

  // ------------------------------------------------------------------ pintar
  function pintar() {
    visibles = filtrar();
    observador.disconnect();
    const animar = !primeraVez && !reducirMovimiento();
    const tarjetas = visibles.map((obra, i) => {
      const t = tarjeta(obra, i);
      if (animar) {
        t.classList.add('entrando');
        t.style.setProperty('--retraso', `${Math.min(i, 12) * 45}ms`);
      }
      return t;
    });
    rejilla.replaceChildren(...tarjetas);
    rejilla.setAttribute('aria-busy', 'false');
    for (const lienzo of rejilla.querySelectorAll('.obra-lienzo')) {
      colocarImagen(lienzo);
      observador.observe(lienzo);
    }
    pintarIconos();

    const total = obras.length;
    cuenta.textContent =
      visibles.length === total
        ? `${total} ${total === 1 ? 'obra' : 'obras'}`
        : `${visibles.length} de ${total} obras`;
    vacio.hidden = visibles.length > 0 || total === 0;
    if (total === 0) {
      rejilla.replaceChildren(h('p', { class: 'vacio', text: 'Muy pronto habrá dibujos por aquí.' }));
    }
    primeraVez = false;
  }

  // ------------------------------------------------------------------ eventos
  let temporizador;
  buscar.addEventListener('input', () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => {
      filtros.texto = buscar.value;
      pintar();
    }, 140);
  });
  orden.addEventListener('change', () => {
    filtros.orden = orden.value;
    pintar();
  });
  $('#quitar-filtros').addEventListener('click', () => {
    Object.assign(filtros, { tecnica: 'todas', categoria: 'todas', texto: '' });
    buscar.value = '';
    pintarFiltrosTecnica();
    pintarFiltrosCategoria();
    pintar();
  });

  pintarFiltrosTecnica();
  pintarFiltrosCategoria();
  pintar();
  const filtrosCaja = $('.filtros');
  filtrosCaja.hidden = obras.length === 0;

  return {
    visibles: () => visibles,
  };
}
