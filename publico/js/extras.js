// Detalles extra: entradas al hacer scroll, barra superior, sección activa
// en el menú, modo CRT y un código secreto.
import { $, $$, aviso, almacen, reducirMovimiento } from './util.js';

// Los elementos que están fuera de la pantalla al cargar aparecen al llegar
// a ellos. Los que ya se ven no se tocan, así no hay parpadeos.
export function iniciarEntradas() {
  if (reducirMovimiento() || !('IntersectionObserver' in window)) return;
  const selectores = [
    '.titulo-seccion',
    '.galeria-cuenta',
    '.filtros',
    '.obra',
    '.vitrina-placa',
    '.vitrina-pestanas',
    '.vitrina-detalle',
    '.vitrina-acciones',
    '.sobre-datos > div',
    '.declaracion',
    '.fila-contacto',
    '.pie-columnas > div',
  ];
  const elementos = $$(selectores.join(',')).filter((el) => el.getBoundingClientRect().top > window.innerHeight);

  const observador = new IntersectionObserver(
    (entradas) => {
      const nuevas = entradas.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      nuevas.forEach((entrada, i) => {
        entrada.target.style.setProperty('--retraso', `${Math.min(i, 8) * 75}ms`);
        entrada.target.classList.add('visible');
        observador.unobserve(entrada.target);
      });
    },
    { rootMargin: '0px 0px -8% 0px' }
  );
  for (const el of elementos) {
    el.classList.add('revelar');
    observador.observe(el);
  }
}

// La barra superior gana un fondo al bajar, y el menú marca la sección visible.
export function iniciarBarra() {
  const barra = $('#barra');
  const alBajar = () => barra.classList.toggle('con-fondo', window.scrollY > 8);
  window.addEventListener('scroll', alBajar, { passive: true });
  alBajar();

  const enlaces = $$('.barra-nav a');
  const secciones = enlaces.map((a) => $(a.getAttribute('href'))).filter(Boolean);
  const observador = new IntersectionObserver(
    (entradas) => {
      for (const entrada of entradas) {
        if (!entrada.isIntersecting) continue;
        const id = `#${entrada.target.id}`;
        enlaces.forEach((a) => a.setAttribute('aria-current', String(a.getAttribute('href') === id)));
      }
    },
    { rootMargin: '-45% 0px -50% 0px' }
  );
  secciones.forEach((s) => observador.observe(s));
}

// Modo CRT: líneas de barrido como en una tele antigua. Se recuerda la elección.
export function iniciarCrt() {
  const boton = $('#modo-crt');
  const aplicar = (activo) => {
    document.body.classList.toggle('crt', activo);
    boton.setAttribute('aria-pressed', String(activo));
    almacen.guardar('snoker-crt', activo ? '1' : '0');
  };
  aplicar(almacen.leer('snoker-crt') === '1');
  boton.addEventListener('click', () => aplicar(!document.body.classList.contains('crt')));

  // Código secreto clásico: arriba, arriba, abajo, abajo, izquierda, derecha, izquierda, derecha, B, A.
  const secreto = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
  let progreso = 0;
  document.addEventListener('keydown', (e) => {
    if (e.target.matches?.('input, textarea, select') || !$('#visor').hidden) return;
    const tecla = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    progreso = tecla === secreto[progreso] ? progreso + 1 : tecla === secreto[0] ? 1 : 0;
    if (progreso === secreto.length) {
      progreso = 0;
      const activo = !document.body.classList.contains('crt');
      aplicar(activo);
      aviso(activo ? 'Código secreto: modo CRT activado' : 'Modo CRT desactivado');
    }
  });
}
