const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const leer = (archivo) => fs.readFileSync(path.join(__dirname, '..', archivo), 'utf8');

test('la cuenta identifica su biblioteca y puede consultar el catálogo sin acciones de gestión', async () => {
  const dom = new JSDOM(leer('public/index.html'), { runScripts: 'outside-only', url: 'http://localhost' });
  const { window } = dom;
  const requests = [];
  let retrasarBusqueda = false;
  let resolverBusqueda;
  const biblioteca = { id: 1, nombre: 'Escuela Martín' };
  const libros = [
    { id: 1, titulo: 'Disponible', autor: 'Autor', biblioteca_nombre: 'Escuela Martín', disponible: true },
    { id: 2, titulo: 'Prestado', autor: 'Autor', biblioteca_nombre: 'Escuela Belgrano', disponible: false, tiene_pdf: true },
  ];
  window.scrollTo = () => {};
  window.fetch = async (url) => {
    requests.push(url);
    const datos = url === '/api/auth/estado'
      ? { autenticado: true, usuario: 'mi_cuenta', biblioteca }
      : url.startsWith('/api/prestamos/vencidos') ? { ok: true, prestamos: [] }
      : url === '/api/bibliotecas' ? { ok: true, bibliotecas: [biblioteca, { id: 2, nombre: 'Escuela Belgrano' }] }
      : url.includes('biblioteca_id=2') ? { ok: true, libros: [libros[1]] }
      : { ok: true, libros: url.includes('catalogo=publico') ? libros : [libros[0]] };
    if (retrasarBusqueda && url.startsWith('/api/libros/buscar')) {
      retrasarBusqueda = false;
      await new Promise((resolve) => { resolverBusqueda = resolve; });
    }
    return { ok: true, status: 200, json: async () => datos };
  };
  try {
    window.eval(leer('public/script.js'));
    const esperar = () => new Promise((resolve) => setImmediate(resolve));
    await esperar();
    assert.equal(window.document.getElementById('texto-sesion').textContent, 'Biblioteca: Escuela Martín');
    window.document.getElementById('btn-catalogo-publico').click();
    await esperar();
    assert.equal(window.document.querySelectorAll('#resultados .ficha-libro').length, 2);
    assert.match(window.document.getElementById('resultados').textContent, /Escuela Belgrano/);
    assert.equal(window.document.querySelectorAll('#resultados .estado-disponibilidad').length, 2);
    assert.match(window.document.getElementById('resultados').textContent, /Prestado · No disponible/);
    assert.equal(window.document.querySelectorAll('#resultados .zona-gestion, #resultados .selector-libro, #resultados .visitas-pdf').length, 0);
    assert.equal(window.document.querySelectorAll('#resultados .boton-ver-pdf').length, 1);
    const filtro = window.document.getElementById('filtro-biblioteca');
    assert.equal(filtro.options.length, 3);
    assert.equal(filtro.options[2].textContent, 'Escuela Belgrano');
    window.document.getElementById('campo-busqueda').value = 'principito';
    filtro.value = '2';
    filtro.dispatchEvent(new window.Event('change'));
    await esperar();
    assert.equal(window.document.querySelectorAll('#resultados .ficha-libro').length, 1);
    assert.match(window.document.getElementById('resultados').textContent, /Escuela Belgrano/);
    assert.ok(requests.some((r) => r.includes('q=principito') && r.includes('biblioteca_id=2')));
    // Una respuesta lenta del filtro anterior no debe reemplazar la selección nueva.
    retrasarBusqueda = true;
    filtro.dispatchEvent(new window.Event('change'));
    filtro.value = '';
    filtro.dispatchEvent(new window.Event('change'));
    await esperar();
    resolverBusqueda();
    await esperar();
    assert.equal(window.document.querySelectorAll('#resultados .ficha-libro').length, 2);
    window.document.getElementById('btn-ir-buscar-admin').click();
    await esperar();
    assert.equal(window.document.querySelectorAll('#resultados .ficha-libro').length, 1);
    assert.equal(window.document.querySelectorAll('#resultados .zona-gestion').length, 1);
    assert.ok(window.document.getElementById('filtro-biblioteca-contenedor').classList.contains('oculta'));
    assert.ok(requests.some((r) => r.includes('catalogo=gestion')));
    assert.ok(requests.some((r) => r.includes('catalogo=publico')));
  } finally { window.close(); }
});
