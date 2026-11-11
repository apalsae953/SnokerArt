// Arranque de la web pública: carga los datos y monta cada sección.
import { $, api, pintarIconos } from './util.js';
import { pintarHeroe } from './heroe.js';
import { crearGaleria } from './galeria.js';
import { pintarVitrina } from './vitrina.js';
import { crearVisor } from './visor.js';
import { rellenarTextos, pintarSobre, pintarContacto, pintarPie } from './secciones.js';
import { iniciarEntradas, iniciarBarra, iniciarCrt } from './extras.js';

async function iniciar() {
  let sitio, obras, categorias;
  try {
    // Una sola petición con todo lo que necesita la página.
    ({ sitio, obras, categorias } = await api('/api/publico'));
  } catch (error) {
    console.error(error);
    $('#rejilla').replaceChildren();
    $('#rejilla').append(Object.assign(document.createElement('p'), {
      className: 'vacio',
      textContent: 'No se ha podido cargar la galería. Recarga la página en un momento.',
    }));
    return;
  }

  const visor = crearVisor({});
  const abrirObra = (obra, lista) => visor.abrir(obra, lista);

  // El título de la pestaña sigue al nombre y al lema elegidos en el panel.
  document.title = [sitio.nombre_sitio, sitio.lema].filter(Boolean).join(' · ');
  rellenarTextos(sitio);
  pintarHeroe({ sitio, obras, abrirObra });
  crearGaleria({ obras, categorias, alAbrir: abrirObra });
  pintarVitrina({ obras, abrirObra });
  pintarSobre({ sitio, obras });
  pintarContacto({ sitio });
  pintarPie({ sitio });
  pintarIconos();

  iniciarBarra();
  iniciarCrt();
  iniciarEntradas();

  // Enlaces directos a una obra: /#obra/pocion-turquesa
  const abrirDesdeEnlace = () => {
    const coincidencia = location.hash.match(/^#obra\/(.+)$/);
    if (!coincidencia) return;
    const obra = obras.find((o) => o.slug === decodeURIComponent(coincidencia[1]));
    if (obra) abrirObra(obra, obras);
  };
  abrirDesdeEnlace();
  window.addEventListener('hashchange', abrirDesdeEnlace);
}

iniciar();
