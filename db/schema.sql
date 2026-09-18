-- Esquema de la base de datos para el inventario de la biblioteca
-- Compatible con PostgreSQL 16.x

-- Permite que las búsquedas ignoren tildes (por ejemplo, "Garcia" encuentra "García")
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE TABLE IF NOT EXISTS libros (
    id              SERIAL PRIMARY KEY,
    titulo          VARCHAR(500) NOT NULL,
    autor           VARCHAR(300) NOT NULL,
    editorial       VARCHAR(300),
    numero_tarjeta  VARCHAR(100) NOT NULL,
    pdf_archivo     VARCHAR(255),
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT numero_tarjeta_unico UNIQUE (numero_tarjeta)
);

-- Por si la tabla ya existía de una instalación anterior sin esta columna.
ALTER TABLE libros ADD COLUMN IF NOT EXISTS pdf_archivo VARCHAR(255);

-- Índices para que las búsquedas sean rápidas a medida que crece la colección
CREATE INDEX IF NOT EXISTS idx_libros_titulo     ON libros (LOWER(titulo));
CREATE INDEX IF NOT EXISTS idx_libros_autor       ON libros (LOWER(autor));
CREATE INDEX IF NOT EXISTS idx_libros_editorial   ON libros (LOWER(editorial));
CREATE INDEX IF NOT EXISTS idx_libros_numero      ON libros (LOWER(numero_tarjeta));
