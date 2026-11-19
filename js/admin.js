/**
 * admin.js — Panel de administración (Supabase)
 * ═══════════════════════════════════════════════════════════
 * Opera 100% contra la base de datos (Supabase).
 * Todas las operaciones son asíncronas y la autorización real la
 * impone RLS en el servidor; acá solo cuidamos la UX.
 *
 *  Tabs: clases / alumnos / profesores / preceptores / seguimientos / papelera
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
  let _preceptores = [];
  let _colegios = [];
  let _colegioCicloId = null;
  let userAdmin = getUsuarioActual();
  const verLegajo = puedeVerLegajo();
  const verDni = puedeVerDni();

  document.getElementById('thead-alumnos').innerHTML = [
    verLegajo ? '<th>Legajo</th>' : '',
    '<th>Nombre y Apellido</th>',
    verDni ? '<th>DNI</th>' : '',
    '<th>Edad</th><th>Clase</th><th class="acciones-col">Acciones</th>'
  ].join('');
  document.getElementById('search-alumnos').placeholder = verLegajo
    ? 'Buscar por nombre, legajo, DNI o curso...'
    : verDni
      ? 'Buscar por nombre, DNI o curso...'
      : 'Buscar por nombre o curso...';

  /* ════════════════ TABS ════════════════ */
  const tabs = document.querySelectorAll('.admin-tab');
  const panels = document.querySelectorAll('.admin-tab-panel');
  tabs.forEach(t => {
    t.addEventListener('click', () => {
      tabs.forEach(x => x.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));
      t.classList.add('active');
      document.getElementById('panel-' + t.dataset.tab).classList.add('active');
      if (t.dataset.tab === 'preceptores') renderPreceptores();
    });
  });
  const tabInicial = new URLSearchParams(window.location.search).get('tab');
  if (tabInicial) {
    const botonTabInicial = Array.from(tabs).find(tab => tab.dataset.tab === tabInicial);
    if (botonTabInicial) botonTabInicial.click();
  }

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
  function cerrarModal() {
    modal.classList.remove('visible');
    modal.querySelectorAll('input[type="password"]').forEach(input => { input.value = ''; });
  }
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
      [_clases, _preceptores] = await Promise.all([
        getClasesAdminDB(),
        getPreceptoresDB()
      ]);
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
      const preceptorNombre = c.preceptorNombre
        ? esc(c.preceptorNombre)
        : '<em style="color:var(--white-40);">Sin asignar</em>';
      return `<tr>
        <td><strong style="color:var(--white);">${esc(c.nombre)}</strong></td>
        <td>${esc(c.nivel)}</td>
        <td>${esc(c.turno)}</td>
        <td>${esc(c.aula)}</td>
        <td>${preceptorNombre}</td>
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

  function buildOptionsPreceptores(seleccionado, colegioId) {
    let opts = '<option value="">Sin asignar</option>';
    _preceptores.filter(p => !colegioId || p.colegio_id === colegioId).forEach(p => {
      const sel = (p.id === seleccionado) ? 'selected' : '';
      opts += `<option value="${p.id}" ${sel}>${esc(p.nombre)} ${esc(p.apellido)}</option>`;
    });
    return opts;
  }

  function modalNuevaClase() {
    abrirModal({
      title: 'Nueva <span>clase</span>',
      sub: 'Podés usar cualquier nombre (ej: 7° A, 1° TEC, Taller de Robótica).',
      confirmText: 'Crear clase',
      body: `
        <div class="modal-form-group">
          <label>Nombre <span style="color:#f08080;">*</span></label>
          <input type="text" id="m-nombre" maxlength="40" placeholder="Ej: 7° A, 1° TEC, Taller de Robótica" autocomplete="off">
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
          <label>Preceptor/a</label>
          <select id="m-preceptor">${buildOptionsPreceptores(null, _colegioCicloId || userAdmin?.colegio_id)}</select>
        </div>
      `,
      onConfirm: async () => {
        const datos = {
          nombre: document.getElementById('m-nombre').value,
          nivel: document.getElementById('m-nivel').value.trim(),
          turno: document.getElementById('m-turno').value,
          aula: document.getElementById('m-aula').value.trim(),
          preceptorId: document.getElementById('m-preceptor').value || null
        };
        if (!datos.nombre.trim() || !datos.nivel || !datos.turno || !datos.aula) {
          modalError('Completá nombre, nivel, turno y aula.'); return false;
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
      sub: 'Modificá los datos de la clase.',
      confirmText: 'Guardar cambios',
      body: `
        <div class="modal-form-group">
          <label>Nombre</label>
          <input type="text" id="m-nombre" maxlength="40" value="${esc(c.nombre)}" autocomplete="off">
        </div>
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
          <label>Preceptor/a</label>
          <select id="m-preceptor">${buildOptionsPreceptores(c.preceptor_id, c.colegio_id)}</select>
        </div>
      `,
      onConfirm: async () => {
        const cambios = {
          nombre: document.getElementById('m-nombre').value,
          nivel: document.getElementById('m-nivel').value.trim(),
          turno: document.getElementById('m-turno').value,
          aula: document.getElementById('m-aula').value.trim(),
          preceptorId: document.getElementById('m-preceptor').value || null
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
    tbody.innerHTML = `<tr class="empty-row"><td colspan="${colspanAlumnos()}">Cargando...</td></tr>`;
    try {
      _alumnos = await getAlumnosAdminDB();
    } catch (e) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="${colspanAlumnos()}">No se pudieron cargar los alumnos.</td></tr>`;
      return;
    }
    pintarAlumnos();
  }

  function nombreCurso(a) {
    if (a.curso_nombre) return a.curso_nombre;
    if (a.anio != null && a.division) return `${a.anio}° ${a.division}`;
    return a.curso_id || '—';
  }

  function pintarAlumnos() {
    const tbody = document.getElementById('tbody-alumnos');
    const lista = buscarAlumnos(_alumnos, qAlumnos, { legajo: verLegajo, dni: verDni });
    if (lista.length === 0) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="${colspanAlumnos()}">No hay alumnos para mostrar.</td></tr>`;
      return;
    }
    tbody.innerHTML = lista.map(a => `
      <tr>
        ${verLegajo ? `<td><span class="legajo-badge">${esc(a.legajo)}</span></td>` : ''}
        <td><strong style="color:var(--white);">${esc(a.apellido)}, ${esc(a.nombre)}</strong></td>
        ${verDni ? `<td style="font-family:'Courier New',monospace;">${esc(a.dni)}</td>` : ''}
        <td>${a.edad != null ? a.edad : '—'} años</td>
        <td>${esc(nombreCurso(a))}</td>
        <td class="acciones-col">
          <button class="btn-ficha" data-act="ficha" data-id="${esc(a.id)}">Ver ficha</button>
          <button class="btn-admin-secondary" data-act="editar" data-id="${esc(a.id)}">Editar</button>
          <button class="btn-admin-danger" data-act="eliminar" data-id="${esc(a.id)}">Eliminar</button>
        </td>
      </tr>`).join('');

    tbody.querySelectorAll('button[data-act]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.act === 'ficha') {
          window.location.href = `ficha-alumno.html?id=${encodeURIComponent(btn.dataset.id)}&volver=admin`;
        }
        else if (btn.dataset.act === 'editar') modalEditarAlumno(btn.dataset.id);
        else modalEliminarAlumno(btn.dataset.id);
      });
    });
  }

  function colspanAlumnos() {
    return 4 + Number(verLegajo) + Number(verDni);
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
      sub: verLegajo
        ? `Se le asignará el legajo ${proximoLegajo()} automáticamente`
        : 'El sistema le asignará un legajo automáticamente.',
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
      sub: `${verLegajo ? `Legajo ${a.legajo} · ` : ''}Clase ${nombreCurso(a)}`,
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
      sub: `Vas a eliminar a ${a.nombre} ${a.apellido}${verLegajo ? ` (legajo ${a.legajo})` : ''}. No se puede deshacer.`,
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
    const clasesPorId = new Map(_clases.map(clase => [String(clase.id), clase.nombre]));
    const esDirectivo = getUsuarioActual()?.rol === 'admin';
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
        : `<div class="curso-chips">${asignados.map(id =>
          `<span class="curso-chip">${esc(clasesPorId.get(String(id)) || 'Clase no disponible')}</span>`
        ).join('')}</div>`;
      return `<tr>
        <td><strong style="color:var(--white);">${esc(p.nombre)} ${esc(p.apellido)}</strong></td>
        <td>${esc(p.materia)}</td>
        <td style="font-size:12px;color:var(--white-40);">${esc(p.email)}</td>
        <td>${cursos}</td>
        <td class="acciones-col">
          <button class="btn-admin-secondary" data-act="asignar" data-id="${esc(p.id)}">Asignar clases</button>
          ${esDirectivo ? `<button class="btn-admin-danger" data-act="eliminar" data-id="${esc(p.id)}">Eliminar</button>` : ''}
        </td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('button[data-act]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.act === 'asignar') modalAsignarCursos(btn.dataset.id);
        else modalEliminarProfesor(btn.dataset.id);
      });
    });
  }

  function modalNuevoProfesor() {
    abrirModal({
      title: 'Crear cuenta <span>de profesor</span>',
      sub: 'Se creará su acceso y quedará asociado a tu colegio.',
      confirmText: 'Crear cuenta',
      body: `
        <div class="modal-form-row">
          <div class="modal-form-group">
            <label for="m-prof-nombre">Nombre</label>
            <input id="m-prof-nombre" type="text" maxlength="100" autocomplete="given-name">
          </div>
          <div class="modal-form-group">
            <label for="m-prof-apellido">Apellido</label>
            <input id="m-prof-apellido" type="text" maxlength="100" autocomplete="family-name">
          </div>
        </div>
        <div class="modal-form-group">
          <label for="m-prof-materia">Materia</label>
          <input id="m-prof-materia" type="text" maxlength="100">
        </div>
        <div class="modal-form-row">
          <div class="modal-form-group">
            <label for="m-prof-dni">DNI</label>
            <input id="m-prof-dni" type="text" maxlength="12" inputmode="numeric">
          </div>
          <div class="modal-form-group">
            <label for="m-prof-fecha">Fecha de nacimiento</label>
            <input id="m-prof-fecha" type="date">
          </div>
        </div>
        <div class="modal-form-group">
          <label for="m-prof-telefono">Teléfono</label>
          <input id="m-prof-telefono" type="tel" maxlength="30" autocomplete="tel">
        </div>
        <div class="modal-form-group">
          <label for="m-prof-email">Email</label>
          <input id="m-prof-email" type="email" maxlength="254" autocomplete="email">
        </div>
        <div class="modal-form-group">
          <label for="m-prof-password">Contraseña temporal (mínimo 8 caracteres)</label>
          <input id="m-prof-password" type="password" minlength="8" autocomplete="new-password">
        </div>
      `,
      onConfirm: async () => {
        const datos = {
          nombre: document.getElementById('m-prof-nombre').value.trim(),
          apellido: document.getElementById('m-prof-apellido').value.trim(),
          materia: document.getElementById('m-prof-materia').value.trim(),
          dni: document.getElementById('m-prof-dni').value.trim(),
          fecha_nacimiento: document.getElementById('m-prof-fecha').value,
          telefono: document.getElementById('m-prof-telefono').value.trim(),
          email: document.getElementById('m-prof-email').value.trim().toLowerCase(),
          password: document.getElementById('m-prof-password').value
        };
        if (!datos.nombre || !datos.apellido || !datos.materia || !datos.email ||
            !datos.dni || !datos.fecha_nacimiento || !datos.telefono) {
          modalError('Completá nombre, apellido, materia, DNI, fecha de nacimiento, teléfono y email.');
          return false;
        }
        if (datos.password.length < 8) {
          modalError('La contraseña temporal debe tener al menos 8 caracteres.');
          return false;
        }
        const resultado = await crearCuentaProfesorDB(datos);
        if (!resultado.ok) {
          modalError(resultado.error);
          return false;
        }
        await renderProfesores();
        return true;
      }
    });
  }

  function modalEliminarProfesor(profesorId) {
    const profesor = _profesores.find(p => p.id === profesorId);
    if (!profesor) return;
    abrirModal({
      title: 'Eliminar <span>cuenta de profesor</span>',
      sub: `Vas a eliminar a ${profesor.nombre} ${profesor.apellido}. Sus asignaciones y seguimientos se guardarán en la papelera.`,
      confirmText: 'Sí, deseo eliminarlo',
      body: '',
      onConfirm: async () => {
        abrirModal({
          title: 'Confirmá tu <span>contraseña</span>',
          sub: `Ingresá tu contraseña actual para eliminar la cuenta de ${profesor.nombre} ${profesor.apellido}.`,
          confirmText: 'Confirmar eliminación',
          procesando: 'Verificando...',
          body: `
            <div class="modal-form-group">
              <label for="m-admin-password">Tu contraseña actual</label>
              <input id="m-admin-password" type="password" autocomplete="current-password">
            </div>
          `,
          onConfirm: async () => {
            const password = document.getElementById('m-admin-password').value;
            if (!password) {
              modalError('Ingresá tu contraseña para confirmar.');
              return false;
            }
            const resultado = await eliminarCuentaProfesorDB(profesorId, password);
            if (!resultado.ok) {
              modalError(resultado.error);
              document.getElementById('m-admin-password').value = '';
              return false;
            }
            await renderProfesores();
            await renderClases();
            await renderSeguimientos();
            return true;
          }
        });
        return false;
      }
    });
  }

  const btnNuevoProfesor = document.getElementById('btn-nuevo-profesor');
  if (userAdmin?.rol === 'admin') {
    btnNuevoProfesor.hidden = false;
    btnNuevoProfesor.addEventListener('click', modalNuevoProfesor);
  }

  /* ════════════════ TAB PRECEPTORES Y CICLO LECTIVO ════════════════ */
  const btnNuevoPreceptor = document.getElementById('btn-nuevo-preceptor');
  const selectorColegioCiclo = document.getElementById('colegio-ciclo');

  async function renderPreceptores() {
    const tbody = document.getElementById('tbody-preceptores');
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">Cargando...</td></tr>`;
    try {
      if (esSuperadmin()) {
        _colegios = await getColegiosSuperadminDB();
        document.getElementById('colegio-ciclo-wrap').classList.remove('oculto');
        selectorColegioCiclo.innerHTML = _colegios.map(c =>
          `<option value="${esc(c.id)}">${esc(c.nombre)}</option>`).join('');
        if (_colegioCicloId && _colegios.some(c => c.id === _colegioCicloId)) {
          selectorColegioCiclo.value = _colegioCicloId;
        }
        _colegioCicloId = selectorColegioCiclo.value || null;
      } else {
        if (userAdmin && !userAdmin.colegio_id) {
          const perfilActualizado = await _resolverPerfil(userAdmin.id);
          if (perfilActualizado) {
            iniciarSesion(perfilActualizado);
            userAdmin = getUsuarioActual();
          }
        }
        _colegioCicloId = userAdmin?.colegio_id || null;
      }
      if (!_colegioCicloId) {
        tbody.innerHTML = `<tr class="empty-row"><td colspan="6">Seleccioná un colegio para administrar sus preceptores.</td></tr>`;
        document.getElementById('ciclo-lectivo-actual').textContent = 'No hay un colegio seleccionado.';
        return;
      }
      _preceptores = await getPreceptoresDB(_colegioCicloId);
      const ciclo = await getCicloLectivoActivoDB(_colegioCicloId);
      const historial = await getCiclosLectivosDB(_colegioCicloId);
      document.getElementById('ciclo-lectivo-actual').textContent = ciclo
        ? `Año activo: ${ciclo.anio_lectivo}`
        : 'No hay un año lectivo activo.';
      document.getElementById('ciclo-lectivo-historial').textContent = historial.length
        ? `Historial: ${historial.map(x => x.anio_lectivo).join(' · ')}`
        : 'Todavía no hay años lectivos registrados.';
      const yearInput = document.getElementById('anio-lectivo');
      if (!yearInput.value) yearInput.value = String(new Date().getFullYear());
      pintarPreceptores();
    } catch (e) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="6">No se pudieron cargar los preceptores.</td></tr>`;
      document.getElementById('ciclo-lectivo-actual').textContent = 'No se pudo cargar el ciclo lectivo.';
      console.error('Error al cargar preceptores:', e.message);
    }
  }

  function pintarPreceptores() {
    const tbody = document.getElementById('tbody-preceptores');
    const filtro = document.getElementById('search-preceptores').value.toLowerCase().trim();
    const asignados = new Map();
    _clases.forEach(c => {
      if (!c.preceptor_id) return;
      if (!asignados.has(c.preceptor_id)) asignados.set(c.preceptor_id, []);
      asignados.get(c.preceptor_id).push(c.nombre);
    });
    const lista = _preceptores.filter(p => {
      const texto = `${p.nombre} ${p.apellido} ${p.dni || ''} ${p.email || ''}`.toLowerCase();
      return !filtro || texto.includes(filtro);
    });
    if (!lista.length) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="6">No hay preceptores para mostrar.</td></tr>`;
      return;
    }
    tbody.innerHTML = lista.map(p => {
      const clases = (asignados.get(p.id) || []).map(nombre => `<span class="curso-chip">${esc(nombre)}</span>`).join(' ');
      return `<tr>
        <td><strong style="color:var(--white);">${esc(p.nombre)} ${esc(p.apellido)}</strong></td>
        <td>${esc(p.dni || '—')}</td>
        <td style="font-size:12px;color:var(--white-40);">${esc(p.email)}</td>
        <td>${esc(p.telefono || '—')}</td>
        <td>${clases || '<em style="color:var(--white-40);">Ninguna</em>'}</td>
        <td class="acciones-col">
          <button class="btn-admin-secondary" data-edit-preceptor="${esc(p.id)}">Editar</button>
          <button class="btn-admin-danger" data-delete-preceptor="${esc(p.id)}">Eliminar</button>
        </td>
      </tr>`;
    }).join('');
    tbody.querySelectorAll('[data-edit-preceptor]').forEach(button => {
      button.addEventListener('click', () => modalEditarPreceptor(button.dataset.editPreceptor));
    });
    tbody.querySelectorAll('[data-delete-preceptor]').forEach(button => {
      button.addEventListener('click', () => modalEliminarPreceptor(button.dataset.deletePreceptor));
    });
  }

  function modalEditarPreceptor(preceptorId) {
    const preceptor = _preceptores.find(p => p.id === preceptorId);
    if (!preceptor) return;
    abrirModal({
      title: `Editar <span>${esc(preceptor.nombre)} ${esc(preceptor.apellido)}</span>`,
      sub: 'Los cambios del email también se aplicarán a su cuenta de acceso.',
      confirmText: 'Guardar cambios',
      body: `
        <div class="modal-form-row">
          <div class="modal-form-group"><label for="m-pre-nombre">Nombre</label><input id="m-pre-nombre" maxlength="100" value="${esc(preceptor.nombre)}"></div>
          <div class="modal-form-group"><label for="m-pre-apellido">Apellido</label><input id="m-pre-apellido" maxlength="100" value="${esc(preceptor.apellido)}"></div>
        </div>
        <div class="modal-form-row">
          <div class="modal-form-group"><label for="m-pre-dni">DNI</label><input id="m-pre-dni" maxlength="12" inputmode="numeric" value="${esc(preceptor.dni || '')}"></div>
          <div class="modal-form-group"><label for="m-pre-fecha">Fecha de nacimiento</label><input id="m-pre-fecha" type="date" value="${esc(preceptor.fecha_nacimiento || '')}"></div>
        </div>
        <div class="modal-form-row">
          <div class="modal-form-group"><label for="m-pre-telefono">Teléfono</label><input id="m-pre-telefono" type="tel" maxlength="30" value="${esc(preceptor.telefono || '')}"></div>
          <div class="modal-form-group"><label for="m-pre-email">Email de acceso</label><input id="m-pre-email" type="email" maxlength="254" value="${esc(preceptor.email || '')}"></div>
        </div>`,
      onConfirm: async () => {
        const datos = {
          nombre: document.getElementById('m-pre-nombre').value.trim(),
          apellido: document.getElementById('m-pre-apellido').value.trim(),
          dni: document.getElementById('m-pre-dni').value.trim(),
          fecha_nacimiento: document.getElementById('m-pre-fecha').value,
          telefono: document.getElementById('m-pre-telefono').value.trim(),
          email: document.getElementById('m-pre-email').value.trim().toLowerCase()
        };
        if (!datos.nombre || !datos.apellido || !datos.dni || !datos.fecha_nacimiento ||
            !datos.telefono || !datos.email) {
          modalError('Completá todos los datos del preceptor/a.');
          return false;
        }
        const resultado = await modificarCuentaPreceptorDB(preceptorId, datos);
        if (!resultado.ok) { modalError(resultado.error); return false; }
        await renderPreceptores();
        await renderClases();
        return true;
      }
    });
  }

  function modalNuevoPreceptor() {
    const colegioField = esSuperadmin()
      ? `<div class="modal-form-group"><label for="m-pre-colegio">Colegio</label><select id="m-pre-colegio">${
          _colegios.map(c => `<option value="${esc(c.id)}" ${c.id === _colegioCicloId ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')
        }</select></div>`
      : '';
    abrirModal({
      title: 'Crear cuenta <span>de preceptor/a</span>',
      sub: 'Se creará su acceso y quedará asociado al colegio seleccionado.',
      confirmText: 'Crear cuenta',
      body: `${colegioField}
        <div class="modal-form-row">
          <div class="modal-form-group"><label for="m-pre-nombre">Nombre</label><input id="m-pre-nombre" maxlength="100"></div>
          <div class="modal-form-group"><label for="m-pre-apellido">Apellido</label><input id="m-pre-apellido" maxlength="100"></div>
        </div>
        <div class="modal-form-row">
          <div class="modal-form-group"><label for="m-pre-dni">DNI</label><input id="m-pre-dni" maxlength="12" inputmode="numeric"></div>
          <div class="modal-form-group"><label for="m-pre-fecha">Fecha de nacimiento</label><input id="m-pre-fecha" type="date"></div>
        </div>
        <div class="modal-form-row">
          <div class="modal-form-group"><label for="m-pre-telefono">Teléfono</label><input id="m-pre-telefono" type="tel" maxlength="30"></div>
          <div class="modal-form-group"><label for="m-pre-email">Email de acceso</label><input id="m-pre-email" type="email" maxlength="254"></div>
        </div>
        <div class="modal-form-group"><label for="m-pre-password">Contraseña temporal (mínimo 8 caracteres)</label><input id="m-pre-password" type="password" minlength="8" autocomplete="new-password"></div>`,
      onConfirm: async () => {
        const datos = {
          nombre: document.getElementById('m-pre-nombre').value.trim(),
          apellido: document.getElementById('m-pre-apellido').value.trim(),
          dni: document.getElementById('m-pre-dni').value.trim(),
          fecha_nacimiento: document.getElementById('m-pre-fecha').value,
          telefono: document.getElementById('m-pre-telefono').value.trim(),
          email: document.getElementById('m-pre-email').value.trim().toLowerCase(),
          password: document.getElementById('m-pre-password').value
        };
        if (esSuperadmin()) datos.colegio_id = document.getElementById('m-pre-colegio').value;
        if (!datos.nombre || !datos.apellido || !datos.dni || !datos.fecha_nacimiento ||
            !datos.telefono || !datos.email) {
          modalError('Completá todos los datos del preceptor/a.');
          return false;
        }
        if (datos.password.length < 8) {
          modalError('La contraseña temporal debe tener al menos 8 caracteres.');
          return false;
        }
        const resultado = await crearCuentaPreceptorDB(datos);
        if (!resultado.ok) { modalError(resultado.error); return false; }
        await renderPreceptores();
        return true;
      }
    });
  }

  function modalEliminarPreceptor(preceptorId) {
    const preceptor = _preceptores.find(p => p.id === preceptorId);
    if (!preceptor) return;
    abrirModal({
      title: 'Eliminar <span>cuenta de preceptor/a</span>',
      sub: `Vas a eliminar a ${preceptor.nombre} ${preceptor.apellido}.`,
      confirmText: 'Sí, deseo eliminarlo',
      onConfirm: async () => {
        abrirModal({
          title: 'Confirmá tu <span>contraseña</span>',
          sub: `Ingresá tu contraseña actual para eliminar la cuenta de ${preceptor.nombre} ${preceptor.apellido}.`,
          confirmText: 'Confirmar eliminación',
          procesando: 'Verificando...',
          body: `<div class="modal-form-group"><label for="m-pre-admin-password">Tu contraseña actual</label><input id="m-pre-admin-password" type="password" autocomplete="current-password"></div>`,
          onConfirm: async () => {
            const password = document.getElementById('m-pre-admin-password').value;
            if (!password) { modalError('Ingresá tu contraseña para confirmar.'); return false; }
            const resultado = await eliminarCuentaPreceptorDB(preceptorId, password);
            if (!resultado.ok) { modalError(resultado.error); return false; }
            await renderPreceptores();
            await renderClases();
            return true;
          }
        });
        return false;
      }
    });
  }

  if (esAdmin()) {
    btnNuevoPreceptor.hidden = false;
    btnNuevoPreceptor.addEventListener('click', modalNuevoPreceptor);
  }
  document.getElementById('search-preceptores').addEventListener('input', pintarPreceptores);
  selectorColegioCiclo.addEventListener('change', () => {
    _colegioCicloId = selectorColegioCiclo.value || null;
    renderPreceptores();
  });
  document.getElementById('btn-abrir-anio').addEventListener('click', () => {
    const anio = Number(document.getElementById('anio-lectivo').value);
    if (!Number.isInteger(anio) || anio < 2000 || anio > 2200 || !_colegioCicloId) {
      document.getElementById('ciclo-lectivo-actual').textContent = 'Ingresá un año entre 2000 y 2200.';
      return;
    }
    abrirModal({
      title: 'Abrir <span>nuevo año lectivo</span>',
      sub: `El año ${anio} quedará activo. El historial de años anteriores se conserva.`,
      confirmText: 'Abrir año',
      onConfirm: async () => {
        const resultado = await abrirAnioLectivoDB(_colegioCicloId, anio);
        if (!resultado.ok) { modalError(resultado.error); return false; }
        await renderPreceptores();
        return true;
      }
    });
  });

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
      opcionesUnicas(todos, 'alumno_id', s => verLegajo
        ? `${nombreAlumno(s)} · L. ${s.alumno_legajo || '—'}`
        : nombreAlumno(s)), 'Todos');
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
            ${verLegajo ? `<span class="celda-secundaria"> · L. ${esc(s.alumno_legajo || '—')}</span>` : ''}</td>
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
          ${verLegajo ? `<dt>Legajo</dt><dd>${esc(s.alumno_legajo || '—')}</dd>` : ''}
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
    // Las clases se necesitan para mostrar nombres en las asignaciones.
    await renderClases();
    await renderProfesores();
    await renderAlumnos();
    await renderSeguimientos();
  })();
})();
