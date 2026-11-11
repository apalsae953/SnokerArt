// Se ejecuta al desplegar en Vercel (npm run preparar): copia los iconos
// Lucide a publico/vendor para que Vercel los sirva como archivo estático.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const origen = path.join(raiz, 'node_modules', 'lucide', 'dist', 'umd', 'lucide.min.js');
const destino = path.join(raiz, 'publico', 'vendor', 'lucide.js');

fs.mkdirSync(path.dirname(destino), { recursive: true });
fs.copyFileSync(origen, destino);
console.log('Iconos copiados a publico/vendor/lucide.js');
