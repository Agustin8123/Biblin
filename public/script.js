// Íconos reutilizados en mensajes y botones (mismo estilo que en index.html)
const ICONO_EXITO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><polyline points="7.5 12.5 10.5 15.5 16.5 9"/></svg>';
const ICONO_ERROR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><line x1="12" y1="7.5" x2="12" y2="13"/><circle cx="12" cy="16.5" r="0.75" fill="currentColor" stroke="none"/></svg>';
const ICONO_BASURA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/></svg>';
const ICONO_DOCUMENTO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M14 3v5h5"/></svg>';
const ICONO_SUBIR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg>';

const pantallas = {
  inicio: document.getElementById('pantalla-inicio'),
  agregar: document.getElementById('pantalla-agregar'),
  buscar: document.getElementById('pantalla-buscar'),
};

function mostrarPantalla(nombre) {
  Object.values(pantallas).forEach((p) => p.classList.add('oculta'));
  pantallas[nombre].classList.remove('oculta');
  window.scrollTo(0, 0);
}

document.getElementById('btn-ir-agregar').addEventListener('click', () => {
  mostrarPantalla('agregar');
  prepararFormularioAgregar();
});

document.getElementById('btn-ir-buscar').addEventListener('click', () => {
  mostrarPantalla('buscar');
  campoBusqueda.value = '';
  buscarLibros('');
  campoBusqueda.focus();
});

document.querySelectorAll('[data-volver]').forEach((boton) => {
  boton.addEventListener('click', () => mostrarPantalla('inicio'));
});

// =====================================================================
// AGREGAR
// =====================================================================
const formAgregar = document.getElementById('form-agregar');
const mensajeAgregar = document.getElementById('mensaje-agregar');
const botonGuardar = formAgregar.querySelector('.boton-guardar');
const campoTitulo = document.getElementById('campo-titulo');
const campoAutor = document.getElementById('campo-autor');
const campoEditorial = document.getElementById('campo-editorial');
const campoNumero = document.getElementById('campo-numero');
const campoPdf = document.getElementById('campo-pdf');
const botonElegirPdf = document.getElementById('btn-elegir-pdf');
const nombrePdfElegido = document.getElementById('nombre-pdf-elegido');

botonElegirPdf.addEventListener('click', () => campoPdf.click());
campoPdf.addEventListener('change', () => {
  nombrePdfElegido.textContent = campoPdf.files[0] ? campoPdf.files[0].name : 'Elegir archivo PDF';
});

async function prepararFormularioAgregar() {
  formAgregar.reset();
  nombrePdfElegido.textContent = 'Elegir archivo PDF';
  ocultarMensaje(mensajeAgregar);
  campoTitulo.focus();

  try {
    const respuesta = await fetch('/api/libros/siguiente-numero');
    const datos = await respuesta.json();
    if (datos.ok) {
      campoNumero.value = datos.siguiente;
    }
  } catch (error) {
    // Si esto falla, no pasa nada: ella puede escribir el número a mano.
  }
}

formAgregar.addEventListener('submit', async (evento) => {
  evento.preventDefault();

  if (!formAgregar.reportValidity()) return;

  const cuerpo = {
    titulo: campoTitulo.value,
    autor: campoAutor.value,
    editorial: campoEditorial.value,
    numero_tarjeta: campoNumero.value,
  };
  const archivoPdf = campoPdf.files[0] || null;

  botonGuardar.disabled = true;
  botonGuardar.textContent = 'Guardando…';

  try {
    const respuesta = await fetch('/api/libros', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    });
    const datos = await respuesta.json();

    if (!datos.ok) {
      mostrarMensaje(mensajeAgregar, 'error', datos.error || 'No se pudo guardar el libro.');
      return;
    }

    let mensajeFinal = 'Guardado. Ya podés agregar otro libro.';

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
        if (!datosPdf.ok) {
          mensajeFinal = `El libro se guardó, pero el PDF no se pudo subir (${datosPdf.error}). Podés subirlo después desde "Buscar un libro".`;
        }
      } catch (error) {
        mensajeFinal = 'El libro se guardó, pero el PDF no se pudo subir por un problema de conexión. Podés subirlo después desde "Buscar un libro".';
      }
    }

    await prepararFormularioAgregar();
    mostrarMensaje(mensajeAgregar, 'exito', mensajeFinal);
  } catch (error) {
    mostrarMensaje(mensajeAgregar, 'error', 'No hay conexión con el servidor. Revisá internet e intentá de nuevo.');
  } finally {
    botonGuardar.disabled = false;
    botonGuardar.textContent = 'Guardar libro';
  }
});

function mostrarMensaje(elemento, tipo, texto) {
  elemento.innerHTML = '';

  const icono = document.createElement('span');
  icono.className = 'icono-mensaje';
  icono.innerHTML = tipo === 'exito' ? ICONO_EXITO : ICONO_ERROR;

  const span = document.createElement('span');
  span.textContent = texto;

  elemento.appendChild(icono);
  elemento.appendChild(span);
  elemento.classList.remove('oculta');
  elemento.className = `mensaje ${tipo}`;
}

function ocultarMensaje(elemento) {
  elemento.className = 'mensaje oculta';
  elemento.innerHTML = '';
}

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

  const numero = document.createElement('p');
  numero.textContent = `Número de tarjeta: ${libro.numero_tarjeta}`;
  ficha.appendChild(numero);

  const filaAcciones = document.createElement('div');
  filaAcciones.className = 'fila-acciones';

  const zonaPdf = document.createElement('div');
  zonaPdf.className = 'zona-pdf';
  actualizarZonaPdf(zonaPdf, libro);
  filaAcciones.appendChild(zonaPdf);

  const botonBorrar = document.createElement('button');
  botonBorrar.type = 'button';
  botonBorrar.className = 'boton-borrar';
  botonBorrar.innerHTML = `${ICONO_BASURA}<span>Borrar</span>`;
  botonBorrar.addEventListener('click', () => borrarLibro(libro.id, libro.titulo));

  filaAcciones.appendChild(botonBorrar);
  ficha.appendChild(filaAcciones);

  return ficha;
}

// Dibuja, dentro de "zonaPdf", el estado correspondiente: un enlace para ver
// el PDF si el libro ya tiene uno, o un botón para subirlo si todavía no.
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

    const quitar = document.createElement('button');
    quitar.type = 'button';
    quitar.className = 'enlace-quitar-pdf';
    quitar.textContent = 'Quitar PDF';
    quitar.addEventListener('click', () => quitarPdf(libro, zonaPdf));
    zonaPdf.appendChild(quitar);
  } else {
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
    if (datos.ok) {
      buscarLibros(campoBusqueda.value.trim());
    } else {
      window.alert(datos.error || 'No se pudo borrar el libro.');
    }
  } catch (error) {
    window.alert('No hay conexión con el servidor.');
  }
}
