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
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://cdnjs.cloudflare.com'],
      styleSrc: ["'self'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'blob:'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
    },
  },
}));
app.use(express.json({ limit: '100kb' }));

// ---------------------------------------------------------------------------
// Autenticación basada en sesiones.
// Las cuentas viven exclusivamente en .env y NO en PostgreSQL.
// Ejemplo:
// BIBLIN_USERS={"EP31":"clave1","EP42":"clave2"}
// Cada usuario es el nombre público de su biblioteca.
// ---------------------------------------------------------------------------
function cargarCuentas() {
  const bruto = String(process.env.BIBLIN_USERS || '').trim();
  if (!bruto) return {};

  try {
    const cuentas = JSON.parse(bruto);
    if (!cuentas || typeof cuentas !== 'object' || Array.isArray(cuentas)) {
      throw new Error('BIBLIN_USERS debe ser un objeto JSON.');
    }

    const resultado = Object.create(null);
    for (const [usuario, valor] of Object.entries(cuentas)) {
      if (!usuario.trim() || usuario !== usuario.trim() || usuario.length > 300 ||
          typeof valor !== 'string' || !valor) {
        throw new Error('Cada cuenta debe tener el nombre de su biblioteca y una clave no vacía.');
      }
      resultado[usuario] = { clave: valor };
    }
    return resultado;
  } catch (error) {
    console.error('Error en BIBLIN_USERS:', error.message);
    return {};
  }
}

const CUENTAS = cargarCuentas();

async function inicializarBibliotecas() {
  const cliente = await pool.connect();
  try {
    // Actualiza instalaciones vacías o ya separadas por biblioteca.
    await cliente.query(fs.readFileSync(path.join(__dirname, 'db', 'migracion-bibliotecas.sql'), 'utf8'));
    await cliente.query('BEGIN');
    for (const nombre of Object.keys(CUENTAS)) {
      await cliente.query('INSERT INTO bibliotecas (nombre) VALUES ($1) ON CONFLICT (nombre) DO NOTHING', [nombre]);
    }
    await cliente.query('COMMIT');
  } catch (error) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    cliente.release();
  }
}

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
    biblioteca: sesion ? sesion.biblioteca : null,
  });
});

app.post('/api/auth/login', limitadorLogin, async (req, res) => {
  if (Object.keys(CUENTAS).length === 0) {
    return res.status(503).json({
      ok: false,
      error: 'No hay cuentas configuradas en el servidor. Revisá BIBLIN_USERS en el archivo .env.',
    });
  }

  const usuario = typeof req.body?.usuario === 'string' ? req.body.usuario.trim() : '';
  const clave = typeof req.body?.clave === 'string' ? req.body.clave : '';
  const claveGuardada = Object.prototype.hasOwnProperty.call(CUENTAS, usuario)
    ? CUENTAS[usuario].clave
    : '';

  if (!usuario || !clave || !claveGuardada || !compararSeguro(clave, claveGuardada)) {
    return res.status(401).json({ ok: false, error: 'Usuario o contraseña incorrectos.' });
  }

  let biblioteca;
  try {
    const resultado = await pool.query('SELECT id, nombre FROM bibliotecas WHERE nombre = $1', [usuario]);
    biblioteca = resultado.rows[0];
    if (!biblioteca) return res.status(503).json({ ok: false, error: 'La cuenta no tiene una biblioteca configurada. Contactá al administrador.' });
  } catch (error) {
    console.error('Error al consultar la biblioteca:', error);
    return res.status(503).json({ ok: false, error: 'No se pudo consultar la biblioteca. Probá de nuevo en un momento.' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  SESIONES.set(token, {
    usuario,
    biblioteca,
    expira: Date.now() + DURACION_SESION_MS,
  });
  establecerCookieSesion(res, req, token);
  res.json({ ok: true, usuario, biblioteca });
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


function esFechaISO(valor) {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const [anio, mes, dia] = valor.split('-').map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return fecha.getUTCFullYear() === anio
    && fecha.getUTCMonth() === mes - 1
    && fecha.getUTCDate() === dia;
}

function validarPrestamo(cuerpo) {
  const libro_id = Number(cuerpo.libro_id);
  const nombre = comoTexto(cuerpo.nombre);
  const apellido = comoTexto(cuerpo.apellido);
  const fecha_prestamo = comoTexto(cuerpo.fecha_prestamo);
  const fecha_limite = comoTexto(cuerpo.fecha_limite);

  if (!Number.isInteger(libro_id) || libro_id <= 0) return { error: 'Elegí un libro válido.' };
  if (!nombre) return { error: 'Falta el nombre de la persona.' };
  if (nombre.length > 150) return { error: 'El nombre es demasiado largo.' };
  if (!apellido) return { error: 'Falta el apellido de la persona.' };
  if (apellido.length > 150) return { error: 'El apellido es demasiado largo.' };
  if (!esFechaISO(fecha_prestamo)) return { error: 'La fecha de préstamo no es válida.' };
  if (!esFechaISO(fecha_limite)) return { error: 'La fecha límite no es válida.' };
  if (fecha_limite < fecha_prestamo) return { error: 'La fecha límite no puede ser anterior a la fecha de préstamo.' };

  return { datos: { libro_id, nombre, apellido, fecha_prestamo, fecha_limite } };
}

// ---------------------------------------------------------------------------
// API de libros
// ---------------------------------------------------------------------------
app.get('/api/libros/siguiente-inventario', exigirLogin, async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT COALESCE(MAX(numero_inventario), 0) + 1 AS siguiente
       FROM libros WHERE biblioteca_id = $1`,
      [req.sesion.biblioteca.id]
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
         (titulo, autor, editorial, tema, numero_tarjeta, numero_inventario, biblioteca_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, titulo, autor, editorial, tema, numero_tarjeta, numero_inventario, creado_en`,
      [titulo, autor, editorial, tema, numero_tarjeta, numero_inventario, req.sesion.biblioteca.id]
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

app.get('/api/bibliotecas', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const resultado = await pool.query(
      `SELECT id, nombre FROM bibliotecas
       WHERE lower(btrim(nombre)) <> 'biblioteca inicial'
       ORDER BY nombre ASC, id ASC`
    );
    res.json({ ok: true, bibliotecas: resultado.rows });
  } catch (error) {
    console.error('Error al listar bibliotecas:', error);
    res.status(500).json({ ok: false, error: 'No se pudieron cargar las bibliotecas. Probá de nuevo.' });
  }
});

app.get('/api/libros/buscar', async (req, res) => {
  const q = comoTexto(req.query.q);
  const filtro = req.query.biblioteca_id;
  const bibliotecaFiltro = filtro === undefined || filtro === '' ? null : Number(filtro);
  if (bibliotecaFiltro !== null && (typeof filtro !== 'string' || !/^[0-9]+$/.test(filtro) || !Number.isSafeInteger(bibliotecaFiltro) || bibliotecaFiltro <= 0)) {
    return res.status(400).json({ ok: false, error: 'Elegí una biblioteca válida.' });
  }

  try {
    const sesion = obtenerSesion(req);
    if (req.query.catalogo === 'gestion' && !sesion) {
      return res.status(401).json({ ok: false, error: 'Necesitás iniciar sesión para gestionar tu biblioteca.' });
    }
    // El catálogo público reúne todas las bibliotecas; la gestión usa la sesión.
    const bibliotecaId = req.query.catalogo === 'publico' ? null : (sesion?.biblioteca.id ?? null);
    res.setHeader('Cache-Control', 'no-store');
    const resultado = await pool.query(
      `SELECT l.id, l.titulo, l.autor, l.editorial, l.tema, l.numero_tarjeta,
              l.numero_inventario, l.creado_en,
              CASE WHEN l.biblioteca_id = $2 THEN l.pdf_visitas ELSE NULL END AS pdf_visitas,
              l.biblioteca_id, b.nombre AS biblioteca_nombre,
              (l.pdf_archivo IS NOT NULL) AS tiene_pdf,
              NOT EXISTS (
                SELECT 1 FROM prestamos p
                WHERE p.libro_id = l.id AND p.fecha_devolucion IS NULL
              ) AS disponible
       FROM libros l
       JOIN bibliotecas b ON b.id = l.biblioteca_id
       WHERE ($2::integer IS NULL OR l.biblioteca_id = $2)
         AND lower(btrim(b.nombre)) <> 'biblioteca inicial'
         AND ($4::integer IS NULL OR l.biblioteca_id = $4)
         AND ($1 = '' OR unaccent(l.titulo) ILIKE unaccent($3)
           OR unaccent(l.autor) ILIKE unaccent($3)
           OR unaccent(COALESCE(l.editorial, '')) ILIKE unaccent($3)
           OR unaccent(COALESCE(l.tema, '')) ILIKE unaccent($3)
           OR unaccent(l.numero_tarjeta) ILIKE unaccent($3)
           OR unaccent(COALESCE(l.numero_inventario::text, '')) ILIKE unaccent($3)
           OR unaccent(b.nombre) ILIKE unaccent($3))
       ORDER BY l.titulo ASC, b.nombre ASC, l.id ASC
       LIMIT 200`,
      [q, bibliotecaId, `%${q}%`, bibliotecaFiltro]
    );
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
       WHERE id = $7 AND biblioteca_id = $8
       RETURNING id, titulo, autor, editorial, tema, numero_tarjeta, numero_inventario,
                 creado_en, (pdf_archivo IS NOT NULL) AS tiene_pdf`,
      [titulo, autor, editorial, tema, numero_tarjeta, numero_inventario, id, req.sesion.biblioteca.id]
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
      'DELETE FROM libros WHERE id = $1 AND biblioteca_id = $2 RETURNING id, pdf_archivo',
      [id, req.sesion.biblioteca.id]
    );
    if (resultado.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Ese libro ya no está en la lista.' });
    }
    if (resultado.rows[0].pdf_archivo) {
      borrarArchivo(path.join(CARPETA_PDFS, resultado.rows[0].pdf_archivo));
    }
    res.json({ ok: true });
  } catch (error) {
    if (error.code === '23503') {
      return res.status(409).json({
        ok: false,
        error: 'Este libro tiene préstamos registrados y no se puede borrar sin perder el historial.',
      });
    }
    console.error('Error al borrar el libro:', error);
    res.status(500).json({ ok: false, error: 'No se pudo borrar el libro. Probá de nuevo en un momento.' });
  }
});

// ---------------------------------------------------------------------------
// API de préstamos
// ---------------------------------------------------------------------------
app.get('/api/prestamos', exigirLogin, async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT p.id, p.libro_id, p.nombre, p.apellido, p.fecha_prestamo, p.fecha_limite,
              p.fecha_devolucion, p.registrado_por, p.devuelto_por, p.creado_en,
              l.titulo, l.autor, l.numero_tarjeta, l.numero_inventario
       FROM prestamos p
       JOIN libros l ON l.id = p.libro_id
       WHERE l.biblioteca_id = $1
       ORDER BY (p.fecha_devolucion IS NULL) DESC,
                COALESCE(p.fecha_devolucion, p.fecha_prestamo) DESC, p.id DESC
       LIMIT 1000`,
      [req.sesion.biblioteca.id]
    );
    res.json({ ok: true, prestamos: resultado.rows });
  } catch (error) {
    console.error('Error al listar préstamos:', error);
    res.status(500).json({ ok: false, error: 'No se pudieron cargar los préstamos.' });
  }
});

app.get('/api/prestamos/vencidos', exigirLogin, async (req, res) => {
  const hoy = comoTexto(req.query.hoy);
  if (!esFechaISO(hoy)) {
    return res.status(400).json({ ok: false, error: 'La fecha local no es válida.' });
  }

  try {
    const resultado = await pool.query(
      `SELECT p.id, p.libro_id, p.nombre, p.apellido, p.fecha_prestamo, p.fecha_limite,
              l.titulo, l.autor, l.numero_tarjeta, l.numero_inventario
       FROM prestamos p
       JOIN libros l ON l.id = p.libro_id
       WHERE p.fecha_devolucion IS NULL AND p.fecha_limite < $1::date AND l.biblioteca_id = $2
       ORDER BY p.fecha_limite ASC, l.titulo ASC`,
      [hoy, req.sesion.biblioteca.id]
    );
    res.json({ ok: true, prestamos: resultado.rows });
  } catch (error) {
    console.error('Error al buscar préstamos vencidos:', error);
    res.status(500).json({ ok: false, error: 'No se pudieron revisar los préstamos vencidos.' });
  }
});

app.post('/api/prestamos', exigirLogin, async (req, res) => {
  const validacion = validarPrestamo(req.body || {});
  if (validacion.error) {
    return res.status(400).json({ ok: false, error: validacion.error });
  }

  const { libro_id, nombre, apellido, fecha_prestamo, fecha_limite } = validacion.datos;
  let cliente;

  try {
    cliente = await pool.connect();
    await cliente.query('BEGIN');

    const libro = await cliente.query(
      'SELECT id, titulo FROM libros WHERE id = $1 AND biblioteca_id = $2 FOR UPDATE',
      [libro_id, req.sesion.biblioteca.id]
    );
    if (libro.rowCount === 0) {
      await cliente.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'Ese libro ya no existe.' });
    }

    const activo = await cliente.query(
      'SELECT id FROM prestamos WHERE libro_id = $1 AND fecha_devolucion IS NULL LIMIT 1',
      [libro_id]
    );
    if (activo.rowCount > 0) {
      await cliente.query('ROLLBACK');
      return res.status(409).json({ ok: false, error: 'Ese libro ya está prestado y figura como no disponible.' });
    }

    const resultado = await cliente.query(
      `INSERT INTO prestamos
         (libro_id, nombre, apellido, fecha_prestamo, fecha_limite, registrado_por)
       VALUES ($1, $2, $3, $4::date, $5::date, $6)
       RETURNING id, libro_id, nombre, apellido, fecha_prestamo, fecha_limite,
                 fecha_devolucion, registrado_por, creado_en`,
      [libro_id, nombre, apellido, fecha_prestamo, fecha_limite, req.sesion.usuario]
    );

    await cliente.query('COMMIT');
    res.status(201).json({
      ok: true,
      prestamo: { ...resultado.rows[0], titulo: libro.rows[0].titulo },
    });
  } catch (error) {
    if (cliente) await cliente.query('ROLLBACK').catch(() => {});
    if (error.code === '23505') {
      return res.status(409).json({ ok: false, error: 'Ese libro ya está prestado y figura como no disponible.' });
    }
    console.error('Error al registrar préstamo:', error);
    res.status(500).json({ ok: false, error: 'No se pudo registrar el préstamo.' });
  } finally {
    if (cliente) cliente.release();
  }
});

app.post('/api/prestamos/:id/devolver', exigirLogin, async (req, res) => {
  const id = Number(req.params.id);
  const fechaDevolucion = comoTexto(req.body?.fecha_devolucion);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ ok: false, error: 'Ese préstamo no existe.' });
  }
  if (!esFechaISO(fechaDevolucion)) {
    return res.status(400).json({ ok: false, error: 'La fecha de devolución no es válida.' });
  }

  try {
    const actual = await pool.query(
      `SELECT fecha_devolucion,
              ($2::date < fecha_prestamo) AS devolucion_anterior
       FROM prestamos
       WHERE id = $1 AND libro_id IN (SELECT id FROM libros WHERE biblioteca_id = $3)`,
      [id, fechaDevolucion, req.sesion.biblioteca.id]
    );
    if (actual.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Ese préstamo ya no existe.' });
    }
    if (actual.rows[0].fecha_devolucion) {
      return res.status(409).json({ ok: false, error: 'Ese libro ya figura como devuelto.' });
    }
    // La comparación se hace en PostgreSQL como DATE contra DATE. Evita que
    // zonas horarias o la representación de Date de Node cambien el día.
    if (actual.rows[0].devolucion_anterior) {
      return res.status(400).json({ ok: false, error: 'La devolución no puede ser anterior al préstamo.' });
    }

    const resultado = await pool.query(
      `UPDATE prestamos
       SET fecha_devolucion = $1::date, devuelto_por = $2
       WHERE id = $3 AND fecha_devolucion IS NULL
         AND libro_id IN (SELECT id FROM libros WHERE biblioteca_id = $4)
       RETURNING id, libro_id, fecha_devolucion, devuelto_por`,
      [fechaDevolucion, req.sesion.usuario, id, req.sesion.biblioteca.id]
    );

    if (resultado.rowCount === 0) {
      return res.status(409).json({ ok: false, error: 'Ese libro ya figura como devuelto.' });
    }

    res.json({ ok: true, prestamo: resultado.rows[0] });
  } catch (error) {
    console.error('Error al devolver libro:', error);
    res.status(500).json({ ok: false, error: 'No se pudo registrar la devolución.' });
  }
});

async function exigirLibroPropio(req, res, next) {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ ok: false, error: 'Ese libro no existe.' });
  try {
    const resultado = await pool.query('SELECT id FROM libros WHERE id = $1 AND biblioteca_id = $2', [id, req.sesion.biblioteca.id]);
    if (!resultado.rowCount) return res.status(404).json({ ok: false, error: 'Ese libro no pertenece a tu biblioteca.' });
    return next();
  } catch (error) {
    console.error('Error al consultar el libro:', error);
    return res.status(500).json({ ok: false, error: 'No se pudo consultar el libro.' });
  }
}

app.post('/api/libros/:id/pdf', exigirLogin, exigirLibroPropio, limitadorSubidas, (req, res) => {
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
      const anterior = await pool.query('SELECT pdf_archivo FROM libros WHERE id = $1 AND biblioteca_id = $2', [id, req.sesion.biblioteca.id]);
      if (anterior.rows.length === 0) {
        borrarArchivo(req.file.path);
        return res.status(404).json({ ok: false, error: 'Ese libro ya no está en la lista.' });
      }

      await pool.query('UPDATE libros SET pdf_archivo = $1 WHERE id = $2 AND biblioteca_id = $3', [req.file.filename, id, req.sesion.biblioteca.id]);
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

    // Cada apertura correcta del PDF cuenta como una visita. El incremento se hace
    // en PostgreSQL para que varias aperturas simultáneas no se pisen entre sí.
    await pool.query(
      'UPDATE libros SET pdf_visitas = pdf_visitas + 1 WHERE id = $1',
      [id]
    );

    const nombreLegible = titulo
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s-]/g, '')
      .trim() || 'libro';

    // Evita que una reapertura quede resuelta solo desde la caché del navegador:
    // queremos que cada entrada vuelva a pasar por esta ruta y sume una visita.
    res.setHeader('Cache-Control', 'no-store');
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
    const resultado = await pool.query('SELECT pdf_archivo FROM libros WHERE id = $1 AND biblioteca_id = $2', [id, req.sesion.biblioteca.id]);
    if (resultado.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Ese libro ya no está en la lista.' });
    }

    const pdfActual = resultado.rows[0].pdf_archivo;
    if (!pdfActual) return res.json({ ok: true });

    await pool.query('UPDATE libros SET pdf_archivo = NULL WHERE id = $1 AND biblioteca_id = $2', [id, req.sesion.biblioteca.id]);
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

if (require.main === module) {
  inicializarBibliotecas().then(() => {
    app.listen(PUERTO, '0.0.0.0', () => {
      if (Object.keys(CUENTAS).length === 0) {
        console.warn('ADVERTENCIA: no hay cuentas configuradas en BIBLIN_USERS. Biblin funcionará en modo Solo lector hasta configurarlas.');
      }
      console.log(`Biblioteca escuchando en el puerto ${PUERTO}`);
    });
  }).catch(async (error) => {
    console.error('No se pudieron preparar las bibliotecas:', error.message);
    await pool.end();
    process.exitCode = 1;
  });
}

module.exports = app;
module.exports.inicializarBibliotecas = inicializarBibliotecas;
