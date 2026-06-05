/**
 * admin.js — Panel de administración (Supabase)
 * ═══════════════════════════════════════════════════════════
 * Reescrito para operar 100% contra la base de datos (sin data.js).
 * Todas las operaciones son asíncronas y la autorización real la
 * impone RLS en el servidor; acá solo cuidamos la UX.
 *
 *  Tabs: clases / alumnos / profesores / seguimientos
 *  Modal universal con onConfirm asíncrono (anti doble-submit).
 *
 * Acceso: admin y superadmin (requireAdmin).
 * Depende de: supabase.js, auth.js, components.js
 * ═══════════════════════════════════════════════════════════
 */
(function () {
  'use strict';

  requireAdmin();
  renderNav('admin', true);
  renderFooter();

  // Cachés de datos (se refrescan al renderizar cada tab)
  let _clases = [];
  let _profesores = [];
  let _alumnos = [];
  let _asignaciones = {}; // profesorId -> [cursoId]

  /* ════════════════ TABS ════════════════ */
  const tabs = document.querySelectorAll('.admin-tab');
  const panels = document.querySelectorAll('.admin-tab-panel');
  tabs.forEach(t => {
    t.addEventListener('click', () => {
      tabs.forEach(x => x.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));
      t.classList.add('active');
      document.getElementById('panel-' + t.dataset.tab).classList.add('active');
    });
  });

  /* ════════════════ MODAL UNIVERSAL ════════════════ */
  const modal = document.getElementById('modal');
  const mTitle = document.getElementById('modal-title');
  const mSub = document.getElementById('modal-sub');
  const mError = document.getElementById('modal-error');
  const mBody = document.getElementById('modal-body');
  const mCancel = document.getElementById('btn-modal-cancel');
  const mConfirm = document.getElementById('btn-modal-confirm');

  function abrirModal(opts) {
    mTitle.innerHTML = opts.title || '';
    mSub.textContent = opts.sub || '';
    mBody.innerHTML = opts.body || '';
    mError.classList.remove('visible');
    mError.textContent = '';
    mConfirm.textContent = opts.confirmText || 'Confirmar';
    mCancel.textContent = opts.cancelText || 'Cancelar';
    modal.classList.add('visible');

    mConfirm.onclick = async () => {
      mConfirm.disabled = true;
      const prev = mConfirm.textContent;
      mConfirm.textContent = 'Guardando...';
      try {
        const ok = opts.onConfirm ? await opts.onConfirm() : true;
        if (ok) cerrarModal();
      } catch (e) {
        modalError('Ocurrió un error inesperado. Intentá de nuevo.');
        console.error('Error en modal:', e.message);
      } finally {
        mConfirm.disabled = false;
        mConfirm.textContent = prev;
      }
    };
  }
  function cerrarModal() { modal.classList.remove('visible'); }
  function modalError(msg) { mError.textContent = msg; mError.classList.add('visible'); }

  mCancel.addEventListener('click', cerrarModal);
  modal.addEventListener('click', e => { if (e.target === modal) cerrarModal(); });

  /* ════════════════ ESCAPE HTML ════════════════ */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  /* ════════════════ TAB CLASES ════════════════ */
  let qClases = '';

  async function renderClases() {
    const tbody = document.getElementById('tbody-clases');
    tbody.innerHTML = `<tr class="empty-row"><td colspan="7">Cargando...</td></tr>`;
    try {
      _clases = await getClasesAdminDB();
    } catch (e) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="7">No se pudieron cargar las clases.</td></tr>`;
      return;
    }
    pintarClases();
  }

  function pintarClases() {
    const tbody = document.getElementById('tbody-clases');
    const term = qClases.toLowerCase().trim();
    let cursos = _clases.slice();
    if (term) {
      cursos = cursos.filter(c =>
        c.nombre.toLowerCase().includes(term) ||
        (c.nivel || '').toLowerCase().includes(term) ||
        (c.aula || '').toLowerCase().includes(term) ||
        (c.turno || '').toLowerCase().includes(term));
    }
    if (cursos.length === 0) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="7">No hay clases para mostrar.</td></tr>`;
      return;
    }
    tbody.innerHTML = cursos.map(c => {
      const profeNombre = c.titularNombre
        ? esc(c.titularNombre)
        : '<em style="color:var(--white-40);">Sin asignar</em>';
      return `<tr>
        <td><strong style="color:var(--white);">${esc(c.nombre)}</strong></td>
        <td>${esc(c.nivel)}</td>
        <td>${esc(c.turno)}</td>
        <td>${esc(c.aula)}</td>
        <td>${profeNombre}</td>
        <td><span class="cantidad-pill">${c.cantAlumnos}</span></td>
        <td class="acciones-col">
          <button class="btn-admin-secondary" data-act="editar" data-id="${esc(c.id)}">Editar</button>
          <button class="btn-admin-danger" data-act="eliminar" data-id="${esc(c.id)}">Eliminar</button>
        </td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('button[data-act]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.act === 'editar') modalEditarClase(btn.dataset.id);
        else modalEliminarClase(btn.dataset.id);
      });
    });
  }

  function buildOptionsProfesores(seleccionado) {
    let opts = '<option value="">Sin asignar</option>';
    _profesores.forEach(p => {
      const sel = (p.id === seleccionado) ? 'selected' : '';
      opts += `<option value="${p.id}" ${sel}>${esc(p.nombre)} ${esc(p.apellido)} — ${esc(p.materia)}</option>`;
    });
    return opts;
  }

  function modalNuevaClase() {
    abrirModal({
      title: 'Nueva <span>clase</span>',
      sub: 'El identificador se arma con el año y la división (ej: 7 + A → 7A)',
      confirmText: 'Crear clase',
      body: `
        <div class="modal-form-row">
          <div class="modal-form-group">
            <label>Año (1–7) <span style="color:#f08080;">*</span></label>
            <input type="number" id="m-anio" min="1" max="7" placeholder="Ej: 7">
          </div>
          <div class="modal-form-group">
            <label>División <span style="color:#f08080;">*</span></label>
            <input type="text" id="m-division" maxlength="1" placeholder="Ej: A">
          </div>
        </div>
        <div class="modal-form-group">
          <label>Nivel <span style="color:#f08080;">*</span></label>
          <input type="text" id="m-nivel" placeholder="Ej: Séptimo Año">
        </div>
        <div class="modal-form-row">
          <div class="modal-form-group">
            <label>Turno <span style="color:#f08080;">*</span></label>
            <select id="m-turno">
              <option value="">Seleccioná...</option>
              <option value="Mañana">Mañana</option>
              <option value="Tarde">Tarde</option>
              <option value="Noche">Noche</option>
            </select>
          </div>
          <div class="modal-form-group">
            <label>Aula <span style="color:#f08080;">*</span></label>
            <input type="text" id="m-aula" placeholder="Ej: 701">
          </div>
        </div>
        <div class="modal-form-group">
          <label>Profesor titular</label>
          <select id="m-profe">${buildOptionsProfesores()}</select>
        </div>
      `,
      onConfirm: async () => {
        const datos = {
          anio: document.getElementById('m-anio').value,
          division: document.getElementById('m-division').value,
          nivel: document.getElementById('m-nivel').value.trim(),
          turno: document.getElementById('m-turno').value,
          aula: document.getElementById('m-aula').value.trim(),
          profesorTitularId: document.getElementById('m-profe').value || null
        };
        if (!datos.nivel || !datos.turno || !datos.aula) {
          modalError('Completá nivel, turno y aula.'); return false;
        }
        const r = await crearClaseDB(datos);
        if (!r.ok) { modalError(r.error); return false; }
        await renderClases();
        return true;
      }
    });
  }

  function modalEditarClase(id) {
    const c = _clases.find(x => x.id === id);
    if (!c) return;
    abrirModal({
      title: `Editar <span>${esc(c.nombre)}</span>`,
      sub: 'El año y la división no se modifican (definen el identificador).',
      confirmText: 'Guardar cambios',
      body: `
        <div class="modal-form-group">
          <label>Nivel</label>
          <input type="text" id="m-nivel" value="${esc(c.nivel)}">
        </div>
        <div class="modal-form-row">
          <div class="modal-form-group">
            <label>Turno</label>
            <select id="m-turno">
              <option value="Mañana" ${c.turno === 'Mañana' ? 'selected' : ''}>Mañana</option>
              <option value="Tarde"  ${c.turno === 'Tarde'  ? 'selected' : ''}>Tarde</option>
              <option value="Noche"  ${c.turno === 'Noche'  ? 'selected' : ''}>Noche</option>
            </select>
          </div>
          <div class="modal-form-group">
            <label>Aula</label>
            <input type="text" id="m-aula" value="${esc(c.aula)}">
          </div>
        </div>
        <div class="modal-form-group">
          <label>Profesor titular</label>
          <select id="m-profe">${buildOptionsProfesores(c.profesor_titular_id)}</select>
        </div>
      `,
      onConfirm: async () => {
        const cambios = {
          nivel: document.getElementById('m-nivel').value.trim(),
          turno: document.getElementById('m-turno').value,
          aula: document.getElementById('m-aula').value.trim(),
          profesorTitularId: document.getElementById('m-profe').value || null
        };
        const r = await modificarClaseDB(id, cambios);
        if (!r.ok) { modalError(r.error); return false; }
        await renderClases();
        return true;
      }
    });
  }

  function modalEliminarClase(id) {
    const c = _clases.find(x => x.id === id);
    if (!c) return;
    abrirModal({
      title: 'Eliminar <span>clase</span>',
      sub: `Vas a eliminar "${c.nombre}". Si tiene alumnos, primero hay que reubicarlos.`,
      confirmText: 'Sí, eliminar',
      body: '',
      onConfirm: async () => {
        const r = await eliminarClaseDB(id);
        if (!r.ok) { modalError(r.error); return false; }
        await renderClases();
        return true;
      }
    });
  }

  document.getElementById('btn-nueva-clase').addEventListener('click', modalNuevaClase);
  document.getElementById('search-clases').addEventListener('input', e => {
    qClases = e.target.value; pintarClases();
  });

  /* ════════════════ TAB ALUMNOS ════════════════ */
  let qAlumnos = '';

  async function renderAlumnos() {
    const tbody = document.getElementById('tbody-alumnos');
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">Cargando...</td></tr>`;
    try {
      _alumnos = await getAlumnosAdminDB();
    } catch (e) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="6">No se pudieron cargar los alumnos.</td></tr>`;
      return;
    }
    pintarAlumnos();
  }

  function nombreCurso(a) {
    if (a.anio != null && a.division) return `${a.anio}° ${a.division}`;
    return a.curso_id || '—';
  }

  function pintarAlumnos() {
    const tbody = document.getElementById('tbody-alumnos');
    const term = qAlumnos.toLowerCase().trim();
    let lista = _alumnos.slice();
    if (term) {
      lista = lista.filter(a =>
        a.nombre.toLowerCase().includes(term) ||
        a.apellido.toLowerCase().includes(term) ||
        String(a.legajo).includes(term) ||
        (a.dni || '').replace(/\./g, '').includes(term.replace(/\./g, '')) ||
        nombreCurso(a).toLowerCase().includes(term));
    }
    if (lista.length === 0) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="6">No hay alumnos para mostrar.</td></tr>`;
      return;
    }
    tbody.innerHTML = lista.map(a => `
      <tr>
        <td><span class="legajo-badge">${esc(a.legajo)}</span></td>
        <td><strong style="color:var(--white);">${esc(a.apellido)}, ${esc(a.nombre)}</strong></td>
        <td style="font-family:'Courier New',monospace;">${esc(a.dni)}</td>
        <td>${a.edad != null ? a.edad : '—'} años</td>
        <td>${esc(nombreCurso(a))}</td>
        <td class="acciones-col">
          <button class="btn-admin-secondary" data-act="editar" data-id="${esc(a.id)}">Editar</button>
          <button class="btn-admin-danger" data-act="eliminar" data-id="${esc(a.id)}">Eliminar</button>
        </td>
      </tr>`).join('');

    tbody.querySelectorAll('button[data-act]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.act === 'editar') modalEditarAlumno(btn.dataset.id);
        else modalEliminarAlumno(btn.dataset.id);
      });
    });
  }

  function buildOptionsClases(seleccionado) {
    let opts = '<option value="">Seleccioná...</option>';
    _clases.forEach(c => {
      const sel = (c.id === seleccionado) ? 'selected' : '';
      opts += `<option value="${c.id}" ${sel}>${esc(c.nombre)} (${esc(c.nivel)})</option>`;
    });
    return opts;
  }

  function proximoLegajo() {
    let max = 0;
    _alumnos.forEach(a => {
      const n = parseInt(a.legajo, 10);
      if (!isNaN(n) && n > max) max = n;
    });
    return String(max + 1).padStart(3, '0');
  }

  function modalNuevoAlumno() {
    if (_clases.length === 0) {
      abrirModal({
        title: 'Nuevo <span>alumno</span>',
        sub: 'Primero tenés que crear al menos una clase.',
        confirmText: 'Entendido', body: '',
        onConfirm: async () => true
      });
      return;
    }
    abrirModal({
      title: 'Nuevo <span>alumno</span>',
      sub: `Se le asignará el legajo ${proximoLegajo()} automáticamente`,
      confirmText: 'Crear alumno',
      body: `
        <div class="modal-form-row">
          <div class="modal-form-group">
            <label>Nombre <span style="color:#f08080;">*</span></label>
            <input type="text" id="m-nombre" placeholder="Ej: María">
          </div>
          <div class="modal-form-group">
            <label>Apellido <span style="color:#f08080;">*</span></label>
            <input type="text" id="m-apellido" placeholder="Ej: Pérez">
          </div>
        </div>
        <div class="modal-form-row">
          <div class="modal-form-group">
            <label>DNI <span style="color:#f08080;">*</span></label>
            <input type="text" id="m-dni" placeholder="44.123.456">
          </div>
          <div class="modal-form-group">
            <label>Fecha de nacimiento <span style="color:#f08080;">*</span></label>
            <input type="date" id="m-fnac">
          </div>
        </div>
        <div class="modal-form-group">
          <label>Clase <span style="color:#f08080;">*</span></label>
          <select id="m-curso">${buildOptionsClases()}</select>
        </div>
      `,
      onConfirm: async () => {
        const datos = {
          legajo: proximoLegajo(),
          nombre: document.getElementById('m-nombre').value.trim(),
          apellido: document.getElementById('m-apellido').value.trim(),
          dni: document.getElementById('m-dni').value.trim(),
          fechaNacimiento: document.getElementById('m-fnac').value,
          cursoId: document.getElementById('m-curso').value
        };
        const r = await crearAlumnoDB(datos);
        if (!r.ok) { modalError(r.error); return false; }
        await renderAlumnos();
        await renderClases();
        return true;
      }
    });
  }

  function modalEditarAlumno(alumnoId) {
    const a = _alumnos.find(x => x.id === alumnoId);
    if (!a) return;
    abrirModal({
      title: `Editar <span>${esc(a.apellido)}, ${esc(a.nombre)}</span>`,
      sub: `Legajo ${a.legajo} · Clase ${nombreCurso(a)}`,
      confirmText: 'Guardar cambios',
      body: `
        <div class="modal-form-row">
          <div class="modal-form-group">
            <label>Nombre</label>
            <input type="text" id="m-nombre" value="${esc(a.nombre)}">
          </div>
          <div class="modal-form-group">
            <label>Apellido</label>
            <input type="text" id="m-apellido" value="${esc(a.apellido)}">
          </div>
        </div>
        <div class="modal-form-row">
          <div class="modal-form-group">
            <label>DNI</label>
            <input type="text" id="m-dni" value="${esc(a.dni)}">
          </div>
          <div class="modal-form-group">
            <label>Fecha de nacimiento</label>
            <input type="date" id="m-fnac" value="${esc(a.fecha_nacimiento)}">
          </div>
        </div>
        <div class="modal-form-group">
          <label>Clase</label>
          <select id="m-curso">${buildOptionsClases(a.curso_id)}</select>
        </div>
      `,
      onConfirm: async () => {
        const cambios = {
          nombre: document.getElementById('m-nombre').value.trim(),
          apellido: document.getElementById('m-apellido').value.trim(),
          dni: document.getElementById('m-dni').value.trim(),
          fechaNacimiento: document.getElementById('m-fnac').value,
          cursoId: document.getElementById('m-curso').value
        };
        const r = await modificarAlumnoDB(alumnoId, cambios);
        if (!r.ok) { modalError(r.error); return false; }
        await renderAlumnos();
        await renderClases();
        return true;
      }
    });
  }

  function modalEliminarAlumno(alumnoId) {
    const a = _alumnos.find(x => x.id === alumnoId);
    if (!a) return;
    abrirModal({
      title: 'Eliminar <span>alumno</span>',
      sub: `Vas a eliminar a ${a.nombre} ${a.apellido} (legajo ${a.legajo}). No se puede deshacer.`,
      confirmText: 'Sí, eliminar',
      body: '',
      onConfirm: async () => {
        const r = await eliminarAlumnoDB(alumnoId);
        if (!r.ok) { modalError(r.error); return false; }
        await renderAlumnos();
        await renderClases();
        return true;
      }
    });
  }

  document.getElementById('btn-nuevo-alumno').addEventListener('click', modalNuevoAlumno);
  document.getElementById('search-alumnos').addEventListener('input', e => {
    qAlumnos = e.target.value; pintarAlumnos();
  });

  /* ════════════════ TAB PROFESORES ════════════════ */
  let qProfes = '';

  async function renderProfesores() {
    const tbody = document.getElementById('tbody-profesores');
    tbody.innerHTML = `<tr class="empty-row"><td colspan="5">Cargando...</td></tr>`;
    try {
      _profesores = await getProfesoresDB();
      const filas = await sb.get('profesor_curso?select=profesor_id,curso_id');
      _asignaciones = {};
      filas.forEach(f => {
        (_asignaciones[f.profesor_id] = _asignaciones[f.profesor_id] || []).push(f.curso_id);
      });
    } catch (e) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="5">No se pudieron cargar los profesores.</td></tr>`;
      return;
    }
    pintarProfesores();
  }

  function pintarProfesores() {
    const tbody = document.getElementById('tbody-profesores');
    const term = qProfes.toLowerCase().trim();
    let lista = _profesores.slice();
    if (term) {
      lista = lista.filter(p =>
        p.nombre.toLowerCase().includes(term) ||
        p.apellido.toLowerCase().includes(term) ||
        (p.materia || '').toLowerCase().includes(term) ||
        (p.email || '').toLowerCase().includes(term));
    }
    if (lista.length === 0) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="5">No hay profesores.</td></tr>`;
      return;
    }
    tbody.innerHTML = lista.map(p => {
      const asignados = _asignaciones[p.id] || [];
      const cursos = asignados.length === 0
        ? '<em style="color:var(--white-40);">Ninguna</em>'
        : `<div class="curso-chips">${asignados.map(id => `<span class="curso-chip">${esc(id)}</span>`).join('')}</div>`;
      return `<tr>
        <td><strong style="color:var(--white);">${esc(p.nombre)} ${esc(p.apellido)}</strong></td>
        <td>${esc(p.materia)}</td>
        <td style="font-size:12px;color:var(--white-40);">${esc(p.email)}</td>
        <td>${cursos}</td>
        <td class="acciones-col">
          <button class="btn-admin-secondary" data-act="asignar" data-id="${p.id}">Asignar clases</button>
        </td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('button[data-act="asignar"]').forEach(btn => {
      btn.addEventListener('click', () => modalAsignarCursos(btn.dataset.id));
    });
  }

  function modalAsignarCursos(profeId) {
    const p = _profesores.find(x => x.id === profeId);
    if (!p) return;
    const asignados = _asignaciones[profeId] || [];
    const checks = _clases.map(c => {
      const ch = asignados.includes(c.id) ? 'checked' : '';
      return `<label class="curso-check-item">
        <input type="checkbox" value="${c.id}" ${ch}>
        <span>${esc(c.nombre)}</span>
      </label>`;
    }).join('');

    abrirModal({
      title: `Asignar clases a <span>${esc(p.nombre)} ${esc(p.apellido)}</span>`,
      sub: 'Marcá las clases que dicta este profesor.',
      confirmText: 'Guardar asignaciones',
      body: `<div class="curso-checklist">${checks || '<em style="color:var(--white-40);">No hay clases creadas.</em>'}</div>`,
      onConfirm: async () => {
        const seleccionados = Array.from(
          mBody.querySelectorAll('input[type="checkbox"]:checked')).map(i => i.value);
        const r = await asignarCursosAProfesorDB(profeId, seleccionados);
        if (!r.ok) { modalError(r.error); return false; }
        await renderProfesores();
        await renderClases();
        return true;
      }
    });
  }

  document.getElementById('search-profesores').addEventListener('input', e => {
    qProfes = e.target.value; pintarProfesores();
  });

  /* ════════════════ TAB SEGUIMIENTOS ════════════════ */
  let qSeg = '';
  let _seguimientos = [];

  async function renderSeguimientos() {
    const tbody = document.getElementById('tbody-seguimientos');
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">Cargando...</td></tr>`;
    try {
      _seguimientos = await getTodosLosSeguimientosDB();
    } catch (e) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="6">No se pudieron cargar los seguimientos.</td></tr>`;
      return;
    }
    pintarSeguimientos();
  }

  function pintarSeguimientos() {
    const tbody = document.getElementById('tbody-seguimientos');
    const term = qSeg.toLowerCase().trim();
    let lista = _seguimientos.slice();
    if (term) {
      lista = lista.filter(s =>
        `${s.alumno_apellido} ${s.alumno_nombre}`.toLowerCase().includes(term) ||
        `${s.profesor_nombre} ${s.profesor_apellido}`.toLowerCase().includes(term) ||
        s.categoria.toLowerCase().includes(term) ||
        (s.curso_nombre || '').toLowerCase().includes(term) ||
        (s.texto || '').toLowerCase().includes(term));
    }
    if (lista.length === 0) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="6">
        Todavía no hay seguimientos cargados por los profesores.</td></tr>`;
      return;
    }
    const catLabel = { conducta: 'Conducta', actitud: 'Actitud', nota: 'Nota', observacion: 'Observación' };
    tbody.innerHTML = lista.map(s => {
      const fecha = new Date(s.creado_en);
      const horaTxt = `${String(fecha.getHours()).padStart(2, '0')}:${String(fecha.getMinutes()).padStart(2, '0')}`;
      const valorTxt = s.categoria === 'nota' ? `<span class="seg-nota-valor">${s.valor}</span> ` : '';
      return `<tr>
        <td><span class="seg-cat-badge seg-cat-${s.categoria}">${catLabel[s.categoria] || s.categoria}</span></td>
        <td><strong style="color:var(--white);">${esc(s.alumno_apellido)}, ${esc(s.alumno_nombre)}</strong>
            <span style="color:var(--white-40);font-size:11px;"> · L. ${esc(s.alumno_legajo)}</span></td>
        <td>${esc(s.curso_nombre)}</td>
        <td>${valorTxt}${esc(s.texto)}</td>
        <td style="color:var(--violet-light);">${esc(s.profesor_nombre)} ${esc(s.profesor_apellido)}</td>
        <td style="color:var(--white-40);">${horaTxt}</td>
      </tr>`;
    }).join('');
  }

  document.getElementById('search-seguimientos').addEventListener('input', e => {
    qSeg = e.target.value; pintarSeguimientos();
  });

  /* ════════════════ RENDER INICIAL ════════════════ */
  (async function init() {
    // Cargar profesores y clases primero (los dropdowns dependen de ellos)
    await renderProfesores();
    await renderClases();
    await renderAlumnos();
    await renderSeguimientos();
  })();
})();
