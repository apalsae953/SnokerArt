// Punto de entrada en Vercel: todas las peticiones que no son archivos de
// publico/ llegan aquí (ver "rewrites" en vercel.json) y las atiende la misma
// aplicación Express que se usa en local.
export { default } from '../servidor/app.js';
