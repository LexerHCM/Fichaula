/**
 * admin.js — Lógica del panel de administración
 * ───────────────────────────────────────────────────────────
 * Maneja:
 *  - Tabs (clases / alumnos / profesores / seguimientos)
 *  - Búsqueda por tab
 *  - Modal universal (crear/editar/eliminar/asignar)
 *  - Llamadas al CRUD de admin-logic.js
 *
 * Como no hay BD, después de cada mutación re-renderizamos.
 */
(function () {
  'use strict';

  // Solo admin puede entrar acá
  requireAdmin();
  renderNav('admin', true);
  renderFooter();

  /* ════════════════════════════════════════════════════════
     TABS
     ════════════════════════════════════════════════════════ */
  const tabs = document.querySelectorAll('.admin-tab');
  const panels = document.querySelectorAll('.admin-tab-panel');

  tabs.forEach(t => {
    t.addEventListener('click', () => {
      tabs.forEach(x => x.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));
      t.classList.add('active');
      const target = 'panel-' + t.dataset.tab;
      document.getElementById(target).classList.add('active');
    });
  });

  /* ════════════════════════════════════════════════════════
     MODAL UNIVERSAL
     ════════════════════════════════════════════════════════ */
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

    // Reasignar handler de confirmar
    mConfirm.onclick = () => {
      const ok = opts.onConfirm ? opts.onConfirm() : true;
      if (ok) cerrarModal();
    };
  }

  function cerrarModal() {
    modal.classList.remove('visible');
  }

  function modalError(msg) {
    mError.textContent = msg;
    mError.classList.add('visible');
  }

  mCancel.addEventListener('click', cerrarModal);
  modal.addEventListener('click', e => {
    if (e.target === modal) cerrarModal();
  });

  /* ════════════════════════════════════════════════════════
     ESCAPE HTML
     ════════════════════════════════════════════════════════ */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /* ════════════════════════════════════════════════════════
     TAB CLASES
     ════════════════════════════════════════════════════════ */
  let qClases = '';

  function renderClases() {
    const tbody = document.getElementById('tbody-clases');
    const term = qClases.toLowerCase().trim();

    let cursos = FICHAULA_DATA.cursos.slice();
    if (term) {
      cursos = cursos.filter(c =>
        c.nombre.toLowerCase().includes(term) ||
        c.nivel.toLowerCase().includes(term) ||
        c.aula.toLowerCase().includes(term) ||
        c.turno.toLowerCase().includes(term)
      );
    }

    if (cursos.length === 0) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="7">No hay clases para mostrar.</td></tr>`;
      return;
    }

    tbody.innerHTML = cursos.map(c => {
      const profe = c.profesorId ? getProfesorById(c.profesorId) : null;
      const profeNombre = profe ? `${profe.nombre} ${profe.apellido}` : '<em style="color:var(--white-40);">Sin asignar</em>';
      return `<tr>
        <td><strong style="color:var(--white);">${esc(c.nombre)}</strong></td>
        <td>${esc(c.nivel)}</td>
        <td>${esc(c.turno)}</td>
        <td>${esc(c.aula)}</td>
        <td>${profeNombre}</td>
        <td><span class="cantidad-pill">${c.alumnos.length}</span></td>
        <td class="acciones-col">
          <button class="btn-admin-secondary" data-act="editar" data-id="${c.id}">Editar</button>
          <button class="btn-admin-danger" data-act="eliminar" data-id="${c.id}">Eliminar</button>
        </td>
      </tr>`;
    }).join('');

    // Listeners
    tbody.querySelectorAll('button[data-act]').forEach(btn => {
      btn.addEventListener('click', () => {
        const act = btn.dataset.act;
        const id = btn.dataset.id;
        if (act === 'editar') modalEditarClase(id);
        else if (act === 'eliminar') modalEliminarClase(id);
      });
    });
  }

  function buildOptionsProfesores(seleccionado) {
    let opts = '<option value="">Sin asignar</option>';
    FICHAULA_PROFESORES.forEach(p => {
      const sel = (p.id === seleccionado) ? 'selected' : '';
      opts += `<option value="${p.id}" ${sel}>${esc(p.nombre)} ${esc(p.apellido)} — ${esc(p.materia)}</option>`;
    });
    return opts;
  }

  function modalNuevaClase() {
    abrirModal({
      title: 'Nueva <span>clase</span>',
      sub: 'Creá un nuevo curso del nivel secundario',
      confirmText: 'Crear clase',
      body: `
        <div class="modal-form-row">
          <div class="modal-form-group">
            <label>Nombre <span style="color:#f08080;">*</span></label>
            <input type="text" id="m-nombre" placeholder="Ej: 7° A">
          </div>
          <div class="modal-form-group">
            <label>Nivel <span style="color:#f08080;">*</span></label>
            <input type="text" id="m-nivel" placeholder="Ej: Séptimo Año">
          </div>
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
      onConfirm: () => {
        const nombre = document.getElementById('m-nombre').value.trim();
        const nivel = document.getElementById('m-nivel').value.trim();
        const turno = document.getElementById('m-turno').value;
        const aula = document.getElementById('m-aula').value.trim();
        const profesorId = document.getElementById('m-profe').value || null;

        if (!nombre || !nivel || !turno || !aula) {
          modalError('Todos los campos marcados con * son obligatorios.');
          return false;
        }
        const r = crearClase({ nombre, nivel, turno, aula, profesorId });
        if (!r.ok) { modalError(r.error); return false; }
        renderClases();
        renderProfesores(); // actualizar lista de cursos asignados
        return true;
      }
    });
  }

  function modalEditarClase(id) {
    const c = getCursoById(id);
    if (!c) return;
    abrirModal({
      title: `Editar <span>${esc(c.nombre)}</span>`,
      sub: 'Modificá los datos generales del curso',
      confirmText: 'Guardar cambios',
      body: `
        <div class="modal-form-row">
          <div class="modal-form-group">
            <label>Nombre</label>
            <input type="text" id="m-nombre" value="${esc(c.nombre)}">
          </div>
          <div class="modal-form-group">
            <label>Nivel</label>
            <input type="text" id="m-nivel" value="${esc(c.nivel)}">
          </div>
        </div>
        <div class="modal-form-row">
          <div class="modal-form-group">
            <label>Turno</label>
            <select id="m-turno">
              <option value="Mañana"  ${c.turno === 'Mañana' ? 'selected' : ''}>Mañana</option>
              <option value="Tarde"   ${c.turno === 'Tarde'  ? 'selected' : ''}>Tarde</option>
              <option value="Noche"   ${c.turno === 'Noche'  ? 'selected' : ''}>Noche</option>
            </select>
          </div>
          <div class="modal-form-group">
            <label>Aula</label>
            <input type="text" id="m-aula" value="${esc(c.aula)}">
          </div>
        </div>
        <div class="modal-form-group">
          <label>Profesor titular</label>
          <select id="m-profe">${buildOptionsProfesores(c.profesorId)}</select>
        </div>
      `,
      onConfirm: () => {
        const cambios = {
          nombre: document.getElementById('m-nombre').value.trim(),
          nivel: document.getElementById('m-nivel').value.trim(),
          turno: document.getElementById('m-turno').value,
          aula: document.getElementById('m-aula').value.trim(),
          profesorId: document.getElementById('m-profe').value || null
        };
        const r = modificarClase(id, cambios);
        if (!r.ok) { modalError(r.error); return false; }
        renderClases();
        renderProfesores();
        return true;
      }
    });
  }

  function modalEliminarClase(id) {
    const c = getCursoById(id);
    if (!c) return;
    abrirModal({
      title: 'Eliminar <span>clase</span>',
      sub: `Vas a eliminar "${c.nombre}" y sus ${c.alumnos.length} alumno(s). Esta acción no se puede deshacer.`,
      confirmText: 'Sí, eliminar',
      body: '',
      onConfirm: () => {
        const r = eliminarClase(id);
        if (!r.ok) { modalError(r.error); return false; }
        renderClases();
        renderAlumnos();
        renderProfesores();
        return true;
      }
    });
  }

  document.getElementById('btn-nueva-clase').addEventListener('click', modalNuevaClase);
  document.getElementById('search-clases').addEventListener('input', e => {
    qClases = e.target.value;
    renderClases();
  });

  /* ════════════════════════════════════════════════════════
     TAB ALUMNOS
     ════════════════════════════════════════════════════════ */
  let qAlumnos = '';

  function getTodosLosAlumnos() {
    const out = [];
    FICHAULA_DATA.cursos.forEach(c => {
      c.alumnos.forEach(a => {
        out.push({ ...a, _cursoId: c.id, _cursoNombre: c.nombre });
      });
    });
    return out;
  }

  function renderAlumnos() {
    const tbody = document.getElementById('tbody-alumnos');
    const term = qAlumnos.toLowerCase().trim();
    let lista = getTodosLosAlumnos();

    if (term) {
      lista = lista.filter(a =>
        a.nombre.toLowerCase().includes(term) ||
        a.apellido.toLowerCase().includes(term) ||
        a.legajo.includes(term) ||
        a.dni.replace(/\./g,'').includes(term.replace(/\./g,'')) ||
        a._cursoNombre.toLowerCase().includes(term)
      );
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
        <td>${calcularEdad(a.fechaNacimiento)} años</td>
        <td>${esc(a._cursoNombre)}</td>
        <td class="acciones-col">
          <button class="btn-admin-secondary"
                  data-act="editar" data-curso="${a._cursoId}" data-legajo="${a.legajo}">Editar</button>
          <button class="btn-admin-danger"
                  data-act="eliminar" data-curso="${a._cursoId}" data-legajo="${a.legajo}">Eliminar</button>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('button[data-act]').forEach(btn => {
      btn.addEventListener('click', () => {
        const cursoId = btn.dataset.curso;
        const legajo = btn.dataset.legajo;
        if (btn.dataset.act === 'editar') modalEditarAlumno(cursoId, legajo);
        else modalEliminarAlumno(cursoId, legajo);
      });
    });
  }

  function buildOptionsClases(seleccionado) {
    let opts = '<option value="">Seleccioná...</option>';
    FICHAULA_DATA.cursos.forEach(c => {
      const sel = (c.id === seleccionado) ? 'selected' : '';
      opts += `<option value="${c.id}" ${sel}>${esc(c.nombre)} (${esc(c.nivel)})</option>`;
    });
    return opts;
  }

  function modalNuevoAlumno() {
    abrirModal({
      title: 'Nuevo <span>alumno</span>',
      sub: 'Registrá un alumno en una clase',
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
      onConfirm: () => {
        const cursoId = document.getElementById('m-curso').value;
        const datos = {
          nombre: document.getElementById('m-nombre').value.trim(),
          apellido: document.getElementById('m-apellido').value.trim(),
          dni: document.getElementById('m-dni').value.trim(),
          fechaNacimiento: document.getElementById('m-fnac').value
        };
        if (!cursoId) { modalError('Tenés que seleccionar una clase.'); return false; }
        const r = crearAlumno(cursoId, datos);
        if (!r.ok) { modalError(r.error); return false; }
        renderAlumnos();
        renderClases();
        return true;
      }
    });
  }

  function modalEditarAlumno(cursoId, legajo) {
    const curso = getCursoById(cursoId);
    if (!curso) return;
    const alumno = curso.alumnos.find(a => a.legajo === legajo);
    if (!alumno) return;

    abrirModal({
      title: `Editar <span>${esc(alumno.apellido)}, ${esc(alumno.nombre)}</span>`,
      sub: `Legajo ${alumno.legajo} · Clase ${curso.nombre}`,
      confirmText: 'Guardar cambios',
      body: `
        <div class="modal-form-row">
          <div class="modal-form-group">
            <label>Nombre</label>
            <input type="text" id="m-nombre" value="${esc(alumno.nombre)}">
          </div>
          <div class="modal-form-group">
            <label>Apellido</label>
            <input type="text" id="m-apellido" value="${esc(alumno.apellido)}">
          </div>
        </div>
        <div class="modal-form-row">
          <div class="modal-form-group">
            <label>DNI</label>
            <input type="text" id="m-dni" value="${esc(alumno.dni)}">
          </div>
          <div class="modal-form-group">
            <label>Fecha de nacimiento</label>
            <input type="date" id="m-fnac" value="${esc(alumno.fechaNacimiento)}">
          </div>
        </div>
        <div class="modal-form-group">
          <label>Trasladar a otra clase</label>
          <select id="m-curso">${buildOptionsClases(cursoId)}</select>
        </div>
      `,
      onConfirm: () => {
        const cambios = {
          nombre: document.getElementById('m-nombre').value.trim(),
          apellido: document.getElementById('m-apellido').value.trim(),
          dni: document.getElementById('m-dni').value.trim(),
          fechaNacimiento: document.getElementById('m-fnac').value
        };
        const nuevoCursoId = document.getElementById('m-curso').value;

        const r = modificarAlumno(cursoId, legajo, cambios);
        if (!r.ok) { modalError(r.error); return false; }

        // Si cambió de curso, trasladar
        if (nuevoCursoId && nuevoCursoId !== cursoId) {
          const r2 = trasladarAlumno(legajo, cursoId, nuevoCursoId);
          if (!r2.ok) { modalError(r2.error); return false; }
        }

        renderAlumnos();
        renderClases();
        return true;
      }
    });
  }

  function modalEliminarAlumno(cursoId, legajo) {
    const curso = getCursoById(cursoId);
    if (!curso) return;
    const alumno = curso.alumnos.find(a => a.legajo === legajo);
    if (!alumno) return;

    abrirModal({
      title: 'Eliminar <span>alumno</span>',
      sub: `Vas a eliminar a ${alumno.nombre} ${alumno.apellido} (legajo ${alumno.legajo}). No se puede deshacer.`,
      confirmText: 'Sí, eliminar',
      body: '',
      onConfirm: () => {
        const r = eliminarAlumno(cursoId, legajo);
        if (!r.ok) { modalError(r.error); return false; }
        renderAlumnos();
        renderClases();
        return true;
      }
    });
  }

  document.getElementById('btn-nuevo-alumno').addEventListener('click', modalNuevoAlumno);
  document.getElementById('search-alumnos').addEventListener('input', e => {
    qAlumnos = e.target.value;
    renderAlumnos();
  });

  /* ════════════════════════════════════════════════════════
     TAB PROFESORES
     ════════════════════════════════════════════════════════ */
  let qProfes = '';

  function renderProfesores() {
    const tbody = document.getElementById('tbody-profesores');
    const term = qProfes.toLowerCase().trim();
    let lista = FICHAULA_PROFESORES.slice();

    if (term) {
      lista = lista.filter(p =>
        p.nombre.toLowerCase().includes(term) ||
        p.apellido.toLowerCase().includes(term) ||
        p.materia.toLowerCase().includes(term) ||
        p.email.toLowerCase().includes(term)
      );
    }

    if (lista.length === 0) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="5">No hay profesores.</td></tr>`;
      return;
    }

    tbody.innerHTML = lista.map(p => {
      const cursos = p.cursosAsignados.length === 0
        ? '<em style="color:var(--white-40);">Ninguna</em>'
        : `<div class="curso-chips">${
            p.cursosAsignados.map(id => `<span class="curso-chip">${esc(id)}</span>`).join('')
          }</div>`;
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
    const p = getProfesorById(profeId);
    if (!p) return;

    const checks = FICHAULA_DATA.cursos.map(c => {
      const ch = p.cursosAsignados.includes(c.id) ? 'checked' : '';
      return `<label class="curso-check-item">
        <input type="checkbox" value="${c.id}" ${ch}>
        <span>${esc(c.nombre)}</span>
      </label>`;
    }).join('');

    abrirModal({
      title: `Asignar clases a <span>${esc(p.nombre)} ${esc(p.apellido)}</span>`,
      sub: `Marcá las clases que querés asignarle a este profesor.`,
      confirmText: 'Guardar asignaciones',
      body: `<div class="curso-checklist">${checks}</div>`,
      onConfirm: () => {
        const seleccionados = Array.from(
          mBody.querySelectorAll('input[type="checkbox"]:checked')
        ).map(i => i.value);
        const r = asignarClasesAProfesor(profeId, seleccionados);
        if (!r.ok) { modalError(r.error); return false; }
        renderProfesores();
        renderClases();
        return true;
      }
    });
  }

  document.getElementById('search-profesores').addEventListener('input', e => {
    qProfes = e.target.value;
    renderProfesores();
  });

  /* ════════════════════════════════════════════════════════
     TAB SEGUIMIENTOS
     ════════════════════════════════════════════════════════ */
  let qSeg = '';

  function renderSeguimientos() {
    const tbody = document.getElementById('tbody-seguimientos');
    const term = qSeg.toLowerCase().trim();
    let lista = getTodosLosSeguimientos();

    if (term) {
      lista = lista.filter(s =>
        s.alumnoNombre.toLowerCase().includes(term) ||
        s.autorNombre.toLowerCase().includes(term) ||
        s.categoria.toLowerCase().includes(term) ||
        s.cursoNombre.toLowerCase().includes(term) ||
        s.texto.toLowerCase().includes(term)
      );
    }

    if (lista.length === 0) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="6">
        Todavía no hay seguimientos cargados por los profesores.
      </td></tr>`;
      return;
    }

    const catLabel = {
      conducta: 'Conducta', actitud: 'Actitud',
      nota: 'Nota', observacion: 'Observación'
    };

    tbody.innerHTML = lista.map(s => {
      const fecha = new Date(s.fecha);
      const horaTxt = `${String(fecha.getHours()).padStart(2,'0')}:${String(fecha.getMinutes()).padStart(2,'0')}`;
      const valorTxt = s.categoria === 'nota'
        ? `<span class="seg-nota-valor">${s.valor}</span> `
        : '';
      return `<tr>
        <td><span class="seg-cat-badge seg-cat-${s.categoria}">${catLabel[s.categoria] || s.categoria}</span></td>
        <td><strong style="color:var(--white);">${esc(s.alumnoNombre)}</strong>
            <span style="color:var(--white-40);font-size:11px;"> · L. ${esc(s.alumnoLegajo)}</span></td>
        <td>${esc(s.cursoNombre)}</td>
        <td>${valorTxt}${esc(s.texto)}</td>
        <td style="color:var(--violet-light);">${esc(s.autorNombre)}</td>
        <td style="color:var(--white-40);">${horaTxt}</td>
      </tr>`;
    }).join('');
  }

  document.getElementById('search-seguimientos').addEventListener('input', e => {
    qSeg = e.target.value;
    renderSeguimientos();
  });

  /* ════════════════════════════════════════════════════════
     RENDER INICIAL
     ════════════════════════════════════════════════════════ */
  renderClases();
  renderAlumnos();
  renderProfesores();
  renderSeguimientos();
})();
