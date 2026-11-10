// Rutas de acceso al panel: configuración inicial, entrar y salir.
import { Router } from 'express';
import {
  adminConfigurado,
  comprobarCodigoConfiguracion,
  consumirCodigoConfiguracion,
  guardarPasswordAdmin,
  validarPasswordNueva,
  verificarPassword,
  hashAdmin,
  crearSesion,
  cerrarSesion,
  sesionActual,
  ipBloqueada,
  registrarFallo,
  limpiarFallos,
  mismoOrigen,
  LONGITUD_MINIMA,
} from '../auth.js';

export const rutasAcceso = Router();
rutasAcceso.use(mismoOrigen);

// Dice si la cuenta existe y si la sesión actual es válida.
rutasAcceso.get('/estado', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({
    configurado: adminConfigurado(),
    autenticado: !!sesionActual(req),
    longitud_minima: LONGITUD_MINIMA,
  });
});

// Primera vez: crea la contraseña usando el código que aparece en la consola.
rutasAcceso.post('/configurar', (req, res) => {
  if (adminConfigurado()) return res.status(409).json({ error: 'La cuenta ya está configurada.' });

  const minutos = ipBloqueada(req.ip);
  if (minutos) return res.status(429).json({ error: `Demasiados intentos. Prueba de nuevo en ${minutos} min.` });

  const { codigo, password } = req.body || {};
  if (!comprobarCodigoConfiguracion(codigo)) {
    registrarFallo(req.ip);
    return res.status(403).json({ error: 'El código no es correcto. Míralo en la consola donde arrancaste el servidor.' });
  }
  const problema = validarPasswordNueva(password);
  if (problema) return res.status(400).json({ error: problema });

  guardarPasswordAdmin(password);
  consumirCodigoConfiguracion();
  limpiarFallos(req.ip);
  crearSesion(req, res);
  res.json({ ok: true });
});

rutasAcceso.post('/entrar', (req, res) => {
  if (!adminConfigurado()) return res.status(409).json({ error: 'Primero hay que crear la contraseña.' });

  const minutos = ipBloqueada(req.ip);
  if (minutos) return res.status(429).json({ error: `Demasiados intentos. Prueba de nuevo en ${minutos} min.` });

  const { password } = req.body || {};
  if (typeof password !== 'string' || !verificarPassword(password, hashAdmin())) {
    const restantes = registrarFallo(req.ip);
    const aviso = restantes > 0 && restantes < 3 ? ` Te quedan ${restantes} intentos.` : '';
    return res.status(401).json({ error: `Contraseña incorrecta.${aviso}` });
  }

  limpiarFallos(req.ip);
  crearSesion(req, res);
  res.json({ ok: true });
});

rutasAcceso.post('/salir', (req, res) => {
  cerrarSesion(req, res);
  res.json({ ok: true });
});
