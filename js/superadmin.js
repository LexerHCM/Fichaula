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
  editClaseId: null,
  editProfId: null,
  editDirId: null,
};

// ── Helpers ─────────────────────────────────────────────────────────────────
const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const val = id => document.getElementById(id).value.trim();

// El directivo que se muestra en el sidebar es el primero de la lista
function syncDirectivo() {
  const dirs = state.dirs[state.school.id] || [];
  state.school.dir = dirs.length ? dirs[0].nombre : null;
  renderSidebar();
}

// ── Init ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  renderSidebar();
  renderMain();
  bindNavEvents();
  bindColegioModalEvents();
  bindCreateModalEvents();
  bindCreateAlumnoModalEvents();
  bindFichaModalEvents();
  bindCreateProfesorModalEvents();
  bindCreateClaseModalEvents();
  bindDeleteModalEvents();
  setupSuperadminDropdown();
});

function setupSuperadminDropdown() {
  const dropdown = document.querySelector('.sa-nav__dropdown');
  if (!dropdown || dropdown.dataset.dropdownSetup === 'true') return;
  dropdown.dataset.dropdownSetup = 'true';

  const trigger = document.getElementById('sa-user-menu-trigger');
  const content = dropdown.querySelector('.dropdown-content');
  if (!trigger || !content) return;

  trigger.addEventListener('click', (event) => {
    event.stopPropagation();
    dropdown.classList.toggle('show');
  });

  content.addEventListener('click', (event) => event.stopPropagation());
  document.addEventListener('click', () => dropdown.classList.remove('show'));
}

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
      <div class="sa-av sa-av--sm">${esc(s.ab)}</div>
      <div class="sa-school-item__info">
        <div class="sa-school-item__name">${esc(s.n)}</div>
        <div class="sa-school-item__dir ${s.dir ? '' : 'sa-school-item__dir--warn'}">
          ${esc(s.dir || 'Sin directivo')}
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
        <span class="sa-panel-title--white">${esc(first)} </span><span class="sa-panel-title--violet">${esc(rest)}</span>
      </div>
      <p class="sa-panel-subtitle">Gestioná clases, alumnos, profesores y directivos de este colegio.</p>

      <div class="sa-tabs">
        ${['clases', 'alumnos', 'profesores', 'directivos', 'opciones'].map(t => `
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
    case 'opciones':    renderOpciones(el);    break;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// NUEVO COLEGIO
// ══════════════════════════════════════════════════════════════════════════════

function openCreateColegioModal() {
  document.getElementById('campo-col-nombre').value = '';
  document.getElementById('campo-col-ab').value = '';
  document.getElementById('btn-col-confirm').disabled = true;
  document.getElementById('modal-colegio').classList.remove('hidden');
  document.getElementById('campo-col-nombre').focus();
}

function closeCreateColegioModal() {
  document.getElementById('modal-colegio').classList.add('hidden');
}

function bindColegioModalEvents() {
  document.getElementById('btn-new-school').addEventListener('click', openCreateColegioModal);
  document.getElementById('modal-colegio').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeCreateColegioModal();
  });
  document.getElementById('btn-col-cancel').addEventListener('click', closeCreateColegioModal);
  document.getElementById('campo-col-nombre').addEventListener('input', () => {
    document.getElementById('btn-col-confirm').disabled = !val('campo-col-nombre');
  });

  document.getElementById('btn-col-confirm').addEventListener('click', () => {
    const nombre = val('campo-col-nombre');
    if (SCHOOLS.some(s => s.n.toLowerCase() === nombre.toLowerCase())) {
      showToast('Ya existe un colegio con ese nombre');
      return;
    }
    const ab = (val('campo-col-ab') ||
      nombre.split(/\s+/).map(w => w[0]).join('').slice(0, 3)).toUpperCase();

    const nuevo = { id: Date.now(), n: nombre, dir: null, al: 0, pr: 0, cl: 0, on: true, ab };
    SCHOOLS.push(nuevo);
    state.dirs[nuevo.id] = [];

    closeCreateColegioModal();
    renderSidebar();
    showToast(`✓ Colegio ${nombre} creado exitosamente`);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: CLASES  (columna Preceptor/a — sin Profesor)
// ══════════════════════════════════════════════════════════════════════════════

function renderClases(el) {
  el.innerHTML = `
    <div class="sa-toolbar">
      <input class="sa-input sa-input--search" id="search-clases" placeholder="Buscar clase...">
      <button class="sa-btn sa-btn--primary" id="btn-new-clase">+ Nueva clase</button>
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

  document.getElementById('btn-new-clase')?.addEventListener('click', openCreateClaseModal);

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
      <td class="col-bold">${esc(c.n)}</td>
      <td class="col-muted">${esc(c.nv)}</td>
      <td class="col-muted">${esc(c.t)}</td>
      <td class="col-muted">${esc(c.a)}</td>
      <td>${esc(c.prec)}</td>
      <td><span class="sa-pill sa-pill--v">${c.al}</span></td>
      <td>
        <div class="sa-actions">
          <button class="sa-btn sa-btn--primary sa-btn--sm btn-edit-clase" data-id="${c.id}">Editar</button>
          <button class="sa-btn sa-btn--ghost-danger sa-btn--sm btn-del-clase"
            data-id="${c.id}" data-nombre="${esc(c.n)}">Eliminar</button>
        </div>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.btn-edit-clase').forEach(btn => {
    btn.addEventListener('click', () => openEditClaseModal(parseInt(btn.dataset.id)));
  });

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
      <button class="sa-btn sa-btn--primary" id="btn-new-alumno">+ Nuevo alumno</button>
    </div>
    <div class="sa-table-wrap">
      <table class="sa-table">
        <thead><tr><th>Alumno</th><th>Clase</th><th>DNI</th><th>Acciones</th></tr></thead>
        <tbody id="tbody-alums"></tbody>
      </table>
    </div>
  `;

  fillAlumsRows(state.alums);

  document.getElementById('btn-new-alumno')?.addEventListener('click', openCreateAlumnoModal);

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
      <td class="col-main">${esc(a.n)}</td>
      <td class="col-muted">${esc(a.cl)}</td>
      <td class="col-muted">${esc(a.dni)}</td>
      <td>
        <div class="sa-actions">
          <button class="sa-btn sa-btn--primary sa-btn--sm btn-ficha-alum" data-id="${a.id}">Ver ficha</button>
          <button class="sa-btn sa-btn--ghost-danger sa-btn--sm btn-del-alum"
            data-id="${a.id}" data-nombre="${esc(a.n)}">Eliminar</button>
        </div>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.btn-ficha-alum').forEach(btn => {
    btn.addEventListener('click', () => openFichaModal(parseInt(btn.dataset.id)));
  });

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
// FICHA DE ALUMNO
// ══════════════════════════════════════════════════════════════════════════════

function openFichaModal(id) {
  const a = state.alums.find(x => x.id === id);
  if (!a) return;

  let nacimiento = '—', edad = '—';
  if (a.fecha_nacimiento) {
    const [y, m, d] = a.fecha_nacimiento.split('-').map(Number);
    nacimiento = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
    const hoy = new Date();
    let e = hoy.getFullYear() - y;
    if (hoy.getMonth() < m - 1 || (hoy.getMonth() === m - 1 && hoy.getDate() < d)) e--;
    edad = `${e} años`;
  }
  const alta = a.creado_en ? new Date(a.creado_en).toLocaleDateString('es-AR') : '—';

  document.getElementById('ficha-subtitle').textContent = state.school ? state.school.n : '';
  document.getElementById('ficha-body').innerHTML = `
    <dt>Alumno</dt><dd>${esc(a.n)}</dd>
    <dt>Clase</dt><dd>${esc(a.cl)}</dd>
    <dt>DNI</dt><dd>${esc(a.dni)}</dd>
    <dt>Nacimiento</dt><dd>${esc(nacimiento)}</dd>
    <dt>Edad</dt><dd>${esc(edad)}</dd>
    <dt>Fecha de alta</dt><dd>${esc(alta)}</dd>`;
  document.getElementById('modal-ficha').classList.remove('hidden');
}

function bindFichaModalEvents() {
  const close = () => document.getElementById('modal-ficha').classList.add('hidden');
  document.getElementById('modal-ficha').addEventListener('click', e => {
    if (e.target === e.currentTarget) close();
  });
  document.getElementById('btn-ficha-close').addEventListener('click', close);
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: PROFESORES
// ══════════════════════════════════════════════════════════════════════════════

function renderProfesores(el) {
  el.innerHTML = `
    <div class="sa-toolbar">
      <input class="sa-input sa-input--search" id="search-profs" placeholder="Buscar profesor...">
      <button class="sa-btn sa-btn--primary" id="btn-new-profesor">+ Nuevo profesor</button>
    </div>
    <div class="sa-table-wrap">
      <table class="sa-table">
        <thead><tr><th>Profesor</th><th>Materia</th><th>Clases asignadas</th><th>Acciones</th></tr></thead>
        <tbody id="tbody-profs"></tbody>
      </table>
    </div>
  `;

  fillProfsRows(state.profs);

  document.getElementById('btn-new-profesor')?.addEventListener('click', openCreateProfesorModal);

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
      <td class="col-main">${esc(p.n)}</td>
      <td class="col-muted">${esc(p.m)}</td>
      <td class="col-muted">${esc(p.cl)}</td>
      <td>
        <div class="sa-actions">
          <button class="sa-btn sa-btn--primary sa-btn--sm btn-edit-prof" data-id="${p.id}">Editar</button>
          <button class="sa-btn sa-btn--ghost-danger sa-btn--sm btn-del-prof"
            data-id="${p.id}" data-nombre="${esc(p.n)}">Eliminar</button>
        </div>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.btn-edit-prof').forEach(btn => {
    btn.addEventListener('click', () => openEditProfesorModal(parseInt(btn.dataset.id)));
  });

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
            <div class="sa-av sa-av--circle">${esc(initials)}</div>
            <div class="sa-dir-card__info">
              <div class="sa-dir-card__name">${esc(d.nombre)}</div>
              <div class="sa-dir-card__email">${esc(d.email)}</div>
            </div>
            <span class="sa-pill sa-pill--green">Directivo</span>
            <span class="sa-dir-card__since">Desde ${esc(d.desde)}</span>
            <div class="sa-actions">
              <button class="sa-btn sa-btn--primary sa-btn--sm btn-edit-dir" data-id="${d.id}">Editar</button>
              <button class="sa-btn sa-btn--ghost-danger sa-btn--sm btn-revocar"
                data-id="${d.id}" data-nombre="${esc(d.nombre)}">Revocar</button>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  el.querySelectorAll('.btn-edit-dir').forEach(btn => {
    btn.addEventListener('click', () => {
      const d = (state.dirs[state.school.id] || []).find(x => x.id === parseInt(btn.dataset.id));
      if (d) abrirFormDirectivo(d);
    });
  });

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
          syncDirectivo();
          showToast('Acceso de directivo revocado');
        }
      );
    });
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// MODAL: CREAR / EDITAR DIRECTIVO
// ══════════════════════════════════════════════════════════════════════════════

const CAMPOS_DIR = ['field-nombre', 'field-apellido', 'field-email', 'field-password'];

function validarFormDir() {
  const editando = state.editDirId !== null;
  document.getElementById('btn-create-confirm').disabled =
    !(val('field-nombre') && val('field-apellido') && val('field-email') &&
      (editando || val('field-password')));
}

function abrirFormDirectivo(d) {
  state.editDirId = d ? d.id : null;
  const [nombre, ...resto] = d ? d.nombre.split(' ') : [''];

  document.getElementById('create-title').textContent =
    d ? 'Editar cuenta de directivo' : 'Crear cuenta de directivo';
  document.getElementById('modal-create-subtitle').innerHTML = d
    ? `Directivo de <strong style="color:#fff">${esc(state.school.n)}</strong>.`
    : `Se asignará a <strong style="color:#fff">${esc(state.school.n)}</strong> y se registrará en Supabase.`;
  document.getElementById('create-info').classList.toggle('hidden', !!d);
  document.getElementById('btn-create-confirm').textContent = d ? 'Guardar cambios' : 'Crear y asignar';

  document.getElementById('field-nombre').value = d ? nombre : '';
  document.getElementById('field-apellido').value = d ? resto.join(' ') : '';
  document.getElementById('field-email').value = d ? d.email : '';
  document.getElementById('field-password').value = '';
  document.getElementById('field-password').placeholder =
    d ? 'Dejar vacío para no cambiarla' : 'Mínimo 8 caracteres';

  validarFormDir();
  document.getElementById('modal-create').classList.remove('hidden');
}

function openCreateModal() { abrirFormDirectivo(null); }

function closeCreateModal() {
  document.getElementById('modal-create').classList.add('hidden');
}

function bindCreateModalEvents() {
  document.getElementById('modal-create').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeCreateModal();
  });
  document.getElementById('btn-create-cancel').addEventListener('click', closeCreateModal);
  CAMPOS_DIR.forEach(id => document.getElementById(id).addEventListener('input', validarFormDir));

  document.getElementById('btn-create-confirm').addEventListener('click', () => {
    const nombre   = val('field-nombre');
    const apellido = val('field-apellido');
    const email    = val('field-email');
    const pass     = document.getElementById('field-password').value;
    const sid      = state.school.id;

    if (pass && pass.length < 8) {
      showToast('La contraseña debe tener al menos 8 caracteres');
      return;
    }

    if (state.editDirId !== null) {
      const d = (state.dirs[sid] || []).find(x => x.id === state.editDirId);
      if (!d) return;
      Object.assign(d, { nombre: `${nombre} ${apellido}`, email });
      closeCreateModal();
      if (state.tab === 'directivos') renderDirsContent();
      syncDirectivo();
      showToast(`✓ Directivo ${nombre} ${apellido} actualizado`);
      return;
    }

    if (!state.dirs[sid]) state.dirs[sid] = [];
    state.dirs[sid].push({
      id:     Date.now(),
      nombre: `${nombre} ${apellido}`,
      email,
      desde:  new Date().getFullYear().toString(),
    });

    closeCreateModal();
    if (state.tab === 'directivos') renderDirsContent();
    syncDirectivo();
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
// TAB: OPCIONES
// ══════════════════════════════════════════════════════════════════════════════

function renderOpciones(el) {
  el.innerHTML = `
    <div class="sa-dir-header">
      <div>
        <div class="sa-dir-title">Opciones del colegio</div>
        <div class="sa-dir-subtitle">Gestioná el estado de este colegio.</div>
      </div>
    </div>
    <div id="options-content"></div>
  `;

  renderOpcionesContent();
}

function renderOpcionesContent() {
  const el = document.getElementById('options-content');
  if (!el || !state.school) return;

  const connected = state.school.on;

  el.innerHTML = `
    <div class="sa-options-grid">
      <div class="sa-options-card">
        <div>
          <div class="sa-options-label">Conexión</div>
          <div class="sa-options-text">Activá o desactivá la conexión del colegio dentro del sistema.</div>
        </div>
        <button class="sa-toggle ${connected ? 'sa-toggle--on' : ''}" id="btn-toggle-connection" aria-pressed="${connected}">
          <span class="sa-toggle__thumb"></span>
        </button>
      </div>

      <div class="sa-options-card sa-options-card--danger">
        <div>
          <div class="sa-options-label">Eliminar colegio</div>
          <div class="sa-options-text">Esta acción eliminará el colegio seleccionado y lo quitará del panel.</div>
        </div>
        <button class="sa-btn sa-btn--ghost-danger sa-btn--sm" id="btn-delete-school">Eliminar colegio</button>
      </div>
    </div>
  `;

  document.getElementById('btn-toggle-connection')?.addEventListener('click', () => {
    state.school.on = !state.school.on;
    renderOpcionesContent();
    renderSidebar();
    showToast(`Conexión ${state.school.on ? 'activada' : 'desactivada'}`);
  });

  document.getElementById('btn-delete-school')?.addEventListener('click', () => {
    openDeleteModal(
      '¿Eliminar este colegio?',
      state.school.n,
      'Sí, eliminar',
      () => {
        const schoolId = state.school.id;
        const schoolName = state.school.n;
        const index = SCHOOLS.findIndex(s => s.id === schoolId);
        if (index !== -1) SCHOOLS.splice(index, 1);
        state.school = null;
        state.tab = 'clases';
        updateNav();
        renderSidebar();
        renderMain();
        showToast(`Colegio ${schoolName} eliminado`);
      }
    );
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// MODAL: CREAR ALUMNO
// ══════════════════════════════════════════════════════════════════════════════

function openCreateAlumnoModal() {
  document.getElementById('campo-alum-nombre').value = '';
  document.getElementById('campo-alum-apellido').value = '';
  document.getElementById('campo-alum-dni').value = '';
  document.getElementById('campo-alum-fecha').value = '';

  const selectCurso = document.getElementById('campo-alum-curso');
  selectCurso.innerHTML = '<option value="">Seleccioná un curso</option>';
  state.clases.forEach(c => {
    const option = document.createElement('option');
    option.value = c.id;
    option.textContent = c.n;
    selectCurso.appendChild(option);
  });
  selectCurso.value = '';

  document.getElementById('btn-alum-confirm').disabled = true;
  document.getElementById('modal-alumno').classList.remove('hidden');
}

function closeCreateAlumnoModal() {
  document.getElementById('modal-alumno').classList.add('hidden');
}

function bindCreateAlumnoModalEvents() {
  document.getElementById('modal-alumno').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeCreateAlumnoModal();
  });
  document.getElementById('btn-alum-cancel').addEventListener('click', closeCreateAlumnoModal);

  const campos = ['campo-alum-nombre', 'campo-alum-apellido', 'campo-alum-dni', 'campo-alum-fecha', 'campo-alum-curso'];
  const validar = () => {
    const dni = document.getElementById('campo-alum-dni').value;
    const allFilled = campos.every(f => document.getElementById(f).value.trim() !== '');
    const dniValid = dni.length === 8 && /^\d+$/.test(dni);
    document.getElementById('btn-alum-confirm').disabled = !(allFilled && dniValid);
  };
  campos.forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener('input', validar);
    el.addEventListener('change', validar);
  });

  document.getElementById('btn-alum-confirm').addEventListener('click', () => {
    const nombre = val('campo-alum-nombre');
    const apellido = val('campo-alum-apellido');
    const dni = val('campo-alum-dni');
    const fecha = document.getElementById('campo-alum-fecha').value;
    const cursoId = parseInt(document.getElementById('campo-alum-curso').value);

    const curso = state.clases.find(c => c.id === cursoId);
    if (!curso) {
      showToast('Error: seleccioná un curso válido');
      return;
    }

    const newAlumno = {
      id: Date.now(),
      n: `${apellido}, ${nombre}`,
      cl: curso.n,
      dni,
      fecha_nacimiento: fecha,
      curso_id: cursoId,
      creado_en: new Date().toISOString(),
    };

    state.alums.push(newAlumno);
    closeCreateAlumnoModal();
    if (state.tab === 'alumnos') renderTabContent();
    showToast(`✓ Alumno ${nombre} ${apellido} creado exitosamente`);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// MODAL: CREAR / EDITAR PROFESOR
// ══════════════════════════════════════════════════════════════════════════════

const CAMPOS_PROF = ['campo-prof-nombre', 'campo-prof-apellido', 'campo-prof-email', 'campo-prof-materia'];

function validarFormProf() {
  const email = val('campo-prof-email');
  const emailOk = state.editProfId !== null ? (!email || email.includes('@')) : email.includes('@');
  document.getElementById('btn-prof-confirm').disabled =
    !(val('campo-prof-nombre') && val('campo-prof-apellido') && val('campo-prof-materia') && emailOk);
}

function abrirFormProfesor(p) {
  state.editProfId = p ? p.id : null;
  const [nombre, ...resto] = p ? p.n.split(' ') : [''];

  document.getElementById('prof-title').textContent = p ? 'Editar profesor' : 'Nuevo profesor';
  document.getElementById('prof-subtitle').textContent =
    p ? 'Modificá los datos del docente.' : 'Registrá un nuevo docente en el sistema.';
  document.getElementById('prof-info').classList.toggle('hidden', !!p);
  document.getElementById('btn-prof-confirm').textContent = p ? 'Guardar cambios' : 'Crear profesor';

  document.getElementById('campo-prof-nombre').value = p ? (p.nombre || nombre) : '';
  document.getElementById('campo-prof-apellido').value = p ? (p.apellido || resto.join(' ')) : '';
  document.getElementById('campo-prof-email').value = p ? (p.email || '') : '';
  document.getElementById('campo-prof-materia').value = p ? p.m : '';

  validarFormProf();
  document.getElementById('modal-profesor').classList.remove('hidden');
}

function openCreateProfesorModal() { abrirFormProfesor(null); }

function openEditProfesorModal(id) {
  const p = state.profs.find(x => x.id === id);
  if (p) abrirFormProfesor(p);
}

function closeCreateProfesorModal() {
  document.getElementById('modal-profesor').classList.add('hidden');
}

function bindCreateProfesorModalEvents() {
  document.getElementById('modal-profesor').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeCreateProfesorModal();
  });
  document.getElementById('btn-prof-cancel').addEventListener('click', closeCreateProfesorModal);
  CAMPOS_PROF.forEach(id => document.getElementById(id).addEventListener('input', validarFormProf));

  document.getElementById('btn-prof-confirm').addEventListener('click', () => {
    const nombre = val('campo-prof-nombre');
    const apellido = val('campo-prof-apellido');
    const email = val('campo-prof-email');
    const materia = val('campo-prof-materia');

    if (state.editProfId !== null) {
      const p = state.profs.find(x => x.id === state.editProfId);
      if (!p) return;
      Object.assign(p, { n: `${nombre} ${apellido}`, nombre, apellido, m: materia, email: email || p.email });
      closeCreateProfesorModal();
      if (state.tab === 'profesores') renderTabContent();
      showToast(`✓ Profesor ${nombre} ${apellido} actualizado`);
      return;
    }

    state.profs.push({
      id: Date.now(),
      n: `${nombre} ${apellido}`,
      nombre, apellido,
      m: materia,
      cl: '',
      email,
      creado_en: new Date().toISOString(),
    });

    closeCreateProfesorModal();
    if (state.tab === 'profesores') renderTabContent();
    showToast(`✓ Profesor ${nombre} ${apellido} creado exitosamente`);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// MODAL: CREAR / EDITAR CLASE
// ══════════════════════════════════════════════════════════════════════════════

const CAMPOS_CLASE = ['campo-clase-nombre', 'campo-clase-nivel', 'campo-clase-turno', 'campo-clase-preceptor'];

function validarFormClase() {
  document.getElementById('btn-clase-confirm').disabled = !CAMPOS_CLASE.every(val);
}

function abrirFormClase(c) {
  state.editClaseId = c ? c.id : null;

  document.getElementById('clase-title').textContent = c ? 'Editar clase' : 'Nueva clase';
  document.getElementById('clase-subtitle').textContent =
    c ? 'Modificá los datos de la clase.' : 'Registrá una nueva clase en el sistema.';
  document.getElementById('btn-clase-confirm').textContent = c ? 'Guardar cambios' : 'Crear clase';

  document.getElementById('campo-clase-nombre').value = c ? c.n : '';
  document.getElementById('campo-clase-nivel').value = c ? c.nv : '';
  document.getElementById('campo-clase-turno').value = c ? c.t : '';
  document.getElementById('campo-clase-preceptor').value = c ? c.prec : '';

  validarFormClase();
  document.getElementById('modal-clase').classList.remove('hidden');
}

function openCreateClaseModal() { abrirFormClase(null); }

function openEditClaseModal(id) {
  const c = state.clases.find(x => x.id === id);
  if (c) abrirFormClase(c);
}

function closeCreateClaseModal() {
  document.getElementById('modal-clase').classList.add('hidden');
}

function bindCreateClaseModalEvents() {
  document.getElementById('modal-clase').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeCreateClaseModal();
  });
  document.getElementById('btn-clase-cancel').addEventListener('click', closeCreateClaseModal);
  CAMPOS_CLASE.forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener('input', validarFormClase);
    el.addEventListener('change', validarFormClase);
  });

  document.getElementById('btn-clase-confirm').addEventListener('click', () => {
    const nombre = val('campo-clase-nombre');
    const nivel = val('campo-clase-nivel');
    const turno = val('campo-clase-turno');
    const preceptor = val('campo-clase-preceptor');

    if (state.clases.some(c => c.id !== state.editClaseId && c.n.toLowerCase() === nombre.toLowerCase())) {
      showToast('Ya existe una clase con ese nombre');
      return;
    }

    if (state.editClaseId !== null) {
      const c = state.clases.find(x => x.id === state.editClaseId);
      if (!c) return;
      const viejo = c.n;
      Object.assign(c, { n: nombre, nv: nivel, t: turno, prec: preceptor });
      state.alums.forEach(a => { if (a.cl === viejo) a.cl = nombre; }); // mantiene la clase de los alumnos
      closeCreateClaseModal();
      if (state.tab === 'clases') renderTabContent();
      showToast(`✓ Clase ${nombre} actualizada`);
      return;
    }

    state.clases.push({
      id: Date.now(),
      n: nombre,
      nv: nivel,
      t: turno,
      a: '',
      prec: preceptor,
      al: 0,
      creado_en: new Date().toISOString(),
    });

    closeCreateClaseModal();
    if (state.tab === 'clases') renderTabContent();
    showToast(`✓ Clase ${nombre} creada exitosamente`);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// TOAST
// ══════════════════════════════════════════════════════════════════════════════

let toastTimer = null;

function showToast(msg) {
  const el = document.getElementById('sa-toast');
  el.classList.remove('hidden');
  el.textContent = msg;
  el.classList.add('sa-toast--visible');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('sa-toast--visible');
  }, 3000);
}