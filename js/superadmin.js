// ============================================================
// superadmin.js — FichAula Gestión de Colegios (Superadmin)
// ============================================================

// ── Datos de colegios (estático, viene de la BD en producción) ─────────────
const SCHOOLS = [
  { id:1, n:'ISCJ Hurlingham',   dir:'Ana Martínez', al:245, pr:18, cl:12, on:true,  ab:'IH'  },
  { id:2, n:'Escuela N°14',      dir:'Carlos Sosa',  al:180, pr:14, cl:9,  on:true,  ab:'E14' },
  { id:3, n:'Inst. San José',    dir:null,           al:310, pr:22, cl:15, on:true,  ab:'ISJ' },
  { id:4, n:'Colegio del Norte', dir:null,           al:95,  pr:8,  cl:6,  on:false, ab:'CN'  },
];

// ── Estado global ───────────────────────────────────────────────────────────
const state = {
  school: null,
  tab: 'clases',
  dirs: {
    1: [{ id:1, nombre:'Ana Martínez',  email:'ana@iscj.edu.ar',   desde:'2023' }],
    2: [{ id:2, nombre:'Carlos Sosa',   email:'carlos@e14.edu.ar', desde:'2022' }],
    3: [],
    4: [],
  },
  clases: [
    { id:1, n:'1° A', nv:'Primer Año',  t:'Mañana', a:'101', prec:'María González', al:8  },
    { id:2, n:'1° B', nv:'Primer Año',  t:'Tarde',  a:'102', prec:'Juan Pérez',     al:7  },
    { id:3, n:'2° A', nv:'Segundo Año', t:'Mañana', a:'201', prec:'Laura Torres',   al:9  },
    { id:4, n:'2° B', nv:'Segundo Año', t:'Tarde',  a:'202', prec:'Carlos Díaz',    al:11 },
  ],
  alums: [
    { id:1, n:'Gómez, Lucas',     cl:'1° A', dni:'44.123.456' },
    { id:2, n:'Rodríguez, Sofía', cl:'1° B', dni:'44.234.567' },
    { id:3, n:'López, Martín',    cl:'2° A', dni:'43.345.678' },
    { id:4, n:'Fernández, Lucía', cl:'2° B', dni:'43.456.789' },
    { id:5, n:'García, Tomás',    cl:'1° A', dni:'44.567.890' },
  ],
  profs: [
    { id:1, n:'María González', m:'Lengua y Literatura', cl:'1° A, 1° B' },
    { id:2, n:'Juan Pérez',     m:'Matemática',          cl:'1° B, 2° A' },
    { id:3, n:'Laura Torres',   m:'Historia',            cl:'2° A, 2° B' },
    { id:4, n:'Carlos Díaz',    m:'Ciencias Naturales',  cl:'2° B'       },
  ],
  deleteCallback: null,
};

// ── Init ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  renderSidebar();
  renderMain();
  bindNavEvents();
  bindCreateModalEvents();
  bindDeleteModalEvents();
});

// ══════════════════════════════════════════════════════════════════════════════
// NAV
// ══════════════════════════════════════════════════════════════════════════════

function bindNavEvents() {
  document.getElementById('btn-back').addEventListener('click', () => {
    state.school = null;
    state.tab    = 'clases';
    updateNav();
    renderSidebar(); // remueve el .active del item
    renderMain();
  });
}

function updateNav() {
  const breadcrumb = document.getElementById('sa-breadcrumb');
  const schoolSpan = document.getElementById('breadcrumb-school');
  if (state.school) {
    breadcrumb.classList.remove('hidden');
    schoolSpan.textContent = state.school.n;
  } else {
    breadcrumb.classList.add('hidden');
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SIDEBAR
// ══════════════════════════════════════════════════════════════════════════════

function renderSidebar() {
  document.getElementById('school-count').textContent = SCHOOLS.length;

  const list = document.getElementById('school-list');
  list.innerHTML = SCHOOLS.map(s => `
    <div class="sa-school-item ${state.school?.id === s.id ? 'active' : ''}" data-id="${s.id}">
      <div class="sa-av sa-av--sm">${s.ab}</div>
      <div class="sa-school-item__info">
        <div class="sa-school-item__name">${s.n}</div>
        <div class="sa-school-item__dir ${s.dir ? '' : 'sa-school-item__dir--warn'}">
          ${s.dir || 'Sin directivo'}
        </div>
      </div>
      <span class="sa-dot ${s.on ? 'sa-dot--on' : 'sa-dot--off'}"></span>
    </div>
  `).join('');

  list.querySelectorAll('.sa-school-item').forEach(el => {
    el.addEventListener('click', () => {
      const id = parseInt(el.dataset.id);
      state.school = SCHOOLS.find(s => s.id === id);
      state.tab    = 'clases';
      updateNav();
      renderSidebar();
      renderMain();
    });
  });

  const totAl = SCHOOLS.reduce((acc, s) => acc + s.al, 0);
  const totPr = SCHOOLS.reduce((acc, s) => acc + s.pr, 0);
  document.getElementById('sidebar-stats').innerHTML = `
    <div class="sa-stat-row">
      <span class="sa-stat-label">colegios</span>
      <span class="sa-stat-value sa-stat-value--v">${SCHOOLS.length}</span>
    </div>
    <div class="sa-stat-row">
      <span class="sa-stat-label">alumnos</span>
      <span class="sa-stat-value sa-stat-value--teal">${totAl}</span>
    </div>
    <div class="sa-stat-row">
      <span class="sa-stat-label">profesores</span>
      <span class="sa-stat-value sa-stat-value--vl">${totPr}</span>
    </div>
  `;
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════════

function renderMain() {
  const main = document.getElementById('sa-main');
  if (!state.school) {
    main.innerHTML = `
      <div class="sa-welcome">
        <div class="sa-welcome__icon">🏫</div>
        <div class="sa-welcome__title">Seleccioná un colegio</div>
        <p class="sa-welcome__subtitle">
          Elegí un colegio del panel izquierdo para gestionar sus clases,
          alumnos, profesores y directivos.
        </p>
      </div>
    `;
    return;
  }
  renderSchoolPanel();
}

// ══════════════════════════════════════════════════════════════════════════════
// SCHOOL PANEL
// ══════════════════════════════════════════════════════════════════════════════

function renderSchoolPanel() {
  const main  = document.getElementById('sa-main');
  const words = state.school.n.split(' ');
  const first = words[0];
  const rest  = words.slice(1).join(' ') || words[0];

  main.innerHTML = `
    <div class="sa-school-panel">
      <div class="sa-panel-title">
        <span class="sa-panel-title--white">${first} </span><span class="sa-panel-title--violet">${rest}</span>
      </div>
      <p class="sa-panel-subtitle">Gestioná clases, alumnos, profesores y directivos de este colegio.</p>

      <div class="sa-tabs">
        ${['clases', 'alumnos', 'profesores', 'directivos'].map(t => `
          <button class="sa-tab-btn ${state.tab === t ? 'active' : ''}" data-tab="${t}">${t}</button>
        `).join('')}
      </div>

      <div id="tab-content"></div>
    </div>
  `;

  main.querySelectorAll('.sa-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.tab = btn.dataset.tab;
      main.querySelectorAll('.sa-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderTabContent();
    });
  });

  renderTabContent();
}

function renderTabContent() {
  const el = document.getElementById('tab-content');
  if (!el) return;
  switch (state.tab) {
    case 'clases':      renderClases(el);      break;
    case 'alumnos':     renderAlumnos(el);     break;
    case 'profesores':  renderProfesores(el);  break;
    case 'directivos':  renderDirectivos(el);  break;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: CLASES  (columna Preceptor/a — sin Profesor)
// ══════════════════════════════════════════════════════════════════════════════

function renderClases(el) {
  el.innerHTML = `
    <div class="sa-toolbar">
      <input class="sa-input sa-input--search" id="search-clases" placeholder="Buscar clase...">
      <button class="sa-btn sa-btn--primary">+ Nueva clase</button>
    </div>
    <div class="sa-table-wrap">
      <table class="sa-table">
        <thead>
          <tr>
            <th>Nombre</th><th>Nivel</th><th>Turno</th>
            <th>Aula</th><th>Preceptor/a</th><th>Alumnos</th><th>Acciones</th>
          </tr>
        </thead>
        <tbody id="tbody-clases"></tbody>
      </table>
    </div>
  `;

  fillClasesRows(state.clases);

  document.getElementById('search-clases').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    fillClasesRows(
      state.clases.filter(c =>
        c.n.toLowerCase().includes(q) ||
        c.nv.toLowerCase().includes(q) ||
        c.prec.toLowerCase().includes(q)
      )
    );
  });
}

function fillClasesRows(list) {
  const tbody = document.getElementById('tbody-clases');
  if (!tbody) return;

  tbody.innerHTML = list.map(c => `
    <tr>
      <td class="col-bold">${c.n}</td>
      <td class="col-muted">${c.nv}</td>
      <td class="col-muted">${c.t}</td>
      <td class="col-muted">${c.a}</td>
      <td>${c.prec}</td>
      <td><span class="sa-pill sa-pill--v">${c.al}</span></td>
      <td>
        <div class="sa-actions">
          <button class="sa-btn sa-btn--primary sa-btn--sm">Editar</button>
          <button class="sa-btn sa-btn--ghost-danger sa-btn--sm btn-del-clase"
            data-id="${c.id}" data-nombre="${c.n}">Eliminar</button>
        </div>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.btn-del-clase').forEach(btn => {
    btn.addEventListener('click', () => {
      openDeleteModal(
        `¿Eliminar la clase ${btn.dataset.nombre}?`,
        btn.dataset.nombre,
        'Sí, eliminar',
        () => {
          state.clases = state.clases.filter(c => c.id !== parseInt(btn.dataset.id));
          renderTabContent();
          showToast('Clase eliminada');
        }
      );
    });
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: ALUMNOS
// ══════════════════════════════════════════════════════════════════════════════

function renderAlumnos(el) {
  el.innerHTML = `
    <div class="sa-toolbar">
      <input class="sa-input sa-input--search" id="search-alums" placeholder="Buscar alumno...">
      <button class="sa-btn sa-btn--primary">+ Nuevo alumno</button>
    </div>
    <div class="sa-table-wrap">
      <table class="sa-table">
        <thead><tr><th>Alumno</th><th>Clase</th><th>DNI</th><th>Acciones</th></tr></thead>
        <tbody id="tbody-alums"></tbody>
      </table>
    </div>
  `;

  fillAlumsRows(state.alums);

  document.getElementById('search-alums').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    fillAlumsRows(state.alums.filter(a =>
      a.n.toLowerCase().includes(q) ||
      a.cl.toLowerCase().includes(q) ||
      a.dni.includes(q)
    ));
  });
}

function fillAlumsRows(list) {
  const tbody = document.getElementById('tbody-alums');
  if (!tbody) return;

  tbody.innerHTML = list.map(a => `
    <tr>
      <td class="col-main">${a.n}</td>
      <td class="col-muted">${a.cl}</td>
      <td class="col-muted">${a.dni}</td>
      <td>
        <div class="sa-actions">
          <button class="sa-btn sa-btn--primary sa-btn--sm">Ver ficha</button>
          <button class="sa-btn sa-btn--ghost-danger sa-btn--sm btn-del-alum"
            data-id="${a.id}" data-nombre="${a.n}">Eliminar</button>
        </div>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.btn-del-alum').forEach(btn => {
    btn.addEventListener('click', () => {
      openDeleteModal(
        '¿Eliminar alumno?',
        btn.dataset.nombre,
        'Sí, eliminar',
        () => {
          state.alums = state.alums.filter(a => a.id !== parseInt(btn.dataset.id));
          renderTabContent();
          showToast('Alumno eliminado');
        }
      );
    });
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: PROFESORES
// ══════════════════════════════════════════════════════════════════════════════

function renderProfesores(el) {
  el.innerHTML = `
    <div class="sa-toolbar">
      <input class="sa-input sa-input--search" id="search-profs" placeholder="Buscar profesor...">
      <button class="sa-btn sa-btn--primary">+ Nuevo profesor</button>
    </div>
    <div class="sa-table-wrap">
      <table class="sa-table">
        <thead><tr><th>Profesor</th><th>Materia</th><th>Clases asignadas</th><th>Acciones</th></tr></thead>
        <tbody id="tbody-profs"></tbody>
      </table>
    </div>
  `;

  fillProfsRows(state.profs);

  document.getElementById('search-profs').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    fillProfsRows(state.profs.filter(p =>
      p.n.toLowerCase().includes(q) ||
      p.m.toLowerCase().includes(q)
    ));
  });
}

function fillProfsRows(list) {
  const tbody = document.getElementById('tbody-profs');
  if (!tbody) return;

  tbody.innerHTML = list.map(p => `
    <tr>
      <td class="col-main">${p.n}</td>
      <td class="col-muted">${p.m}</td>
      <td class="col-muted">${p.cl}</td>
      <td>
        <div class="sa-actions">
          <button class="sa-btn sa-btn--primary sa-btn--sm">Editar</button>
          <button class="sa-btn sa-btn--ghost-danger sa-btn--sm btn-del-prof"
            data-id="${p.id}" data-nombre="${p.n}">Eliminar</button>
        </div>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.btn-del-prof').forEach(btn => {
    btn.addEventListener('click', () => {
      openDeleteModal(
        '¿Eliminar profesor?',
        btn.dataset.nombre,
        'Sí, eliminar',
        () => {
          state.profs = state.profs.filter(p => p.id !== parseInt(btn.dataset.id));
          renderTabContent();
          showToast('Profesor eliminado');
        }
      );
    });
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: DIRECTIVOS
// ══════════════════════════════════════════════════════════════════════════════

function renderDirectivos(el) {
  el.innerHTML = `
    <div class="sa-dir-header">
      <div>
        <div class="sa-dir-title">Directivos del colegio</div>
        <div class="sa-dir-subtitle">Asigná y gestioná las cuentas de directivos para este colegio.</div>
      </div>
      <button class="sa-btn sa-btn--primary" id="btn-open-create">+ Crear cuenta directivo</button>
    </div>
    <div id="dirs-content"></div>
  `;

  document.getElementById('btn-open-create').addEventListener('click', openCreateModal);
  renderDirsContent();
}

function renderDirsContent() {
  const el   = document.getElementById('dirs-content');
  const dirs = state.dirs[state.school.id] || [];

  if (dirs.length === 0) {
    el.innerHTML = `
      <div class="sa-empty">
        <div class="sa-empty__icon">👤</div>
        <div class="sa-empty__title">Sin directivos asignados</div>
        <p class="sa-empty__text">
          Este colegio no tiene directivos registrados.<br>
          Creá el primero para que pueda acceder al sistema.
        </p>
        <button class="sa-btn sa-btn--primary" id="btn-open-create-2">+ Crear primer directivo</button>
      </div>
    `;
    document.getElementById('btn-open-create-2')
      ?.addEventListener('click', openCreateModal);
    return;
  }

  el.innerHTML = `
    <div class="sa-dir-list">
      ${dirs.map(d => {
        const initials = d.nombre.split(' ').slice(0, 2).map(w => w[0]).join('');
        return `
          <div class="sa-dir-card">
            <div class="sa-av sa-av--circle">${initials}</div>
            <div class="sa-dir-card__info">
              <div class="sa-dir-card__name">${d.nombre}</div>
              <div class="sa-dir-card__email">${d.email}</div>
            </div>
            <span class="sa-pill sa-pill--green">Directivo</span>
            <span class="sa-dir-card__since">Desde ${d.desde}</span>
            <div class="sa-actions">
              <button class="sa-btn sa-btn--primary sa-btn--sm">Editar</button>
              <button class="sa-btn sa-btn--ghost-danger sa-btn--sm btn-revocar"
                data-id="${d.id}" data-nombre="${d.nombre}">Revocar</button>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  el.querySelectorAll('.btn-revocar').forEach(btn => {
    btn.addEventListener('click', () => {
      openDeleteModal(
        '¿Revocar acceso de directivo?',
        btn.dataset.nombre,
        'Sí, revocar',
        () => {
          const sid = state.school.id;
          state.dirs[sid] = state.dirs[sid].filter(d => d.id !== parseInt(btn.dataset.id));
          renderDirsContent();
          showToast('Acceso de directivo revocado');
        }
      );
    });
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// MODAL: CREAR DIRECTIVO
// ══════════════════════════════════════════════════════════════════════════════

function openCreateModal() {
  document.getElementById('modal-create-subtitle').innerHTML =
    `Se asignará a <strong style="color:#fff">${state.school.n}</strong> y se registrará en Supabase.`;

  // Limpiar campos
  ['field-nombre', 'field-apellido', 'field-email', 'field-password'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('btn-create-confirm').disabled = true;
  document.getElementById('modal-create').classList.remove('hidden');
}

function closeCreateModal() {
  document.getElementById('modal-create').classList.add('hidden');
}

function bindCreateModalEvents() {
  // Cerrar al hacer clic en el overlay
  document.getElementById('modal-create').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeCreateModal();
  });
  document.getElementById('btn-create-cancel').addEventListener('click', closeCreateModal);

  // Habilitar botón cuando todos los campos tienen valor
  const fieldIds = ['field-nombre', 'field-apellido', 'field-email', 'field-password'];
  fieldIds.forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
      const allFilled = fieldIds.every(f => document.getElementById(f).value.trim() !== '');
      document.getElementById('btn-create-confirm').disabled = !allFilled;
    });
  });

  // Confirmar creación
  document.getElementById('btn-create-confirm').addEventListener('click', () => {
    const nombre   = document.getElementById('field-nombre').value.trim();
    const apellido = document.getElementById('field-apellido').value.trim();
    const email    = document.getElementById('field-email').value.trim();

    const newDir = {
      id:     Date.now(),
      nombre: `${nombre} ${apellido}`,
      email,
      desde:  new Date().getFullYear().toString(),
    };

    const sid = state.school.id;
    if (!state.dirs[sid]) state.dirs[sid] = [];
    state.dirs[sid].push(newDir);

    closeCreateModal();

    // Refrescar pestaña si está abierta
    if (state.tab === 'directivos') renderDirsContent();

    showToast(`✓ Cuenta de ${nombre} ${apellido} creada exitosamente`);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// MODAL: CONFIRMAR ELIMINACIÓN
// ══════════════════════════════════════════════════════════════════════════════

function openDeleteModal(question, nombre, btnLabel, callback) {
  document.getElementById('delete-question').textContent  = question;
  document.getElementById('delete-nombre').textContent    = nombre;
  document.getElementById('btn-delete-confirm').textContent = btnLabel;
  state.deleteCallback = callback;
  document.getElementById('modal-delete').classList.remove('hidden');
}

function closeDeleteModal() {
  document.getElementById('modal-delete').classList.add('hidden');
  state.deleteCallback = null;
}

function bindDeleteModalEvents() {
  document.getElementById('modal-delete').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeDeleteModal();
  });
  document.getElementById('btn-delete-cancel').addEventListener('click', closeDeleteModal);
  document.getElementById('btn-delete-confirm').addEventListener('click', () => {
    if (state.deleteCallback) state.deleteCallback();
    closeDeleteModal();
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// TOAST
// ══════════════════════════════════════════════════════════════════════════════

let toastTimer = null;

function showToast(msg) {
  const el = document.getElementById('sa-toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3000);
}
