// Lógica de la pantalla de acceso: entrar o crear la contraseña la primera vez.
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

function mostrarError(id, mensaje, formulario) {
  const el = $(id);
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
    const obras = await (await fetch('/api/obras')).json();
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
  $('#minimo').textContent = estado.longitud_minima;

  const formEntrar = $('#form-entrar');
  const formConfigurar = $('#form-configurar');

  if (!estado.configurado) {
    formConfigurar.hidden = false;
    const codigoUrl = new URLSearchParams(location.search).get('codigo');
    if (codigoUrl) $('#codigo').value = codigoUrl;
    ($('#codigo').value ? $('#nueva') : $('#codigo')).focus();
  } else {
    formEntrar.hidden = false;
    $('#password').focus();
  }

  formEntrar.addEventListener('submit', async (e) => {
    e.preventDefault();
    const boton = formEntrar.querySelector('button[type="submit"]');
    const password = $('#password').value;
    if (!password) return mostrarError('#error-entrar', 'Escribe tu contraseña.', formEntrar);
    boton.disabled = true;
    try {
      await enviar('/api/acceso/entrar', { password });
      location.reload();
    } catch (error) {
      mostrarError('#error-entrar', error.message, formEntrar);
      $('#password').select();
      boton.disabled = false;
    }
  });

  formConfigurar.addEventListener('submit', async (e) => {
    e.preventDefault();
    const boton = formConfigurar.querySelector('button[type="submit"]');
    const codigo = $('#codigo').value.trim();
    const nueva = $('#nueva').value;
    if (!codigo) return mostrarError('#error-configurar', 'Escribe el código que aparece en la consola.', formConfigurar);
    if (nueva.length < estado.longitud_minima) {
      return mostrarError('#error-configurar', `La contraseña debe tener al menos ${estado.longitud_minima} caracteres.`, formConfigurar);
    }
    if (nueva !== $('#repetir').value) {
      return mostrarError('#error-configurar', 'Las dos contraseñas no coinciden.', formConfigurar);
    }
    boton.disabled = true;
    try {
      await enviar('/api/acceso/configurar', { codigo, password: nueva });
      location.reload();
    } catch (error) {
      mostrarError('#error-configurar', error.message, formConfigurar);
      boton.disabled = false;
    }
  });

  window.lucide?.createIcons();
}

iniciar();
