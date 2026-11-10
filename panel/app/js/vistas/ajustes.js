// Vista "Ajustes de la web": textos, contacto, redes y obras de portada.
import { h, api, icono, pintarIconos, aviso, avisoError, campo, interruptor, miniatura } from '../ui.js';

const REDES = [
  ['artstation', 'ArtStation', 'https://www.artstation.com/tu-usuario'],
  ['itchio', 'itch.io', 'https://tu-usuario.itch.io'],
  ['instagram', 'Instagram', 'https://www.instagram.com/tu-usuario'],
  ['x', 'X (Twitter)', 'https://x.com/tu-usuario'],
  ['bluesky', 'Bluesky', 'https://bsky.app/profile/tu-usuario'],
  ['youtube', 'YouTube', 'https://www.youtube.com/@tu-canal'],
  ['github', 'GitHub', 'https://github.com/tu-usuario'],
  ['web', 'Otra web', 'https://...'],
];

export async function montar({ contenedor, acciones }) {
  const [ajustes, obras] = await Promise.all([api('/ajustes'), api('/obras')]);
  let sucio = false;

  const texto = (id, valor, max, extra = {}) => h('input', { type: 'text', id, name: id, value: valor || '', maxlength: String(max), ...extra });
  const area = (id, valor, max, filas = 4) => {
    const el = h('textarea', { id, name: id, maxlength: String(max), rows: String(filas) });
    el.value = valor || '';
    return el;
  };

  // Selector visual de obra (portada / avatar)
  function selectorObra(nombre, valor, filtro, textoNinguna) {
    const candidatas = obras.filter(filtro);
    return h(
      'div',
      { class: 'selector-obra', role: 'radiogroup' },
      h('label', { title: textoNinguna }, h('input', { type: 'radio', name: nombre, value: '', checked: !valor }), h('span', { class: 'ninguna', text: 'Automática' })),
      candidatas.map((o) =>
        h('label', { title: o.titulo }, h('input', { type: 'radio', name: nombre, value: String(o.id), checked: String(o.id) === valor, 'aria-label': o.titulo }), miniatura(o, 84))
      )
    );
  }

  const secciones = [
    {
      id: 'identidad',
      titulo: 'Identidad',
      nota: 'El nombre y los textos principales de la portada.',
      campos: [
        campo({ etiqueta: 'Nombre de la web', control: texto('nombre_sitio', ajustes.nombre_sitio, 60, { required: true }), id: 'nombre_sitio', contador: true, ayuda: 'Se muestra en grande en la portada y en el pie.' }),
        campo({ etiqueta: 'Lema', control: texto('lema', ajustes.lema, 120), id: 'lema', contador: true, ayuda: 'Aparece en la pestaña del navegador y en el pie.' }),
        campo({ etiqueta: 'Frase de portada', control: area('descripcion', ajustes.descripcion, 300, 2), id: 'descripcion', contador: true, ayuda: 'La frase junto al botón "Ver la galería". Corta y clara funciona mejor.' }),
      ],
    },
    {
      id: 'sobre',
      titulo: 'Sobre mí',
      nota: 'La sección de presentación de la web.',
      campos: [
        campo({ etiqueta: 'Texto principal', control: area('sobre_mi', ajustes.sobre_mi, 1500, 4), id: 'sobre_mi', contador: true }),
        campo({ etiqueta: 'Segundo párrafo', control: area('sobre_mi_extra', ajustes.sobre_mi_extra, 800, 3), id: 'sobre_mi_extra', contador: true }),
        h(
          'div',
          { class: 'campos-2' },
          campo({ etiqueta: 'Ubicación', control: texto('ubicacion', ajustes.ubicacion, 80, { placeholder: 'Por ejemplo: Almería, España' }), id: 'ubicacion' }),
          campo({ etiqueta: 'Dibujando desde', control: texto('desde', ajustes.desde, 20, { placeholder: 'Por ejemplo: 2019' }), id: 'desde' })
        ),
        interruptor({ nombre: 'abierto_encargos', etiqueta: 'Abierto a encargos', ayuda: 'Muestra un aviso en la web de que aceptas trabajos', marcado: ajustes.abierto_encargos }),
      ],
    },
    {
      id: 'contacto',
      titulo: 'Contacto y redes',
      nota: 'Solo se muestran los que rellenes. Sin ninguno, la sección de contacto se oculta.',
      campos: [
        campo({ etiqueta: 'Email de contacto', control: h('input', { type: 'email', id: 'email', name: 'email', value: ajustes.email || '', maxlength: '120', placeholder: 'tu@email.com' }), id: 'email' }),
        h(
          'div',
          { class: 'campos-2' },
          REDES.map(([clave, nombre, ejemplo]) =>
            campo({ etiqueta: nombre, control: h('input', { type: 'url', id: `red-${clave}`, name: `red-${clave}`, value: ajustes.redes?.[clave] || '', placeholder: ejemplo, maxlength: '300' }), id: `red-${clave}` })
          )
        ),
      ],
    },
    {
      id: 'imagenes',
      titulo: 'Imágenes de la portada',
      nota: 'En automático, la web elige una obra destacada.',
      campos: [
        h('div', { class: 'campo' }, h('span', { class: 'etiqueta-campo', text: 'Escena de portada' }), h('p', { class: 'ayuda', text: 'La imagen grande junto al texto de la portada. Quedan mejor las imágenes anchas (escenarios).' }), selectorObra('obra_portada', ajustes.obra_portada, (o) => o.ancho / o.alto >= 1.2, 'Elegir automáticamente')),
        h('div', { class: 'campo' }, h('span', { class: 'etiqueta-campo', text: 'Avatar de "Sobre mí"' }), h('p', { class: 'ayuda', text: 'Un sprite que te represente. Se muestra junto a tu presentación.' }), selectorObra('obra_avatar', ajustes.obra_avatar, (o) => o.ancho / o.alto < 1.5, 'Elegir automáticamente')),
      ],
    },
    {
      id: 'pie',
      titulo: 'Pie de página',
      nota: 'Un texto opcional junto al copyright.',
      campos: [campo({ etiqueta: 'Texto del pie', control: texto('texto_pie', ajustes.texto_pie, 200, { placeholder: 'Por ejemplo: Hecho con píxeles y café.' }), id: 'texto_pie', contador: true })],
    },
  ];

  const indicador = h('span', { class: 'aviso-cambios', text: 'Cambios sin guardar', hidden: true });
  const guardar = h('button', { type: 'submit', class: 'boton boton-acento boton-grande' }, icono('check'), 'Guardar cambios');
  const formulario = h(
    'form',
    { class: 'formulario', novalidate: true },
    secciones.map((s) =>
      h(
        'section',
        { class: 'bloque seccion-ajustes', id: `ajustes-${s.id}`, 'aria-labelledby': `titulo-${s.id}` },
        h('div', { class: 'bloque-cabecera' }, h('h2', { class: 'bloque-titulo', id: `titulo-${s.id}`, text: s.titulo }), h('p', { class: 'bloque-nota', text: s.nota })),
        h('div', { class: 'formulario' }, s.campos)
      )
    ),
    h('div', { class: 'barra-guardar' }, indicador, h('a', { class: 'boton boton-fantasma', href: '/', target: '_blank', rel: 'noopener' }, icono('external-link'), 'Ver la web'), guardar)
  );

  const indice = h(
    'nav',
    { class: 'indice-ajustes', 'aria-label': 'Apartados de ajustes' },
    secciones.map((s) => h('a', { href: `#ajustes`, text: s.titulo, onclick: (e) => { e.preventDefault(); document.getElementById(`ajustes-${s.id}`).scrollIntoView({ behavior: 'smooth' }); } }))
  );

  contenedor.append(h('div', { class: 'ajustes' }, indice, formulario));
  acciones.append(h('button', { type: 'button', class: 'boton boton-acento', onclick: () => formulario.requestSubmit() }, icono('check'), h('span', { class: 'texto-boton', text: 'Guardar' })));

  const marcarSucio = () => {
    sucio = true;
    indicador.hidden = false;
  };
  formulario.addEventListener('input', marcarSucio);
  formulario.addEventListener('change', marcarSucio);

  formulario.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = formulario.elements;
    if (!f.nombre_sitio.value.trim()) {
      f.nombre_sitio.focus();
      return aviso('El nombre de la web no puede quedar vacío.', 'error');
    }
    const datos = {
      nombre_sitio: f.nombre_sitio.value,
      lema: f.lema.value,
      descripcion: f.descripcion.value,
      sobre_mi: f.sobre_mi.value,
      sobre_mi_extra: f.sobre_mi_extra.value,
      ubicacion: f.ubicacion.value,
      desde: f.desde.value,
      abierto_encargos: f.abierto_encargos.checked,
      email: f.email.value,
      redes: Object.fromEntries(REDES.map(([clave]) => [clave, f[`red-${clave}`].value])),
      obra_portada: formulario.querySelector('input[name="obra_portada"]:checked')?.value || '',
      obra_avatar: formulario.querySelector('input[name="obra_avatar"]:checked')?.value || '',
      texto_pie: f.texto_pie.value,
    };
    guardar.disabled = true;
    try {
      await api('/ajustes', { metodo: 'PUT', datos });
      sucio = false;
      indicador.hidden = true;
      document.getElementById('marca-nombre').textContent = datos.nombre_sitio.trim();
      aviso('Ajustes guardados. Ya se ven en la web.');
    } catch (error) {
      avisoError(error);
    }
    guardar.disabled = false;
  });

  pintarIconos();
  return { puedeSalir: () => !sucio };
}
