// Lógica de la pantalla de acceso: entrar con la contraseña o explicar cómo
// configurarla si todavía no existe.
const $ = (s) => document.querySelector(s);

async function enviar(ruta, datos) {
  const respuesta = await fetch(ruta, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(datos),
  });
  const cuerpo = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) throw new Error(cuerpo.error || 'No se ha podido completar la acción.');
  return cuerpo;
}

function mostrarError(mensaje, formulario) {
  const el = $('#error-entrar');
  el.textContent = mensaje;
  el.hidden = false;
  formulario.classList.remove('temblor');
  void formulario.offsetWidth;
  formulario.classList.add('temblor');
}

// Botón de ojo para ver u ocultar la contraseña.
function iniciarVerPassword() {
  document.querySelectorAll('.ver-password').forEach((boton) => {
    boton.addEventListener('click', () => {
      const campo = document.getElementById(boton.dataset.para);
      const visible = campo.type === 'text';
      campo.type = visible ? 'password' : 'text';
      boton.setAttribute('aria-label', visible ? 'Mostrar contraseña' : 'Ocultar contraseña');
      boton.innerHTML = `<i data-lucide="${visible ? 'eye' : 'eye-off'}"></i>`;
      window.lucide?.createIcons();
    });
  });
}

// Un sprite de la galería flotando en el lado decorativo.
async function pintarObjeto() {
  try {
    const { obras } = await (await fetch('/api/publico')).json();
    const sprites = obras.filter((o) => o.pixelado && o.ancho / o.alto < 1.5);
    const obra = sprites[Math.floor(Math.random() * sprites.length)];
    if (!obra) return;
    const nativo = obra.ancho / (obra.escala || 1);
    const img = document.createElement('img');
    img.src = obra.url;
    img.alt = '';
    img.width = nativo * Math.max(2, Math.floor(160 / nativo));
    $('#acceso-objeto').append(img);
  } catch {
    /* decorativo: si falla no pasa nada */
  }
}

async function iniciar() {
  iniciarVerPassword();
  pintarObjeto();

  const estado = await (await fetch('/api/acceso/estado')).json();
  if (estado.autenticado) return location.reload();
  document.querySelectorAll('.minimo').forEach((el) => (el.textContent = estado.longitud_minima));

  // Sin contraseña configurada: se explica cómo ponerla.
  if (estado.clave !== 'ok') {
    $('#sin-clave').hidden = false;
    $('#sin-clave-motivo').textContent =
      estado.clave === 'corta'
        ? `La contraseña configurada (CLAVE_PANEL) es demasiado corta. Debe tener al menos ${estado.longitud_minima} caracteres.`
        : 'El panel todavía no tiene contraseña. Se configura una sola vez:';
    $(estado.en_vercel ? '#pasos-vercel' : '#pasos-local').hidden = false;
    window.lucide?.createIcons();
    return;
  }

  const formulario = $('#form-entrar');
  formulario.hidden = false;
  $('#password').focus();

  formulario.addEventListener('submit', async (e) => {
    e.preventDefault();
    const boton = formulario.querySelector('button[type="submit"]');
    const password = $('#password').value;
    if (!password) return mostrarError('Escribe tu contraseña.', formulario);
    boton.disabled = true;
    try {
      await enviar('/api/acceso/entrar', { password });
      location.reload();
    } catch (error) {
      mostrarError(error.message, formulario);
      $('#password').select();
      boton.disabled = false;
    }
  });

  window.lucide?.createIcons();
}

iniciar();
