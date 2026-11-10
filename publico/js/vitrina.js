// Sección "Destacadas": una obra grande en su placa, con pestañas para
// cambiar entre las obras destacadas, sus datos y su paleta.
import { $, h, icono, pintarIconos, medidasEnCaja, pintarPaleta, datosObra, pintarDatos, reducirMovimiento } from './util.js';

export function pintarVitrina({ obras, abrirObra }) {
  const destacadas = obras.filter((o) => o.destacada).slice(0, 6);
  const seccion = $('#destacadas');
  if (destacadas.length === 0) {
    seccion.hidden = true;
    document.querySelectorAll('[data-si="destacadas"]').forEach((el) => (el.hidden = true));
    return;
  }
  seccion.hidden = false;

  const placa = $('#vitrina-placa');
  const img = $('#vitrina-img');
  const pestanas = $('#vitrina-pestanas');
  let actual = 0;

  function colocar() {
    const obra = destacadas[actual];
    const caja = placa.getBoundingClientRect();
    if (!caja.width) return;
    const ancha = obra.ancho / obra.alto >= 1.4;
    const medidas = medidasEnCaja(obra, caja.width, caja.height, ancha ? 0.94 : 0.62);
    img.style.width = `${medidas.ancho}px`;
    img.style.height = `${medidas.alto}px`;
  }

  function mostrar(indice, { foco = false } = {}) {
    actual = (indice + destacadas.length) % destacadas.length;
    const obra = destacadas[actual];

    const cambiar = () => {
      img.src = obra.url;
      img.alt = obra.titulo;
      img.className = obra.pixelado ? 'pixelado' : 'suave';
      placa.classList.toggle('cuadricula', obra.transparente);
      colocar();
      requestAnimationFrame(() => img.classList.remove('cambiando'));
    };
    if (img.src && !reducirMovimiento()) {
      img.classList.add('cambiando');
      setTimeout(cambiar, 180);
    } else {
      cambiar();
    }

    $('#vitrina-nombre').textContent = obra.titulo;
    $('#vitrina-desc').textContent = obra.descripcion;
    $('#vitrina-desc').hidden = !obra.descripcion;
    pintarDatos($('#vitrina-datos'), datosObra(obra));
    pintarPaleta($('#vitrina-paleta'), obra.paleta);

    // La segunda acción es "Descargar" si la obra lo permite.
    const secundaria = $('#vitrina-secundaria');
    if (obra.descargable) {
      secundaria.href = `/api/obras/${encodeURIComponent(obra.slug)}/descargar`;
      secundaria.replaceChildren(icono('download'), ' Descargar');
    } else {
      secundaria.href = '#galeria';
      secundaria.replaceChildren(icono('layout-grid'), ' Ver la galería');
    }
    pintarIconos();

    [...pestanas.children].forEach((p, i) => {
      p.setAttribute('aria-selected', String(i === actual));
      p.tabIndex = i === actual ? 0 : -1;
      if (i === actual && foco) p.focus();
    });
  }

  pestanas.replaceChildren(
    ...destacadas.map((obra, i) =>
      h('button', {
        type: 'button',
        role: 'tab',
        class: 'pestana',
        id: `pestana-${obra.id}`,
        'aria-controls': 'vitrina-detalle',
        text: obra.titulo,
        onclick: () => mostrar(i),
      })
    )
  );
  pestanas.hidden = destacadas.length < 2;

  // Navegación con teclado entre pestañas (flechas arriba/abajo).
  pestanas.addEventListener('keydown', (e) => {
    if (['ArrowDown', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
      mostrar(actual + 1, { foco: true });
    } else if (['ArrowUp', 'ArrowLeft'].includes(e.key)) {
      e.preventDefault();
      mostrar(actual - 1, { foco: true });
    }
  });

  $('#vitrina-abrir').addEventListener('click', () => abrirObra(destacadas[actual], destacadas));
  placa.addEventListener('click', () => abrirObra(destacadas[actual], destacadas));
  placa.style.cursor = 'zoom-in';
  new ResizeObserver(colocar).observe(placa);

  mostrar(0);
}
