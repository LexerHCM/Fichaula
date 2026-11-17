/**
 * curso.js — Detalle de un curso.
 *  - Tabla de alumnos con búsqueda (el legajo solo lo ve superadmin;
 *    el DNI lo ve dirección).
 *  - Seguimientos:
 *      · el profesor carga los suyos y elige quién los ve
 *        ("Dirección" o "Todos"); ve los propios y los que otro profesor
 *        del curso compartió con "Todos";
 *      · dirección (admin/superadmin) ve todos;
 *      · elimina el autor o dirección; el borrado va a la papelera.
 *    Qué filas llegan lo decide RLS en el servidor; los filtros de esta
 *    pantalla trabajan solo sobre lo que el servidor ya devolvió.
 *  - Acceso bloqueado si la clase no es visible para el usuario (RLS).
 * Depende de: supabase.js, auth.js, components.js, filtros.js
 */
(function () {
  'use strict';

  requireAuth();
  renderNav('clases', true);
  renderFooter();

  const btnBackTop = document.getElementById('btn-back-top');
  const btnBackBot = document.getElementById('btn-back-bottom');
  if (btnBackTop) btnBackTop.addEventListener('click', () => history.back());
  if (btnBackBot) btnBackBot.addEventListener('click', () => history.back());

  const user = getUsuarioActual();
  const verLegajo = puedeVerLegajo();
  const verDni = puedeVerDni();
  const puedeAgregar = puedeAgregarSeguimiento();

  const params = new URLSearchParams(window.location.search);
  const cursoId = params.get('id');
  const fichaInicialId = params.get('alumno');
  if (fichaInicialId) {
    const fichaParams = new URLSearchParams({
      id: fichaInicialId,
      volver: 'curso'
    });
    if (cursoId) fichaParams.set('curso_id', cursoId);
    window.location.replace(`ficha-alumno.html?${fichaParams.toString()}`);
    return;
  }

  const AYUDA_VISIBILIDAD = {
    admin: 'Solo lo ven dirección y vos.',
    profesor: 'Lo ven dirección y los demás profesores de este curso.'
  };
  const CONFIRMAR_MS = 4000;  // cuánto queda armado el "¿Eliminar?" antes de volver a la normalidad
  const barraFiltros = document.getElementById('seg-filtros');

  let curso = null;
  let seguimientos = [];   // lo que el servidor devolvió para este usuario
  let comentariosClase = [];
  let asistenciaDelDia = [];
  let cargaAsistencia = 0;
  let anioLectivoActivo = null;
  let cargaActual = 0;     // número de la última carga pedida (si llegan desordenadas, vale la última)
  let avisoTimer = null;

  iniciar();

  async function iniciar() {
    if (!cursoId) { mostrarCursoNoEncontrado(); return; }
    try {
      const claseData = await getClaseByIdDB(cursoId);
      // Si RLS no la devolvió (o no existe), no hay acceso.
      if (!claseData) { mostrarAccesoDenegado(); return; }

      curso = claseData;
      document.title = `${curso.nombre} — Fichaula`;

      renderHeader();
      configurarTablaAlumnos();
      filtrarAlumnos(document.getElementById('search-input').value);
      await configurarAsistencia();
      configurarComentariosClase();
      configurarSeguimientos();
      await refrescarSeguimientos();
    } catch (err) {
      console.error('Error al cargar el curso:', err.message);
      document.getElementById('curso-header').innerHTML = `
        <p style="color:var(--white-40);margin-top:16px;">
          No se pudo cargar el curso. Revisá tu conexión e intentá de nuevo.
        </p>`;
    }
  }

  function mostrarCursoNoEncontrado() {
    document.getElementById('curso-header').innerHTML = `
      <p style="color:var(--white-40);margin-top:16px;">
        Curso no encontrado.
        <a href="clases.html" style="color:var(--violet-light);">Ver todos los cursos</a>.
      </p>`;
  }

  function mostrarAccesoDenegado() {
    document.getElementById('curso-header').innerHTML = `
      <div class="badge acceso-denegado-badge">ACCESO DENEGADO</div>
      <h1 class="page-title">Curso no disponible</h1>
      <p class="page-subtitle" style="margin-top:20px;">
        No tenés acceso a este curso.
        <a href="clases.html" style="color:var(--violet-light);">Ver tus clases</a>.
      </p>`;
  }

  function renderHeader() {
    document.getElementById('curso-header').innerHTML = `
      <div class="badge">${escapeHtml(curso.nivel.toUpperCase())}</div>
      <h1 class="page-title">Curso <span>${escapeHtml(curso.nombre)}</span></h1>
      <div class="page-meta-pills">
        <span class="meta-pill violet">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
          </svg>
          ${curso.alumnos.length} alumnos
        </span>
        <span class="meta-pill">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          Turno ${escapeHtml(curso.turno)}
        </span>
        <span class="meta-pill">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          </svg>
          Aula ${escapeHtml(curso.aula)}
        </span>
      </div>`;
  }

  function configurarTablaAlumnos() {
    const thead = document.getElementById('thead-row');
    thead.innerHTML = [
      '<th>#</th>',
      verLegajo ? '<th>Legajo</th>' : '',
      '<th>Nombre y Apellido</th><th>Edad</th>',
      verDni ? '<th>DNI</th>' : '',
      '<th>Ficha</th>'
    ].join('');
    const buscador = document.getElementById('search-input');
    buscador.placeholder = verLegajo
      ? 'Buscar por nombre, apellido, legajo o DNI...'
      : verDni
        ? 'Buscar por nombre, apellido o DNI...'
        : 'Buscar por nombre o apellido...';
    buscador.addEventListener('input', e => filtrarAlumnos(e.target.value));
  }

  function iniciales(n, ap) { return (n[0] + ap[0]).toUpperCase(); }

  function crearFila(a, i) {
    const edad = a.edad != null ? a.edad : '—';
    const nombre = `
      <td>
        <div class="alumno-nombre-cell">
          <div class="alumno-avatar">${escapeHtml(iniciales(a.nombre, a.apellido))}</div>
          <span>${escapeHtml(a.apellido)}, ${escapeHtml(a.nombre)}</span>
        </div>
      </td>`;
    const ficha = `<td><button class="btn-ficha" data-ficha-alumno="${escapeHtml(a.id)}">Ver ficha</button></td>`;
    return `<tr>
      <td style="color:var(--white-40);font-size:13px;">${i + 1}</td>
      ${verLegajo ? `<td><span class="legajo-badge">${escapeHtml(a.legajo)}</span></td>` : ''}
      ${nombre}
      <td style="font-size:13px;">${edad} años</td>
      ${verDni ? `<td style="font-family:'Courier New',monospace;font-size:13px;">${escapeHtml(a.dni)}</td>` : ''}
      ${ficha}
    </tr>`;
  }

  function actualizarContador(n) {
    document.getElementById('alumnos-count-label').innerHTML =
      `Mostrando <strong>${n}</strong> de <strong>${curso.alumnos.length}</strong> alumnos`;
  }

  function renderAlumnos(lista) {
    const tbody = document.getElementById('alumnos-tbody');
    const colspan = 4 + Number(verLegajo) + Number(verDni);
    tbody.innerHTML = lista.length === 0
      ? `<tr><td colspan="${colspan}" class="no-results">No se encontraron alumnos.</td></tr>`
      : lista.map((a, i) => crearFila(a, i)).join('');
    tbody.querySelectorAll('[data-ficha-alumno]').forEach(button => {
      button.addEventListener('click', () => abrirFichaAlumno(button.dataset.fichaAlumno));
    });
    actualizarContador(lista.length);
  }

  // La búsqueda respeta los permisos independientes de legajo y DNI.
  function filtrarAlumnos(q) {
    renderAlumnos(buscarAlumnos(curso.alumnos, q, { legajo: verLegajo, dni: verDni }));
  }

  /* ─────────────── ASISTENCIA ─────────────── */
  function fechaLocal() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  async function configurarAsistencia() {
    const inputFecha = document.getElementById('asistencia-fecha');
    inputFecha.value = fechaLocal();
    inputFecha.addEventListener('change', () => cargarAsistencia(inputFecha.value));
    if (!puedeEditarAsistencia()) {
      document.getElementById('asistencia-section').style.display = 'none';
      return;
    }
    if (!curso.colegio_id) {
      document.getElementById('asistencia-ciclo-hint').textContent =
        'La clase todavía no está asociada a un colegio.';
      return;
    }
    try {
      const ciclo = await getCicloLectivoActivoDB(curso.colegio_id);
      if (!ciclo) {
        document.getElementById('asistencia-ciclo-hint').textContent =
          'No hay un año lectivo activo. Dirección debe abrirlo desde Panel Admin → Preceptores.';
        document.getElementById('asistencia-tbody').innerHTML =
          `<tr><td colspan="5" class="no-results">No se puede cargar asistencia hasta que se abra un año lectivo.</td></tr>`;
        return;
      }
      anioLectivoActivo = ciclo.anio_lectivo;
      document.getElementById('asistencia-anio').textContent = `· ${anioLectivoActivo}`;
      document.getElementById('asistencia-ciclo-hint').textContent =
        'Presente: 0 faltas · Tarde: 0,25 · Ausente: 1 (también si está justificada)';
      await cargarAsistencia(inputFecha.value);
    } catch (error) {
      document.getElementById('asistencia-ciclo-hint').textContent =
        `No se pudo cargar el año lectivo: ${error.message}`;
    }
  }

  async function cargarAsistencia(fecha) {
    const tbody = document.getElementById('asistencia-tbody');
    if (!anioLectivoActivo) return;
    const carga = ++cargaAsistencia;
    tbody.innerHTML = `<tr><td colspan="5" class="no-results">Cargando asistencia...</td></tr>`;
    try {
      const datos = await getAsistenciasDelCursoDB(
        curso.id, fecha, anioLectivoActivo, curso.alumnos.map(alumno => alumno.id));
      if (carga !== cargaAsistencia) return;
      asistenciaDelDia = datos.delDia;
      await pintarAsistencia(datos, carga);
    } catch (error) {
      if (carga !== cargaAsistencia) return;
      tbody.innerHTML = `<tr><td colspan="5" class="no-results">No se pudo cargar la asistencia: ${escapeHtml(error.message)}</td></tr>`;
    }
  }

  async function pintarAsistencia(datos, carga) {
    const tbody = document.getElementById('asistencia-tbody');
    const registros = new Map(datos.delDia.map(registro => [registro.alumno_id, registro]));
    if (!curso.alumnos.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="no-results">No hay alumnos en esta clase.</td></tr>`;
      return;
    }
    const filas = await Promise.all(curso.alumnos.map(async alumno => {
      const registro = registros.get(alumno.id);
      const estado = registro?.estado || '';
      const justificada = Boolean(registro?.justificada);
      const total = Number(datos.totales[alumno.id] || 0);
      const archivos = await Promise.all((registro?.adjuntos || []).map(async (path, index) => {
        try {
          const url = await getUrlImagenJustificacion(path);
          return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Imagen ${index + 1}</a>`;
        } catch (error) {
          console.error('No se pudo generar el enlace de una justificación:', error.message);
          return `<span class="ficha-muted">Imagen ${index + 1} no disponible</span>`;
        }
      }));
      return `<tr data-asistencia-alumno="${escapeHtml(alumno.id)}">
        <td><strong>${escapeHtml(alumno.apellido)}, ${escapeHtml(alumno.nombre)}</strong></td>
        <td><div class="asistencia-controls">
          <select class="asistencia-estado" aria-label="Estado de ${escapeHtml(alumno.nombre)} ${escapeHtml(alumno.apellido)}">
            <option value="">Sin registrar</option>
            <option value="presente" ${estado === 'presente' ? 'selected' : ''}>Presente</option>
            <option value="tarde" ${estado === 'tarde' ? 'selected' : ''}>Tarde</option>
            <option value="ausente" ${estado === 'ausente' ? 'selected' : ''}>Ausente</option>
          </select>
        </div></td>
        <td>${String(total).replace(/\.00$/, '')}</td>
        <td class="asistencia-justificacion">
          <label><input class="asistencia-justificada" type="checkbox" ${justificada ? 'checked' : ''}>
            Justificar ausencia</label>
          <div class="asistencia-justificacion-detalle" style="display:${justificada ? 'block' : 'none'}">
            <textarea class="asistencia-motivo" maxlength="1000" placeholder="Explicación">${escapeHtml(registro?.motivo || '')}</textarea>
            <input class="asistencia-imagenes" type="file" accept="image/jpeg,image/png,image/webp" multiple>
            <small>Hasta 5 imágenes JPG, PNG o WebP; 10 MB por imagen.</small>
            <div class="asistencia-archivos">${archivos.join(' ')}</div>
          </div>
        </td>
        <td><button type="button" class="btn-seg asistencia-guardar">Guardar</button></td>
      </tr>`;
    }));
    if (carga !== cargaAsistencia) return;
    tbody.innerHTML = filas.join('');
    tbody.querySelectorAll('tr[data-asistencia-alumno]').forEach(row => {
      const estado = row.querySelector('.asistencia-estado');
      const justificada = row.querySelector('.asistencia-justificada');
      const detalle = row.querySelector('.asistencia-justificacion-detalle');
      const syncJustificacion = () => {
        const habilitada = estado.value === 'ausente';
        justificada.disabled = !habilitada;
        if (!habilitada) justificada.checked = false;
        const mostrarDetalle = habilitada && justificada.checked;
        detalle.style.display = mostrarDetalle ? 'block' : 'none';
        if (!mostrarDetalle) {
          row.querySelector('.asistencia-motivo').value = '';
          row.querySelector('.asistencia-imagenes').value = '';
        }
      };
      estado.addEventListener('change', syncJustificacion);
      justificada.addEventListener('change', syncJustificacion);
      syncJustificacion();
      row.querySelector('.asistencia-guardar').addEventListener('click', () => guardarAsistenciaFila(row));
    });
  }

  async function guardarAsistenciaFila(row) {
    const alumnoId = row.dataset.asistenciaAlumno;
    const alumno = curso.alumnos.find(item => item.id === alumnoId);
    const previo = asistenciaDelDia.find(registro => registro.alumno_id === alumnoId);
    const estado = row.querySelector('.asistencia-estado').value;
    const justificada = row.querySelector('.asistencia-justificada').checked;
    const motivo = row.querySelector('.asistencia-motivo')?.value.trim() || '';
    const inputFiles = row.querySelector('.asistencia-imagenes');
    const files = Array.from(inputFiles?.files || []);
    const button = row.querySelector('.asistencia-guardar');
    const anteriores = justificada ? (previo?.adjuntos || []) : [];
    if (!estado) { mostrarAviso(`Seleccioná el estado de ${alumno.nombre}.`, 'error'); return; }
    if (justificada && estado !== 'ausente') { mostrarAviso('Solo se puede justificar una ausencia.', 'error'); return; }
    if (justificada && !motivo) { mostrarAviso('Escribí la explicación de la justificación.', 'error'); return; }
    if (files.length + anteriores.length > 5) { mostrarAviso('Se permiten hasta 5 imágenes por justificación.', 'error'); return; }
    if (files.some(file => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024)) {
      mostrarAviso('Cada imagen debe ser JPG, PNG o WebP y pesar como máximo 10 MB.', 'error');
      return;
    }

    button.disabled = true;
    button.textContent = 'Guardando...';
    const payload = {
      id: previo?.id || null,
      alumnoId,
      cursoId: curso.id,
      fecha: document.getElementById('asistencia-fecha').value,
      anioLectivo: anioLectivoActivo,
      estado,
      justificada,
      motivo: justificada ? motivo : null,
      adjuntos: anteriores
    };
    const guardado = await guardarAsistenciaDB(payload);
    if (!guardado.ok) {
      button.disabled = false;
      button.textContent = 'Guardar';
      mostrarAviso(guardado.error, 'error');
      return;
    }
    const asistenciaId = payload.id || guardado.data;
    const subidas = [];
    for (const file of files) {
      const resultado = await subirImagenJustificacion(asistenciaId, file);
      if (!resultado.ok) {
        const cleanup = await eliminarImagenesJustificacion(subidas);
        button.disabled = false;
        button.textContent = 'Guardar';
        mostrarAviso(`La asistencia se guardó, pero no se pudo adjuntar una imagen: ${resultado.error}${cleanup.ok ? '' : ` ${cleanup.error}`}`, 'error');
        await cargarAsistencia(payload.fecha);
        return;
      }
      subidas.push(resultado.path);
    }
    if (subidas.length) {
      const resultado = await guardarAsistenciaDB({ ...payload, id: asistenciaId, adjuntos: [...anteriores, ...subidas] });
      if (!resultado.ok) {
        const cleanup = await eliminarImagenesJustificacion(subidas);
        button.disabled = false;
        button.textContent = 'Guardar';
        mostrarAviso(`La asistencia se guardó, pero no se pudieron vincular las imágenes: ${resultado.error}${cleanup.ok ? '' : ` ${cleanup.error}`}`, 'error');
        await cargarAsistencia(payload.fecha);
        return;
      }
    }
    if (!justificada && previo?.adjuntos?.length) {
      const cleanup = await eliminarImagenesJustificacion(previo.adjuntos);
      if (!cleanup.ok) mostrarAviso(`Asistencia guardada. No se pudieron limpiar imágenes anteriores: ${cleanup.error}`, 'error');
    }
    mostrarAviso(`Asistencia guardada para ${alumno.nombre} ${alumno.apellido}.`, 'ok');
    await cargarAsistencia(payload.fecha);
  }

  /* ─────────────── COMENTARIOS DE CLASE Y FICHA ─────────────── */
  function configurarComentariosClase() {
    const formulario = document.getElementById('comentario-clase-form');
    const boton = document.getElementById('btn-agregar-comentario-clase');
    if (!puedeComentar()) {
      formulario.style.display = 'none';
    } else {
      boton.addEventListener('click', agregarComentarioClase);
    }
    refrescarComentariosClase();
  }

  async function refrescarComentariosClase() {
    const lista = document.getElementById('comentarios-clase-lista');
    lista.innerHTML = '<div class="seg-empty">Cargando comentarios...</div>';
    try {
      comentariosClase = await getComentariosDeClaseDB(curso.id);
      pintarComentariosClase();
    } catch (error) {
      lista.innerHTML = `<div class="seg-empty">No se pudieron cargar los comentarios: ${escapeHtml(error.message)}</div>`;
    }
  }

  function pintarComentariosClase() {
    const lista = document.getElementById('comentarios-clase-lista');
    lista.innerHTML = comentariosClase.length ? comentariosClase.map(comentario => `
      <article class="comentario-clase-item">
        <header><span><strong>${escapeHtml(comentario.autor_nombre)} ${escapeHtml(comentario.autor_apellido)}</strong>
          · ${escapeHtml(new Date(comentario.creado_en).toLocaleString('es-AR'))}
          · ${comentario.visible_para === 'profesor' ? 'Todos' : 'Dirección'}</span>
          ${(esAdmin() || comentario.autor_id === user.id) ? `<button type="button" data-eliminar-comentario="${escapeHtml(comentario.id)}">Eliminar</button>` : ''}
        </header>
        <p>${escapeHtml(comentario.texto)}</p>
      </article>`).join('') : '<p class="ficha-muted">Todavía no hay comentarios para esta clase.</p>';
    lista.querySelectorAll('[data-eliminar-comentario]').forEach(button => {
      button.addEventListener('click', async () => {
        const result = await eliminarComentarioDB(button.dataset.eliminarComentario);
        if (!result.ok) { mostrarAviso(result.error, 'error'); return; }
        await refrescarComentariosClase();
      });
    });
  }

  async function agregarComentarioClase() {
    const texto = document.getElementById('comentario-clase-texto');
    const boton = document.getElementById('btn-agregar-comentario-clase');
    const contenido = texto.value.trim();
    if (!contenido) { mostrarAviso('Escribí un comentario antes de guardarlo.', 'error'); return; }
    boton.disabled = true;
    const result = await agregarComentarioClaseDB(
      curso.id, contenido, document.getElementById('comentario-clase-visibilidad').value);
    boton.disabled = false;
    if (!result.ok) { mostrarAviso(result.error, 'error'); return; }
    texto.value = '';
    await refrescarComentariosClase();
  }

  function abrirFichaAlumno(alumnoId) {
    const fichaParams = new URLSearchParams({
      id: alumnoId,
      volver: 'curso',
      curso_id: curso.id
    });
    window.location.href = `ficha-alumno.html?${fichaParams.toString()}`;
  }

  /* ─────────────── SEGUIMIENTOS ─────────────── */
  function configurarSeguimientos() {
    const secSeg = document.getElementById('seguimientos-section');
    secSeg.style.display = 'block';

    const formWrap = document.getElementById('seg-form-wrapper');
    const hint = document.getElementById('seguimientos-hint');

    // Filtros de la lista (todos los roles)
    llenarSelectFiltro(
      barraFiltros.querySelector('[data-filtro="alumnoId"]'),
      curso.alumnos.map(a => ({ id: a.id, etiqueta: `${a.apellido}, ${a.nombre}` })),
      'Todos');
    conectarFiltros(barraFiltros, pintarSeguimientos);

    if (!puedeAgregar) {
      if (formWrap) formWrap.style.display = 'none';
      if (hint) hint.textContent = 'Vista de dirección — lo que elimines va a la papelera';
      return;
    }

    if (hint) hint.textContent = 'Quedan guardados en la base de datos';

    const sel = document.getElementById('seg-alumno');
    curso.alumnos.forEach(a => {
      const opt = document.createElement('option');
      opt.value = a.id;
      opt.textContent = `${a.apellido}, ${a.nombre}`;
      sel.appendChild(opt);
    });

    const selCat = document.getElementById('seg-categoria');
    const inpVal = document.getElementById('seg-valor');
    selCat.addEventListener('change', () => {
      if (selCat.value === 'nota') { inpVal.disabled = false; inpVal.focus(); }
      else { inpVal.disabled = true; inpVal.value = ''; }
    });

    document.querySelectorAll('input[name="seg-visibilidad"]').forEach(radio => {
      radio.addEventListener('change', actualizarAyudaVisibilidad);
    });
    // Al entrar siempre arranca en "Dirección", aunque el navegador
    // recuerde lo que estaba marcado antes de recargar.
    marcarVisibilidadPorDefecto();

    document.getElementById('btn-agregar-seg').addEventListener('click', agregarSeg);
    document.getElementById('seg-texto').addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); if (!e.repeat) agregarSeg(); }
    });
  }

  /** 'admin' (Dirección) o 'profesor' (Todos), según lo marcado en el formulario. */
  function visibilidadElegida() {
    const marcado = document.querySelector('input[name="seg-visibilidad"]:checked');
    return marcado ? marcado.value : VISIBILIDAD_POR_DEFECTO;
  }

  function actualizarAyudaVisibilidad() {
    document.getElementById('seg-visibilidad-ayuda').textContent =
      AYUDA_VISIBILIDAD[visibilidadElegida()] || '';
  }

  // Compartir con todos es siempre una decisión explícita: la opción
  // marcada por defecto es "Dirección".
  function marcarVisibilidadPorDefecto() {
    document.querySelector(`input[name="seg-visibilidad"][value="${VISIBILIDAD_POR_DEFECTO}"]`).checked = true;
    actualizarAyudaVisibilidad();
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /* Avisos en la página (reemplazan a los alert del navegador) */
  function mostrarAviso(mensaje, tipo) {
    const aviso = document.getElementById('seg-aviso');
    aviso.textContent = mensaje;
    aviso.className = `seg-aviso visible ${tipo}`;
    clearTimeout(avisoTimer);
    if (tipo === 'ok') avisoTimer = setTimeout(ocultarAviso, 6000);
  }

  function ocultarAviso() {
    clearTimeout(avisoTimer);
    document.getElementById('seg-aviso').className = 'seg-aviso';
  }

  function nombreAutor(s) {
    return `${s.profesor_nombre || ''} ${s.profesor_apellido || ''}`.trim() || 'Profesor';
  }

  async function refrescarSeguimientos() {
    const lista = document.getElementById('seguimientos-list');
    const estaCarga = ++cargaActual;
    lista.innerHTML = `<div class="seg-empty">Cargando seguimientos...</div>`;
    try {
      const filas = await getSeguimientosDeClaseDB(cursoId);
      if (estaCarga !== cargaActual) return;   // ya se pidió una carga más nueva
      seguimientos = filas;
    } catch (err) {
      if (estaCarga !== cargaActual) return;
      console.error('Error al cargar seguimientos:', err.message);
      seguimientos = [];
      barraFiltros.classList.add('oculto');
      document.getElementById('seg-filtros-resumen').textContent = '';
      lista.innerHTML = `<div class="seg-empty">
        No se pudieron cargar los seguimientos. Revisá tu conexión.
      </div>`;
      return;
    }

    // El filtro "Profesor" solo ofrece a los autores de lo que este
    // usuario puede ver: no revela quién más cargó seguimientos.
    llenarSelectFiltro(
      barraFiltros.querySelector('[data-filtro="profesorId"]'),
      opcionesUnicas(seguimientos, 'profesor_id',
        s => s.profesor_id === user.id ? `${nombreAutor(s)} (yo)` : nombreAutor(s)),
      'Todos');

    pintarSeguimientos();
  }

  function pintarSeguimientos() {
    const lista = document.getElementById('seguimientos-list');
    const resumen = document.getElementById('seg-filtros-resumen');

    barraFiltros.classList.toggle('oculto', seguimientos.length === 0);

    if (seguimientos.length === 0) {
      resumen.textContent = '';
      lista.innerHTML = `<div class="seg-empty">
        ${puedeAgregar
          ? 'Todavía no hay seguimientos en esta clase.<br>Agregá el primero usando el formulario de arriba.'
          : 'Todavía no hay seguimientos cargados en esta clase.'}
      </div>`;
      return;
    }

    const visibles = filtrarSeguimientos(seguimientos, leerFiltros(barraFiltros));
    resumen.innerHTML =
      `Mostrando <strong>${visibles.length}</strong> de <strong>${seguimientos.length}</strong> seguimientos`;

    if (visibles.length === 0) {
      lista.innerHTML = `<div class="seg-empty">Ningún seguimiento coincide con los filtros.</div>`;
      return;
    }

    lista.innerHTML = visibles.map(s => {
      const ini = (s.alumno_nombre[0] + s.alumno_apellido[0]).toUpperCase();
      const catLabel = ETIQUETA_CATEGORIA[s.categoria] || s.categoria;
      const valorPrefix = s.categoria === 'nota'
        ? `<span class="seg-nota-valor">${escapeHtml(s.valor)}</span>` : '';
      const visLabel = ETIQUETA_VISIBILIDAD[s.visible_para] || s.visible_para;
      const visTitle = s.visible_para === 'profesor'
        ? 'Lo ven dirección y los profesores del curso'
        : 'Lo ven dirección y su autor';
      const btnBorrar = puedeEliminarSeguimiento(s)
        ? `<button class="btn-seg-eliminar" data-id="${escapeHtml(s.id)}" title="Eliminar" aria-label="Eliminar seguimiento">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
               <polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/>
             </svg>
             <span class="btn-seg-eliminar-texto">¿Eliminar?</span>
           </button>`
        : '';

      return `<div class="seg-item">
        <span class="seg-cat-badge seg-cat-${escapeHtml(s.categoria)}">${escapeHtml(catLabel)}</span>
        <div class="seg-body">
          <div class="seg-top">
            <div class="seg-top-left">
              <div class="alumno-avatar seg-avatar">${escapeHtml(ini)}</div>
              <span class="seg-alumno">${escapeHtml(s.alumno_apellido)}, ${escapeHtml(s.alumno_nombre)}</span>
              <span class="seg-vis-badge seg-vis-${escapeHtml(s.visible_para)}" title="${visTitle}">${escapeHtml(visLabel)}</span>
            </div>
            <span class="seg-meta">
              <span class="seg-autor">${escapeHtml(nombreAutor(s))}</span><span>·</span>
              <span>${formatearFechaHora(s.creado_en)}</span>
            </span>
          </div>
          <div class="seg-texto">${valorPrefix}${escapeHtml(s.texto)}</div>
        </div>
        ${btnBorrar}
      </div>`;
    }).join('');

    lista.querySelectorAll('.btn-seg-eliminar').forEach(btn => {
      btn.addEventListener('click', () => eliminarSeg(btn));
      btn.addEventListener('blur', () => cancelarConfirmacion(btn));
    });
  }

  function cancelarConfirmacion(btn) {
    clearTimeout(btn._desarmar);
    btn.classList.remove('confirmar');
    btn.title = 'Eliminar';
    btn.setAttribute('aria-label', 'Eliminar seguimiento');
  }

  // Eliminar pide confirmación en el mismo botón: el primer clic lo
  // transforma en "¿Eliminar?" y recién el segundo borra. El pedido se
  // desarma solo a los pocos segundos o al salir del botón, y un doble
  // clic no alcanza para confirmar.
  async function eliminarSeg(btn) {
    if (btn.disabled) return;
    if (!btn.classList.contains('confirmar')) {
      btn.classList.add('confirmar');
      btn.title = 'Hacé clic otra vez para confirmar';
      btn.setAttribute('aria-label', 'Confirmar: eliminar seguimiento');
      btn._armadoEn = Date.now();
      btn._desarmar = setTimeout(() => cancelarConfirmacion(btn), CONFIRMAR_MS);
      return;
    }
    if (Date.now() - btn._armadoEn < 500) return;   // segundo clic de un doble clic

    clearTimeout(btn._desarmar);
    btn.disabled = true;
    const r = await eliminarSeguimientoDB(btn.dataset.id);
    if (!r.ok) {
      btn.disabled = false;
      cancelarConfirmacion(btn);
      mostrarAviso(r.error, 'error');
      return;
    }
    mostrarAviso(esAdmin()
      ? 'Seguimiento movido a la papelera. Podés restaurarlo desde Panel Admin → Papelera.'
      : 'Seguimiento eliminado. Dirección puede restaurarlo desde la papelera.', 'ok');
    await refrescarSeguimientos();
  }

  async function agregarSeg() {
    const btn = document.getElementById('btn-agregar-seg');
    if (btn.disabled) return;   // ya hay un guardado en curso (Enter repetido)

    const campos = ['seg-alumno', 'seg-categoria', 'seg-texto', 'seg-valor']
      .map(id => document.getElementById(id));
    const [selAlumno, selCategoria, inpTexto, inpValor] = campos;

    const alumnoId = selAlumno.value;
    const categoria = selCategoria.value;
    const texto = inpTexto.value.trim();
    const valor = inpValor.value;
    const visiblePara = visibilidadElegida();

    campos.forEach(c => c.classList.remove('seg-campo-error'));
    ocultarAviso();

    if (!alumnoId)  { selAlumno.classList.add('seg-campo-error'); return; }
    if (!categoria) { selCategoria.classList.add('seg-campo-error'); return; }
    if (categoria === 'nota' && !valor) { inpValor.classList.add('seg-campo-error'); return; }
    if (!texto)     { inpTexto.classList.add('seg-campo-error'); return; }

    btn.disabled = true;
    const r = await agregarSeguimientoDB(cursoId, alumnoId, { categoria, texto, valor, visiblePara });
    btn.disabled = false;
    if (!r.ok) { mostrarAviso(r.error, 'error'); return; }

    inpTexto.value = '';
    inpValor.value = '';
    selCategoria.value = '';
    selAlumno.value = '';
    inpValor.disabled = true;
    marcarVisibilidadPorDefecto();

    mostrarAviso(visiblePara === 'profesor'
      ? 'Seguimiento guardado. Lo ven dirección y los profesores de este curso.'
      : 'Seguimiento guardado. Solo lo ven dirección y vos.', 'ok');
    await refrescarSeguimientos();

    // Si los filtros activos lo dejan afuera de la lista, se limpian para que se vea.
    const idNuevo = r.data && r.data.id;
    const aLaVista = filtrarSeguimientos(seguimientos, leerFiltros(barraFiltros)).some(s => s.id === idNuevo);
    if (idNuevo && !aLaVista && seguimientos.some(s => s.id === idNuevo)) {
      limpiarFiltros(barraFiltros);
      pintarSeguimientos();
    }
  }
})();
