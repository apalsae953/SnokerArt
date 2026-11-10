// Cambia la contraseña del panel desde la consola (por si la olvidas).
// Uso: npm run cambiar-password
import readline from 'node:readline';
import { guardarPasswordAdmin, validarPasswordNueva, cerrarOtrasSesiones } from '../servidor/auth.js';

// Pregunta sin mostrar lo que se escribe en pantalla.
function preguntarOculto(pregunta) {
  return new Promise((resolver) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (texto) => {
      if (texto.includes(pregunta)) rl.output.write(texto);
    };
    rl.question(pregunta, (respuesta) => {
      rl.close();
      process.stdout.write('\n');
      resolver(respuesta);
    });
  });
}

const nueva = await preguntarOculto('Nueva contraseña: ');
const problema = validarPasswordNueva(nueva);
if (problema) {
  console.error(problema);
  process.exit(1);
}
const repetida = await preguntarOculto('Repite la contraseña: ');
if (nueva !== repetida) {
  console.error('Las contraseñas no coinciden.');
  process.exit(1);
}

guardarPasswordAdmin(nueva);
cerrarOtrasSesiones('');
console.log('Contraseña cambiada. Se han cerrado todas las sesiones abiertas.');
