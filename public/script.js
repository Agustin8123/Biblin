const ICONO_EXITO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><polyline points="7.5 12.5 10.5 15.5 16.5 9"/></svg>';
const ICONO_ERROR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><line x1="12" y1="7.5" x2="12" y2="13"/><circle cx="12" cy="16.5" r="0.75" fill="currentColor" stroke="none"/></svg>';
const ICONO_BASURA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/></svg>';
const ICONO_DOCUMENTO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M14 3v5h5"/></svg>';
const ICONO_SUBIR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg>';
const ICONO_LAPIZ = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';

const pantallas = {
  inicio: document.getElementById('pantalla-inicio'),
  login: document.getElementById('pantalla-login'),
  agregar: document.getElementById('pantalla-agregar'),
  buscar: document.getElementById('pantalla-buscar'),
};

let sesion = {
  autenticado: false,
  usuario: null,
};

let modoLector = true;
let libroEditandoId = null;

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
    };
  } catch (error) {
    sesion = { autenticado: false, usuario: null };
  }
  actualizarInicio();
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
    textoSesion.textContent = `Sesión iniciada como ${sesion.usuario}`;
  } else {
    inicioPublico.classList.remove('oculta');
    inicioAdmin.classList.add('oculta');
    barraSesion.classList.add('oculta');
    textoSesion.textContent = '';
  }
}

function irABuscar(lector = !sesion.autenticado) {
  modoLector = lector && !sesion.autenticado;
  document.getElementById('indicador-lector').classList.toggle('oculta', !modoLector);
  mostrarPantalla('buscar');
  campoBusqueda.value = '';
  buscarLibros('');
  campoBusqueda.focus();
}

// =====================================================================
// INICIO / SESIÓN
// =====================================================================

document.getElementById('btn-solo-lector').addEventListener('click', () => irABuscar(true));

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
    sesion = { autenticado: true, usuario: datos.usuario };
    modoLector = false;
    actualizarInicio();
    mostrarPantalla('inicio');
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
  actualizarInicio();
  mostrarPantalla('inicio');
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

formBuscar.addEventListener('submit', (evento) => {
  evento.preventDefault();
  buscarLibros(campoBusqueda.value.trim());
});

async function buscarLibros(texto) {
  resultados.innerHTML = '';
  const cargando = document.createElement('p');
  cargando.className = 'estado-vacio';
  cargando.textContent = 'Buscando…';
  resultados.appendChild(cargando);

  try {
    const respuesta = await fetch(`/api/libros/buscar?q=${encodeURIComponent(texto)}`);
    const datos = await respuesta.json();

    if (!datos.ok) {
      mostrarEstadoVacio(datos.error || 'No se pudo hacer la búsqueda.');
      return;
    }
    pintarResultados(datos.libros);
  } catch (error) {
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

  if (libros.length === 0) {
    mostrarEstadoVacio('No encontramos ningún libro con ese dato. Probá escribiendo menos letras.');
    return;
  }

  libros.forEach((libro) => {
    resultados.appendChild(crearFichaLibro(libro));
  });
}

function crearFichaLibro(libro) {
  const ficha = document.createElement('article');
  ficha.className = 'ficha-libro';

  const titulo = document.createElement('h3');
  titulo.textContent = libro.titulo;
  ficha.appendChild(titulo);

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

  const filaAcciones = document.createElement('div');
  filaAcciones.className = 'fila-acciones';

  const zonaPdf = document.createElement('div');
  zonaPdf.className = 'zona-pdf';
  actualizarZonaPdf(zonaPdf, libro);
  filaAcciones.appendChild(zonaPdf);

  if (sesion.autenticado && !modoLector) {
    const zonaGestion = document.createElement('div');
    zonaGestion.className = 'zona-gestion';

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

actualizarEstadoSesion();
