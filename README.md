# Nuestra Biblioteca

Aplicación web simple para llevar el inventario de una biblioteca. Permite
agregar libros y buscarlos por título, autor, editorial o número de tarjeta.
La interfaz está pensada para alguien sin experiencia con computadoras:
dos botones grandes en la pantalla de inicio, formularios cortos y mensajes
en lenguaje simple.

## Qué incluye

- `server.js` / `db.js` — servidor Node.js (Express) y conexión a PostgreSQL.
- `db/schema.sql` — la tabla de libros y los índices necesarios.
- `public/` — la interfaz (HTML, CSS y JavaScript), sin frameworks.
- `.env.example` — plantilla de configuración.

## Requisitos

- Node.js 18 o más nuevo.
- PostgreSQL 16.x (se probó específicamente con 16.15).

## 1. Preparar la base de datos

Con PostgreSQL ya instalado y corriendo:

```bash
sudo -u postgres psql -c "CREATE USER biblioteca WITH PASSWORD 'elegí-una-clave';"
sudo -u postgres psql -c "CREATE DATABASE biblioteca OWNER biblioteca;"
sudo -u postgres psql -d biblioteca -c "GRANT ALL ON SCHEMA public TO biblioteca;"
psql -h localhost -U biblioteca -d biblioteca -f db/schema.sql
```

El esquema activa la extensión `unaccent`, así que las búsquedas ignoran
tildes (buscar "garcia" encuentra "García"). Viene con PostgreSQL, pero si
`CREATE EXTENSION unaccent;` fallara, instalá el paquete `postgresql-contrib`
de tu distribución.

## 2. Configurar la aplicación

```bash
cp .env.example .env
```

Editá `.env` y completá `DATABASE_URL` con los datos reales de conexión.
El formato es:

```
DATABASE_URL=postgresql://usuario:contraseña@host:puerto/nombre_base
```

## 3. Instalar e iniciar

```bash
npm install
npm start
```

Por defecto el servidor escucha en el puerto 3000. Para probarlo en la
misma máquina, abrí `http://localhost:3000` en el navegador.

## Cómo funciona para quien la usa

- **Agregar un libro**: pide título, autor, editorial (opcional), número de
  tarjeta y, opcionalmente, un PDF con la versión digitalizada. El número de
  tarjeta se sugiere solo (el siguiente libre), pero se puede cambiar. Al
  guardar, el formulario se limpia para cargar el siguiente libro sin tener
  que volver atrás.
- **Buscar un libro**: un solo campo de búsqueda que revisa título, autor,
  editorial y número de tarjeta al mismo tiempo, para no obligar a elegir
  dónde buscar. Dejarlo vacío y tocar "Buscar" muestra todos los libros
  ordenados alfabéticamente.
- Cada resultado tiene:
  - **Ver PDF** (si el libro ya tiene uno cargado): lo abre en una pestaña
    nueva del navegador.
  - **Subir PDF** (si todavía no tiene uno): sirve tanto para libros nuevos
    como para libros que ya estaban cargados de antes sin PDF.
  - **Quitar PDF**: por si se subió el archivo equivocado.
  - **Borrar**: borra el libro entero (con confirmación), y de paso borra
    su PDF si tenía uno.

### Sobre los archivos PDF

- Se guardan en la carpeta `uploads/pdfs/` del servidor, no en la base de
  datos. Esa carpeta crece con el tiempo: conviene incluirla en cualquier
  backup que hagas del servidor (la base de datos sola no alcanza para
  recuperar los PDFs).
- Tamaño máximo por archivo: 100 MB por defecto. Se puede cambiar con
  `MAX_PDF_MB` en el `.env`.
- Solo se aceptan archivos que sean realmente PDF (se revisa el contenido
  del archivo, no solo el nombre), así que no hace falta preocuparse por
  que alguien suba otra cosa con extensión `.pdf`.

## Poner el servidor abierto a internet: recomendaciones

Vas a exponer un formulario que escribe en una base de datos, así que
conviene sumar un par de capas de protección además de la aplicación en sí:

1. **HTTPS con un proxy inverso.** No expongas Node directamente al puerto
   80/443. Poné [Caddy](https://caddyserver.com/) o Nginx + Certbot delante;
   Caddy en particular consigue el certificado HTTPS solo, con muy poca
   configuración. Si usás Nginx, recordá subir `client_max_body_size` (por
   defecto es 1 MB) para que no corte la subida de PDFs grandes antes de
   que lleguen a Node.
2. **No expongas el puerto de PostgreSQL (5432) a internet.** Que escuche
   solo en `localhost` o en la red interna; la aplicación Node es la única
   que necesita hablarle a la base.
3. **Contraseña de acceso (opcional, ya incluida).** Si en `.env` completás
   `SITE_USER` y `SITE_PASSWORD`, el navegador va a pedir usuario y clave
   antes de mostrar cualquier página. Es una sola vez por navegador (el
   propio navegador la recuerda). Recomendado si el servidor queda
   accesible para cualquiera en internet, no solo para tu familia.
4. **Mantené las dependencias al día** corriendo `npm audit` de tanto en
   tanto y actualizando con `npm update` cuando haya avisos.

Con el proxy inverso manejando HTTPS y el acceso restringido de alguna de
estas formas, el resto de la aplicación (límite de pedidos por minuto,
validación de datos, consultas parametrizadas contra SQL injection) ya
viene resuelto en el código.

## Personalizar el nombre

El título "Nuestra Biblioteca" está en `public/index.html` (etiqueta
`<title>` y `<h1>`) y se puede cambiar por el nombre real de la biblioteca
o de la familia sin tocar nada más.
