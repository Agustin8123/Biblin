-- Ejecutar después de las migraciones de préstamos y visitas a PDFs.
-- Los libros existentes pasan a la biblioteca inicial, sin cambiar sus IDs,
-- préstamos ni archivos PDF. Se puede volver a ejecutar sin duplicar datos.
BEGIN;

CREATE TABLE IF NOT EXISTS bibliotecas (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(300) NOT NULL CHECK (btrim(nombre) <> '')
);

INSERT INTO bibliotecas (id, nombre) VALUES (1, 'Biblioteca inicial')
ON CONFLICT (id) DO NOTHING;
SELECT setval(pg_get_serial_sequence('bibliotecas', 'id'),
              GREATEST((SELECT MAX(id) FROM bibliotecas),
                       (SELECT last_value FROM bibliotecas_id_seq)));

ALTER TABLE libros ADD COLUMN IF NOT EXISTS biblioteca_id INTEGER REFERENCES bibliotecas(id);
UPDATE libros SET biblioteca_id = 1 WHERE biblioteca_id IS NULL;
ALTER TABLE libros ALTER COLUMN biblioteca_id SET NOT NULL;

-- Cada escuela puede usar sus propios tejuelos, aunque coincidan con otra.
ALTER TABLE libros DROP CONSTRAINT IF EXISTS numero_tarjeta_unico;
CREATE UNIQUE INDEX IF NOT EXISTS idx_libros_biblioteca_tarjeta
    ON libros (biblioteca_id, numero_tarjeta);
CREATE INDEX IF NOT EXISTS idx_libros_biblioteca_inventario
    ON libros (biblioteca_id, numero_inventario);

COMMIT;
