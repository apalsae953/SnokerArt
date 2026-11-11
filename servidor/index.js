// Arranque en tu PC: npm start (o npm run dev para que se reinicie solo).
// En Vercel no se usa este archivo: allí la aplicación se carga desde api/index.js.
import app from './app.js';
import { config } from './config.js';
import { usandoBlob } from './almacen.js';
import { estadoClave } from './auth.js';

app.listen(config.puerto, config.host, () => {
  const local = `http://localhost:${config.puerto}`;
  console.log('');
  console.log('  Snoker Art en marcha');
  console.log(`  Web pública:   ${local}/`);
  console.log(`  Panel privado: ${local}${config.rutaPanel}/`);
  console.log(`  Almacén:       ${usandoBlob ? 'Vercel Blob (el mismo que la web publicada)' : 'carpetas datos/ y subidas/ de este PC'}`);
  const clave = estadoClave();
  if (clave !== 'ok') {
    console.log('');
    console.log(
      clave === 'falta'
        ? '  Aviso: falta la contraseña del panel. Añade CLAVE_PANEL=tu-contraseña al archivo .env'
        : `  Aviso: CLAVE_PANEL es demasiado corta (mínimo ${config.longitudMinimaClave} caracteres).`
    );
  }
  console.log('');
});
