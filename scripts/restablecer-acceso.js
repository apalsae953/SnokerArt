// Borra la contraseña del panel y todas las sesiones. Las obras y los ajustes
// no se tocan. Al arrancar de nuevo el servidor aparecerá un código nuevo en
// la consola para crear otra contraseña desde el panel.
// Uso: npm run restablecer-acceso
import { db } from '../servidor/db.js';

db.exec('DELETE FROM admin; DELETE FROM sesiones;');
console.log('Acceso restablecido. Arranca el servidor (npm start) y sigue las instrucciones de la consola.');
