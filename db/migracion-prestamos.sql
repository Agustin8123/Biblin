-- Ejecutar una sola vez sobre una instalación existente de Biblin.
-- Ejemplo:
-- psql -h localhost -U biblioteca -d biblioteca -f db/migracion-prestamos.sql

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

CREATE UNIQUE INDEX IF NOT EXISTS idx_prestamos_libro_activo
    ON prestamos (libro_id)
    WHERE fecha_devolucion IS NULL;

CREATE INDEX IF NOT EXISTS idx_prestamos_fecha_limite
    ON prestamos (fecha_limite)
    WHERE fecha_devolucion IS NULL;

CREATE INDEX IF NOT EXISTS idx_prestamos_libro
    ON prestamos (libro_id);
