// Vista "Seguridad": cómo cambiar la contraseña y cerrar la sesión en todos
// los demás dispositivos. La contraseña vive en la variable CLAVE_PANEL (en
// Vercel o en el archivo .env), no en la web, así que nadie puede cambiarla
// desde el panel aunque entrara en él.
import { h, api, icono, aviso, avisoError, confirmar } from '../ui.js';

export async function montar({ contenedor, contexto }) {
  const enVercel = !!contexto.info?.en_vercel;
  const ruta = contexto.info?.ruta_panel || '/panel';

  const pasosVercel = h(
    'ol',
    { class: 'formulario', vars: { gap: '10px', 'padding-left': '1.3em', 'list-style': 'decimal' } },
    h('li', {}, 'En vercel.com abre tu proyecto, ', h('strong', { text: 'Settings' }), ' y luego ', h('strong', { text: 'Environment Variables' }), '.'),
    h('li', {}, 'Edita la variable ', h('code', { text: 'CLAVE_PANEL' }), ' y escribe la nueva contraseña (mínimo 10 caracteres).'),
    h('li', {}, 'En ', h('strong', { text: 'Deployments' }), ' pulsa ', h('strong', { text: 'Redeploy' }), ' en el último despliegue.'),
    h('li', {}, 'Al cambiarla se cierran todas las sesiones abiertas y tendrás que entrar de nuevo.')
  );
  const pasosLocal = h(
    'ol',
    { class: 'formulario', vars: { gap: '10px', 'padding-left': '1.3em', 'list-style': 'decimal' } },
    h('li', {}, 'Abre el archivo ', h('code', { text: '.env' }), ' de la carpeta del proyecto.'),
    h('li', {}, 'Cambia la línea ', h('code', { text: 'CLAVE_PANEL=...' }), ' por la nueva contraseña (mínimo 10 caracteres).'),
    h('li', {}, 'Reinicia el servidor. Se cerrarán todas las sesiones abiertas.')
  );

  const cerrarTodas = h('button', { type: 'button', class: 'boton boton-tono' }, icono('log-out'), 'Cerrar sesión en los demás dispositivos');
  cerrarTodas.addEventListener('click', async () => {
    const ok = await confirmar({
      titulo: '¿Cerrar las demás sesiones?',
      texto: 'Cualquier otro ordenador o móvil donde hayas entrado al panel tendrá que volver a poner la contraseña. Tú sigues dentro.',
      boton: 'Cerrar sesiones',
    });
    if (!ok) return;
    try {
      await api('/sesiones/cerrar-todas', { metodo: 'POST' });
      aviso('Listo: solo sigue abierta esta sesión');
    } catch (error) {
      avisoError(error);
    }
  });

  contenedor.append(
    h(
      'section',
      { class: 'bloque' },
      h('div', { class: 'bloque-cabecera' }, h('h2', { class: 'bloque-titulo', text: 'Cambiar la contraseña' })),
      h('p', { class: 'bloque-nota', vars: { 'margin-bottom': '16px' }, text: 'La contraseña no se guarda en la web sino en la configuración del servidor. Así, aunque alguien entrara en el panel, no podría cambiarla.' }),
      enVercel ? pasosVercel : pasosLocal
    ),
    h(
      'section',
      { class: 'bloque' },
      h('div', { class: 'bloque-cabecera' }, h('h2', { class: 'bloque-titulo', text: 'Sesiones' })),
      h('p', { class: 'bloque-nota', vars: { 'margin-bottom': '16px' }, text: 'Cada sesión dura 14 días. Si entraste desde un ordenador que no es tuyo, ciérrala desde aquí.' }),
      cerrarTodas
    ),
    h(
      'section',
      { class: 'bloque' },
      h('div', { class: 'bloque-cabecera' }, h('h2', { class: 'bloque-titulo', text: 'Consejos' })),
      h(
        'ul',
        { class: 'formulario', vars: { gap: '12px' } },
        h('li', {}, 'Tu panel está en ', h('code', { text: `${ruta}/` }), '. Para que sea más difícil de encontrar, crea la variable ', h('code', { text: 'RUTA_PANEL' }), ' con otra ruta, por ejemplo ', h('code', { text: '/taller-secreto' }), '.'),
        h('li', {}, 'Tras 5 intentos fallidos de contraseña, esa conexión queda bloqueada 15 minutos.'),
        h('li', {}, 'Usa una contraseña que no uses en ningún otro sitio.')
      )
    )
  );
}
