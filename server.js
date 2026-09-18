require('dotenv').config();

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');

const pool = require('./db');

const app = express();
const PUERTO = process.env.PORT || 3000;
const MAX_PDF_MB = Number(process.env.MAX_PDF_MB) || 100;

// Carpeta donde se guardan los PDF subidos (fuera de "public" para que no
// se puedan listar ni abrir directamente sin pasar por las rutas de abajo).
const CARPETA_PDFS = path.join(__dirname, 'uploads', 'pdfs');
fs.mkdirSync(CARPETA_PDFS, { recursive: true });

// Si la app corre detrás de un proxy inverso (recomendado, ver README),
// esto permite que el limitador de pedidos identifique bien cada visitante.
app.set('trust proxy', 1);

app.use(helmet());
app.use(express.json({ limit: '100kb' }));

// ---------------------------------------------------------------------------
// Protección opcional con usuario y contraseña.
// Si se definen SITE_USER y SITE_PASSWORD en el archivo .env, la aplicación
// entera pide esas credenciales antes de mostrar nada. Si no se definen,
// queda abierta tal como está (pensado para cuando ya se protege el acceso
// de otra forma, por ejemplo restringiendo la red).
// ---------------------------------------------------------------------------
function pedirCredenciales(req, res, next) {
  const usuario = process.env.SITE_USER;
  const clave = process.env.SITE_PASSWORD;

  if (!usuario || !clave) return next();

  const encabezado = req.headers.authorization || '';
  const [tipo, valor] = encabezado.split(' ');

  if (tipo === 'Basic' && valor) {
    const decodificado = Buffer.from(valor, 'base64').toString('utf8');
    const separador = decodificado.indexOf(':');
    const u = decodificado.slice(0, separador);
    const p = decodificado.slice(separador + 1);
    if (u === usuario && p === clave) return next();
  }

  res.set('WWW-Authenticate', 'Basic realm="Biblioteca"');
  return res.status(401).send('Hace falta usuario y contraseña para entrar.');
}

app.use(pedirCredenciales);
app.use(express.static(path.join(__dirname, 'public')));

// Límite general para la API: evita que alguien la sature de pedidos.
const limitadorApi = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Demasiados pedidos seguidos. Esperá un momento y probá de nuevo.' },
});
app.use('/api/', limitadorApi);

// Límite más estricto específicamente para subir archivos, que son pedidos
// más pesados que el resto de la API.
const limitadorSubidas = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Demasiados archivos subidos seguidos. Esperá un momento y probá de nuevo.' },
});

// ---------------------------------------------------------------------------
// Subida de PDFs
// ---------------------------------------------------------------------------
const almacenamientoPdf = multer.diskStorage({
  destination: (req, file, cb) => cb(null, CARPETA_PDFS),
  filename: (req, file, cb) => {
    const nombre = `libro-${req.params.id}-${crypto.randomBytes(8).toString('hex')}.pdf`;
    cb(null, nombre);
  },
});

const subidaPdf = multer({
  storage: almacenamientoPdf,
  limits: { fileSize: MAX_PDF_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('SOLO_PDF'));
    }
    cb(null, true);
  },
}).single('pdf');

// Comprueba que el archivo guardado empiece realmente con la firma de un PDF
// (%PDF-), para no confiar solo en la extensión o el tipo que manda el navegador.
function esPdfValido(rutaArchivo) {
  const buffer = Buffer.alloc(5);
  const fd = fs.openSync(rutaArchivo, 'r');
  fs.readSync(fd, buffer, 0, 5, 0);
  fs.closeSync(fd);
  return buffer.toString('ascii') === '%PDF-';
}

function borrarArchivo(rutaArchivo) {
  fs.unlink(rutaArchivo, () => {});
}

// ---------------------------------------------------------------------------
// Utilidades de validación
// ---------------------------------------------------------------------------
function comoTexto(valor) {
  return typeof valor === 'string' ? valor.trim() : '';
}

function validarLibro(cuerpo) {
  const titulo = comoTexto(cuerpo.titulo);
  const autor = comoTexto(cuerpo.autor);
  const editorial = comoTexto(cuerpo.editorial);
  const numero_tarjeta = comoTexto(cuerpo.numero_tarjeta);

  if (!titulo) return { error: 'Falta el título del libro.' };
  if (titulo.length > 500) return { error: 'El título es demasiado largo.' };

  if (!autor) return { error: 'Falta el autor del libro.' };
  if (autor.length > 300) return { error: 'El autor es demasiado largo.' };

  if (editorial.length > 300) return { error: 'La editorial es demasiado larga.' };

  if (!numero_tarjeta) return { error: 'Falta el número de tarjeta.' };
  if (numero_tarjeta.length > 100) return { error: 'El número de tarjeta es demasiado largo.' };

  return { datos: { titulo, autor, editorial: editorial || null, numero_tarjeta } };
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

// Sugiere el próximo número de tarjeta libre, para que no haya que llevar la
// cuenta a mano. Sólo mira números de tarjeta que son puramente numéricos.
app.get('/api/libros/siguiente-numero', async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT COALESCE(MAX(numero_tarjeta::integer), 0) + 1 AS siguiente
       FROM libros
       WHERE numero_tarjeta ~ '^[0-9]+$'`
    );
    res.json({ ok: true, siguiente: String(resultado.rows[0].siguiente) });
  } catch (error) {
    console.error('Error al calcular el siguiente número:', error);
    res.json({ ok: true, siguiente: '1' });
  }
});

// Agrega un libro nuevo.
app.post('/api/libros', async (req, res) => {
  const validacion = validarLibro(req.body || {});
  if (validacion.error) {
    return res.status(400).json({ ok: false, error: validacion.error });
  }

  const { titulo, autor, editorial, numero_tarjeta } = validacion.datos;

  try {
    const resultado = await pool.query(
      `INSERT INTO libros (titulo, autor, editorial, numero_tarjeta)
       VALUES ($1, $2, $3, $4)
       RETURNING id, titulo, autor, editorial, numero_tarjeta, creado_en`,
      [titulo, autor, editorial, numero_tarjeta]
    );
    res.status(201).json({ ok: true, libro: resultado.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      // Violación de la restricción UNIQUE sobre numero_tarjeta.
      return res.status(409).json({
        ok: false,
        error: `Ya hay un libro guardado con el número de tarjeta "${numero_tarjeta}". Probá con otro número.`,
      });
    }
    console.error('Error al guardar el libro:', error);
    res.status(500).json({ ok: false, error: 'No se pudo guardar el libro. Probá de nuevo en un momento.' });
  }
});

// Busca libros por título, autor, editorial o número de tarjeta.
// Si no se manda texto de búsqueda, devuelve todos (ordenados por título).
app.get('/api/libros/buscar', async (req, res) => {
  const q = comoTexto(req.query.q);

  try {
    let resultado;
    if (q) {
      resultado = await pool.query(
        `SELECT id, titulo, autor, editorial, numero_tarjeta, creado_en, (pdf_archivo IS NOT NULL) AS tiene_pdf
         FROM libros
         WHERE unaccent(titulo) ILIKE unaccent($1)
            OR unaccent(autor) ILIKE unaccent($1)
            OR unaccent(COALESCE(editorial, '')) ILIKE unaccent($1)
            OR unaccent(numero_tarjeta) ILIKE unaccent($1)
         ORDER BY titulo ASC
         LIMIT 200`,
        [`%${q}%`]
      );
    } else {
      resultado = await pool.query(
        `SELECT id, titulo, autor, editorial, numero_tarjeta, creado_en, (pdf_archivo IS NOT NULL) AS tiene_pdf
         FROM libros
         ORDER BY titulo ASC
         LIMIT 200`
      );
    }
    res.json({ ok: true, libros: resultado.rows });
  } catch (error) {
    console.error('Error al buscar libros:', error);
    res.status(500).json({ ok: false, error: 'No se pudo hacer la búsqueda. Probá de nuevo en un momento.' });
  }
});

// Borra un libro (para corregir errores de carga).
app.delete('/api/libros/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ ok: false, error: 'Ese libro no existe.' });
  }

  try {
    const resultado = await pool.query('DELETE FROM libros WHERE id = $1 RETURNING id, pdf_archivo', [id]);
    if (resultado.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Ese libro ya no está en la lista.' });
    }
    if (resultado.rows[0].pdf_archivo) {
      borrarArchivo(path.join(CARPETA_PDFS, resultado.rows[0].pdf_archivo));
    }
    res.json({ ok: true });
  } catch (error) {
    console.error('Error al borrar el libro:', error);
    res.status(500).json({ ok: false, error: 'No se pudo borrar el libro. Probá de nuevo en un momento.' });
  }
});

// Sube (o reemplaza) el PDF de un libro ya existente.
app.post('/api/libros/:id/pdf', limitadorSubidas, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ ok: false, error: 'Ese libro no existe.' });
  }

  subidaPdf(req, res, async (error) => {
    if (error) {
      if (error.message === 'SOLO_PDF') {
        return res.status(400).json({ ok: false, error: 'Ese archivo no es un PDF. Elegí un archivo con extensión .pdf.' });
      }
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ ok: false, error: `El archivo es demasiado grande. El máximo es ${MAX_PDF_MB} MB.` });
      }
      console.error('Error al subir el PDF:', error);
      return res.status(400).json({ ok: false, error: 'No se pudo subir el archivo.' });
    }

    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'No se recibió ningún archivo.' });
    }

    if (!esPdfValido(req.file.path)) {
      borrarArchivo(req.file.path);
      return res.status(400).json({ ok: false, error: 'Ese archivo no parece ser un PDF válido.' });
    }

    try {
      const anterior = await pool.query('SELECT pdf_archivo FROM libros WHERE id = $1', [id]);
      if (anterior.rows.length === 0) {
        borrarArchivo(req.file.path);
        return res.status(404).json({ ok: false, error: 'Ese libro ya no está en la lista.' });
      }

      await pool.query('UPDATE libros SET pdf_archivo = $1 WHERE id = $2', [req.file.filename, id]);

      if (anterior.rows[0].pdf_archivo) {
        borrarArchivo(path.join(CARPETA_PDFS, anterior.rows[0].pdf_archivo));
      }

      res.json({ ok: true });
    } catch (err) {
      borrarArchivo(req.file.path);
      console.error('Error al guardar el PDF:', err);
      res.status(500).json({ ok: false, error: 'No se pudo guardar el PDF. Probá de nuevo.' });
    }
  });
});

// Muestra el PDF de un libro para abrirlo en el navegador.
app.get('/api/libros/:id/pdf', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).send('Ese libro no existe.');
  }

  try {
    const resultado = await pool.query('SELECT titulo, pdf_archivo FROM libros WHERE id = $1', [id]);
    if (resultado.rows.length === 0 || !resultado.rows[0].pdf_archivo) {
      return res.status(404).send('Este libro todavía no tiene un PDF cargado.');
    }

    const { titulo, pdf_archivo } = resultado.rows[0];
    const rutaArchivo = path.join(CARPETA_PDFS, pdf_archivo);

    if (!fs.existsSync(rutaArchivo)) {
      return res.status(404).send('No se encontró el archivo PDF.');
    }

    const nombreLegible = titulo
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s-]/g, '')
      .trim() || 'libro';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${nombreLegible}.pdf"`);
    fs.createReadStream(rutaArchivo).pipe(res);
  } catch (error) {
    console.error('Error al abrir el PDF:', error);
    res.status(500).send('No se pudo abrir el archivo.');
  }
});

// Quita el PDF de un libro (por si se subió el archivo equivocado).
app.delete('/api/libros/:id/pdf', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ ok: false, error: 'Ese libro no existe.' });
  }

  try {
    const resultado = await pool.query('SELECT pdf_archivo FROM libros WHERE id = $1', [id]);
    if (resultado.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Ese libro ya no está en la lista.' });
    }

    const pdfActual = resultado.rows[0].pdf_archivo;
    if (!pdfActual) {
      return res.json({ ok: true });
    }

    await pool.query('UPDATE libros SET pdf_archivo = NULL WHERE id = $1', [id]);
    borrarArchivo(path.join(CARPETA_PDFS, pdfActual));
    res.json({ ok: true });
  } catch (error) {
    console.error('Error al quitar el PDF:', error);
    res.status(500).json({ ok: false, error: 'No se pudo quitar el PDF. Probá de nuevo en un momento.' });
  }
});

app.use('/api/', (req, res) => {
  res.status(404).json({ ok: false, error: 'Esa dirección no existe.' });
});

app.listen(PUERTO, '0.0.0.0', () => {
  console.log(`Biblioteca escuchando en el puerto ${PUERTO}`);
});
