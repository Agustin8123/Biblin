const ICONO_EXITO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><polyline points="7.5 12.5 10.5 15.5 16.5 9"/></svg>';
const ICONO_ERROR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><line x1="12" y1="7.5" x2="12" y2="13"/><circle cx="12" cy="16.5" r="0.75" fill="currentColor" stroke="none"/></svg>';
const ICONO_BASURA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/></svg>';
const ICONO_DOCUMENTO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M14 3v5h5"/></svg>';
const ICONO_SUBIR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg>';
const ICONO_LAPIZ = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
const ICONO_PRESTAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h11a3 3 0 0 1 3 3v9"/><path d="M4 6v12h11"/><path d="M18 12h4"/><path d="M20 10l2 2-2 2"/></svg>';
const ICONO_IMPRIMIR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9V3h12v6"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v7H6z"/><circle cx="18" cy="12" r="1" fill="currentColor" stroke="none"/></svg>';

const pantallas = {
  inicio: document.getElementById('pantalla-inicio'),
  login: document.getElementById('pantalla-login'),
  agregar: document.getElementById('pantalla-agregar'),
  buscar: document.getElementById('pantalla-buscar'),
  prestar: document.getElementById('pantalla-prestar'),
  prestamos: document.getElementById('pantalla-prestamos'),
};

let sesion = {
  autenticado: false,
  usuario: null,
};

let modoLector = true;
let libroEditandoId = null;
let librosActuales = [];
let vencidosRevisados = false;

function mostrarPantalla(nombre) {
  Object.values(pantallas).forEach((p) => p.classList.add('oculta'));
  pantallas[nombre].classList.remove('oculta');
  window.scrollTo(0, 0);
}

function mostrarMensaje(elemento, tipo, texto) {
  elemento.innerHTML = '';
  const icono = document.createElement('span');
  icono.className = 'icono-mensaje';
  icono.innerHTML = tipo === 'exito' ? ICONO_EXITO : ICONO_ERROR;

  const span = document.createElement('span');
  span.textContent = texto;

  elemento.appendChild(icono);
  elemento.appendChild(span);
  elemento.className = `mensaje ${tipo}`;
}

function ocultarMensaje(elemento) {
  elemento.className = 'mensaje oculta';
  elemento.innerHTML = '';
}

async function actualizarEstadoSesion() {
  try {
    const respuesta = await fetch('/api/auth/estado', { cache: 'no-store' });
    const datos = await respuesta.json();
    sesion = {
      autenticado: Boolean(datos.autenticado),
      usuario: datos.usuario || null,
      biblioteca: datos.biblioteca || null,
    };
  } catch (error) {
    sesion = { autenticado: false, usuario: null };
  }
  actualizarInicio();
  if (sesion.autenticado) verificarPrestamosVencidos();
}

function actualizarInicio() {
  const inicioPublico = document.getElementById('inicio-publico');
  const inicioAdmin = document.getElementById('inicio-admin');
  const barraSesion = document.getElementById('barra-sesion');
  const textoSesion = document.getElementById('texto-sesion');

  if (sesion.autenticado) {
    inicioPublico.classList.add('oculta');
    inicioAdmin.classList.remove('oculta');
    barraSesion.classList.remove('oculta');
    textoSesion.textContent = `Biblioteca: ${sesion.biblioteca?.nombre || sesion.usuario}`;
  } else {
    inicioPublico.classList.remove('oculta');
    inicioAdmin.classList.add('oculta');
    barraSesion.classList.add('oculta');
    textoSesion.textContent = '';
  }
}

function irABuscar(lector = !sesion.autenticado) {
  modoLector = lector || !sesion.autenticado;
  document.querySelector('#pantalla-buscar h2').textContent = modoLector ? 'Catálogo de todas las bibliotecas' : 'Buscar en mi biblioteca';
  document.getElementById('indicador-lector').classList.toggle('oculta', !modoLector);
  document.getElementById('filtro-biblioteca-contenedor').classList.toggle('oculta', !modoLector);
  filtroBiblioteca.value = '';
  if (modoLector) cargarBibliotecas();
  mostrarPantalla('buscar');
  campoBusqueda.value = '';
  buscarLibros('');
  campoBusqueda.focus();
}

// =====================================================================
// INICIO / SESIÓN
// =====================================================================

document.getElementById('btn-solo-lector').addEventListener('click', () => irABuscar(true));
document.getElementById('btn-catalogo-publico').addEventListener('click', () => irABuscar(true));

document.getElementById('btn-ir-login').addEventListener('click', () => {
  mostrarPantalla('login');
  ocultarMensaje(mensajeLogin);
  campoUsuario.focus();
});

document.getElementById('btn-ir-agregar').addEventListener('click', () => {
  if (!sesion.autenticado) {
    mostrarPantalla('login');
    campoUsuario.focus();
    return;
  }
  modoLector = false;
  libroEditandoId = null;
  document.querySelector('#pantalla-agregar h2').textContent = 'Agregar un libro';
  botonGuardar.textContent = 'Guardar libro';
  document.querySelector('#pantalla-agregar [data-volver]').dataset.volver = 'inicio';
  mostrarPantalla('agregar');
  prepararFormularioAgregar();
});

document.getElementById('btn-ir-buscar-admin').addEventListener('click', () => irABuscar(false));

document.getElementById('btn-ir-prestar').addEventListener('click', () => abrirPantallaPrestar());
document.getElementById('btn-ir-prestamos').addEventListener('click', () => abrirPantallaPrestamos());

document.getElementById('btn-cerrar-sesion').addEventListener('click', cerrarSesion);

document.querySelectorAll('[data-volver]').forEach((boton) => {
  boton.addEventListener('click', () => {
    const destino = boton.dataset.volver || 'inicio';
    mostrarPantalla(destino);
    if (destino === 'inicio') actualizarInicio();
    if (destino === 'buscar') buscarLibros(campoBusqueda.value.trim());
  });
});

const formLogin = document.getElementById('form-login');
const mensajeLogin = document.getElementById('mensaje-login');
const campoUsuario = document.getElementById('campo-usuario');
const campoClave = document.getElementById('campo-clave');
const botonLogin = formLogin.querySelector('button[type="submit"]');

formLogin.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  if (!formLogin.reportValidity()) return;

  botonLogin.disabled = true;
  botonLogin.textContent = 'Entrando…';
  ocultarMensaje(mensajeLogin);

  try {
    const respuesta = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: campoUsuario.value.trim(), clave: campoClave.value }),
    });
    const datos = await respuesta.json();

    if (!respuesta.ok || !datos.ok) {
      mostrarMensaje(mensajeLogin, 'error', datos.error || 'Usuario o contraseña incorrectos.');
      return;
    }

    campoClave.value = '';
    sesion = { autenticado: true, usuario: datos.usuario, biblioteca: datos.biblioteca };
    modoLector = false;
    actualizarInicio();
    mostrarPantalla('inicio');
    vencidosRevisados = false;
    verificarPrestamosVencidos();
  } catch (error) {
    mostrarMensaje(mensajeLogin, 'error', 'No hay conexión con el servidor. Revisá internet e intentá de nuevo.');
  } finally {
    botonLogin.disabled = false;
    botonLogin.textContent = 'Entrar';
  }
});

async function cerrarSesion() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch (error) {
    // El servidor igualmente puede haber cerrado la sesión aunque falle la respuesta.
  }
  sesion = { autenticado: false, usuario: null };
  modoLector = true;
  vencidosRevisados = false;
  actualizarInicio();
  mostrarPantalla('inicio');
}

// =====================================================================
// PRÉSTAMOS Y DEVOLUCIONES
// =====================================================================
const formBuscarPrestamo = document.getElementById('form-buscar-prestamo');
const campoBusquedaPrestamo = document.getElementById('campo-busqueda-prestamo');
const resultadosPrestamo = document.getElementById('resultados-prestamo');
const formPrestamo = document.getElementById('form-prestamo');
const prestamoLibroId = document.getElementById('prestamo-libro-id');
const prestamoNombre = document.getElementById('prestamo-nombre');
const prestamoApellido = document.getElementById('prestamo-apellido');
const prestamoFecha = document.getElementById('prestamo-fecha');
const prestamoLimite = document.getElementById('prestamo-limite');
const libroPrestamoSeleccionado = document.getElementById('libro-prestamo-seleccionado');
const mensajePrestamo = document.getElementById('mensaje-prestamo');
const prestamosActivos = document.getElementById('prestamos-activos');
const historialPrestamos = document.getElementById('historial-prestamos');
const botonActualizarPrestamos = document.getElementById('btn-actualizar-prestamos');
const modalVencidos = document.getElementById('modal-vencidos');
const resumenVencidos = document.getElementById('resumen-vencidos');
const listaVencidosModal = document.getElementById('lista-vencidos-modal');
const botonCerrarVencidos = document.getElementById('btn-cerrar-vencidos');

function fechaLocalISO(fecha = new Date()) {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

function fechaDesdeISO(iso) {
  const [anio, mes, dia] = String(iso).split('-').map(Number);
  return new Date(anio, mes - 1, dia, 12, 0, 0, 0);
}

function fechaLimitePorDefecto(fechaPrestamoISO) {
  const fecha = fechaDesdeISO(fechaPrestamoISO);
  fecha.setDate(fecha.getDate() + 7);
  if (fecha.getDay() === 6) fecha.setDate(fecha.getDate() + 2);
  if (fecha.getDay() === 0) fecha.setDate(fecha.getDate() + 1);
  return fechaLocalISO(fecha);
}

function formatearFecha(iso) {
  if (!iso) return '—';
  const fecha = fechaDesdeISO(String(iso).slice(0, 10));
  return fecha.toLocaleDateString('es-AR');
}

function prepararFechasPrestamo() {
  const hoy = fechaLocalISO();
  prestamoFecha.value = hoy;
  prestamoLimite.value = fechaLimitePorDefecto(hoy);
}

prestamoFecha.addEventListener('change', () => {
  if (prestamoFecha.value) {
    prestamoLimite.value = fechaLimitePorDefecto(prestamoFecha.value);
  }
});

formBuscarPrestamo.addEventListener('submit', (evento) => {
  evento.preventDefault();
  buscarLibrosParaPrestamo(campoBusquedaPrestamo.value.trim());
});

botonActualizarPrestamos.addEventListener('click', cargarPrestamos);
botonCerrarVencidos.addEventListener('click', () => modalVencidos.classList.add('oculta'));

function asegurarSesionAdministrativa() {
  if (sesion.autenticado) return true;
  mostrarPantalla('login');
  campoUsuario.focus();
  return false;
}

function abrirPantallaPrestar(libro = null) {
  if (!asegurarSesionAdministrativa()) return;
  modoLector = false;
  ocultarMensaje(mensajePrestamo);
  formPrestamo.classList.add('oculta');
  prestamoLibroId.value = '';
  libroPrestamoSeleccionado.innerHTML = '';
  campoBusquedaPrestamo.value = '';
  mostrarPantalla('prestar');

  if (libro) {
    seleccionarLibroPrestamo(libro);
    resultadosPrestamo.innerHTML = '';
  } else {
    buscarLibrosParaPrestamo('');
    campoBusquedaPrestamo.focus();
  }
}

function abrirPantallaPrestamos() {
  if (!asegurarSesionAdministrativa()) return;
  modoLector = false;
  mostrarPantalla('prestamos');
  cargarPrestamos();
}

async function buscarLibrosParaPrestamo(texto) {
  resultadosPrestamo.innerHTML = '<p class="estado-vacio">Buscando…</p>';
  try {
    const respuesta = await fetch(`/api/libros/buscar?q=${encodeURIComponent(texto)}&catalogo=gestion`, { cache: 'no-store' });
    const datos = await respuesta.json();
    if (respuesta.status === 401) {
      sesion = { autenticado: false, usuario: null };
      actualizarInicio();
      mostrarPantalla('login');
      return;
    }
    if (!datos.ok) {
      resultadosPrestamo.innerHTML = `<p class="estado-vacio">${datos.error || 'No se pudo buscar.'}</p>`;
      return;
    }
    pintarLibrosParaPrestamo(datos.libros || []);
  } catch (error) {
    resultadosPrestamo.innerHTML = '<p class="estado-vacio">No hay conexión con el servidor.</p>';
  }
}

function pintarLibrosParaPrestamo(libros) {
  resultadosPrestamo.innerHTML = '';
  if (libros.length === 0) {
    resultadosPrestamo.innerHTML = '<p class="estado-vacio">No encontramos ningún libro.</p>';
    return;
  }

  libros.forEach((libro) => {
    const ficha = document.createElement('article');
    ficha.className = 'ficha-libro ficha-prestamo';

    const titulo = document.createElement('h3');
    titulo.textContent = libro.titulo;
    ficha.appendChild(titulo);

    const datos = document.createElement('p');
    datos.textContent = `${libro.autor} · Tejuelo: ${libro.numero_tarjeta}${libro.numero_inventario ? ` · Inv.: ${libro.numero_inventario}` : ''}`;
    ficha.appendChild(datos);

    const estado = document.createElement('span');
    estado.className = `estado-disponibilidad ${libro.disponible ? 'disponible' : 'no-disponible'}`;
    estado.textContent = libro.disponible ? 'Disponible' : 'Prestado · No disponible';
    ficha.appendChild(estado);

    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'boton-elegir-prestamo';
    boton.textContent = libro.disponible ? 'Elegir este libro' : 'No disponible';
    boton.disabled = !libro.disponible;
    if (libro.disponible) boton.addEventListener('click', () => seleccionarLibroPrestamo(libro));
    ficha.appendChild(boton);

    resultadosPrestamo.appendChild(ficha);
  });
}

function seleccionarLibroPrestamo(libro) {
  if (!libro || libro.disponible === false) return;
  prestamoLibroId.value = String(libro.id);
  libroPrestamoSeleccionado.innerHTML = '';

  const titulo = document.createElement('strong');
  titulo.textContent = libro.titulo;
  const detalle = document.createElement('span');
  detalle.textContent = `${libro.autor} · Tejuelo ${libro.numero_tarjeta}${libro.numero_inventario ? ` · Inventario ${libro.numero_inventario}` : ''}`;
  libroPrestamoSeleccionado.appendChild(titulo);
  libroPrestamoSeleccionado.appendChild(detalle);

  prestamoNombre.value = '';
  prestamoApellido.value = '';
  prepararFechasPrestamo();
  ocultarMensaje(mensajePrestamo);
  formPrestamo.classList.remove('oculta');
  prestamoNombre.focus();
  formPrestamo.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

formPrestamo.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  if (!formPrestamo.reportValidity()) return;

  const cuerpo = {
    libro_id: Number(prestamoLibroId.value),
    nombre: prestamoNombre.value,
    apellido: prestamoApellido.value,
    fecha_prestamo: prestamoFecha.value,
    fecha_limite: prestamoLimite.value,
  };

  const boton = formPrestamo.querySelector('button[type="submit"]');
  boton.disabled = true;
  boton.textContent = 'Registrando…';

  try {
    const respuesta = await fetch('/api/prestamos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    });
    const datos = await respuesta.json();

    if (respuesta.status === 401) {
      sesion = { autenticado: false, usuario: null };
      actualizarInicio();
      mostrarPantalla('login');
      return;
    }

    if (!datos.ok) {
      mostrarMensaje(mensajePrestamo, 'error', datos.error || 'No se pudo registrar el préstamo.');
      return;
    }

    formPrestamo.classList.add('oculta');
    prestamoLibroId.value = '';
    mostrarMensaje(
      mensajePrestamo,
      'exito',
      `Préstamo registrado. "${datos.prestamo.titulo}" ahora figura como no disponible.`
    );
    await buscarLibrosParaPrestamo(campoBusquedaPrestamo.value.trim());
  } catch (error) {
    mostrarMensaje(mensajePrestamo, 'error', 'No hay conexión con el servidor.');
  } finally {
    boton.disabled = false;
    boton.textContent = 'Registrar préstamo';
  }
});

async function cargarPrestamos() {
  prestamosActivos.innerHTML = '<p class="estado-vacio">Cargando…</p>';
  historialPrestamos.innerHTML = '<p class="estado-vacio">Cargando…</p>';

  try {
    const respuesta = await fetch('/api/prestamos', { cache: 'no-store' });
    const datos = await respuesta.json();
    if (respuesta.status === 401) {
      sesion = { autenticado: false, usuario: null };
      actualizarInicio();
      mostrarPantalla('login');
      return;
    }
    if (!datos.ok) throw new Error(datos.error || 'No se pudieron cargar los préstamos.');

    const activos = datos.prestamos.filter((p) => !p.fecha_devolucion);
    const historial = datos.prestamos.filter((p) => p.fecha_devolucion);
    pintarPrestamosActivos(activos);
    pintarHistorialPrestamos(historial);
  } catch (error) {
    prestamosActivos.innerHTML = '<p class="estado-vacio">No se pudieron cargar los préstamos.</p>';
    historialPrestamos.innerHTML = '';
  }
}

function pintarPrestamosActivos(prestamos) {
  prestamosActivos.innerHTML = '';
  if (prestamos.length === 0) {
    prestamosActivos.innerHTML = '<p class="estado-vacio estado-vacio-compacto">No hay libros prestados en este momento.</p>';
    return;
  }

  const hoy = fechaLocalISO();
  prestamos.forEach((prestamo) => {
    const ficha = crearFichaPrestamo(prestamo, true, hoy);
    prestamosActivos.appendChild(ficha);
  });
}

function pintarHistorialPrestamos(prestamos) {
  historialPrestamos.innerHTML = '';
  if (prestamos.length === 0) {
    historialPrestamos.innerHTML = '<p class="estado-vacio estado-vacio-compacto">Todavía no hay devoluciones registradas.</p>';
    return;
  }
  prestamos.forEach((prestamo) => historialPrestamos.appendChild(crearFichaPrestamo(prestamo, false)));
}

function crearFichaPrestamo(prestamo, activo, hoy = fechaLocalISO()) {
  const ficha = document.createElement('article');
  ficha.className = 'ficha-prestamo-registro';
  const vencido = activo && String(prestamo.fecha_limite).slice(0, 10) < hoy;
  if (vencido) ficha.classList.add('prestamo-vencido');

  const titulo = document.createElement('h4');
  titulo.textContent = prestamo.titulo;
  ficha.appendChild(titulo);

  const persona = document.createElement('p');
  persona.innerHTML = `<strong>Prestado a:</strong> ${escaparHtml(prestamo.nombre)} ${escaparHtml(prestamo.apellido)}`;
  ficha.appendChild(persona);

  const fechas = document.createElement('p');
  fechas.innerHTML = `<strong>Prestado:</strong> ${formatearFecha(prestamo.fecha_prestamo)} · <strong>Límite:</strong> ${formatearFecha(prestamo.fecha_limite)}`;
  ficha.appendChild(fechas);

  if (vencido) {
    const aviso = document.createElement('span');
    aviso.className = 'etiqueta-vencido';
    aviso.textContent = 'Fuera de fecha';
    ficha.appendChild(aviso);
  }

  if (activo) {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'boton-devolver';
    boton.textContent = 'Devolver';
    boton.addEventListener('click', () => devolverPrestamo(prestamo));
    ficha.appendChild(boton);
  } else {
    const devolucion = document.createElement('p');
    devolucion.className = 'fecha-devolucion';
    devolucion.innerHTML = `<strong>Devuelto:</strong> ${formatearFecha(prestamo.fecha_devolucion)}`;
    ficha.appendChild(devolucion);
  }

  return ficha;
}

async function devolverPrestamo(prestamo) {
  const confirmar = window.confirm(`¿Registrar la devolución de "${prestamo.titulo}"?`);
  if (!confirmar) return;

  try {
    const respuesta = await fetch(`/api/prestamos/${prestamo.id}/devolver`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fecha_devolucion: fechaLocalISO() }),
    });
    const datos = await respuesta.json();
    if (respuesta.status === 401) {
      sesion = { autenticado: false, usuario: null };
      actualizarInicio();
      mostrarPantalla('login');
      return;
    }
    if (!datos.ok) {
      window.alert(datos.error || 'No se pudo registrar la devolución.');
      return;
    }
    cargarPrestamos();
  } catch (error) {
    window.alert('No hay conexión con el servidor.');
  }
}

function escaparHtml(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function verificarPrestamosVencidos() {
  if (!sesion.autenticado || vencidosRevisados) return;
  vencidosRevisados = true;

  try {
    const hoy = fechaLocalISO();
    const respuesta = await fetch(`/api/prestamos/vencidos?hoy=${encodeURIComponent(hoy)}`, { cache: 'no-store' });
    const datos = await respuesta.json();
    if (!respuesta.ok || !datos.ok || !Array.isArray(datos.prestamos) || datos.prestamos.length === 0) return;

    resumenVencidos.textContent = datos.prestamos.length === 1
      ? 'Hay 1 libro que ya pasó su fecha límite.'
      : `Hay ${datos.prestamos.length} libros que ya pasaron su fecha límite.`;

    listaVencidosModal.innerHTML = '';
    datos.prestamos.forEach((prestamo) => {
      const item = document.createElement('div');
      item.className = 'vencido-modal-item';

      const titulo = document.createElement('strong');
      titulo.textContent = prestamo.titulo;
      const detalle = document.createElement('span');
      detalle.textContent = `${prestamo.nombre} ${prestamo.apellido} · Venció ${formatearFecha(prestamo.fecha_limite)}`;

      item.appendChild(titulo);
      item.appendChild(detalle);
      listaVencidosModal.appendChild(item);
    });

    modalVencidos.classList.remove('oculta');
  } catch (error) {
    // La revisión no debe impedir iniciar sesión si temporalmente falla la conexión.
    vencidosRevisados = false;
  }
}

// =====================================================================
// AGREGAR
// =====================================================================
const formAgregar = document.getElementById('form-agregar');
const mensajeAgregar = document.getElementById('mensaje-agregar');
const botonGuardar = formAgregar.querySelector('.boton-guardar');
const campoTitulo = document.getElementById('campo-titulo');
const campoAutor = document.getElementById('campo-autor');
const campoEditorial = document.getElementById('campo-editorial');
const campoTema = document.getElementById('campo-tema');
const campoTejuelo = document.getElementById('campo-tejuelo');
const campoInventario = document.getElementById('campo-inventario');
const campoPdf = document.getElementById('campo-pdf');
const botonElegirPdf = document.getElementById('btn-elegir-pdf');
const nombrePdfElegido = document.getElementById('nombre-pdf-elegido');

botonElegirPdf.addEventListener('click', () => campoPdf.click());
campoPdf.addEventListener('change', () => {
  nombrePdfElegido.textContent = campoPdf.files[0] ? campoPdf.files[0].name : 'Elegir archivo PDF';
});

function abrirEdicion(libro) {
  if (!sesion.autenticado || modoLector) return;

  libroEditandoId = libro.id;
  document.querySelector('#pantalla-agregar h2').textContent = 'Editar libro';
  botonGuardar.textContent = 'Guardar cambios';
  document.querySelector('#pantalla-agregar [data-volver]').dataset.volver = 'buscar';

  mostrarPantalla('agregar');
  ocultarMensaje(mensajeAgregar);
  nombrePdfElegido.textContent = 'Elegir archivo PDF';
  campoPdf.value = '';

  campoTitulo.value = libro.titulo;
  campoAutor.value = libro.autor;
  campoEditorial.value = libro.editorial || '';
  campoTema.value = libro.tema || '';
  campoTejuelo.value = libro.numero_tarjeta;
  campoInventario.value = libro.numero_inventario || '';
  campoTitulo.focus();
}

async function prepararFormularioAgregar() {
  formAgregar.reset();
  nombrePdfElegido.textContent = 'Elegir archivo PDF';
  ocultarMensaje(mensajeAgregar);
  campoTitulo.focus();

  try {
    const respuesta = await fetch('/api/libros/siguiente-inventario');
    const datos = await respuesta.json();
    if (datos.ok) campoInventario.value = datos.siguiente;
  } catch (error) {
    // Si falla, se puede escribir el inventario a mano.
  }
}

formAgregar.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  if (!formAgregar.reportValidity()) return;

  const cuerpo = {
    titulo: campoTitulo.value,
    autor: campoAutor.value,
    editorial: campoEditorial.value,
    tema: campoTema.value,
    numero_tarjeta: campoTejuelo.value,
    numero_inventario: campoInventario.value,
  };
  const archivoPdf = campoPdf.files[0] || null;
  const editando = libroEditandoId !== null;

  botonGuardar.disabled = true;
  botonGuardar.textContent = editando ? 'Guardando cambios…' : 'Guardando…';

  try {
    const url = editando ? `/api/libros/${libroEditandoId}` : '/api/libros';
    const metodo = editando ? 'PUT' : 'POST';
    const respuesta = await fetch(url, {
      method: metodo,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    });
    const datos = await respuesta.json();

    if (respuesta.status === 401) {
      sesion = { autenticado: false, usuario: null };
      actualizarInicio();
      mostrarMensaje(mensajeAgregar, 'error', 'La sesión terminó. Iniciá sesión nuevamente.');
      mostrarPantalla('login');
      return;
    }

    if (!datos.ok) {
      mostrarMensaje(mensajeAgregar, 'error', datos.error || 'No se pudo guardar.');
      return;
    }

    let mensajeFinal = editando ? 'Los cambios se guardaron.' : 'Guardado. Ya podés agregar otro libro.';

    if (archivoPdf) {
      botonGuardar.textContent = 'Subiendo PDF…';
      const datosFormulario = new FormData();
      datosFormulario.append('pdf', archivoPdf);
      try {
        const respuestaPdf = await fetch(`/api/libros/${datos.libro.id}/pdf`, {
          method: 'POST',
          body: datosFormulario,
        });
        const datosPdf = await respuestaPdf.json();
        if (respuestaPdf.status === 401) {
          sesion = { autenticado: false, usuario: null };
          actualizarInicio();
          mensajeFinal += ' La sesión terminó antes de subir el PDF.';
        } else if (!datosPdf.ok) {
          mensajeFinal += ` El PDF no se pudo subir (${datosPdf.error}).`;
        }
      } catch (error) {
        mensajeFinal += ' El PDF no se pudo subir por un problema de conexión.';
      }
    }

    if (editando) {
      mostrarMensaje(mensajeAgregar, 'exito', mensajeFinal);
    } else {
      await prepararFormularioAgregar();
      mostrarMensaje(mensajeAgregar, 'exito', mensajeFinal);
    }
  } catch (error) {
    mostrarMensaje(mensajeAgregar, 'error', 'No hay conexión con el servidor. Revisá internet e intentá de nuevo.');
  } finally {
    botonGuardar.disabled = false;
    botonGuardar.textContent = editando ? 'Guardar cambios' : 'Guardar libro';
  }
});

// =====================================================================
// BUSCAR
// =====================================================================
const formBuscar = document.getElementById('form-buscar');
const campoBusqueda = document.getElementById('campo-busqueda');
const resultados = document.getElementById('resultados');
const controlesSeleccion = document.getElementById('controles-seleccion');
const seleccionarTodos = document.getElementById('seleccionar-todos');
const contadorSeleccion = document.getElementById('contador-seleccion');
const botonImprimirSeleccionados = document.getElementById('btn-imprimir-seleccionados');
const filtroBiblioteca = document.getElementById('filtro-biblioteca');
const errorBibliotecas = document.getElementById('error-bibliotecas');
const reintentarBibliotecas = document.getElementById('btn-reintentar-bibliotecas');
let ultimaBusqueda = 0;
let ultimaCargaBibliotecas = 0;

async function cargarBibliotecas() {
  const carga = ++ultimaCargaBibliotecas;
  filtroBiblioteca.disabled = true;
  errorBibliotecas.classList.add('oculta');
  reintentarBibliotecas.classList.add('oculta');
  try {
    const respuesta = await fetch('/api/bibliotecas', { cache: 'no-store' });
    const datos = await respuesta.json();
    if (carga !== ultimaCargaBibliotecas) return;
    if (!respuesta.ok || !datos.ok) throw new Error('No se pudieron cargar las bibliotecas.');
    const seleccion = filtroBiblioteca.value;
    filtroBiblioteca.replaceChildren(new Option('Todas las bibliotecas', ''));
    datos.bibliotecas.forEach((biblioteca) => {
      filtroBiblioteca.add(new Option(biblioteca.nombre, String(biblioteca.id)));
    });
    filtroBiblioteca.value = seleccion;
    if (filtroBiblioteca.selectedIndex < 0) filtroBiblioteca.value = '';
  } catch (error) {
    if (carga !== ultimaCargaBibliotecas) return;
    errorBibliotecas.classList.remove('oculta');
    reintentarBibliotecas.classList.remove('oculta');
  } finally {
    if (carga === ultimaCargaBibliotecas) filtroBiblioteca.disabled = false;
  }
}

reintentarBibliotecas.addEventListener('click', cargarBibliotecas);
filtroBiblioteca.addEventListener('change', () => buscarLibros(campoBusqueda.value.trim()));

seleccionarTodos.addEventListener('change', () => {
  const checks = resultados.querySelectorAll('.selector-libro');
  checks.forEach((check) => {
    check.checked = seleccionarTodos.checked;
  });
  actualizarControlesSeleccion();
});

botonImprimirSeleccionados.addEventListener('click', () => {
  const librosSeleccionados = obtenerLibrosSeleccionados();
  if (librosSeleccionados.length === 0) return;
  generarPdfTarjetas(librosSeleccionados);
});

formBuscar.addEventListener('submit', (evento) => {
  evento.preventDefault();
  buscarLibros(campoBusqueda.value.trim());
});

async function buscarLibros(texto) {
  const busqueda = ++ultimaBusqueda;
  const sesionBusqueda = sesion;
  const lectorBusqueda = modoLector;
  const sigueVigente = () => busqueda === ultimaBusqueda && sesionBusqueda === sesion && lectorBusqueda === modoLector;
  resultados.innerHTML = '';
  controlesSeleccion.classList.add('oculta');
  const cargando = document.createElement('p');
  cargando.className = 'estado-vacio';
  cargando.textContent = 'Buscando…';
  resultados.appendChild(cargando);

  try {
    const filtro = modoLector && filtroBiblioteca.value ? `&biblioteca_id=${encodeURIComponent(filtroBiblioteca.value)}` : '';
    const respuesta = await fetch(`/api/libros/buscar?q=${encodeURIComponent(texto)}&catalogo=${modoLector ? 'publico' : 'gestion'}${filtro}`, { cache: 'no-store' });
    const datos = await respuesta.json();
    if (!sigueVigente()) return;

    if (respuesta.status === 401) {
      sesion = { autenticado: false, usuario: null };
      actualizarInicio();
      mostrarPantalla('login');
      return;
    }
    if (!datos.ok) {
      mostrarEstadoVacio(datos.error || 'No se pudo hacer la búsqueda.');
      return;
    }
    pintarResultados(datos.libros);
  } catch (error) {
    if (!sigueVigente()) return;
    mostrarEstadoVacio('No hay conexión con el servidor. Revisá internet e intentá de nuevo.');
  }
}

function mostrarEstadoVacio(texto) {
  resultados.innerHTML = '';
  const p = document.createElement('p');
  p.className = 'estado-vacio';
  p.textContent = texto;
  resultados.appendChild(p);
}

function pintarResultados(libros) {
  resultados.innerHTML = '';
  librosActuales = Array.isArray(libros) ? libros : [];
  resetearControlesSeleccion();

  if (librosActuales.length === 0) {
    controlesSeleccion.classList.add('oculta');
    mostrarEstadoVacio('No encontramos ningún libro con ese dato. Probá escribiendo menos letras.');
    return;
  }

  librosActuales.forEach((libro) => {
    resultados.appendChild(crearFichaLibro(libro));
  });

  actualizarControlesSeleccion();
}

function crearFichaLibro(libro) {
  const ficha = document.createElement('article');
  ficha.className = 'ficha-libro';

  if (sesion.autenticado && !modoLector) {
    const selector = document.createElement('div');
    selector.className = 'selector-libro-contenedor';

    const check = document.createElement('input');
    check.type = 'checkbox';
    check.className = 'selector-libro';
    check.dataset.libroId = String(libro.id);
    check.setAttribute('aria-label', `Seleccionar ${libro.titulo}`);
    check.addEventListener('change', actualizarControlesSeleccion);

    selector.appendChild(check);
    ficha.appendChild(selector);
  }

  const titulo = document.createElement('h3');
  titulo.textContent = libro.titulo;
  ficha.appendChild(titulo);

  const disponibilidad = document.createElement('span');
  disponibilidad.className = `estado-disponibilidad ${libro.disponible === false ? 'no-disponible' : 'disponible'}`;
  disponibilidad.textContent = libro.disponible === false ? 'Prestado · No disponible' : 'Disponible';
  ficha.appendChild(disponibilidad);

  const biblioteca = document.createElement('p');
  biblioteca.className = 'biblioteca-libro';
  biblioteca.textContent = `Biblioteca: ${libro.biblioteca_nombre}`;
  ficha.appendChild(biblioteca);

  const autor = document.createElement('p');
  autor.textContent = `Autor: ${libro.autor}`;
  ficha.appendChild(autor);

  if (libro.editorial) {
    const editorial = document.createElement('p');
    editorial.textContent = `Editorial: ${libro.editorial}`;
    ficha.appendChild(editorial);
  }

  if (libro.tema) {
    const tema = document.createElement('p');
    tema.textContent = `Tema: ${libro.tema}`;
    ficha.appendChild(tema);
  }

  const tejuelo = document.createElement('p');
  tejuelo.textContent = `Tejuelo: ${libro.numero_tarjeta}`;
  ficha.appendChild(tejuelo);

  if (libro.numero_inventario) {
    const inventario = document.createElement('p');
    inventario.textContent = `Número de inventario: ${libro.numero_inventario}`;
    ficha.appendChild(inventario);
  }

  if (sesion.autenticado && !modoLector) {
    const visitas = document.createElement('p');
    visitas.className = 'visitas-pdf';
    const cantidadVisitas = Number(libro.pdf_visitas) || 0;
    visitas.textContent = `Visitas al PDF: ${cantidadVisitas.toLocaleString('es-AR')}`;
    ficha.appendChild(visitas);
  }

  const filaAcciones = document.createElement('div');
  filaAcciones.className = 'fila-acciones';

  const zonaPdf = document.createElement('div');
  zonaPdf.className = 'zona-pdf';
  actualizarZonaPdf(zonaPdf, libro);
  filaAcciones.appendChild(zonaPdf);

  if (sesion.autenticado && !modoLector) {
    const zonaGestion = document.createElement('div');
    zonaGestion.className = 'zona-gestion';

    const botonPrestar = document.createElement('button');
    botonPrestar.type = 'button';
    botonPrestar.className = 'boton-prestar-libro';
    botonPrestar.innerHTML = `${ICONO_PRESTAR}<span>${libro.disponible === false ? 'Prestado' : 'Prestar'}</span>`;
    botonPrestar.disabled = libro.disponible === false;
    if (libro.disponible !== false) {
      botonPrestar.addEventListener('click', () => abrirPantallaPrestar(libro));
    }
    zonaGestion.appendChild(botonPrestar);

    const botonImprimir = document.createElement('button');
    botonImprimir.type = 'button';
    botonImprimir.className = 'boton-imprimir-libro';
    botonImprimir.innerHTML = `${ICONO_IMPRIMIR}<span>Tarjetas</span>`;
    botonImprimir.addEventListener('click', () => generarPdfTarjetas([libro]));
    zonaGestion.appendChild(botonImprimir);

    const botonEditar = document.createElement('button');
    botonEditar.type = 'button';
    botonEditar.className = 'boton-editar';
    botonEditar.innerHTML = `${ICONO_LAPIZ}<span>Editar</span>`;
    botonEditar.addEventListener('click', () => abrirEdicion(libro));
    zonaGestion.appendChild(botonEditar);

    const botonBorrar = document.createElement('button');
    botonBorrar.type = 'button';
    botonBorrar.className = 'boton-borrar';
    botonBorrar.innerHTML = `${ICONO_BASURA}<span>Borrar</span>`;
    botonBorrar.addEventListener('click', () => borrarLibro(libro.id, libro.titulo));
    zonaGestion.appendChild(botonBorrar);

    filaAcciones.appendChild(zonaGestion);
  }

  ficha.appendChild(filaAcciones);
  return ficha;
}

function actualizarZonaPdf(zonaPdf, libro) {
  zonaPdf.innerHTML = '';

  if (libro.tiene_pdf) {
    const verPdf = document.createElement('a');
    verPdf.href = `/api/libros/${libro.id}/pdf`;
    verPdf.target = '_blank';
    verPdf.rel = 'noopener';
    verPdf.className = 'boton-pdf boton-ver-pdf';
    verPdf.innerHTML = `${ICONO_DOCUMENTO}<span>Ver PDF</span>`;
    zonaPdf.appendChild(verPdf);

    if (sesion.autenticado && !modoLector) {
      const quitar = document.createElement('button');
      quitar.type = 'button';
      quitar.className = 'enlace-quitar-pdf';
      quitar.textContent = 'Quitar PDF';
      quitar.addEventListener('click', () => quitarPdf(libro, zonaPdf));
      zonaPdf.appendChild(quitar);
    }
  } else if (sesion.autenticado && !modoLector) {
    const botonSubir = document.createElement('button');
    botonSubir.type = 'button';
    botonSubir.className = 'boton-pdf boton-subir-pdf';
    botonSubir.innerHTML = `${ICONO_SUBIR}<span>Subir PDF</span>`;

    const inputArchivo = document.createElement('input');
    inputArchivo.type = 'file';
    inputArchivo.accept = 'application/pdf';
    inputArchivo.className = 'input-archivo-oculto';
    inputArchivo.setAttribute('aria-hidden', 'true');
    inputArchivo.tabIndex = -1;

    botonSubir.addEventListener('click', () => inputArchivo.click());
    inputArchivo.addEventListener('change', () => {
      if (inputArchivo.files[0]) {
        subirPdfExistente(libro, inputArchivo.files[0], zonaPdf, botonSubir);
      }
    });

    zonaPdf.appendChild(botonSubir);
    zonaPdf.appendChild(inputArchivo);
  }
}

async function subirPdfExistente(libro, archivo, zonaPdf, botonSubir) {
  const etiqueta = botonSubir.querySelector('span');
  const textoOriginal = etiqueta.textContent;
  botonSubir.disabled = true;
  etiqueta.textContent = 'Subiendo…';

  const datosFormulario = new FormData();
  datosFormulario.append('pdf', archivo);

  try {
    const respuesta = await fetch(`/api/libros/${libro.id}/pdf`, {
      method: 'POST',
      body: datosFormulario,
    });
    const datos = await respuesta.json();

    if (respuesta.status === 401) {
      sesion = { autenticado: false, usuario: null };
      actualizarInicio();
      irABuscar(true);
      return;
    }

    if (datos.ok) {
      libro.tiene_pdf = true;
      actualizarZonaPdf(zonaPdf, libro);
    } else {
      window.alert(datos.error || 'No se pudo subir el PDF.');
      botonSubir.disabled = false;
      etiqueta.textContent = textoOriginal;
    }
  } catch (error) {
    window.alert('No hay conexión con el servidor.');
    botonSubir.disabled = false;
    etiqueta.textContent = textoOriginal;
  }
}

async function quitarPdf(libro, zonaPdf) {
  const confirmar = window.confirm('¿Quitar el PDF de este libro? El libro va a seguir en la lista.');
  if (!confirmar) return;

  try {
    const respuesta = await fetch(`/api/libros/${libro.id}/pdf`, { method: 'DELETE' });
    const datos = await respuesta.json();

    if (respuesta.status === 401) {
      sesion = { autenticado: false, usuario: null };
      actualizarInicio();
      irABuscar(true);
      return;
    }

    if (datos.ok) {
      libro.tiene_pdf = false;
      actualizarZonaPdf(zonaPdf, libro);
    } else {
      window.alert(datos.error || 'No se pudo quitar el PDF.');
    }
  } catch (error) {
    window.alert('No hay conexión con el servidor.');
  }
}

async function borrarLibro(id, titulo) {
  const confirmar = window.confirm(`¿Borrar "${titulo}"?\nEsto no se puede deshacer.`);
  if (!confirmar) return;

  try {
    const respuesta = await fetch(`/api/libros/${id}`, { method: 'DELETE' });
    const datos = await respuesta.json();

    if (respuesta.status === 401) {
      sesion = { autenticado: false, usuario: null };
      actualizarInicio();
      irABuscar(true);
      return;
    }

    if (datos.ok) {
      buscarLibros(campoBusqueda.value.trim());
    } else {
      window.alert(datos.error || 'No se pudo borrar el libro.');
    }
  } catch (error) {
    window.alert('No hay conexión con el servidor.');
  }
}

function resetearControlesSeleccion() {
  seleccionarTodos.checked = false;
  seleccionarTodos.indeterminate = false;
  contadorSeleccion.textContent = '0 seleccionados';
  botonImprimirSeleccionados.disabled = true;
  controlesSeleccion.classList.toggle('oculta', !(sesion.autenticado && !modoLector));
}

function obtenerLibrosSeleccionados() {
  const ids = Array.from(resultados.querySelectorAll('.selector-libro:checked'))
    .map((check) => Number(check.dataset.libroId))
    .filter((id) => Number.isInteger(id));

  return ids
    .map((id) => librosActuales.find((libro) => Number(libro.id) === id))
    .filter(Boolean);
}

function actualizarControlesSeleccion() {
  const checks = Array.from(resultados.querySelectorAll('.selector-libro'));
  if (!sesion.autenticado || modoLector || checks.length === 0) {
    resetearControlesSeleccion();
    return;
  }

  const seleccionados = checks.filter((check) => check.checked).length;
  const todos = seleccionados === checks.length;

  seleccionarTodos.checked = todos;
  seleccionarTodos.indeterminate = seleccionados > 0 && !todos;
  contadorSeleccion.textContent = `${seleccionados} seleccionado${seleccionados === 1 ? '' : 's'}`;
  botonImprimirSeleccionados.disabled = seleccionados === 0;
  controlesSeleccion.classList.remove('oculta');
}

async function cargarFuentesParaTarjetas() {
  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }
}

function escaparTextoTarjeta(valor) {
  return String(valor ?? '').trim();
}

function crearTarjetaImpresion(libro, variante) {
  const tarjeta = document.createElement('article');
  tarjeta.className = `tarjeta-impresion tarjeta-variante-${variante}`;

  const principal = document.createElement('div');
  principal.className = 'tarjeta-principal';

  const contenido = document.createElement('div');
  contenido.className = 'tarjeta-contenido';

  const agregarPrincipal = (valor, clase = '') => {
    if (!valor) return;
    const linea = document.createElement('div');
    linea.className = `tarjeta-primer-dato ${clase}`.trim();
    linea.textContent = escaparTextoTarjeta(valor);
    principal.appendChild(linea);
  };

  const agregarLinea = (label, valor, clase = '') => {
    if (!valor) return;
    const linea = document.createElement('div');
    linea.className = `tarjeta-linea ${clase}`.trim();

    if (label) {
      const etiqueta = document.createElement('span');
      etiqueta.className = 'tarjeta-etiqueta';
      etiqueta.textContent = `${label}: `;
      linea.appendChild(etiqueta);
    }

    const texto = document.createElement('span');
    texto.textContent = escaparTextoTarjeta(valor);
    linea.appendChild(texto);
    contenido.appendChild(linea);
  };

  if (variante === 1) {
    agregarPrincipal(libro.autor, 'tarjeta-autor-directo');
    agregarLinea('', libro.titulo, 'tarjeta-titulo-principal');
    agregarLinea('Tema', libro.tema);
    agregarLinea('Editorial', libro.editorial);
    agregarLinea('Tejuelo', libro.numero_tarjeta);
  } else if (variante === 2) {
    agregarPrincipal(libro.titulo, 'tarjeta-titulo-principal');
    agregarLinea('Autor', libro.autor);
    agregarLinea('Tema', libro.tema);
    agregarLinea('Editorial', libro.editorial);
    agregarLinea('Tejuelo', libro.numero_tarjeta);
  } else {
    agregarPrincipal(libro.tema, 'tarjeta-tema-principal');
    agregarLinea('', libro.titulo, 'tarjeta-titulo-principal');
    agregarLinea('Autor', libro.autor);
    agregarLinea('Editorial', libro.editorial);
    agregarLinea('Tejuelo', libro.numero_tarjeta);
  }

  principal.appendChild(contenido);
  tarjeta.appendChild(principal);
  return tarjeta;
}

function crearHojaTarjetas(grupoLibros) {
  const hoja = document.createElement('div');
  hoja.className = 'hoja-tarjetas';

  const columnas = [7, 75, 143];
  const filas = [12, 56, 100, 144, 188, 232];

  grupoLibros.forEach((libro, indice) => {
    const fila = indice;
    const tarjetas = [1, 2, 3];
    tarjetas.forEach((variante, columna) => {
      const tarjeta = crearTarjetaImpresion(libro, variante);
      tarjeta.style.left = `${columnas[columna]}mm`;
      tarjeta.style.top = `${filas[fila]}mm`;
      hoja.appendChild(tarjeta);
    });
  });

  return hoja;
}

async function generarPdfTarjetas(libros) {
  if (!sesion.autenticado || modoLector) return;
  if (!Array.isArray(libros) || libros.length === 0) return;

  if (!window.html2canvas || !window.jspdf?.jsPDF) {
    window.alert('No se pudo cargar el generador de PDF. Revisá la conexión e intentá nuevamente.');
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'impresion-procesando';
  overlay.innerHTML = '<span>Preparando tarjetas…</span>';
  document.body.appendChild(overlay);

  try {
    await cargarFuentesParaTarjetas();

    const contenedor = document.createElement('div');
    contenedor.className = 'contenedor-generacion-tarjetas';
    document.body.appendChild(contenedor);

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    const porPagina = 6;

    for (let inicio = 0; inicio < libros.length; inicio += porPagina) {
      const grupo = libros.slice(inicio, inicio + porPagina);
      const hoja = crearHojaTarjetas(grupo);
      contenedor.innerHTML = '';
      contenedor.appendChild(hoja);

      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const canvas = await window.html2canvas(hoja, {
        scale: 2,
        backgroundColor: '#FFFFFF',
        useCORS: true,
        logging: false,
        width: hoja.offsetWidth,
        height: hoja.offsetHeight,
      });

      if (inicio > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 210, 297, undefined, 'FAST');
    }

    const fecha = new Date().toISOString().slice(0, 10);
    const nombre = libros.length === 1
      ? `tarjetas-${sanearNombreArchivo(libros[0].titulo)}.pdf`
      : `tarjetas-biblin-${fecha}.pdf`;

    pdf.save(nombre);
  } catch (error) {
    console.error('Error al generar las tarjetas:', error);
    window.alert('No se pudo generar el PDF de las tarjetas. Probá nuevamente.');
  } finally {
    overlay.remove();
    document.querySelector('.contenedor-generacion-tarjetas')?.remove();
    actualizarControlesSeleccion();
  }
}

function sanearNombreArchivo(texto) {
  return String(texto || 'libro')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80) || 'libro';
}

actualizarEstadoSesion();
