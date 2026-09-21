# Biblin

Plataforma compartida para las bibliotecas de las escuelas del pueblo. Cada
cuenta gestiona su propia biblioteca y el catálogo público reúne los libros
de todas las escuelas, indicando su biblioteca y disponibilidad. Permite
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

Si Biblin ya estaba instalado antes de agregar el sistema de préstamos, no hace falta recrear la base. Ejecutá solamente:

```bash
psql -h localhost -U biblioteca -d biblioteca -f db/migracion-prestamos.sql
```

Eso crea el historial de préstamos sin tocar los libros existentes.

Si la instalación ya existía antes de agregar el contador de visitas a los PDFs, ejecutá también:

```bash
psql -h localhost -U biblioteca -d biblioteca -f db/migracion-visitas-pdf.sql
```

Eso agrega el contador empezando en 0 para todos los libros existentes.

Al iniciar, el servidor aplica `db/migracion-bibliotecas.sql` y crea las
bibliotecas con los nombres de usuario configurados en `BIBLIN_USERS`.
No crea una biblioteca de ejemplo. Si una versión anterior creó
**Biblioteca inicial**, la elimina únicamente cuando está vacía.
Reiniciar no duplica bibliotecas ni cambia sus libros, préstamos o PDFs.

Esto admite instalaciones vacías o con libros ya asignados a bibliotecas.
Si una instalación antigua tiene libros sin biblioteca, hay que asignarlos a
su escuela antes de completar la migración: el servidor se detiene sin
reasignarlos automáticamente.

Los tejuelos pueden repetirse entre escuelas, pero no dentro de una misma
biblioteca. La sugerencia del siguiente inventario se calcula por biblioteca.

## 2. Configurar la aplicación

Las cuentas de gestión no se guardan en PostgreSQL. Se configuran manualmente en el archivo `.env` mediante `BIBLIN_USERS`, usando un objeto JSON, por ejemplo:

```
BIBLIN_USERS={"EP31":"CAMBIAR_CLAVE_1","EP42":"CAMBIAR_CLAVE_2"}
```

El nombre de usuario **es el nombre de la biblioteca**. No se necesitan IDs ni
crear escuelas manualmente en la base: cada entrada del JSON crea su biblioteca
al arrancar, incluso si aún no tiene libros. Reiniciá después de agregar cuentas
o cambiar contraseñas. Mantené el nombre de usuario para conservar el vínculo:
un nombre diferente crea otra biblioteca. Quitar una cuenta no borra sus libros
ni su biblioteca del catálogo público.

El acceso **Solo lector** no requiere cuenta: muestra libros, biblioteca de
origen, disponibilidad y PDFs de todas las escuelas. No expone datos de las
personas que pidieron préstamos ni contadores de visitas.
El desplegable **Biblioteca de la escuela** permite elegir una escuela o
**Todas las bibliotecas** y combinar esa selección con la búsqueda de libros.
Muestra automáticamente los nombres de las bibliotecas, iguales a los usuarios
configurados. La lista no expone las contraseñas.
El selector nativo tiene un ancho máximo y el navegador permite desplazarse
por las opciones cuando hay muchas escuelas, sin alargar la página.

Con una sesión iniciada, la barra superior identifica la biblioteca y la cuenta.
La gestión, impresión de tarjetas, PDFs, préstamos, historial y avisos de
vencimiento se limitan a esa biblioteca. El servidor comprueba esta pertenencia
también ante pedidos directos a la API. El botón **Consultar todas las bibliotecas**
abre el catálogo público sin cerrar la sesión y sin habilitar acciones de gestión.


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

El archivo de ejemplo usa `PORT=3010`: abrí `http://localhost:3010` en el
navegador. Si no configurás `PORT`, el servidor usa 3000.

Las pruebas de aislamiento entre bibliotecas se ejecutan con `npm test`.
Usan una base PostgreSQL temporal en memoria (PGlite), sin conectar a la base real.

## Cómo funciona para quien la usa

- **Agregar un libro**: pide título, autor, editorial (opcional), tema, tejuelo, número de inventario y, opcionalmente, un PDF con la versión digitalizada. El tejuelo acepta letras y números; el número de inventario solo acepta números. El inventario se sugiere automáticamente con el siguiente número disponible.
- **Buscar un libro**: un solo campo de búsqueda que revisa título, autor, editorial, tema, tejuelo y número de inventario al mismo tiempo. Dejarlo vacío y tocar "Buscar" muestra todos los libros ordenados alfabéticamente. Con una sesión de gestión iniciada también se muestra cuántas veces se abrió el PDF de cada libro.
- Con una sesión iniciada, cada resultado permite seleccionar libros individualmente o todos juntos para generar un PDF de tarjetas. También existe un botón para generar las tres tarjetas de un libro directamente. La generación del PDF se realiza en el navegador, no en el servidor.
- **Prestar un libro**: busca entre los libros ya registrados, guarda nombre y apellido, fecha de préstamo y fecha límite. Por defecto usa la fecha local del navegador y una semana después; si esa fecha cae sábado o domingo, pasa al lunes. Un libro con un préstamo activo queda marcado como no disponible.
- **Préstamos y devoluciones**: muestra los libros actualmente prestados y permite registrar la devolución. Los préstamos devueltos pasan al historial y nunca se eliminan. Al iniciar sesión, Biblin avisa mediante una ventana si existen préstamos fuera de fecha.
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
