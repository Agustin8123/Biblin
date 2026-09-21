# Biblin

Aplicación web simple para llevar el inventario de una biblioteca. Permite
agregar libros y buscarlos por título, autor, editorial, tema, tejuelo o número de inventario.
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

Las cuentas de gestión no se guardan en PostgreSQL. Se configuran manualmente en el archivo `.env` mediante `BIBLIN_USERS`, usando un objeto JSON, por ejemplo:

```
BIBLIN_USERS={"admin":"clave1","biblioteca":"clave2"}
```

El acceso **Solo lector** no requiere cuenta. Con una sesión iniciada se habilitan las funciones de gestión y la impresión de tarjetas.


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

- **Agregar un libro**: pide título, autor, editorial (opcional), tema, tejuelo, número de inventario y, opcionalmente, un PDF con la versión digitalizada. El tejuelo acepta letras y números; el número de inventario solo acepta números. El inventario se sugiere automáticamente con el siguiente número disponible.
- **Buscar un libro**: un solo campo de búsqueda que revisa título, autor, editorial, tema, tejuelo y número de inventario al mismo tiempo. Dejarlo vacío y tocar "Buscar" muestra todos los libros ordenados alfabéticamente.
- Con una sesión iniciada, cada resultado permite seleccionar libros individualmente o todos juntos para generar un PDF de tarjetas. También existe un botón para generar las tres tarjetas de un libro directamente. La generación del PDF se realiza en el navegador, no en el servidor.
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
