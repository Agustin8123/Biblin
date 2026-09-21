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

Para incorporar varias bibliotecas a una instalación existente, después de
las migraciones anteriores ejecutá:

```bash
psql -h localhost -U biblioteca -d biblioteca -v ON_ERROR_STOP=1 -f db/migracion-bibliotecas.sql
```

Los libros actuales quedan en **Biblioteca inicial** (ID 1), conservando sus
préstamos y PDFs. Las instalaciones nuevas ya incluyen esto en `db/schema.sql`.
La migración se puede volver a ejecutar y no cambia las bibliotecas ya asignadas.

Renombrá la biblioteca inicial y creá las demás con los nombres reales de las
escuelas. Por ejemplo, desde PostgreSQL:

```sql
UPDATE bibliotecas SET nombre = 'Escuela San Martín' WHERE id = 1;
INSERT INTO bibliotecas (nombre) VALUES ('Escuela Belgrano') RETURNING id;
SELECT id, nombre FROM bibliotecas ORDER BY id;
```

Usá los IDs obtenidos para configurar las cuentas. Los nombres anteriores son
ejemplos. Los tejuelos pueden repetirse entre escuelas, pero no dentro de una
misma biblioteca. La sugerencia del siguiente inventario se calcula por biblioteca.

## 2. Configurar la aplicación

Las cuentas de gestión no se guardan en PostgreSQL. Se configuran manualmente en el archivo `.env` mediante `BIBLIN_USERS`, usando un objeto JSON, por ejemplo:

```
BIBLIN_USERS={"Escuela San Martín":{"clave":"CAMBIAR_CLAVE_1","biblioteca_id":1},"Escuela Belgrano":{"clave":"CAMBIAR_CLAVE_2","biblioteca_id":2}}
```

Cada cuenta debe apuntar a una biblioteca existente. Dos cuentas pueden compartir
una biblioteca si trabajan en la misma escuela. Reiniciá el servidor después de
cambiar `BIBLIN_USERS`. Las cuentas antiguas con formato `"usuario":"clave"`
siguen funcionando y pertenecen a la biblioteca inicial (ID 1); asigná los IDs
explícitamente para separar las escuelas.

El acceso **Solo lector** no requiere cuenta: muestra libros, biblioteca de
origen, disponibilidad y PDFs de todas las escuelas. No expone datos de las
personas que pidieron préstamos ni contadores de visitas.
El desplegable **Biblioteca de la escuela** permite elegir una escuela o
**Todas las bibliotecas** y combinar esa selección con la búsqueda de libros.
Usa el nombre público de `bibliotecas.nombre`: configurá el mismo nombre de
escuela en la biblioteca y en su cuenta. La lista no expone las credenciales.
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

Por defecto el servidor escucha en el puerto 3000. Para probarlo en la
misma máquina, abrí `http://localhost:3000` en el navegador.

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
