/**
 * admin.js — Panel de administración (Supabase)
 * ═══════════════════════════════════════════════════════════
 * Reescrito para operar 100% contra la base de datos (sin data.js).
 * Todas las operaciones son asíncronas y la autorización real la
 * impone RLS en el servidor; acá solo cuidamos la UX.
 *
 *  Tabs: clases / alumnos / profesores / seguimientos / papelera
 *  Modal universal con onConfirm asíncrono (anti doble-submit).
 *
 *  Seguimientos: dirección ve todos, los filtra y puede eliminarlos.
 *  Eliminar = mover a la papelera; desde la pestaña Papelera se
 *  restauran o se eliminan definitivamente.
 *
 * Acceso: admin y superadmin (requireAdmin).
 * Depende de: supabase.js, auth.js, components.js, filtros.js
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

  let modalTurno = 0; // número de la apertura actual del modal

  function abrirModal(opts) {
    // Si una operación de un modal anterior termina tarde, no toca este.
    const turno = ++modalTurno;
    mTitle.innerHTML = opts.title || '';
    mSub.textContent = opts.sub || '';
    mBody.innerHTML = opts.body || '';
    mError.classList.remove('visible');
    mError.textContent = '';
    mConfirm.textContent = opts.confirmText || 'Confirmar';
    mCancel.textContent = opts.cancelText || 'Cancelar';
    // soloCerrar: modal informativo, con un único botón.
    mCancel.classList.toggle('oculto', !!opts.soloCerrar);
    mConfirm.disabled = false;
    modal.classList.add('visible');

    mConfirm.onclick = async () => {
      mConfirm.disabled = true;
      const prev = mConfirm.textContent;
      mConfirm.textContent = opts.soloCerrar ? prev : (opts.procesando || 'Guardando...');
      try {
        const ok = opts.onConfirm ? await opts.onConfirm() : true;
        if (ok && turno === modalTurno) cerrarModal();
      } catch (e) {
        if (turno === modalTurno) modalError('Ocurrió un error inesperado. Intentá de nuevo.');
        console.error('Error en modal:', e.message);
      } finally {
        if (turno === modalTurno) {
          mConfirm.disabled = false;
          mConfirm.textContent = prev;
        }
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
  let qAlumnos = document.getElementById('search-alumnos').value;

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
    // Dirección puede buscar también por legajo y DNI.
    const lista = buscarAlumnos(_alumnos, qAlumnos, { identificadores: true });
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
        await renderSeguimientos(); // muestran el nombre y la clase del alumno
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
        await renderSeguimientos(); // sus seguimientos pasaron a la papelera
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

  /* ════════════════ TABS SEGUIMIENTOS Y PAPELERA ════════════════
     Dirección ve todos los seguimientos y es la única que entra a la
     papelera (lo garantiza RLS en el servidor; acá solo se muestra).
     ══════════════════════════════════════════════════════════════ */
  const DIAS_RETENCION = 30; // la purga diaria borra lo que lleva más de 30 días en la papelera

  const filtrosSeg = document.getElementById('filtros-seguimientos');
  let _seguimientos = [];     // activos
  let _papelera = [];         // eliminados (una fila por entrada de la papelera)
  let errorActivos = false;   // la última carga de cada lista falló
  let errorPapelera = false;
  let cargaSeg = 0;           // número de la última carga pedida (vale la más nueva)
  let qPapelera = document.getElementById('search-papelera').value;

  function nombreAlumno(s) {
    return (s.alumno_apellido || s.alumno_nombre)
      ? `${s.alumno_apellido}, ${s.alumno_nombre}` : 'Alumno no disponible';
  }
  function nombreProfesor(s) {
    return `${s.profesor_nombre || ''} ${s.profesor_apellido || ''}`.trim() || 'Profesor no disponible';
  }
  function quienElimino(s) {
    if (s.eliminado_por_autor === true) return 'por su autor/a';
    if (s.eliminado_por_autor === false) return 'por dirección';
    return 'sin registro de quién';
  }
  function plazoDePurga(s) {
    const pasados = Math.floor((Date.now() - new Date(s.deleted_at).getTime()) / 86400000);
    const dias = Math.max(0, DIAS_RETENCION - pasados);
    if (dias === 0) return 'en la próxima limpieza diaria';
    return `automático en ${dias} ${dias === 1 ? 'día' : 'días'}`;
  }
  function badgeVisibilidad(s) {
    return `<span class="seg-vis-badge seg-vis-${esc(s.visible_para)}">${esc(ETIQUETA_VISIBILIDAD[s.visible_para] || s.visible_para)}</span>`;
  }

  async function renderSeguimientos() {
    const tbodySeg = document.getElementById('tbody-seguimientos');
    const tbodyPap = document.getElementById('tbody-papelera');
    const estaCarga = ++cargaSeg;
    tbodySeg.innerHTML = `<tr class="empty-row"><td colspan="8">Cargando...</td></tr>`;
    tbodyPap.innerHTML = `<tr class="empty-row"><td colspan="7">Cargando...</td></tr>`;

    // Cada lista se carga por separado: si una falla, la otra se muestra igual.
    const [activos, eliminados] = await Promise.allSettled([
      getTodosLosSeguimientosDB(), getSeguimientosPapeleraDB()
    ]);
    if (estaCarga !== cargaSeg) return; // ya se pidió una carga más nueva

    errorActivos = activos.status === 'rejected';
    errorPapelera = eliminados.status === 'rejected';
    if (errorActivos) console.error('Error al cargar seguimientos:', activos.reason && activos.reason.message);
    if (errorPapelera) console.error('Error al cargar la papelera:', eliminados.reason && eliminados.reason.message);

    // `clave` identifica la fila en pantalla: el id del seguimiento si está
    // activo, o el de su entrada en la papelera si está eliminado.
    _seguimientos = errorActivos ? [] : activos.value.map(x => ({ ...x, eliminado: false, clave: x.id }));
    _papelera = errorPapelera ? [] : eliminados.value.map(x => ({ ...x, eliminado: true, clave: x.papelera_id }));

    // Opciones de "Alumno" y "Profesor": los que figuran en los datos.
    const todos = _seguimientos.concat(_papelera);
    llenarSelectFiltro(filtrosSeg.querySelector('[data-filtro="alumnoId"]'),
      opcionesUnicas(todos, 'alumno_id', s => `${nombreAlumno(s)} · L. ${s.alumno_legajo || '—'}`), 'Todos');
    llenarSelectFiltro(filtrosSeg.querySelector('[data-filtro="profesorId"]'),
      opcionesUnicas(todos, 'profesor_id', nombreProfesor), 'Todos');

    const contador = document.getElementById('contador-papelera');
    contador.textContent = _papelera.length;
    contador.classList.toggle('oculto', _papelera.length === 0);

    pintarSeguimientos();
    pintarPapelera();
  }

  /** Celdas comunes a las dos tablas: categoría, alumno, clase, texto y profesor. */
  function celdasSeguimiento(s) {
    const valorTxt = s.categoria === 'nota' ? `<span class="seg-nota-valor">${esc(s.valor)}</span> ` : '';
    return `
        <td><span class="seg-cat-badge seg-cat-${esc(s.categoria)}">${esc(ETIQUETA_CATEGORIA[s.categoria] || s.categoria)}</span></td>
        <td><strong class="celda-principal">${esc(nombreAlumno(s))}</strong>
            <span class="celda-secundaria"> · L. ${esc(s.alumno_legajo || '—')}</span></td>
        <td>${esc(s.curso_nombre || '—')}</td>
        <td>${valorTxt}${esc(s.texto)}</td>
        <td class="celda-autor">${esc(nombreProfesor(s))}</td>`;
  }

  function accionesSeguimiento(s) {
    const datos = `data-clave="${esc(s.clave)}" data-eliminado="${s.eliminado ? '1' : '0'}"`;
    const ver = `<button class="btn-admin-secondary btn-admin-sm" data-act="ver" ${datos}>Ver</button>`;
    if (!s.eliminado) {
      return `${ver}<button class="btn-admin-danger" data-act="eliminar" ${datos}>Eliminar</button>`;
    }
    return `${ver}
          <button class="btn-admin-secondary btn-admin-sm" data-act="restaurar" ${datos}>Restaurar</button>
          <button class="btn-admin-danger" data-act="purgar" ${datos}>Eliminar definitivo</button>`;
  }

  function conectarAcciones(tbody) {
    tbody.querySelectorAll('button[data-act]').forEach(btn => {
      btn.addEventListener('click', () => {
        const origen = btn.dataset.eliminado === '1' ? _papelera : _seguimientos;
        const s = origen.find(x => x.clave === btn.dataset.clave);
        if (!s) return;
        if (btn.dataset.act === 'ver') modalVerSeguimiento(s);
        else if (btn.dataset.act === 'eliminar') modalEliminarSeguimiento(s);
        else if (btn.dataset.act === 'restaurar') modalRestaurarSeguimiento(s);
        else if (btn.dataset.act === 'purgar') modalPurgarSeguimiento(s);
      });
    });
  }

  function pintarSeguimientos() {
    const tbody = document.getElementById('tbody-seguimientos');
    const resumen = document.getElementById('resumen-seguimientos');
    const filtros = leerFiltros(filtrosSeg);

    // Estado: activos (por defecto), eliminados (papelera) o ambos.
    let base = _seguimientos;
    if (filtros.estado === 'eliminados') base = _papelera;
    else if (filtros.estado === 'todos') base = _seguimientos.concat(_papelera);

    // Si no se pudo cargar lo que este estado necesita, se dice eso (y no "no hay").
    const falloActivos = errorActivos && filtros.estado !== 'eliminados';
    const falloPapelera = errorPapelera && filtros.estado !== 'activos';
    if (falloActivos || falloPapelera) {
      resumen.textContent = '';
      tbody.innerHTML = `<tr class="empty-row"><td colspan="8">${
        falloActivos ? 'No se pudieron cargar los seguimientos.' : 'No se pudo cargar la papelera.'}</td></tr>`;
      return;
    }

    const lista = filtrarSeguimientos(base, filtros)
      .sort((a, b) => new Date(b.creado_en) - new Date(a.creado_en));

    resumen.innerHTML = base.length
      ? `Mostrando <strong>${lista.length}</strong> de <strong>${base.length}</strong> seguimientos`
      : '';

    if (lista.length === 0) {
      let vacio = 'Ningún seguimiento coincide con los filtros.';
      if (base.length === 0) {
        vacio = filtros.estado === 'eliminados'
          ? 'No hay seguimientos eliminados.'
          : 'Todavía no hay seguimientos cargados por los profesores.';
      }
      tbody.innerHTML = `<tr class="empty-row"><td colspan="8">${vacio}</td></tr>`;
      return;
    }

    tbody.innerHTML = lista.map(s => `<tr>
        ${celdasSeguimiento(s)}
        <td>${badgeVisibilidad(s)}</td>
        <td class="celda-fecha">${formatearFechaHora(s.creado_en)}${
          s.eliminado ? '<br><span class="seg-estado-eliminado">Eliminado</span>' : ''}</td>
        <td class="acciones-col">${accionesSeguimiento(s)}</td>
      </tr>`).join('');
    conectarAcciones(tbody);
  }

  function pintarPapelera() {
    const tbody = document.getElementById('tbody-papelera');
    if (errorPapelera) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="7">No se pudo cargar la papelera.</td></tr>`;
      return;
    }
    const lista = filtrarSeguimientos(_papelera, { texto: qPapelera });

    if (lista.length === 0) {
      const vacio = _papelera.length
        ? 'Ningún seguimiento eliminado coincide con la búsqueda.'
        : 'La papelera está vacía.';
      tbody.innerHTML = `<tr class="empty-row"><td colspan="7">${vacio}</td></tr>`;
      return;
    }

    tbody.innerHTML = lista.map(s => `<tr>
        ${celdasSeguimiento(s)}
        <td class="celda-fecha">${formatearFechaHora(s.deleted_at)}<br>
            <span class="celda-secundaria">${esc(quienElimino(s))}</span></td>
        <td class="acciones-col">${accionesSeguimiento(s)}</td>
      </tr>`).join('');
    conectarAcciones(tbody);
  }

  /** Ficha completa: el seguimiento, el alumno y (si corresponde) el borrado. */
  function modalVerSeguimiento(s) {
    const alumno = _alumnos.find(a => a.id === s.alumno_id); // datos al día, si el alumno sigue activo
    const dni = alumno ? alumno.dni : s.alumno_dni;
    const nota = s.categoria === 'nota' ? ` <span class="seg-nota-valor">${esc(s.valor)}</span>` : '';
    const alcance = s.visible_para === 'profesor'
      ? 'dirección y los profesores del curso' : 'dirección y su autor/a';

    let clase = esc(s.curso_nombre || '—');
    if (alumno) clase += ` — Turno ${esc(alumno.turno)} · Aula ${esc(alumno.aula)}`;

    let eliminacion = '';
    if (s.eliminado) {
      eliminacion = `
        <h3 class="detalle-titulo">Eliminación</h3>
        <dl class="detalle">
          <dt>Eliminado el</dt><dd>${formatearFechaHora(s.deleted_at)}</dd>
          <dt>Eliminado</dt><dd>${esc(quienElimino(s))}</dd>
          <dt>Borrado definitivo</dt><dd>${esc(plazoDePurga(s))}</dd>
        </dl>`;
    }

    abrirModal({
      title: `Seguimiento <span>${s.eliminado ? 'eliminado' : 'activo'}</span>`,
      sub: '',
      confirmText: 'Cerrar',
      soloCerrar: true,
      body: `
        <h3 class="detalle-titulo">Seguimiento</h3>
        <dl class="detalle">
          <dt>Categoría</dt>
          <dd><span class="seg-cat-badge seg-cat-${esc(s.categoria)}">${esc(ETIQUETA_CATEGORIA[s.categoria] || s.categoria)}</span>${nota}</dd>
          <dt>Texto</dt><dd>${esc(s.texto)}</dd>
          <dt>Visible para</dt><dd>${badgeVisibilidad(s)} <span class="celda-secundaria">${alcance}</span></dd>
          <dt>Cargado por</dt><dd>${esc(nombreProfesor(s))}${s.materia ? ` — ${esc(s.materia)}` : ''}</dd>
          <dt>Fecha de carga</dt><dd>${formatearFechaHora(s.creado_en)}</dd>
        </dl>
        <h3 class="detalle-titulo">Alumno</h3>
        <dl class="detalle">
          <dt>Nombre</dt><dd>${esc(nombreAlumno(s))}${
            s.eliminado && s.alumno_existe === false ? ' <span class="seg-estado-eliminado">Alumno eliminado</span>' : ''}</dd>
          <dt>Legajo</dt><dd>${esc(s.alumno_legajo || '—')}</dd>
          <dt>DNI</dt><dd>${esc(dni || '—')}</dd>
          <dt>Clase</dt><dd>${clase}</dd>
          ${alumno && alumno.edad != null ? `<dt>Edad</dt><dd>${esc(alumno.edad)} años</dd>` : ''}
        </dl>
        ${eliminacion}`
    });
  }

  function modalEliminarSeguimiento(s) {
    abrirModal({
      title: 'Eliminar <span>seguimiento</span>',
      sub: `Vas a eliminar el seguimiento de ${nombreAlumno(s)} que cargó ${nombreProfesor(s)}. ` +
           'Queda en la papelera y lo podés restaurar desde ahí.',
      confirmText: 'Sí, eliminar',
      procesando: 'Eliminando...',
      body: '',
      onConfirm: async () => {
        const r = await eliminarSeguimientoDB(s.id);
        if (!r.ok) { modalError(r.error); return false; }
        await renderSeguimientos();
        return true;
      }
    });
  }

  function modalRestaurarSeguimiento(s) {
    // Sin el alumno o el profesor no hay a dónde devolverlo.
    if (s.alumno_existe === false || s.profesor_existe === false) {
      abrirModal({
        title: 'No se puede <span>restaurar</span>',
        sub: s.alumno_existe === false
          ? 'El alumno de este seguimiento fue eliminado.'
          : 'El profesor que cargó este seguimiento fue eliminado.',
        confirmText: 'Entendido',
        soloCerrar: true,
        body: ''
      });
      return;
    }
    abrirModal({
      title: 'Restaurar <span>seguimiento</span>',
      sub: `El seguimiento de ${nombreAlumno(s)} vuelve a estar activo, visible para ` +
           (s.visible_para === 'profesor' ? 'dirección y los profesores del curso.' : `dirección y ${nombreProfesor(s)}.`),
      confirmText: 'Sí, restaurar',
      procesando: 'Restaurando...',
      body: '',
      onConfirm: async () => {
        const r = await restaurarSeguimientoDB(s.papelera_id);
        if (!r.ok) { modalError(r.error); return false; }
        await renderSeguimientos();
        return true;
      }
    });
  }

  function modalPurgarSeguimiento(s) {
    abrirModal({
      title: 'Eliminar <span>definitivamente</span>',
      sub: `Vas a borrar para siempre el seguimiento de ${nombreAlumno(s)} que cargó ${nombreProfesor(s)}. ` +
           'Esta acción no se puede deshacer.',
      confirmText: 'Sí, eliminar definitivamente',
      procesando: 'Eliminando...',
      body: '',
      onConfirm: async () => {
        const r = await purgarSeguimientoDB(s.papelera_id);
        if (!r.ok) { modalError(r.error); return false; }
        await renderSeguimientos();
        return true;
      }
    });
  }

  conectarFiltros(filtrosSeg, pintarSeguimientos);
  document.getElementById('search-papelera').addEventListener('input', e => {
    qPapelera = e.target.value; pintarPapelera();
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
