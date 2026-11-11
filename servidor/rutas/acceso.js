// Rutas de acceso al panel: comprobar estado, entrar y salir.
import { Router } from 'express';
import {
  estadoClave,
  comprobarClave,
  crearSesion,
  cerrarSesion,
  sesionValida,
  ipBloqueada,
  registrarFallo,
  limpiarFallos,
  mismoOrigen,
} from '../auth.js';
import { leerContenido } from '../contenido.js';
import { config } from '../config.js';

export const rutasAcceso = Router();
rutasAcceso.use(mismoOrigen);

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// Dice si la contraseña está configurada y si la sesión actual es válida.
rutasAcceso.get('/estado', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({
    clave: estadoClave(),
    autenticado: await sesionValida(req),
    longitud_minima: config.longitudMinimaClave,
    en_vercel: config.enVercel,
  });
});

rutasAcceso.post('/entrar', async (req, res) => {
  if (estadoClave() !== 'ok') {
    return res.status(409).json({ error: 'La contraseña del panel no está configurada (variable CLAVE_PANEL).' });
  }
  const minutos = ipBloqueada(req.ip);
  if (minutos) return res.status(429).json({ error: `Demasiados intentos. Prueba de nuevo en ${minutos} min.` });

  if (!comprobarClave(req.body?.password)) {
    const restantes = registrarFallo(req.ip);
    await esperar(800);
    const aviso = restantes > 0 && restantes < 3 ? ` Te quedan ${restantes} intentos.` : '';
    return res.status(401).json({ error: `Contraseña incorrecta.${aviso}` });
  }

  limpiarFallos(req.ip);
  const { ajustes } = await leerContenido({ fresco: true });
  crearSesion(res, ajustes.version_sesion);
  res.json({ ok: true });
});

rutasAcceso.post('/salir', (req, res) => {
  cerrarSesion(res);
  res.json({ ok: true });
});
