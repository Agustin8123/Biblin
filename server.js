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
const CARPETA_PDFS = path.join(__dirname, 'uploads', 'pdfs');
fs.mkdirSync(CARPETA_PDFS, { recursive: true });

app.set('trust proxy', 1);
app.use(helmet());
app.use(express.json({ limit: '100kb' }));

// ---------------------------------------------------------------------------
// Autenticación basada en sesiones.
// Las cuentas viven exclusivamente en .env y NO en PostgreSQL.
// Ejemplo:
// BIBLIN_USERS={"admin":"clave1","biblioteca":"clave2"}
// ---------------------------------------------------------------------------
function cargarCuentas() {
  const bruto = String(process.env.BIBLIN_USERS || '').trim();
  if (!bruto) return {};

  try {
    const cuentas = JSON.parse(bruto);
    if (!cuentas || typeof cuentas !== 'object' || Array.isArray(cuentas)) {
      throw new Error('BIBLIN_USERS debe ser un objeto JSON.');
    }

    const resultado = {};
    for (const [usuario, clave] of Object.entries(cuentas)) {
      if (!usuario.trim() || typeof clave !== 'string') continue;
      resultado[usuario] = clave;
    }
    return resultado;
  } catch (error) {
    console.error('Error en BIBLIN_USERS:', error.message);
    return {};
  }
}

const CUENTAS = cargarCuentas();
const SESIONES = new Map();
const DURACION_SESION_MS = 12 * 60 * 60 * 1000;
const NOMBRE_COOKIE_SESION = 'biblin_session';

function compararSeguro(a, b) {
  const bufferA = Buffer.from(String(a));
  const bufferB = Buffer.from(String(b));
  if (bufferA.length !== bufferB.length) return false;
  return crypto.timingSafeEqual(bufferA, bufferB);
}

function analizarCookies(encabezado) {
  const cookies = {};
  if (!encabezado) return cookies;

  for (const parte of encabezado.split(';')) {
    const separador = parte.indexOf('=');
    if (separador === -1) continue;
    const nombre = parte.slice(0, separador).trim();
    const valor = parte.slice(separador + 1).trim();
    if (nombre) cookies[nombre] = valor;
  }
  return cookies;
}

function obtenerSesion(req) {
  const cookies = analizarCookies(req.headers.cookie || '');
  const token = cookies[NOMBRE_COOKIE_SESION];
  if (!token) return null;

  const sesion = SESIONES.get(token);
  if (!sesion) return null;

  if (sesion.expira <= Date.now()) {
    SESIONES.delete(token);
    return null;
  }

  return sesion;
}

function esConexionSegura(req) {
  return req.secure || req.headers['x-forwarded-proto'] === 'https';
}

function establecerCookieSesion(res, req, token) {
  const partes = [
    `${NOMBRE_COOKIE_SESION}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.floor(DURACION_SESION_MS / 1000)}`,
  ];
  if (esConexionSegura(req)) partes.push('Secure');
  res.setHeader('Set-Cookie', partes.join('; '));
}

function borrarCookieSesion(res) {
  res.setHeader(
    'Set-Cookie',
    `${NOMBRE_COOKIE_SESION}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`
  );
}

function exigirLogin(req, res, next) {
  const sesion = obtenerSesion(req);
  if (sesion) {
    req.sesion = sesion;
    return next();
  }
  return res.status(401).json({ ok: false, error: 'Necesitás iniciar sesión para hacer eso.' });
}

setInterval(() => {
  const ahora = Date.now();
  for (const [token, sesion] of SESIONES) {
    if (sesion.expira <= ahora) SESIONES.delete(token);
  }
}, 30 * 60 * 1000).unref();

// ---------------------------------------------------------------------------
// Límites de pedidos
// ---------------------------------------------------------------------------
const limitadorApi = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Demasiados pedidos seguidos. Esperá un momento y probá de nuevo.' },
});
app.use('/api/', limitadorApi);

const limitadorLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Demasiados intentos de inicio de sesión. Esperá unos minutos y probá de nuevo.' },
});

const limitadorSubidas = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Demasiados archivos subidos seguidos. Esperá un momento y probá de nuevo.' },
});

// ---------------------------------------------------------------------------
// Autenticación API
// ---------------------------------------------------------------------------
app.get('/api/auth/estado', (req, res) => {
  const sesion = obtenerSesion(req);
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    ok: true,
    autenticado: Boolean(sesion),
    usuario: sesion ? sesion.usuario : null,
  });
});

app.post('/api/auth/login', limitadorLogin, (req, res) => {
  if (Object.keys(CUENTAS).length === 0) {
    return res.status(503).json({
      ok: false,
      error: 'No hay cuentas configuradas en el servidor. Revisá BIBLIN_USERS en el archivo .env.',
    });
  }

  const usuario = typeof req.body?.usuario === 'string' ? req.body.usuario.trim() : '';
  const clave = typeof req.body?.clave === 'string' ? req.body.clave : '';
  const claveGuardada = Object.prototype.hasOwnProperty.call(CUENTAS, usuario)
    ? CUENTAS[usuario]
    : '';

  if (!usuario || !clave || !claveGuardada || !compararSeguro(clave, claveGuardada)) {
    return res.status(401).json({ ok: false, error: 'Usuario o contraseña incorrectos.' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  SESIONES.set(token, {
    usuario,
    expira: Date.now() + DURACION_SESION_MS,
  });
  establecerCookieSesion(res, req, token);
  res.json({ ok: true, usuario });
});

app.post('/api/auth/logout', (req, res) => {
  const cookies = analizarCookies(req.headers.cookie || '');
  const token = cookies[NOMBRE_COOKIE_SESION];
  if (token) SESIONES.delete(token);
  borrarCookieSesion(res);
  res.json({ ok: true });
});

app.use(express.static(path.join(__dirname, 'public')));

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
  const tema = comoTexto(cuerpo.tema);
  const numero_tarjeta = comoTexto(cuerpo.numero_tarjeta);
  const numero_inventario = comoTexto(cuerpo.numero_inventario);

  if (!titulo) return { error: 'Falta el título del libro.' };
  if (titulo.length > 500) return { error: 'El título es demasiado largo.' };

  if (!autor) return { error: 'Falta el autor del libro.' };
  if (autor.length > 300) return { error: 'El autor es demasiado largo.' };

  if (editorial.length > 300) return { error: 'La editorial es demasiado larga.' };

  if (!tema) return { error: 'Falta el tema del libro.' };
  if (tema.length > 200) return { error: 'El tema es demasiado largo.' };

  if (!numero_tarjeta) return { error: 'Falta el tejuelo.' };
  if (numero_tarjeta.length > 100) return { error: 'El tejuelo es demasiado largo.' };

  if (!numero_inventario) return { error: 'Falta el número de inventario.' };
  if (!/^[0-9]+$/.test(numero_inventario)) {
    return { error: 'El número de inventario debe contener solamente números.' };
  }
  if (numero_inventario.length > 100) return { error: 'El número de inventario es demasiado largo.' };

  return {
    datos: {
      titulo,
      autor,
      editorial: editorial || null,
      tema,
      numero_tarjeta,
      numero_inventario,
    },
  };
}

// ---------------------------------------------------------------------------
// API de libros
// ---------------------------------------------------------------------------
app.get('/api/libros/siguiente-inventario', exigirLogin, async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT COALESCE(MAX(numero_inventario::numeric), 0) + 1 AS siguiente
       FROM libros
       WHERE numero_inventario ~ '^[0-9]+$'`
    );
    res.json({ ok: true, siguiente: String(resultado.rows[0].siguiente) });
  } catch (error) {
    console.error('Error al calcular el siguiente inventario:', error);
    res.json({ ok: true, siguiente: '1' });
  }
});

app.post('/api/libros', exigirLogin, async (req, res) => {
  const validacion = validarLibro(req.body || {});
  if (validacion.error) {
    return res.status(400).json({ ok: false, error: validacion.error });
  }

  const {
    titulo,
    autor,
    editorial,
    tema,
    numero_tarjeta,
    numero_inventario,
  } = validacion.datos;

  try {
    const resultado = await pool.query(
      `INSERT INTO libros
         (titulo, autor, editorial, tema, numero_tarjeta, numero_inventario)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, titulo, autor, editorial, tema, numero_tarjeta, numero_inventario, creado_en`,
      [titulo, autor, editorial, tema, numero_tarjeta, numero_inventario]
    );
    res.status(201).json({ ok: true, libro: resultado.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      const detalle = String(error.detail || '');
      if (detalle.includes('numero_inventario')) {
        return res.status(409).json({
          ok: false,
          error: `Ya hay un libro guardado con el número de inventario "${numero_inventario}". Probá con otro número.`,
        });
      }
      return res.status(409).json({
        ok: false,
        error: `Ya hay un libro guardado con el tejuelo "${numero_tarjeta}". Probá con otro tejuelo.`,
      });
    }
    console.error('Error al guardar el libro:', error);
    res.status(500).json({ ok: false, error: 'No se pudo guardar el libro. Probá de nuevo en un momento.' });
  }
});

app.get('/api/libros/buscar', async (req, res) => {
  const q = comoTexto(req.query.q);

  try {
    let resultado;
    if (q) {
      resultado = await pool.query(
        `SELECT id, titulo, autor, editorial, tema, numero_tarjeta, numero_inventario, creado_en,
                (pdf_archivo IS NOT NULL) AS tiene_pdf
         FROM libros
         WHERE unaccent(titulo) ILIKE unaccent($1)
            OR unaccent(autor) ILIKE unaccent($1)
            OR unaccent(COALESCE(editorial, '')) ILIKE unaccent($1)
            OR unaccent(COALESCE(tema, '')) ILIKE unaccent($1)
            OR unaccent(numero_tarjeta) ILIKE unaccent($1)
            OR unaccent(COALESCE(numero_inventario::text, '')) ILIKE unaccent($1)
         ORDER BY titulo ASC
         LIMIT 200`,
        [`%${q}%`]
      );
    } else {
      resultado = await pool.query(
        `SELECT id, titulo, autor, editorial, tema, numero_tarjeta, numero_inventario, creado_en,
                (pdf_archivo IS NOT NULL) AS tiene_pdf
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

// Edita un libro ya existente (para corregir errores de tipeo).
app.put('/api/libros/:id', exigirLogin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ ok: false, error: 'Ese libro no existe.' });
  }

  const validacion = validarLibro(req.body || {});
  if (validacion.error) {
    return res.status(400).json({ ok: false, error: validacion.error });
  }

  const {
    titulo,
    autor,
    editorial,
    tema,
    numero_tarjeta,
    numero_inventario,
  } = validacion.datos;

  try {
    const resultado = await pool.query(
      `UPDATE libros
       SET titulo = $1, autor = $2, editorial = $3, tema = $4,
           numero_tarjeta = $5, numero_inventario = $6
       WHERE id = $7
       RETURNING id, titulo, autor, editorial, tema, numero_tarjeta, numero_inventario,
                 creado_en, (pdf_archivo IS NOT NULL) AS tiene_pdf`,
      [titulo, autor, editorial, tema, numero_tarjeta, numero_inventario, id]
    );
    if (resultado.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Ese libro ya no está en la lista.' });
    }
    res.json({ ok: true, libro: resultado.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      const detalle = String(error.detail || '');
      if (detalle.includes('numero_inventario')) {
        return res.status(409).json({
          ok: false,
          error: `Ya hay otro libro guardado con el número de inventario "${numero_inventario}". Probá con otro número.`,
        });
      }
      return res.status(409).json({
        ok: false,
        error: `Ya hay otro libro guardado con el tejuelo "${numero_tarjeta}". Probá con otro tejuelo.`,
      });
    }
    console.error('Error al editar el libro:', error);
    res.status(500).json({ ok: false, error: 'No se pudo guardar el cambio. Probá de nuevo en un momento.' });
  }
});

app.delete('/api/libros/:id', exigirLogin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ ok: false, error: 'Ese libro no existe.' });
  }

  try {
    const resultado = await pool.query(
      'DELETE FROM libros WHERE id = $1 RETURNING id, pdf_archivo',
      [id]
    );
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

app.post('/api/libros/:id/pdf', exigirLogin, limitadorSubidas, (req, res) => {
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

// El PDF permanece disponible para Solo lector.
app.get('/api/libros/:id/pdf', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).send('Ese libro no existe.');
  }

  try {
    const resultado = await pool.query(
      'SELECT titulo, pdf_archivo FROM libros WHERE id = $1',
      [id]
    );
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

app.delete('/api/libros/:id/pdf', exigirLogin, async (req, res) => {
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
    if (!pdfActual) return res.json({ ok: true });

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
  if (Object.keys(CUENTAS).length === 0) {
    console.warn('ADVERTENCIA: no hay cuentas configuradas en BIBLIN_USERS. Biblin funcionará en modo Solo lector hasta configurarlas.');
  }
  console.log(`Biblioteca escuchando en el puerto ${PUERTO}`);
});
