/**
 * curso.js — Detalle de un curso.
 *  - Tabla de alumnos (sin legajo si es profesor — lo filtra RLS).
 *  - Seguimientos: el profesor agrega/borra (borrado LÓGICO/soft delete),
 *    admin/superadmin solo lectura.
 *  - Acceso bloqueado si la clase no es visible para el usuario (RLS).
 * Depende de: supabase.js, auth.js, components.js
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

  let curso = null;

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
      renderAlumnos(curso.alumnos);
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
      <div class="badge">${curso.nivel.toUpperCase()}</div>
      <h1 class="page-title">Curso <span>${curso.nombre}</span></h1>
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
          Turno ${curso.turno}
        </span>
        <span class="meta-pill">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          </svg>
          Aula ${curso.aula}
        </span>
      </div>`;
  }

  function configurarTablaAlumnos() {
    const thead = document.getElementById('thead-row');
    thead.innerHTML = verLegajo
      ? `<th>#</th><th>Legajo</th><th>Nombre y Apellido</th><th>Edad</th><th>DNI</th>`
      : `<th>#</th><th>Nombre y Apellido</th><th>Edad</th>`;
    document.getElementById('search-input')
      .addEventListener('input', e => filtrarAlumnos(e.target.value));
  }

  function iniciales(n, ap) { return (n[0] + ap[0]).toUpperCase(); }

  function crearFila(a, i) {
    const edad = a.edad != null ? a.edad : '—';
    const nombre = `
      <td>
        <div class="alumno-nombre-cell">
          <div class="alumno-avatar">${iniciales(a.nombre, a.apellido)}</div>
          <span>${a.apellido}, ${a.nombre}</span>
        </div>
      </td>`;
    if (verLegajo) {
      return `<tr>
        <td style="color:var(--white-40);font-size:13px;">${i + 1}</td>
        <td><span class="legajo-badge">${a.legajo}</span></td>
        ${nombre}
        <td style="font-size:13px;">${edad} años</td>
        <td style="font-family:'Courier New',monospace;font-size:13px;">${a.dni}</td>
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

  function filtrarAlumnos(q) {
    const term = q.toLowerCase().trim();
    if (!term) { renderAlumnos(curso.alumnos); return; }
    renderAlumnos(curso.alumnos.filter(a =>
      a.nombre.toLowerCase().includes(term) ||
      a.apellido.toLowerCase().includes(term) ||
      (verLegajo && String(a.legajo).includes(term))
    ));
  }

  /* ─────────────── SEGUIMIENTOS ─────────────── */
  function configurarSeguimientos() {
    const secSeg = document.getElementById('seguimientos-section');
    secSeg.style.display = 'block';

    const formWrap = document.getElementById('seg-form-wrapper');
    const hint = document.getElementById('seguimientos-hint');

    if (!puedeAgregar) {
      if (formWrap) formWrap.style.display = 'none';
      if (hint) hint.textContent = 'Solo lectura — los seguimientos los cargan los profesores';
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

    document.getElementById('btn-agregar-seg').addEventListener('click', agregarSeg);
    document.getElementById('seg-texto').addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); agregarSeg(); }
    });
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatearHora(iso) {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  async function refrescarSeguimientos() {
    const lista = document.getElementById('seguimientos-list');
    lista.innerHTML = `<div class="seg-empty">Cargando seguimientos...</div>`;
    try {
      const todos = await getSeguimientosDeClaseDB(cursoId);
      renderSeguimientos(todos);
    } catch (err) {
      console.error('Error al cargar seguimientos:', err.message);
      lista.innerHTML = `<div class="seg-empty">
        No se pudieron cargar los seguimientos. Revisá tu conexión.
      </div>`;
    }
  }

  function renderSeguimientos(todos) {
    const lista = document.getElementById('seguimientos-list');
    if (!todos || todos.length === 0) {
      lista.innerHTML = `<div class="seg-empty">
        ${puedeAgregar
          ? 'Todavía no hay seguimientos en esta clase.<br>Agregá el primero usando el formulario de arriba.'
          : 'Todavía no hay seguimientos cargados en esta clase.'}
      </div>`;
      return;
    }

    lista.innerHTML = todos.map(s => {
      const ini = (s.alumno_nombre[0] + s.alumno_apellido[0]).toUpperCase();
      const catLabel = { conducta: 'Conducta', actitud: 'Actitud', nota: 'Nota', observacion: 'Observación' }[s.categoria] || s.categoria;
      const valorPrefix = s.categoria === 'nota' ? `<span class="seg-nota-valor">${s.valor}</span>` : '';
      const puedeBorrar = puedeAgregar && s.profesor_id === user.id;
      const btnBorrar = puedeBorrar
        ? `<button class="btn-seg-eliminar" data-id="${s.id}" title="Eliminar">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
               <polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/>
             </svg>
           </button>`
        : '';
      const autorNombre = `${s.profesor_nombre} ${s.profesor_apellido}`;

      return `<div class="seg-item">
        <span class="seg-cat-badge seg-cat-${s.categoria}">${catLabel}</span>
        <div class="seg-body">
          <div class="seg-top">
            <div class="seg-top-left">
              <div class="alumno-avatar" style="width:28px;height:28px;font-size:10px;">${ini}</div>
              <span class="seg-alumno">${s.alumno_apellido}, ${s.alumno_nombre}</span>
            </div>
            <span class="seg-meta">
              <span class="seg-autor">${escapeHtml(autorNombre)}</span><span>·</span>
              <span>${formatearHora(s.creado_en)}</span>
            </span>
          </div>
          <div class="seg-texto">${valorPrefix}${escapeHtml(s.texto)}</div>
        </div>
        ${btnBorrar}
      </div>`;
    }).join('');

    lista.querySelectorAll('.btn-seg-eliminar').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        const r = await eliminarSeguimientoDB(btn.dataset.id);
        if (!r.ok) { alert(r.error); btn.disabled = false; return; }
        await refrescarSeguimientos();
      });
    });
  }

  async function agregarSeg() {
    const legajo = document.getElementById('seg-alumno').value;
    const categoria = document.getElementById('seg-categoria').value;
    const texto = document.getElementById('seg-texto').value.trim();
    const valor = document.getElementById('seg-valor').value;

    ['seg-alumno', 'seg-categoria', 'seg-texto', 'seg-valor'].forEach(id => {
      document.getElementById(id).style.borderColor = '';
    });
    if (!legajo)    { document.getElementById('seg-alumno').style.borderColor = '#E24B4A'; return; }
    if (!categoria) { document.getElementById('seg-categoria').style.borderColor = '#E24B4A'; return; }
    if (categoria === 'nota' && !valor) { document.getElementById('seg-valor').style.borderColor = '#E24B4A'; return; }
    if (!texto)     { document.getElementById('seg-texto').style.borderColor = '#E24B4A'; return; }

    const btn = document.getElementById('btn-agregar-seg');
    btn.disabled = true;
    const r = await agregarSeguimientoDB(cursoId, legajo, { categoria, texto, valor });
    btn.disabled = false;
    if (!r.ok) { alert(r.error); return; }

    document.getElementById('seg-texto').value = '';
    document.getElementById('seg-valor').value = '';
    document.getElementById('seg-categoria').value = '';
    document.getElementById('seg-alumno').value = '';
    document.getElementById('seg-valor').disabled = true;
    await refrescarSeguimientos();
  }
})();
