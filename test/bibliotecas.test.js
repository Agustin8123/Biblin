const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { unaccent } = require('@electric-sql/pglite/contrib/unaccent');

const leer = (archivo) => fs.readFileSync(path.join(__dirname, '..', archivo), 'utf8');
let db, server, base, cuentaA, cuentaB, libroA, libroB;
const libro = { titulo: 'El principito', autor: 'Antoine', tema: 'Literatura', numero_tarjeta: 'L-1', numero_inventario: '1' };
const prestamo = { nombre: 'Persona', apellido: 'Lectora', fecha_prestamo: '2026-09-01', fecha_limite: '2026-09-08' };

async function pedir(ruta, cookie, method = 'GET', body) {
  const response = await fetch(base + ruta, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, datos: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
}

before(async () => {
  db = new PGlite({ extensions: { unaccent } });
  await db.exec(leer('db/schema.sql'));
  await db.exec("UPDATE bibliotecas SET nombre = 'Escuela Martín' WHERE id = 1; INSERT INTO bibliotecas (nombre) VALUES ('Escuela Belgrano');");
  // Ejecutamos las consultas reales de la API en PostgreSQL en memoria.
  // Solo reemplazamos el transporte pg; no se toca DATABASE_URL.
  const pool = {
    async query(sql, params) {
      const resultado = await db.query(sql, params);
      return { rows: resultado.rows, rowCount: resultado.rows.length || resultado.affectedRows || 0 };
    },
    async connect() { return { query: pool.query, release() {} }; },
  };
  require.cache[require.resolve('../db')] = { exports: pool };
  process.env.BIBLIN_USERS = JSON.stringify({ a: { clave: 'test-a', biblioteca_id: 1 }, b: { clave: 'test-b', biblioteca_id: 2 }, antigua: 'test-antigua', sinBiblioteca: { clave: 'test', biblioteca_id: 999 } });
  const app = require('../server');
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  cuentaA = (await pedir('/api/auth/login', null, 'POST', { usuario: 'a', clave: 'test-a' })).cookie;
  cuentaB = (await pedir('/api/auth/login', null, 'POST', { usuario: 'b', clave: 'test-b' })).cookie;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (db) await db.close();
});

test('sesiones vinculadas a escuelas y compatibilidad de cuentas antiguas', async () => {
  assert.equal((await pedir('/api/auth/estado', cuentaA)).datos.biblioteca.id, 1);
  assert.equal((await pedir('/api/auth/estado', cuentaB)).datos.biblioteca.nombre, 'Escuela Belgrano');
  assert.equal((await pedir('/api/auth/login', null, 'POST', { usuario: 'antigua', clave: 'test-antigua' })).datos.biblioteca.id, 1);
  assert.equal((await pedir('/api/auth/login', null, 'POST', { usuario: 'sinBiblioteca', clave: 'test' })).status, 503);
  assert.equal((await pedir('/api/auth/login', null, 'POST', { usuario: 'a', clave: 'incorrecta' })).status, 401);
});

test('cada cuenta crea en su biblioteca y los tejuelos pueden coincidir entre escuelas', async () => {
  const a = await pedir('/api/libros', cuentaA, 'POST', { ...libro, biblioteca_id: 2 });
  const b = await pedir('/api/libros', cuentaB, 'POST', libro);
  assert.equal(a.status, 201);
  assert.equal(b.status, 201);
  libroA = a.datos.libro.id;
  libroB = b.datos.libro.id;
  assert.equal((await pedir('/api/libros', cuentaA, 'POST', libro)).status, 409);
  const rows = (await db.query('SELECT biblioteca_id FROM libros ORDER BY id')).rows;
  assert.deepEqual(rows.map((r) => r.biblioteca_id), [1, 2]);
});

test('gestión e inventario por escuela; catálogo público compartido sin datos privados', async () => {
  await db.query('UPDATE libros SET numero_inventario = 42, pdf_visitas = 8 WHERE id = $1', [libroB]);
  assert.equal((await pedir('/api/libros/siguiente-inventario', cuentaA)).datos.siguiente, '2');
  assert.equal((await pedir('/api/libros/siguiente-inventario', cuentaB)).datos.siguiente, '43');
  for (const [cookie, id] of [[cuentaA, libroA], [cuentaB, libroB]]) {
    const propios = (await pedir('/api/libros/buscar', cookie)).datos.libros;
    assert.deepEqual(propios.map((l) => l.id), [id]);
  }
  for (const cookie of [null, cuentaA]) {
    const publicos = (await pedir('/api/libros/buscar?catalogo=publico', cookie)).datos.libros;
    assert.equal(publicos.length, 2);
    assert.ok(publicos.every((l) => l.biblioteca_nombre && l.disponible && l.pdf_visitas === null));
    assert.ok(publicos.every((l) => !('nombre' in l) && !('apellido' in l)));
  }
  assert.equal((await pedir('/api/libros/buscar?q=martin')).datos.libros[0].id, libroA);
  assert.equal((await pedir('/api/libros/buscar?catalogo=gestion')).status, 401);
});

test('selector público de escuelas y filtro combinado con búsqueda sin ampliar permisos', async () => {
  const escuelas = await pedir('/api/bibliotecas');
  assert.equal(escuelas.status, 200);
  assert.deepEqual(escuelas.datos.bibliotecas, [{ id: 2, nombre: 'Escuela Belgrano' }, { id: 1, nombre: 'Escuela Martín' }]);
  for (const cookie of [null, cuentaA]) {
    const filtrados = await pedir('/api/libros/buscar?catalogo=publico&biblioteca_id=2&q=principito', cookie);
    assert.deepEqual(filtrados.datos.libros.map((l) => l.id), [libroB]);
  }
  assert.equal((await pedir('/api/libros/buscar?catalogo=publico&biblioteca_id=2&q=inexistente')).datos.libros.length, 0);
  assert.equal((await pedir('/api/libros/buscar?catalogo=gestion&biblioteca_id=2', cuentaA)).datos.libros.length, 0);
  assert.equal((await pedir('/api/libros/buscar?biblioteca_id=999')).datos.libros.length, 0);
  for (const invalido of ['0', '-1', 'abc', '1.5', '1&biblioteca_id=2']) {
    assert.equal((await pedir(`/api/libros/buscar?biblioteca_id=${invalido}`)).status, 400);
  }
});

test('no se permite editar, eliminar ni cargar o quitar PDFs de otra biblioteca', async () => {
  for (const [cookie, ajeno] of [[cuentaA, libroB], [cuentaB, libroA]]) {
    assert.equal((await pedir(`/api/libros/${ajeno}`, cookie, 'PUT', { ...libro, titulo: 'Cambio ajeno' })).status, 404);
    assert.equal((await pedir(`/api/libros/${ajeno}`, cookie, 'DELETE')).status, 404);
    assert.equal((await pedir(`/api/libros/${ajeno}/pdf`, cookie, 'POST')).status, 404);
    assert.equal((await pedir(`/api/libros/${ajeno}/pdf`, cookie, 'DELETE')).status, 404);
  }
  assert.equal((await pedir(`/api/libros/${libroA}`, cuentaA, 'PUT', { ...libro, biblioteca_id: 2 })).status, 200);
  assert.equal((await pedir(`/api/libros/${libroA}`, null, 'DELETE')).status, 401);
});

test('préstamos, devoluciones, historial y vencidos aislados; disponibilidad pública actualizada', async () => {
  assert.equal((await pedir('/api/prestamos', cuentaA, 'POST', { ...prestamo, libro_id: libroB })).status, 404);
  assert.equal((await pedir('/api/prestamos', cuentaB, 'POST', { ...prestamo, libro_id: libroA })).status, 404);
  const a = await pedir('/api/prestamos', cuentaA, 'POST', { ...prestamo, libro_id: libroA });
  const b = await pedir('/api/prestamos', cuentaB, 'POST', { ...prestamo, libro_id: libroB });
  assert.equal(a.status, 201);
  assert.equal(b.status, 201);
  assert.ok((await pedir('/api/libros/buscar')).datos.libros.every((l) => l.disponible === false));
  for (const [cookie, id] of [[cuentaA, libroA], [cuentaB, libroB]]) {
    for (const ruta of ['/api/prestamos', '/api/prestamos/vencidos?hoy=2026-09-21']) {
      assert.deepEqual((await pedir(ruta, cookie)).datos.prestamos.map((p) => p.libro_id), [id]);
      assert.equal((await pedir(ruta)).status, 401);
    }
  }
  const devolver = `/api/prestamos/${b.datos.prestamo.id}/devolver`;
  assert.equal((await pedir(devolver, cuentaA, 'POST', { fecha_devolucion: '2026-09-21' })).status, 404);
  assert.equal((await pedir(devolver, cuentaB, 'POST', { fecha_devolucion: '2026-09-21' })).status, 200);
  assert.equal((await pedir('/api/libros/buscar', cuentaB)).datos.libros[0].disponible, true);
  assert.ok((await pedir('/api/prestamos', cuentaB)).datos.prestamos[0].fecha_devolucion);
});

test('PDF público de otra escuela y gestión del archivo solo por su cuenta', async () => {
  const form = new FormData();
  form.append('pdf', new Blob(['%PDF-1.4\n%%EOF'], { type: 'application/pdf' }), 'test.pdf');
  const subida = await fetch(`${base}/api/libros/${libroB}/pdf`, { method: 'POST', headers: { cookie: cuentaB }, body: form });
  assert.equal(subida.status, 200);
  try {
    const lectura = await fetch(`${base}/api/libros/${libroB}/pdf`);
    assert.equal(lectura.status, 200);
    assert.match(await lectura.text(), /^%PDF-/);
    assert.equal((await pedir(`/api/libros/${libroB}/pdf`, cuentaA, 'DELETE')).status, 404);
  } finally {
    assert.equal((await pedir(`/api/libros/${libroB}/pdf`, cuentaB, 'DELETE')).status, 200);
  }
});

test('migración repetible preserva libros, préstamos y PDFs anteriores', async () => {
  const anterior = new PGlite({ extensions: { unaccent } });
  try {
    const esquema = leer('db/schema.sql');
    await anterior.exec(esquema.slice(0, esquema.indexOf('-- Separación de bibliotecas')));
    await anterior.exec("INSERT INTO libros (titulo, autor, numero_tarjeta, pdf_archivo, pdf_visitas) VALUES ('Anterior', 'Autor', 'A-1', 'archivo.pdf', 5);");
    await anterior.exec("INSERT INTO prestamos (libro_id, nombre, apellido, fecha_prestamo, fecha_limite) VALUES (1, 'Nombre', 'Apellido', '2026-09-01', '2026-09-08');");
    await anterior.exec(leer('db/migracion-bibliotecas.sql'));
    await anterior.exec(leer('db/migracion-bibliotecas.sql'));
    const row = (await anterior.query('SELECT * FROM libros')).rows[0];
    assert.equal(row.biblioteca_id, 1);
    assert.equal(row.pdf_archivo, 'archivo.pdf');
    assert.equal(Number(row.pdf_visitas), 5);
    assert.equal((await anterior.query('SELECT * FROM prestamos')).rows[0].libro_id, row.id);
    const nueva = (await anterior.query("INSERT INTO bibliotecas (nombre) VALUES ('Otra') RETURNING id")).rows[0];
    assert.equal(nueva.id, 2);
    await anterior.exec(leer('db/schema.sql'));
    assert.equal((await anterior.query('SELECT COUNT(*)::int AS cantidad FROM bibliotecas')).rows[0].cantidad, 2);
  } finally { await anterior.close(); }
});
