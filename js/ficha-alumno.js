(function () {
  'use strict';

  requireAuth();
  renderNav('', true);
  renderFooter();

  const params = new URLSearchParams(window.location.search);
  const alumnoId = params.get('id');
  const contenido = document.getElementById('ficha-contenido');
  const volver = document.getElementById('ficha-volver');

  configurarRetorno();
  if (!alumnoId) {
    mostrarError('No se indicó qué alumno consultar.');
  } else {
    cargarFicha();
  }

  async function cargarFicha() {
    contenido.innerHTML = '<div class="ficha-page-loading">Cargando ficha del alumno...</div>';
    try {
      const ficha = await getFichaAlumnoDB(alumnoId);
      if (!ficha) throw new Error('No se encontró la ficha del alumno.');
      await renderFicha(ficha);
    } catch (error) {
      console.error('Error al cargar la ficha del alumno:', error.message);
      mostrarError(`No se pudo cargar la ficha: ${error.message}`);
    }
  }

  async function renderFicha(ficha) {
    const nombreCompleto = `${ficha.nombre || ''} ${ficha.apellido || ''}`.trim();
    const curso = ficha.curso_nombre ||
      [ficha.anio ? `${ficha.anio}°` : '', ficha.division || ''].filter(Boolean).join(' ');
    const titulo = document.getElementById('ficha-titulo');
    titulo.innerHTML = `Ficha de <span>${esc(nombreCompleto || 'alumno')}</span>`;
    document.title = `Ficha de ${nombreCompleto || 'alumno'} — Fichaula`;

    const totales = {};
    ficha.asistencias.forEach(registro => {
      const anio = registro.anio_lectivo || 'Sin año';
      if (!totales[anio]) totales[anio] = { faltas: 0, tardes: 0, presentes: 0 };
      if (registro.estado === 'ausente') totales[anio].faltas += 1;
      else if (registro.estado === 'tarde') {
        totales[anio].tardes += 1;
        totales[anio].faltas += 0.25;
      } else {
        totales[anio].presentes += 1;
      }
    });

    const años = Object.keys(totales).sort((a, b) => Number(b) - Number(a));
    const asistencias = ficha.asistencias.length
      ? await Promise.all(ficha.asistencias.map(renderAsistencia))
      : ['<p class="ficha-muted">Sin registros de asistencia.</p>'];
    // Mismas tarjetas que en Clases → curso (js/seguimientos-ui.js): a quién se
    // envió (Dirección / Todos), autor, fecha y "Eliminar" para su autor o dirección.
    const comentarios = ficha.comentarios.length
      ? ficha.comentarios.map(c => renderComentarioItem(c, { mostrarAlumno: false })).join('')
      : '<div class="seg-empty">Sin comentarios disponibles.</div>';
    // Misma tarjeta que Clases → curso → Seguimiento de alumnos (js/seguimientos-ui.js).
    // Sin el nombre del alumno: en su ficha ya se sabe de quién es.
    const seguimientos = ficha.seguimientos.length
      ? ficha.seguimientos.map(s => renderSeguimientoItem(s, { mostrarAlumno: false })).join('')
      : '<div class="seg-empty">Sin seguimientos disponibles.</div>';

    contenido.innerHTML = `
      <div class="ficha-content-inner">
        <section class="ficha-section ficha-personal">
          <div class="ficha-section-heading">
            <div><span class="ficha-eyebrow">INFORMACIÓN</span><h2>Datos personales</h2></div>
          </div>
          <div class="ficha-personal-grid">
            ${datoPersonal('Nombre completo', nombreCompleto)}
            ${datoPersonal('DNI', ficha.dni)}
            ${esSuperadmin() ? datoPersonal('Legajo', ficha.legajo) : ''}
            ${datoPersonal('Fecha de nacimiento', fechaCorta(ficha.fecha_nacimiento))}
            ${datoPersonal('Edad', ficha.edad == null ? '' : `${ficha.edad} años`)}
            ${datoPersonal('Curso', curso)}
            ${datoPersonal('Turno', ficha.turno)}
          </div>
        </section>

        <section class="ficha-section">
          <div class="ficha-section-heading">
            <div><span class="ficha-eyebrow">PRESENTISMO</span><h2>Totales por año lectivo</h2></div>
          </div>
          ${años.length ? `<div class="ficha-anios-grid">${años.map(anio => `
            <article class="ficha-anio-card">
              <span class="ficha-anio-label">${esc(anio)}</span>
              <strong>${numero(totales[anio].faltas)} <small>faltas equivalentes</small></strong>
              <div><span>${totales[anio].tardes} tardanzas</span><span>${totales[anio].presentes} presentes</span></div>
            </article>`).join('')}</div>` : '<p class="ficha-muted">Sin historial anual.</p>'}
        </section>

        <section class="ficha-section">
          <div class="ficha-section-heading">
            <div><span class="ficha-eyebrow">REGISTRO</span><h2>Detalle de asistencia</h2></div>
            <span class="ficha-count">${ficha.asistencias.length} registros</span>
          </div>
          <div class="ficha-entry-list">${asistencias.join('')}</div>
        </section>

        <section class="ficha-section">
          <div class="ficha-section-heading">
            <div><span class="ficha-eyebrow">COMUNICACIÓN</span><h2>Comentarios</h2></div>
            <span class="ficha-count">${ficha.comentarios.length}</span>
          </div>
          ${puedeComentar() ? renderFormComentario('ficha-comentario', {
            placeholder: `Escribí un comentario sobre ${nombreCompleto || 'el alumno'}...`
          }) : ''}
          <p class="ficha-seg-aviso" id="ficha-com-aviso" role="status"></p>
          <div class="seguimientos-list" id="ficha-comentarios">${comentarios}</div>
        </section>

        <section class="ficha-section">
          <div class="ficha-section-heading">
            <div><span class="ficha-eyebrow">ACOMPAÑAMIENTO</span><h2>Seguimientos</h2></div>
            <span class="ficha-count">${ficha.seguimientos.length}</span>
          </div>
          <p class="ficha-seg-aviso" id="ficha-seg-aviso" role="status"></p>
          <div class="seguimientos-list" id="ficha-seguimientos">${seguimientos}</div>
        </section>
      </div>`;

    conectarFormComentario('ficha-comentario', {
      guardar: ({ texto, visiblePara }) => agregarComentarioDB(alumnoId, texto, visiblePara),
      alGuardar: async () => {
        await cargarFicha();
        mostrarAviso('ficha-com-aviso', 'Comentario agregado.', 'ok');
      },
      avisar: (mensaje, tipo) => mostrarAviso('ficha-com-aviso', mensaje, tipo)
    });
    conectarBorradoComentarios(document.getElementById('ficha-comentarios'), {
      alEliminar: async (mensaje) => {
        await cargarFicha();
        mostrarAviso('ficha-com-aviso', mensaje, 'ok');
      },
      alFallar: (mensaje) => mostrarAviso('ficha-com-aviso', mensaje, 'error')
    });
    conectarBorradoSeguimientos(document.getElementById('ficha-seguimientos'), {
      alEliminar: async (mensaje) => {
        await cargarFicha();
        mostrarAvisoSeg(mensaje, 'ok');
      },
      alFallar: (mensaje) => mostrarAvisoSeg(mensaje, 'error')
    });

    function datoPersonal(etiqueta, valor) {
      return `<div class="ficha-personal-item"><span>${esc(etiqueta)}</span><strong>${esc(valor || '—')}</strong></div>`;
    }
  }

  async function renderAsistencia(registro) {
    const links = await Promise.all((registro.adjuntos || []).map(async (path, index) => {
      try {
        const url = await getUrlImagenJustificacion(path);
        return `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Justificación ${index + 1}</a>`;
      } catch (error) {
        console.error('No se pudo generar el enlace de una justificación:', error.message);
        return '<span class="ficha-muted">Imagen no disponible</span>';
      }
    }));
    const justificacion = registro.justificada
      ? `<p>${esc(registro.motivo || 'Justificada')}</p>` : '';
    return `<article class="ficha-entry">
      <div class="ficha-entry-main">
        <strong>${esc(fechaCorta(registro.fecha))}</strong>
        <span>${esc(registro.curso_nombre || registro.curso_id || 'Clase')}</span>
        <span class="ficha-estado ficha-estado-${esc(registro.estado)}">${esc(registro.estado)}${registro.justificada ? ' · justificada' : ''}</span>
      </div>
      ${justificacion}
      ${links.length ? `<div class="asistencia-archivos">${links.join(' ')}</div>` : ''}
    </article>`;
  }

  /** Aviso debajo del título de una sección (comentarios o seguimientos). */
  function mostrarAviso(id, mensaje, tipo) {
    const aviso = document.getElementById(id);
    if (!aviso) return;
    aviso.textContent = mensaje || '';
    aviso.className = `ficha-seg-aviso ficha-seg-aviso--${tipo}`;
  }

  function mostrarAvisoSeg(mensaje, tipo) {
    mostrarAviso('ficha-seg-aviso', mensaje, tipo);
  }

  function configurarRetorno() {
    const tipo = params.get('volver');
    let destino = 'alumnos.html';
    let etiqueta = 'Volver a alumnos';
    if (tipo === 'curso') {
      const cursoId = params.get('curso_id');
      if (cursoId) destino = `curso.html?id=${encodeURIComponent(cursoId)}`;
      etiqueta = 'Volver al curso';
    } else if (tipo === 'admin') {
      destino = 'admin.html?tab=alumnos';
      etiqueta = 'Volver al panel';
    } else if (tipo === 'superadmin') {
      const colegioId = params.get('colegio_id');
      const tab = params.get('tab');
      destino = colegioId
        ? `superadmin.html?colegio=${encodeURIComponent(colegioId)}&tab=${encodeURIComponent(tab || 'alumnos')}`
        : 'superadmin.html';
      etiqueta = 'Volver al panel';
    }
    volver.href = destino;
    volver.textContent = `← ${etiqueta}`;
  }

  function mostrarError(mensaje) {
    contenido.innerHTML = `<div class="ficha-page-error" role="alert">${esc(mensaje)}</div>`;
  }

  function fechaCorta(valor) {
    if (!valor) return '—';
    const fecha = new Date(`${String(valor).slice(0, 10)}T00:00:00`);
    return Number.isNaN(fecha.getTime()) ? String(valor) : fecha.toLocaleDateString('es-AR');
  }

  function numero(valor) {
    return Number.isInteger(valor) ? String(valor) : valor.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  }

  function esc(valor) {
    return String(valor == null ? '' : valor)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
})();
