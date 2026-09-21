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
