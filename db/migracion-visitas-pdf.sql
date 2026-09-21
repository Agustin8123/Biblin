-- Agrega el contador de aperturas de PDFs a instalaciones existentes.
-- Es seguro ejecutarlo más de una vez.
ALTER TABLE libros
ADD COLUMN IF NOT EXISTS pdf_visitas BIGINT NOT NULL DEFAULT 0;
