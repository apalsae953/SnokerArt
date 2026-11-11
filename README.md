# Snoker Art

Web para mostrar arte de videojuegos (pixel art, 2D y 3D) con un panel privado
desde el que se sube y gestiona todo. **No usa base de datos**: las imágenes y
un archivo `contenido.json` (títulos, categorías, textos de la web) se guardan
en **Vercel Blob** cuando está publicada, o en carpetas normales en tu PC.

- **Web pública**: portada con el nombre en grande y tus sprites flotando encima
  como objetos recogibles, galería con filtros y búsqueda, sección de destacadas
  con la paleta de cada obra, "Sobre mí", contacto y un visor a pantalla completa
  con lupa de píxeles (zoom por múltiplos enteros, rejilla, cambio de fondo y
  paleta que se copia con un clic).
- **Panel privado**: resumen, lista de obras (editar, publicar, destacar,
  ordenar arrastrando, borrar), subida múltiple arrastrando o pegando con Ctrl+V,
  categorías, ajustes de los textos y redes de la web, y seguridad.

## Publicar en Vercel

La web ya está preparada (`vercel.json` y `api/index.js`). En tu proyecto de
Vercel solo hacen falta dos cosas, una única vez:

1. **Almacén de imágenes**: pestaña **Storage**, crear un **Blob** con acceso
   **Public** (mejor en la región **Paris, cdg1**, que es donde corre la web) y
   conectarlo al proyecto. Vercel añade solo la variable `BLOB_READ_WRITE_TOKEN`.
2. **Contraseña del panel**: **Settings > Environment Variables**, añadir
   `CLAVE_PANEL` con tu contraseña (mínimo 10 caracteres).

Después, cada vez que subes cambios a GitHub, Vercel publica la web solo. Si
cambias una variable, pulsa **Redeploy** en el último despliegue.

La primera vez, mientras el almacén está vacío, la web muestra las obras de la
carpeta `semilla/`. En cuanto guardas algo desde el panel, se copian al almacén
y a partir de ahí todo vive en Vercel Blob.

## Usarla en tu PC

```bash
npm install
npm run dev
```

Abre `http://localhost:3000` para la web y `http://localhost:3000/panel/` para
el panel. La contraseña local está en el archivo `.env` (`CLAVE_PANEL=...`);
copia `.env.example` como `.env` si no lo tienes.

En tu PC se usan las carpetas `datos/` y `subidas/`, que son independientes de
la web publicada. Si pones en `.env` el mismo `BLOB_READ_WRITE_TOKEN` que en
Vercel, tu PC trabajará directamente sobre la web publicada.

## Cómo funciona la subida de imágenes

- Formatos: PNG, JPG, WEBP y GIF (también animados).
- Vercel no admite subidas de más de 4,3 MB. El panel convierte solo las
  imágenes más grandes a WEBP de alta calidad antes de subirlas (el pixel art
  pesa muchísimo menos y se sube intacto). Los GIF deben pesar menos de 4,3 MB.
- El servidor **detecta el pixel art escalado**: si exportas un sprite de 32×32
  a 128×128, la web sabe que es 32×32 a x4 y lo amplía siempre por números
  enteros para que los píxeles se vean nítidos.
- Se extrae la **paleta de colores** de cada obra automáticamente.
- Los PNG, GIF y WEBP se guardan sin tocar ni un píxel. Los JPG se vuelven a
  guardar para borrar los datos EXIF (por ejemplo, la ubicación GPS).

## Variables de entorno

| Variable | Para qué sirve |
| --- | --- |
| `CLAVE_PANEL` | Contraseña del panel (mínimo 10 caracteres). Obligatoria. |
| `BLOB_READ_WRITE_TOKEN` | La añade Vercel al conectar el Blob. Con ella se usa Vercel Blob. |
| `RUTA_PANEL` | Ruta secreta del panel, por ejemplo `/taller-snoker-8f3k`. Por defecto `/panel`. |
| `PUERTO` | Puerto en tu PC (por defecto 3000). |
| `MAX_MB_SUBIDA` | Tamaño máximo por imagen en tu PC. |

## Seguridad

- La contraseña vive en la configuración del servidor, nunca en la web: aunque
  alguien entrara al panel no podría cambiarla.
- La sesión es una cookie `HttpOnly`, `SameSite=Strict` y firmada, que dura 14
  días. Cambiar `CLAVE_PANEL` cierra todas las sesiones, y desde **Seguridad**
  se puede cerrar la sesión en los demás dispositivos.
- Tras 5 intentos fallidos esa conexión queda bloqueada 15 minutos, y cada fallo
  tarda casi un segundo en responder.
- Las peticiones que cambian datos se rechazan si vienen de otra web.
- Sin sesión, el código del panel ni siquiera se descarga.
- `contenido.json` se guarda en Vercel Blob con un nombre aleatorio que no se
  puede adivinar (incluye los borradores).
- Dos guardados a la vez nunca se pisan: cada cambio comprueba la versión del
  archivo antes de escribir y, si otro se adelantó, se repite con los datos
  nuevos.

## Estructura del proyecto

```
api/index.js        Entrada en Vercel (carga la misma aplicación Express)
servidor/
  app.js            Aplicación Express: cabeceras, rutas y panel
  index.js          Arranque en tu PC
  config.js         Configuración leída de las variables de entorno
  almacen.js        Guardar archivos: Vercel Blob o carpetas locales
  contenido.js      contenido.json: lectura, guardado seguro y semilla
  auth.js           Contraseña, cookies firmadas y protecciones
  imagenes.js       Procesado de imágenes (escala pixel, paleta, miniaturas)
  rutas/            API pública, acceso y API privada del panel
publico/            Web pública (Vercel la sirve directamente desde su CDN)
panel/acceso/       Pantalla de acceso al panel
panel/app/          Panel privado (solo se sirve con sesión iniciada)
semilla/            Contenido inicial: tus primeras obras y ajustes
scripts/preparar.js Se ejecuta al desplegar: copia los iconos a publico/vendor
vercel.json         Configuración de Vercel
```

## Detalles divertidos

- Pulsa los sprites que flotan sobre el nombre de la portada: se "recogen" como
  objetos de un juego y se abren en el visor.
- En el pie hay un interruptor de **modo CRT** (líneas de televisión antigua).
  También se activa con un código secreto clásico de los videojuegos.
