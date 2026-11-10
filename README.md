# Snoker Art

Web para mostrar arte de videojuegos (pixel art, 2D y 3D) con un panel privado
desde el que se sube y gestiona todo.

- **Web pública**: portada con el nombre en grande y tus sprites flotando encima
  como objetos recogibles, galería con filtros y búsqueda, sección de destacadas
  con la paleta de cada obra, "Sobre mí", contacto y un visor a pantalla completa
  con lupa de píxeles (zoom por múltiplos enteros, rejilla, cambio de fondo y
  paleta que se copia con un clic).
- **Panel privado**: resumen con estadísticas de visitas, lista de obras (editar,
  publicar, destacar, ordenar arrastrando, borrar), subida múltiple arrastrando o
  pegando con Ctrl+V, categorías, ajustes de los textos y redes de la web, y
  seguridad (contraseña y sesiones abiertas).

## Requisitos

- [Node.js](https://nodejs.org) 22.13 o superior (usa la base de datos SQLite que
  viene incluida en Node, no hace falta instalar nada más).

## Arrancar la web

```bash
npm install
npm start
```

Abre `http://localhost:3000` para ver la web y `http://localhost:3000/panel/`
para el panel.

Mientras desarrollas puedes usar `npm run dev`, que reinicia el servidor solo
cada vez que cambias un archivo del servidor.

## Primera vez: crear la contraseña

La primera vez que arrancas el servidor, la consola muestra un **código de
configuración** de 8 caracteres. Abre el panel, escribe ese código y elige tu
contraseña (mínimo 10 caracteres). Solo quien ve la consola del servidor puede
crear la cuenta, así que nadie más puede adueñarse del panel aunque la web ya
esté publicada.

## Cómo funciona la subida de imágenes

- Formatos: PNG, JPG, WEBP y GIF (también animados). Máximo 25 MB por imagen
  (se puede cambiar en `.env`).
- El servidor **detecta el pixel art escalado**: si exportas un sprite de 32×32
  a 128×128, la web sabe que es 32×32 a x4 y lo amplía siempre por números
  enteros para que los píxeles se vean nítidos.
- Se extrae la **paleta de colores** de cada obra automáticamente.
- Los PNG, GIF y WEBP se guardan sin tocar ni un píxel. Los JPG se vuelven a
  guardar para borrar los datos EXIF (por ejemplo, la ubicación GPS de una foto).
- Las imágenes grandes (renders 3D, ilustraciones) generan una miniatura ligera
  para que la galería cargue rápido.

## Configuración (`.env`)

Copia `.env.example` como `.env` y ajusta lo que necesites:

| Variable | Para qué sirve |
| --- | --- |
| `PUERTO` | Puerto de la web (por defecto 3000). |
| `RUTA_PANEL` | Ruta secreta del panel. Cámbiala por algo difícil de adivinar, por ejemplo `/taller-snoker-8f3k`. |
| `MAX_MB_SUBIDA` | Tamaño máximo de cada imagen. |
| `NODE_ENV=production` | Al publicar con HTTPS: activa las cookies seguras. |
| `CONFIAR_PROXY=1` | Si la web va detrás de un proxy (Render, Railway, Nginx...). |

## Comandos útiles

```bash
npm run cambiar-password
```

Cambia la contraseña desde la consola, por si la olvidas.

```bash
npm run restablecer-acceso
```

Borra la contraseña y las sesiones (las obras no se tocan). Al volver a arrancar
aparecerá un código nuevo para crear otra contraseña.

## Dónde se guardan las cosas

```
datos/snoker.db     Base de datos (obras, categorías, ajustes, visitas, sesiones)
subidas/            Imágenes subidas y sus miniaturas
```

Para hacer una **copia de seguridad** basta con copiar esas dos carpetas. Están
en `.gitignore` para que nunca se suban a un repositorio por accidente.

## Estructura del proyecto

```
servidor/
  index.js          Arranque, cabeceras de seguridad y rutas de páginas
  config.js         Configuración leída de .env
  db.js             Base de datos SQLite y migraciones
  auth.js           Contraseña (scrypt), sesiones y protecciones
  imagenes.js       Procesado de imágenes (escala pixel, paleta, miniaturas)
  rutas/            API pública, acceso y API privada del panel
publico/            Web pública (HTML, CSS y JavaScript sin compilar)
panel/acceso/       Pantalla de acceso al panel
panel/app/          Panel privado (solo se sirve con sesión iniciada)
scripts/            Utilidades de consola
```

## Seguridad

- Contraseña guardada con scrypt (nunca en texto plano).
- Cookie de sesión `HttpOnly` y `SameSite=Strict`, sesiones de 14 días que se
  pueden cerrar desde el panel.
- Bloqueo de 15 minutos tras 5 intentos fallidos.
- Las peticiones que cambian datos se rechazan si vienen de otra web.
- Sin sesión, el código del panel ni siquiera se descarga (responde 404).
- Cabeceras de seguridad (CSP, X-Frame-Options, nosniff...).
- Los textos que escribes se pintan siempre como texto, nunca como HTML.

## Publicar en internet

La web necesita un hosting que ejecute Node.js y que **conserve los archivos**
(las carpetas `datos/` y `subidas/`). Opciones:

- **Render** o **Railway** con un disco/volumen persistente montado en la carpeta
  del proyecto.
- Un **VPS** (por ejemplo con Nginx delante y `pm2` para mantenerlo encendido).

Al publicarla: pon `NODE_ENV=production`, `CONFIAR_PROXY=1` si hay proxy, y
cambia `RUTA_PANEL` por una ruta secreta.

## Detalles divertidos

- Pulsa los sprites que flotan sobre el nombre de la portada: se "recogen" como
  objetos de un juego y se abren en el visor.
- En el pie hay un interruptor de **modo CRT** (líneas de televisión antigua).
  También se activa con un código secreto clásico de los videojuegos.
