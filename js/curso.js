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

  const params = new URLSearchParams(window.location.search);
  // Superadmin (botón "Ver" del panel): gestión completa de la clase (js/curso-gestion.js)
  const esGestor = esSuperadmin() && typeof window.CursoGestion !== 'undefined';
  const vieneDelPanel = esGestor && params.get('volver') === 'superadmin';

  const btnBackTop = document.getElementById('btn-back-top');
  const btnBackBot = document.getElementById('btn-back-bottom');
  // Vuelve al panel con el mismo colegio abierto, en la pestaña Clases
  const urlPanel = () => {
    const colegio = params.get('colegio') || (curso && curso.colegio_id);   // se llama al hacer clic, curso ya existe
    return colegio ? `superadmin.html?colegio=${encodeURIComponent(colegio)}&tab=clases` : 'superadmin.html';
  };
  const volver = () => {
    if (vieneDelPanel) window.location.href = urlPanel();
    else history.back();
  };
  [btnBackTop, btnBackBot].forEach(b => {
    if (!b) return;
    if (vieneDelPanel) b.textContent = '← Volver al panel';
    b.addEventListener('click', volver);
  });

  const user = getUsuarioActual();
  const verLegajo = puedeVerLegajo();
  const verDni = puedeVerDni();
  const puedeAgregar = puedeAgregarSeguimiento();

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
      if (esGestor) await CursoGestion.iniciar(curso, { alCambiar: recargarCurso });
      await configurarAsistencia();
      // Viene del popup "Pasar asistencia" del inicio: ir directo a la tabla.
      if (location.hash === '#asistencia') {
        document.getElementById('asistencia-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
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

  /** Superadmin cambió algo de la clase o de sus alumnos: recargar y volver a pintar. */
  async function recargarCurso() {
    const nuevo = await getClaseByIdDB(cursoId);
    if (!nuevo) { window.location.href = vieneDelPanel ? urlPanel() : 'clases.html'; return; }
    curso = nuevo;
    document.title = `${curso.nombre} — Fichaula`;
    renderHeader();
    filtrarAlumnos(document.getElementById('search-input').value);
    CursoGestion.actualizar(curso);
    if (anioLectivoActivo) await recargarConservando([]);
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
      '<th>Ficha</th>',
      esGestor ? '<th>Acciones</th>' : ''
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
      ${esGestor ? `<td><div class="gestion-acciones-fila">
        <button class="btn-ficha" data-editar-alumno="${escapeHtml(a.id)}">Editar</button>
        <button class="btn-ficha gestion-btn-borrar" data-eliminar-alumno="${escapeHtml(a.id)}">Eliminar</button>
      </div></td>` : ''}
    </tr>`;
  }

  function actualizarContador(n) {
    document.getElementById('alumnos-count-label').innerHTML =
      `Mostrando <strong>${n}</strong> de <strong>${curso.alumnos.length}</strong> alumnos`;
  }

  function renderAlumnos(lista) {
    const tbody = document.getElementById('alumnos-tbody');
    const colspan = 4 + Number(verLegajo) + Number(verDni) + Number(esGestor);
    tbody.innerHTML = lista.length === 0
      ? `<tr><td colspan="${colspan}" class="no-results">No se encontraron alumnos.</td></tr>`
      : lista.map((a, i) => crearFila(a, i)).join('');
    tbody.querySelectorAll('[data-ficha-alumno]').forEach(button => {
      button.addEventListener('click', () => abrirFichaAlumno(button.dataset.fichaAlumno));
    });
    if (esGestor) {
      tbody.querySelectorAll('[data-editar-alumno]').forEach(b =>
        b.addEventListener('click', () => CursoGestion.editarAlumno(b.dataset.editarAlumno)));
      tbody.querySelectorAll('[data-eliminar-alumno]').forEach(b =>
        b.addEventListener('click', () => CursoGestion.eliminarAlumno(b.dataset.eliminarAlumno)));
    }
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
    inputFecha.dataset.anterior = inputFecha.value;
    inputFecha.addEventListener('change', () => {
      // Cambiar de fecha descarta lo no guardado: preguntar antes.
      const pendientes = filasModificadas().length;
      if (pendientes && !window.confirm(
        `Hay ${pendientes} alumno${pendientes === 1 ? '' : 's'} con cambios sin guardar. ¿Cambiar de fecha igual y descartarlos?`)) {
        inputFecha.value = inputFecha.dataset.anterior;
        return;
      }
      inputFecha.dataset.anterior = inputFecha.value;
      ocultarAvisoAsistencia();
      cargarAsistencia(inputFecha.value);
    });
    document.getElementById('btn-asistencia-guardar-todo').addEventListener('click', guardarTodaLaAsistencia);
    document.querySelectorAll('[data-marcar-todos]').forEach(boton => {
      boton.addEventListener('click', () => marcarSinRegistrarComo(boton.dataset.marcarTodos));
    });
    window.addEventListener('beforeunload', e => {
      if (filasModificadas().length) { e.preventDefault(); e.returnValue = ''; }
    });
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
    actualizarPendientes();
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
      document.getElementById('asistencia-bulk').hidden = true;
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
          <select class="asistencia-estado" data-estado="${escapeHtml(estado)}" aria-label="Estado de ${escapeHtml(alumno.nombre)} ${escapeHtml(alumno.apellido)}">
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
    document.getElementById('asistencia-bulk').hidden = false;
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
        estado.dataset.estado = estado.value;
        marcarFila(row);
      };
      estado.addEventListener('change', syncJustificacion);
      justificada.addEventListener('change', syncJustificacion);
      row.querySelector('.asistencia-motivo').addEventListener('input', () => marcarFila(row));
      row.querySelector('.asistencia-imagenes').addEventListener('change', () => marcarFila(row));
      syncJustificacion();
      row.querySelector('.asistencia-guardar').addEventListener('click', () => guardarAsistenciaFila(row));
    });
    actualizarPendientes();
  }

  /* ── Cambios sin guardar ── */
  function registroPrevio(alumnoId) {
    return asistenciaDelDia.find(registro => registro.alumno_id === alumnoId);
  }

  /** ¿La fila difiere de lo que está guardado en la base? */
  function filaModificada(row) {
    const previo = registroPrevio(row.dataset.asistenciaAlumno);
    const estado = row.querySelector('.asistencia-estado').value;
    const justificada = row.querySelector('.asistencia-justificada').checked;
    const motivo = row.querySelector('.asistencia-motivo').value.trim();
    const files = row.querySelector('.asistencia-imagenes').files;
    return estado !== (previo?.estado || '') ||
      justificada !== Boolean(previo?.justificada) ||
      (justificada && motivo !== (previo?.motivo || '').trim()) ||
      Boolean(files && files.length);
  }

  function filasModificadas() {
    return Array.from(document.querySelectorAll('#asistencia-tbody tr[data-asistencia-alumno]'))
      .filter(filaModificada);
  }

  function marcarFila(row) {
    row.classList.toggle('asistencia-modificada', filaModificada(row));
    row.classList.remove('asistencia-error');
    actualizarPendientes();
  }

  function actualizarPendientes() {
    const n = filasModificadas().length;
    document.getElementById('asistencia-pendientes').textContent =
      n ? `${n} cambio${n === 1 ? '' : 's'} sin guardar` : '';
    const boton = document.getElementById('btn-asistencia-guardar-todo');
    if (!boton.dataset.guardando) {
      boton.disabled = !n;
      boton.textContent = n ? `Guardar todo (${n})` : 'Guardar todo';
    }
  }

  /** Atajo: pone el estado elegido en todos los alumnos que siguen "Sin registrar". */
  function marcarSinRegistrarComo(estado) {
    document.querySelectorAll('#asistencia-tbody tr[data-asistencia-alumno]').forEach(row => {
      const select = row.querySelector('.asistencia-estado');
      if (select.value) return;
      select.value = estado;
      select.dispatchEvent(new Event('change'));
    });
  }

  /** Foto de lo no guardado (estado, justificación, motivo) para reponerlo tras recargar. */
  function capturarPendientes(excluirIds) {
    const excluir = new Set(excluirIds || []);
    return filasModificadas()
      .filter(row => !excluir.has(row.dataset.asistenciaAlumno))
      .map(row => ({
        alumnoId: row.dataset.asistenciaAlumno,
        estado: row.querySelector('.asistencia-estado').value,
        justificada: row.querySelector('.asistencia-justificada').checked,
        motivo: row.querySelector('.asistencia-motivo').value
      }));
  }

  function reponerPendientes(pendientes, conError) {
    const errores = new Set(conError || []);
    pendientes.forEach(p => {
      const row = document.querySelector(`#asistencia-tbody tr[data-asistencia-alumno="${CSS.escape(p.alumnoId)}"]`);
      if (!row) return;
      const select = row.querySelector('.asistencia-estado');
      const check = row.querySelector('.asistencia-justificada');
      select.value = p.estado;
      select.dispatchEvent(new Event('change'));
      check.checked = p.justificada;
      check.dispatchEvent(new Event('change'));
      row.querySelector('.asistencia-motivo').value = p.motivo;
      marcarFila(row);
      if (errores.has(p.alumnoId)) row.classList.add('asistencia-error');
    });
  }

  /** Recarga la tabla sin perder lo que el usuario cargó y todavía no guardó. */
  async function recargarConservando(excluirIds, conError) {
    const pendientes = capturarPendientes(excluirIds);
    await cargarAsistencia(document.getElementById('asistencia-fecha').value);
    reponerPendientes(pendientes, conError);
    return pendientes;
  }

  /* ── Guardado ── */
  /** Valida una fila. Devuelve { error } o { datos } listos para guardar. */
  function validarFila(row) {
    const alumnoId = row.dataset.asistenciaAlumno;
    const alumno = curso.alumnos.find(item => item.id === alumnoId);
    const nombre = `${alumno.apellido}, ${alumno.nombre}`;
    const previo = registroPrevio(alumnoId);
    const estado = row.querySelector('.asistencia-estado').value;
    const justificada = row.querySelector('.asistencia-justificada').checked;
    const motivo = row.querySelector('.asistencia-motivo')?.value.trim() || '';
    const files = Array.from(row.querySelector('.asistencia-imagenes')?.files || []);
    const anteriores = justificada ? (previo?.adjuntos || []) : [];
    if (!estado) {
      return { error: previo
        ? `${nombre}: un registro guardado no se puede volver a "Sin registrar".`
        : `Seleccioná el estado de ${alumno.nombre}.` };
    }
    if (justificada && estado !== 'ausente') return { error: `${nombre}: solo se puede justificar una ausencia.` };
    if (justificada && !motivo) return { error: `${nombre}: escribí la explicación de la justificación.` };
    if (files.length + anteriores.length > 5) return { error: `${nombre}: se permiten hasta 5 imágenes por justificación.` };
    if (files.some(file => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024)) {
      return { error: `${nombre}: cada imagen debe ser JPG, PNG o WebP y pesar como máximo 10 MB.` };
    }
    return {
      datos: {
        alumno, previo, files, anteriores, justificada,
        payload: {
          id: previo?.id || null,
          alumnoId,
          cursoId: curso.id,
          fecha: document.getElementById('asistencia-fecha').value,
          anioLectivo: anioLectivoActivo,
          estado,
          justificada,
          motivo: justificada ? motivo : null,
          adjuntos: anteriores
        }
      }
    };
  }

  /**
   * Guarda una fila ya validada (registro + imágenes). No recarga la tabla.
   * @returns {{ok: boolean, guardado: boolean, error?: string, aviso?: string}}
   *   guardado = el estado quedó en la base aunque algo de las imágenes fallara.
   */
  async function guardarFilaValidada(row, { alumno, previo, files, anteriores, justificada, payload }) {
    const button = row.querySelector('.asistencia-guardar');
    const nombre = `${alumno.apellido}, ${alumno.nombre}`;
    button.disabled = true;
    button.textContent = 'Guardando...';
    try {
      const guardado = await guardarAsistenciaDB(payload);
      if (!guardado.ok) return { ok: false, guardado: false, error: `${nombre}: ${guardado.error}` };
      const asistenciaId = payload.id || guardado.data;
      const subidas = [];
      for (const file of files) {
        const resultado = await subirImagenJustificacion(asistenciaId, file);
        if (!resultado.ok) {
          const cleanup = await eliminarImagenesJustificacion(subidas);
          return { ok: false, guardado: true,
            error: `${nombre}: la asistencia se guardó, pero no se pudo adjuntar una imagen: ${resultado.error}${cleanup.ok ? '' : ` ${cleanup.error}`}` };
        }
        subidas.push(resultado.path);
      }
      if (subidas.length) {
        const resultado = await guardarAsistenciaDB({ ...payload, id: asistenciaId, adjuntos: [...anteriores, ...subidas] });
        if (!resultado.ok) {
          const cleanup = await eliminarImagenesJustificacion(subidas);
          return { ok: false, guardado: true,
            error: `${nombre}: la asistencia se guardó, pero no se pudieron vincular las imágenes: ${resultado.error}${cleanup.ok ? '' : ` ${cleanup.error}`}` };
        }
      }
      if (!justificada && previo?.adjuntos?.length) {
        const cleanup = await eliminarImagenesJustificacion(previo.adjuntos);
        if (!cleanup.ok) return { ok: true, guardado: true, aviso: `${nombre}: no se pudieron limpiar imágenes anteriores: ${cleanup.error}` };
      }
      return { ok: true, guardado: true };
    } finally {
      button.disabled = false;
      button.textContent = 'Guardar';
    }
  }

  async function guardarAsistenciaFila(row) {
    const alumnoId = row.dataset.asistenciaAlumno;
    const validacion = validarFila(row);
    if (validacion.error) {
      row.classList.add('asistencia-error');
      mostrarAvisoAsistencia(validacion.error, 'error');
      return;
    }
    const r = await guardarFilaValidada(row, validacion.datos);
    if (!r.ok && !r.guardado) {
      row.classList.add('asistencia-error');
      mostrarAvisoAsistencia(r.error, 'error');
      return;
    }
    if (!r.ok) mostrarAvisoAsistencia(r.error, 'error');
    else if (r.aviso) mostrarAvisoAsistencia(`Asistencia guardada. ${r.aviso}`, 'error');
    else mostrarAvisoAsistencia(`Asistencia guardada para ${validacion.datos.alumno.nombre} ${validacion.datos.alumno.apellido}.`, 'ok');
    // Las demás filas con cambios sin guardar se conservan.
    await recargarConservando([alumnoId]);
  }

  /** "Guardar todo": guarda de una vez todas las filas con cambios. */
  async function guardarTodaLaAsistencia() {
    const boton = document.getElementById('btn-asistencia-guardar-todo');
    if (boton.dataset.guardando) return;
    const filas = filasModificadas();
    if (!filas.length) return;

    // 1) Validar todo antes de guardar nada.
    const validas = [];
    const errores = [];
    filas.forEach(row => {
      const v = validarFila(row);
      if (v.error) { errores.push(v.error); row.classList.add('asistencia-error'); }
      else validas.push({ row, datos: v.datos });
    });
    if (errores.length) {
      mostrarAvisoAsistencia(
        `No se guardó nada. Corregí ${errores.length === 1 ? 'esto' : `estos ${errores.length} casos`}: ${errores.join(' · ')}`,
        'error');
      const primera = document.querySelector('#asistencia-tbody tr.asistencia-error');
      if (primera) primera.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    // 2) Guardar en tandas (sin saturar la conexión).
    boton.dataset.guardando = '1';
    boton.disabled = true;
    boton.textContent = `Guardando 0 de ${validas.length}...`;
    document.querySelectorAll('[data-marcar-todos]').forEach(b => { b.disabled = true; });
    const fallidas = [];      // no quedaron guardadas: se conservan para reintentar
    const problemas = [];     // mensajes de error (incluye imágenes)
    let listas = 0;
    const TANDA = 4;
    try {
      for (let i = 0; i < validas.length; i += TANDA) {
        const tanda = validas.slice(i, i + TANDA);
        const resultados = await Promise.all(tanda.map(item => guardarFilaValidada(item.row, item.datos)));
        resultados.forEach((r, j) => {
          const alumnoId = tanda[j].row.dataset.asistenciaAlumno;
          if (!r.guardado) fallidas.push(alumnoId);
          if (r.error) problemas.push(r.error);
          if (r.aviso) problemas.push(r.aviso);
        });
        listas += tanda.length;
        boton.textContent = `Guardando ${listas} de ${validas.length}...`;
      }
    } finally {
      delete boton.dataset.guardando;
      document.querySelectorAll('[data-marcar-todos]').forEach(b => { b.disabled = false; });
    }

    // 3) Recargar conservando solo lo que no se pudo guardar.
    const guardadas = validas
      .map(item => item.row.dataset.asistenciaAlumno)
      .filter(id => !fallidas.includes(id));
    await recargarConservando(guardadas, fallidas);

    const ok = guardadas.length;
    if (!problemas.length) {
      mostrarAvisoAsistencia(`Asistencia guardada para ${ok} alumno${ok === 1 ? '' : 's'}.`, 'ok');
    } else {
      mostrarAvisoAsistencia(
        `Se guardaron ${ok} de ${validas.length}. ${problemas.join(' · ')}` +
        (fallidas.length ? ' Las filas marcadas en rojo siguen sin guardar (si tenían imágenes, volvé a adjuntarlas).' : ''),
        'error');
    }
  }

  function mostrarAvisoAsistencia(mensaje, tipo) {
    const aviso = document.getElementById('asistencia-aviso');
    aviso.textContent = mensaje;
    aviso.className = `seg-aviso visible ${tipo}`;
    clearTimeout(aviso._ocultar);
    if (tipo === 'ok') aviso._ocultar = setTimeout(ocultarAvisoAsistencia, 6000);
  }

  function ocultarAvisoAsistencia() {
    const aviso = document.getElementById('asistencia-aviso');
    clearTimeout(aviso._ocultar);
    aviso.className = 'seg-aviso';
  }

  /* ─────────────── COMENTARIOS DE CLASE Y FICHA ─────────────── */
  // Formulario y tarjetas compartidos con la ficha del alumno (js/seguimientos-ui.js)
  function configurarComentariosClase() {
    if (puedeComentar()) {
      document.getElementById('comentario-clase-form-contenedor').innerHTML = renderFormComentario('comentario-clase', {
        alumnos: curso.alumnos || [],
        placeholder: 'Escribí un comentario sobre esta clase...'
      });
      conectarFormComentario('comentario-clase', {
        guardar: ({ sobre, texto, visiblePara }) => sobre
          ? agregarComentarioDB(sobre, texto, visiblePara)          // sobre un alumno
          : agregarComentarioClaseDB(curso.id, texto, visiblePara), // sobre toda la clase
        alGuardar: async () => {
          avisarComentario('Comentario agregado.', 'ok');
          await refrescarComentariosClase();
        },
        avisar: avisarComentario
      });
    }
    refrescarComentariosClase();
  }

  function avisarComentario(mensaje, tipo) {
    const aviso = document.getElementById('comentario-clase-aviso');
    aviso.textContent = mensaje;
    aviso.className = `seg-aviso visible ${tipo}`;
    clearTimeout(aviso._ocultar);
    if (tipo === 'ok') aviso._ocultar = setTimeout(() => { aviso.className = 'seg-aviso'; }, 4000);
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
    lista.innerHTML = comentariosClase.length
      ? comentariosClase.map(c => renderComentarioItem(c)).join('')
      : '<div class="seg-empty">Todavía no hay comentarios para esta clase.</div>';
    conectarBorradoComentarios(lista, {
      alEliminar: async (mensaje) => {
        avisarComentario(mensaje, 'ok');
        await refrescarComentariosClase();
      },
      alFallar: (mensaje) => avisarComentario(mensaje, 'error')
    });
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

  const nombreAutor = nombreAutorSeguimiento;   // js/seguimientos-ui.js

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

    // Tarjeta compartida con la ficha del alumno (js/seguimientos-ui.js)
    lista.innerHTML = visibles.map(s => renderSeguimientoItem(s)).join('');
    conectarBorradoSeguimientos(lista, {
      alEliminar: async (mensaje) => {
        mostrarAviso(mensaje, 'ok');
        await refrescarSeguimientos();
      },
      alFallar: (mensaje) => mostrarAviso(mensaje, 'error')
    });
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
