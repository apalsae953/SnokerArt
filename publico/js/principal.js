// Arranque de la web pública: carga los datos y monta cada sección.
import { $, api, pintarIconos } from './util.js';
import { pintarHeroe } from './heroe.js';
import { crearGaleria } from './galeria.js';
import { pintarVitrina } from './vitrina.js';
import { crearVisor } from './visor.js';
import { rellenarTextos, pintarSobre, pintarContacto, pintarPie } from './secciones.js';
import { iniciarEntradas, iniciarBarra, iniciarCrt } from './extras.js';

// Cada obra cuenta una visita por sesión del navegador.
function registrarVista(obra) {
  const clave = `vista-${obra.id}`;
  try {
    if (sessionStorage.getItem(clave)) return;
    sessionStorage.setItem(clave, '1');
  } catch {
    /* sin almacenamiento: se cuenta igualmente, el servidor filtra repeticiones */
  }
  fetch(`/api/obras/${obra.id}/vista`, { method: 'POST' }).catch(() => {});
}

async function iniciar() {
  let sitio, obras, categorias;
  try {
    [sitio, obras, categorias] = await Promise.all([api('/api/sitio'), api('/api/obras'), api('/api/categorias')]);
  } catch (error) {
    console.error(error);
    $('#rejilla').replaceChildren();
    $('#rejilla').append(Object.assign(document.createElement('p'), {
      className: 'vacio',
      textContent: 'No se ha podido cargar la galería. Recarga la página en un momento.',
    }));
    return;
  }

  const visor = crearVisor({ alVer: registrarVista });
  const abrirObra = (obra, lista) => visor.abrir(obra, lista);

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
