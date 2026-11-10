// Vista "Seguridad": cambiar la contraseña y ver las sesiones abiertas.
import { h, api, icono, pintarIconos, aviso, avisoError, campo, confirmar, fechaRelativa } from '../ui.js';

// Describe el dispositivo a partir del identificador del navegador.
function describirAgente(agente = '') {
  const navegador = /Edg\//.test(agente)
    ? 'Edge'
    : /OPR\//.test(agente)
      ? 'Opera'
      : /Firefox\//.test(agente)
        ? 'Firefox'
        : /Chrome\//.test(agente)
          ? 'Chrome'
          : /Safari\//.test(agente)
            ? 'Safari'
            : 'Navegador';
  const sistema = /Windows/.test(agente)
    ? 'Windows'
    : /Android/.test(agente)
      ? 'Android'
      : /iPhone|iPad/.test(agente)
        ? 'iOS'
        : /Mac OS/.test(agente)
          ? 'macOS'
          : /Linux/.test(agente)
            ? 'Linux'
            : 'otro sistema';
  return { texto: `${navegador} en ${sistema}`, movil: /Android|iPhone|iPad|Mobile/.test(agente) };
}

export async function montar({ contenedor, contexto }) {
  // ------------------------------------------------------------ contraseña
  const actual = h('input', { type: 'password', id: 'pw-actual', autocomplete: 'current-password' });
  const nueva = h('input', { type: 'password', id: 'pw-nueva', autocomplete: 'new-password' });
  const repetir = h('input', { type: 'password', id: 'pw-repetir', autocomplete: 'new-password' });
  const formulario = h(
    'form',
    { class: 'formulario', novalidate: true, vars: { 'max-width': '520px' } },
    campo({ etiqueta: 'Contraseña actual', control: actual, id: 'pw-actual' }),
    campo({ etiqueta: 'Nueva contraseña', control: nueva, id: 'pw-nueva', ayuda: 'Mínimo 10 caracteres. Al cambiarla se cierran las sesiones abiertas en otros dispositivos.' }),
    campo({ etiqueta: 'Repite la nueva contraseña', control: repetir, id: 'pw-repetir' }),
    h('div', {}, h('button', { type: 'submit', class: 'boton boton-acento' }, icono('key-round'), 'Cambiar contraseña'))
  );
  formulario.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (nueva.value.length < 10) return aviso('La nueva contraseña debe tener al menos 10 caracteres.', 'error');
    if (nueva.value !== repetir.value) return aviso('Las contraseñas nuevas no coinciden.', 'error');
    try {
      const r = await api('/password', { metodo: 'PUT', datos: { actual: actual.value, nueva: nueva.value } });
      formulario.reset();
      aviso(r.sesiones_cerradas ? `Contraseña cambiada. Se han cerrado ${r.sesiones_cerradas} sesiones más.` : 'Contraseña cambiada');
      pintarSesiones();
    } catch (error) {
      avisoError(error);
    }
  });

  // ------------------------------------------------------------ sesiones
  const listaSesiones = h('ul', { class: 'lista-sesiones' });
  const cerrarOtras = h('button', { type: 'button', class: 'boton boton-tono' }, icono('log-out'), 'Cerrar las demás');
  cerrarOtras.addEventListener('click', async () => {
    const ok = await confirmar({ titulo: '¿Cerrar las demás sesiones?', texto: 'Tendrás que volver a entrar en esos dispositivos.', boton: 'Cerrar sesiones' });
    if (!ok) return;
    try {
      const r = await api('/sesiones/otras', { metodo: 'DELETE' });
      aviso(`${r.cerradas} sesiones cerradas`);
      pintarSesiones();
    } catch (error) {
      avisoError(error);
    }
  });

  async function pintarSesiones() {
    const sesiones = await api('/sesiones');
    listaSesiones.replaceChildren(
      ...sesiones.map((s) => {
        const agente = describirAgente(s.agente);
        return h(
          'li',
          {},
          icono(agente.movil ? 'smartphone' : 'monitor'),
          h('div', {}, h('span', { class: 'titulo', text: agente.texto }), h('small', { text: `Último uso ${fechaRelativa(s.ultimo_uso)} · IP ${s.ip || 'desconocida'}` })),
          s.actual ? h('span', { class: 'etiqueta-actual', text: 'Esta sesión' }) : null
        );
      })
    );
    cerrarOtras.hidden = sesiones.length < 2;
    pintarIconos();
  }

  const ruta = contexto.info?.ruta_panel || '/panel';
  contenedor.append(
    h('section', { class: 'bloque' }, h('div', { class: 'bloque-cabecera' }, h('h2', { class: 'bloque-titulo', text: 'Contraseña' })), formulario),
    h('section', { class: 'bloque' }, h('div', { class: 'bloque-cabecera' }, h('h2', { class: 'bloque-titulo', text: 'Sesiones abiertas' }), cerrarOtras), listaSesiones),
    h(
      'section',
      { class: 'bloque' },
      h('div', { class: 'bloque-cabecera' }, h('h2', { class: 'bloque-titulo', text: 'Consejos' })),
      h(
        'ul',
        { class: 'formulario', vars: { gap: '12px' } },
        h('li', {}, 'Tu panel está en ', h('code', { text: `${ruta}/` }), '. Para que sea más difícil de encontrar, cambia la ruta en el archivo ', h('code', { text: '.env' }), ' con ', h('code', { text: 'RUTA_PANEL=/otra-ruta-secreta' }), '.'),
        h('li', {}, 'Si olvidas la contraseña, ejecuta ', h('code', { text: 'npm run cambiar-password' }), ' en la carpeta del proyecto.'),
        h('li', {}, 'Tras 5 intentos fallidos de contraseña, esa conexión queda bloqueada 15 minutos.')
      )
    )
  );
  await pintarSesiones();
}
