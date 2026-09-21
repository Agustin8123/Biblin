-- Esquema de la base de datos para el inventario de la biblioteca
-- Compatible con PostgreSQL 16.x

-- Permite que las búsquedas ignoren tildes (por ejemplo, "Garcia" encuentra "García")
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE TABLE IF NOT EXISTS libros (
    id                SERIAL PRIMARY KEY,
    titulo            VARCHAR(500) NOT NULL,
    autor             VARCHAR(300) NOT NULL,
    editorial         VARCHAR(300),
    numero_tarjeta    VARCHAR(100) NOT NULL,
    pdf_archivo       VARCHAR(255),
    pdf_visitas       BIGINT NOT NULL DEFAULT 0,
    creado_en         TIMESTAMPTZ NOT NULL DEFAULT now(),
    tema              VARCHAR(200),
    numero_inventario INTEGER,
    CONSTRAINT numero_tarjeta_unico UNIQUE (numero_tarjeta)
);

-- Para instalaciones anteriores.
ALTER TABLE libros ADD COLUMN IF NOT EXISTS pdf_archivo VARCHAR(255);
ALTER TABLE libros ADD COLUMN IF NOT EXISTS pdf_visitas BIGINT NOT NULL DEFAULT 0;
ALTER TABLE libros ADD COLUMN IF NOT EXISTS tema VARCHAR(200);
ALTER TABLE libros ADD COLUMN IF NOT EXISTS numero_inventario INTEGER;

-- Historial de préstamos. La devolución no borra registros: completa fecha_devolucion.
CREATE TABLE IF NOT EXISTS prestamos (
    id               SERIAL PRIMARY KEY,
    libro_id         INTEGER NOT NULL REFERENCES libros(id) ON DELETE RESTRICT,
    nombre           VARCHAR(150) NOT NULL,
    apellido         VARCHAR(150) NOT NULL,
    fecha_prestamo   DATE NOT NULL,
    fecha_limite     DATE NOT NULL,
    fecha_devolucion DATE,
    registrado_por   VARCHAR(100),
    devuelto_por     VARCHAR(100),
    creado_en        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT prestamos_fecha_limite_valida CHECK (fecha_limite >= fecha_prestamo),
    CONSTRAINT prestamos_devolucion_valida CHECK (
      fecha_devolucion IS NULL OR fecha_devolucion >= fecha_prestamo
    )
);

-- Un libro solo puede tener un préstamo activo a la vez.
CREATE UNIQUE INDEX IF NOT EXISTS idx_prestamos_libro_activo
    ON prestamos (libro_id)
    WHERE fecha_devolucion IS NULL;

CREATE INDEX IF NOT EXISTS idx_prestamos_fecha_limite
    ON prestamos (fecha_limite)
    WHERE fecha_devolucion IS NULL;

CREATE INDEX IF NOT EXISTS idx_prestamos_libro
    ON prestamos (libro_id);

-- Índices para búsquedas de libros.
CREATE INDEX IF NOT EXISTS idx_libros_titulo      ON libros (LOWER(titulo));
CREATE INDEX IF NOT EXISTS idx_libros_autor       ON libros (LOWER(autor));
CREATE INDEX IF NOT EXISTS idx_libros_editorial   ON libros (LOWER(editorial));
CREATE INDEX IF NOT EXISTS idx_libros_tema        ON libros (LOWER(tema));
CREATE INDEX IF NOT EXISTS idx_libros_numero      ON libros (LOWER(numero_tarjeta));
CREATE INDEX IF NOT EXISTS idx_libros_inventario  ON libros (numero_inventario);

-- Separación de bibliotecas (también compatible con instalaciones existentes).
-- Ejecutar después de las migraciones de préstamos y visitas a PDFs.
-- Las bibliotecas se crean al iniciar el servidor con los nombres de BIBLIN_USERS.
-- No crea bibliotecas de ejemplo ni reasigna libros existentes.
BEGIN;

CREATE TABLE IF NOT EXISTS bibliotecas (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(300) NOT NULL CHECK (btrim(nombre) <> '')
);

ALTER TABLE libros ADD COLUMN IF NOT EXISTS biblioteca_id INTEGER REFERENCES bibliotecas(id);
-- Si una instalación antigua tiene libros sin biblioteca, detiene la migración
-- para que se les asigne su escuela explícitamente, sin atribuirlos a otra cuenta.
ALTER TABLE libros ALTER COLUMN biblioteca_id SET NOT NULL;

DELETE FROM bibliotecas b WHERE b.nombre = 'Biblioteca inicial'
    AND NOT EXISTS (SELECT 1 FROM libros l WHERE l.biblioteca_id = b.id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bibliotecas_nombre ON bibliotecas (nombre);

-- Cada escuela puede usar sus propios tejuelos, aunque coincidan con otra.
ALTER TABLE libros DROP CONSTRAINT IF EXISTS numero_tarjeta_unico;
CREATE UNIQUE INDEX IF NOT EXISTS idx_libros_biblioteca_tarjeta
    ON libros (biblioteca_id, numero_tarjeta);
CREATE INDEX IF NOT EXISTS idx_libros_biblioteca_inventario
    ON libros (biblioteca_id, numero_inventario);

COMMIT;
