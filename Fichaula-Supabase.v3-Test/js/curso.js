/**
 * curso.js — Detalle de un curso.
 *  - Tabla de alumnos con búsqueda (el legajo y el DNI solo los ve y
 *    los busca dirección).
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
  const puedeAgregar = puedeAgregarSeguimiento();

  const params = new URLSearchParams(window.location.search);
  const cursoId = params.get('id');

  const AYUDA_VISIBILIDAD = {
    admin: 'Solo lo ven dirección y vos.',
    profesor: 'Lo ven dirección y los demás profesores de este curso.'
  };
  const CONFIRMAR_MS = 4000;  // cuánto queda armado el "¿Eliminar?" antes de volver a la normalidad
  const barraFiltros = document.getElementById('seg-filtros');

  let curso = null;
  let seguimientos = [];   // lo que el servidor devolvió para este usuario
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
    thead.innerHTML = verLegajo
      ? `<th>#</th><th>Legajo</th><th>Nombre y Apellido</th><th>Edad</th><th>DNI</th>`
      : `<th>#</th><th>Nombre y Apellido</th><th>Edad</th>`;
    const buscador = document.getElementById('search-input');
    buscador.placeholder = verLegajo
      ? 'Buscar por nombre, apellido, legajo o DNI...'
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
    if (verLegajo) {
      return `<tr>
        <td style="color:var(--white-40);font-size:13px;">${i + 1}</td>
        <td><span class="legajo-badge">${escapeHtml(a.legajo)}</span></td>
        ${nombre}
        <td style="font-size:13px;">${edad} años</td>
        <td style="font-family:'Courier New',monospace;font-size:13px;">${escapeHtml(a.dni)}</td>
      </tr>`;
    }
    return `<tr>
      <td style="color:var(--white-40);font-size:13px;">${i + 1}</td>
      ${nombre}
      <td style="font-size:13px;">${edad} años</td>
    </tr>`;
  }

  function actualizarContador(n) {
    document.getElementById('alumnos-count-label').innerHTML =
      `Mostrando <strong>${n}</strong> de <strong>${curso.alumnos.length}</strong> alumnos`;
  }

  function renderAlumnos(lista) {
    const tbody = document.getElementById('alumnos-tbody');
    const colspan = verLegajo ? 5 : 3;
    tbody.innerHTML = lista.length === 0
      ? `<tr><td colspan="${colspan}" class="no-results">No se encontraron alumnos.</td></tr>`
      : lista.map((a, i) => crearFila(a, i)).join('');
    actualizarContador(lista.length);
  }

  // Legajo y DNI solo se pueden buscar si el usuario puede verlos.
  function filtrarAlumnos(q) {
    renderAlumnos(buscarAlumnos(curso.alumnos, q, { identificadores: verLegajo }));
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
      opt.value = a.legajo;
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

    const legajo = selAlumno.value;
    const categoria = selCategoria.value;
    const texto = inpTexto.value.trim();
    const valor = inpValor.value;
    const visiblePara = visibilidadElegida();

    campos.forEach(c => c.classList.remove('seg-campo-error'));
    ocultarAviso();

    if (!legajo)    { selAlumno.classList.add('seg-campo-error'); return; }
    if (!categoria) { selCategoria.classList.add('seg-campo-error'); return; }
    if (categoria === 'nota' && !valor) { inpValor.classList.add('seg-campo-error'); return; }
    if (!texto)     { inpTexto.classList.add('seg-campo-error'); return; }

    btn.disabled = true;
    const r = await agregarSeguimientoDB(cursoId, legajo, { categoria, texto, valor, visiblePara });
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
