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
  preceptores: [],
  deleteCallback: null,
  importacionPendiente: null,
  editClaseId: null,
  editProfId: null,
  editDirId: null,
};

const parametrosRetornoFicha = new URLSearchParams(window.location.search);
const colegioRetornoFicha = parametrosRetornoFicha.get('colegio');
const pestañaRetornoFicha = parametrosRetornoFicha.get('tab');
let pestañaInicialFicha = ['clases', 'alumnos', 'profesores', 'preceptores', 'directivos', 'opciones']
  .includes(pestañaRetornoFicha) ? pestañaRetornoFicha : null;

const datosPorColegio = Object.fromEntries(SCHOOLS.map(({ id }) => [id, {
  clases: state.clases.map(clase => ({ ...clase })),
  alums: state.alums.map(alumno => ({ ...alumno })),
  profs: state.profs.map(profesor => ({ ...profesor }))
}]));

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
  const usuario = getUsuarioActual();
  if (!usuario || usuario.rol !== 'superadmin') {
    requireSuperadmin();
    return;
  }
  renderSidebar();
  renderMain();
  bindNavEvents();
  bindColegioModalEvents();
  bindCreateModalEvents();
  bindCreateAlumnoModalEvents();
  bindFichaModalEvents();
  bindCreateProfesorModalEvents();
  bindCreatePreceptorModalEvents();
  bindDeletePreceptorModalEvents();
  bindCreateClaseModalEvents();
  bindDeleteModalEvents();
  bindImportarExcelEvents();
  setupSuperadminDropdown();
  cargarColegiosPersistidos();
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
    state.tab = 'clases';
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
    el.addEventListener('click', async () => {
      const id = el.dataset.id;
      state.school = SCHOOLS.find(s => String(s.id) === id);
      let datos = datosPorColegio[id];
      if (state.school.persistido) {
        try {
          const [datosPersistidos, directivos] = await Promise.all([
            getDatosColegioSuperadminDB(id),
            getDirectivosColegioSuperadminDB(id)
          ]);
          if (String(state.school?.id) !== id) return;
          datos = datosPersistidos;
          state.dirs[id] = directivos;
          datosPorColegio[id] = datos;
          state.school.cl = datos.clases.length;
          state.school.al = datos.alums.length;
          state.school.pr = datos.profs.length;
        } catch (error) {
          if (String(state.school?.id) !== id) return;
          showToast(`No se pudieron cargar los datos del colegio: ${error.message}`);
          return;
        }
      }
      state.clases = datos.clases;
      state.alums = datos.alums;
      state.profs = datos.profs;
      state.preceptores = datos.preceptores || [];
      state.tab = pestañaInicialFicha || 'clases';
      pestañaInicialFicha = null;
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
          alumnos, profesores, preceptores y directivos.
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
      <p class="sa-panel-subtitle">Gestioná clases, alumnos, profesores, preceptores y directivos de este colegio.</p>

      <div class="sa-tabs">
        ${['clases', 'alumnos', 'profesores', 'preceptores', 'directivos', 'opciones'].map(t => `
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
    case 'preceptores': renderPreceptores(el); break;
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

  document.getElementById('btn-col-confirm').addEventListener('click', async () => {
    const nombre = val('campo-col-nombre');
    if (SCHOOLS.some(s => s.n.toLowerCase() === nombre.toLowerCase())) {
      showToast('Ya existe un colegio con ese nombre');
      return;
    }
    const ab = (val('campo-col-ab') ||
      nombre.split(/\s+/).map(w => w[0]).join('').slice(0, 3)).toUpperCase();

    const boton = document.getElementById('btn-col-confirm');
    boton.disabled = true;
    const resultado = await crearColegioSuperadminDB(nombre, ab);
    if (!resultado.ok) {
      boton.disabled = false;
      showToast(`No se pudo crear el colegio: ${resultado.error}`);
      return;
    }
    const nuevo = {
      id: resultado.data.id, n: resultado.data.nombre, dir: null,
      al: 0, pr: 0, cl: 0, on: true, ab: resultado.data.sigla, persistido: true
    };
    SCHOOLS.push(nuevo);
    state.dirs[nuevo.id] = [];
    datosPorColegio[nuevo.id] = { clases: [], alums: [], profs: [], preceptores: [] };

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
    btn.addEventListener('click', () => openEditClaseModal(btn.dataset.id));
  });

  tbody.querySelectorAll('.btn-del-clase').forEach(btn => {
    btn.addEventListener('click', () => {
      openDeleteModal(
        `¿Eliminar la clase ${btn.dataset.nombre}?`,
        btn.dataset.nombre,
        'Sí, eliminar',
        () => {
          state.clases = state.clases.filter(c => String(c.id) !== btn.dataset.id);
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
          <button class="sa-btn sa-btn--primary sa-btn--sm btn-ficha btn-ficha-alum" data-id="${a.id}">Ver ficha</button>
          <button class="sa-btn sa-btn--ghost-danger sa-btn--sm btn-del-alum"
            data-id="${a.id}" data-nombre="${esc(a.n)}">Eliminar</button>
        </div>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.btn-ficha-alum').forEach(btn => {
    btn.addEventListener('click', () => {
      if (state.school?.persistido) {
        const params = new URLSearchParams({
          id: btn.dataset.id,
          volver: 'superadmin',
          colegio_id: state.school.id,
          tab: 'alumnos'
        });
        window.location.href = `ficha-alumno.html?${params.toString()}`;
        return;
      }
      openFichaModal(btn.dataset.id);
    });
  });

  tbody.querySelectorAll('.btn-del-alum').forEach(btn => {
    btn.addEventListener('click', () => {
      openDeleteModal(
        '¿Eliminar alumno?',
        btn.dataset.nombre,
        'Sí, eliminar',
        () => {
          state.alums = state.alums.filter(a => String(a.id) !== btn.dataset.id);
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

async function openFichaModal(id) {
  const a = state.alums.find(x => String(x.id) === String(id));
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
  const fichaBody = document.getElementById('ficha-body');
  fichaBody.innerHTML = `<dt>Alumno</dt><dd>${esc(a.n)}</dd>
    <dt>Clase</dt><dd>${esc(a.cl)}</dd>
    <dt>DNI</dt><dd>${esc(a.dni)}</dd>
    <dt>Nacimiento</dt><dd>${esc(nacimiento)}</dd>
    <dt>Edad</dt><dd>${esc(edad)}</dd>
    <dt>Fecha de alta</dt><dd>${esc(alta)}</dd>
    <dt>Asistencia</dt><dd>Cargando...</dd>`;
  document.getElementById('modal-ficha').classList.remove('hidden');
  if (state.school?.persistido) {
    try {
      const ficha = await getFichaAlumnoDB(id);
      if (!ficha) throw new Error('No se encontró la ficha del alumno.');
      const totals = {};
      ficha.asistencias.forEach(registro => {
        totals[registro.anio_lectivo] = (totals[registro.anio_lectivo] || 0) +
          (registro.estado === 'ausente' ? 1 : registro.estado === 'tarde' ? 0.25 : 0);
      });
      const years = Object.keys(totals).sort((left, right) => Number(right) - Number(left));
      const history = years.length
        ? years.map(year => `${year}: ${totals[year]} faltas`).join(' · ')
        : 'Sin registros de asistencia';
      const comments = ficha.comentarios.length
        ? ficha.comentarios.map(comment => `<p><strong>${esc(comment.autor_nombre || 'Equipo escolar')}</strong> · ${esc(new Date(comment.creado_en).toLocaleDateString('es-AR'))}<br>${esc(comment.texto)}</p>`).join('')
        : '<p>Sin comentarios.</p>';
      const followups = ficha.seguimientos.length
        ? ficha.seguimientos.map(item => `<p><strong>${esc(item.categoria)}</strong> · ${esc(new Date(item.creado_en).toLocaleDateString('es-AR'))}<br>${esc(item.texto)}</p>`).join('')
        : '<p>Sin seguimientos.</p>';
      fichaBody.innerHTML = `
        <dt>Alumno</dt><dd>${esc(ficha.apellido)}, ${esc(ficha.nombre)}</dd>
        <dt>Clase</dt><dd>${esc(ficha.anio)}° ${esc(ficha.division)}</dd>
        <dt>DNI</dt><dd>${esc(ficha.dni || '—')}</dd>
        <dt>Nacimiento</dt><dd>${esc(ficha.fecha_nacimiento || '—')} · ${ficha.edad == null ? '—' : `${esc(ficha.edad)} años`}</dd>
        <dt>Fecha de alta</dt><dd>${esc(alta)}</dd>
        <dt>Asistencia</dt><dd>${esc(history)}</dd>
        <dt>Comentarios</dt><dd>${comments}</dd>
        <dt>Seguimientos</dt><dd>${followups}</dd>`;
    } catch (error) {
      fichaBody.innerHTML += `<dt>Datos adicionales</dt><dd>${esc(error.message || 'No se pudieron cargar.')}</dd>`;
    }
    return;
  }
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
    btn.addEventListener('click', () => openEditProfesorModal(btn.dataset.id));
  });

  tbody.querySelectorAll('.btn-del-prof').forEach(btn => {
    btn.addEventListener('click', () => {
      openDeleteModal(
        '¿Eliminar profesor?',
        btn.dataset.nombre,
        'Sí, eliminar',
        () => {
          state.profs = state.profs.filter(p => String(p.id) !== btn.dataset.id);
          renderTabContent();
          showToast('Profesor eliminado');
        }
      );
    });
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: PRECEPTORES
// ══════════════════════════════════════════════════════════════════════════════

function renderPreceptores(el) {
  const puedeGestionar = Boolean(state.school.persistido);
  el.innerHTML = `
    <div class="sa-toolbar">
      <input class="sa-input sa-input--search" id="search-preceptores" placeholder="Buscar preceptor/a...">
      <button class="sa-btn sa-btn--primary" id="btn-new-preceptor" ${puedeGestionar ? '' : 'disabled'}>
        + Nueva cuenta
      </button>
    </div>
    ${puedeGestionar ? '' : '<p class="sa-empty__text">Las cuentas reales requieren un colegio guardado en Supabase.</p>'}
    <section class="sa-ciclo-card">
      <div><strong>Ciclo lectivo</strong><p id="sa-ciclo-actual">Cargando...</p><small id="sa-ciclo-historial"></small></div>
      <div class="sa-ciclo-controls">
        <input class="sa-input" id="sa-anio-lectivo" type="number" min="2000" max="2200" aria-label="Año lectivo">
        <button class="sa-btn sa-btn--primary" id="btn-sa-abrir-anio" ${puedeGestionar ? '' : 'disabled'}>Abrir año</button>
      </div>
    </section>
    <div class="sa-table-wrap">
      <table class="sa-table">
        <thead><tr><th>Preceptor/a</th><th>DNI</th><th>Email</th><th>Teléfono</th><th>Clases</th><th>Acciones</th></tr></thead>
        <tbody id="tbody-preceptores"></tbody>
      </table>
    </div>
  `;
  const body = document.getElementById('tbody-preceptores');
  if (!puedeGestionar) {
    body.innerHTML = '<tr><td colspan="6">Sin cuentas reales para mostrar.</td></tr>';
    return;
  }
  document.getElementById('btn-new-preceptor').addEventListener('click', openCreatePreceptorModal);
  document.getElementById('search-preceptores').addEventListener('input', e => {
    const query = e.target.value.toLowerCase();
    fillPreceptoresRows(state.preceptores.filter(preceptor =>
      `${preceptor.n} ${preceptor.dni} ${preceptor.email}`.toLowerCase().includes(query)));
  });
  document.getElementById('btn-sa-abrir-anio').addEventListener('click', abrirAnioSuperadmin);
  document.getElementById('sa-anio-lectivo').value = String(new Date().getFullYear());
  cargarCicloSuperadmin();
  fillPreceptoresRows(state.preceptores);
}

function fillPreceptoresRows(list) {
  const tbody = document.getElementById('tbody-preceptores');
  if (!tbody) return;
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="6">No hay preceptores para mostrar.</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(preceptor => `
    <tr>
      <td class="col-main">${esc(preceptor.n)}</td>
      <td class="col-muted">${esc(preceptor.dni || '—')}</td>
      <td class="col-muted">${esc(preceptor.email || '—')}</td>
      <td class="col-muted">${esc(preceptor.telefono || '—')}</td>
      <td class="col-muted">${esc(preceptor.cl || '—')}</td>
      <td>
        <button class="sa-btn sa-btn--secondary sa-btn--sm" data-edit-preceptor="${esc(preceptor.id)}">Editar</button>
        <button class="sa-btn sa-btn--ghost-danger sa-btn--sm" data-delete-preceptor="${esc(preceptor.id)}">Eliminar</button>
      </td>
    </tr>
  `).join('');
  tbody.querySelectorAll('[data-edit-preceptor]').forEach(button => {
    button.addEventListener('click', () => openEditPreceptorModal(button.dataset.editPreceptor));
  });
  tbody.querySelectorAll('[data-delete-preceptor]').forEach(button => {
    button.addEventListener('click', () => openDeletePreceptorModal(button.dataset.deletePreceptor));
  });
}

async function recargarColegioSeleccionado() {
  if (!state.school?.persistido) return;
  const datos = await getDatosColegioSuperadminDB(state.school.id);
  datosPorColegio[state.school.id] = datos;
  state.clases = datos.clases;
  state.alums = datos.alums;
  state.profs = datos.profs;
  state.preceptores = datos.preceptores;
  state.school.cl = datos.clases.length;
  state.school.al = datos.alums.length;
  state.school.pr = datos.profs.length;
  renderSidebar();
  renderTabContent();
}

function openCreatePreceptorModal() {
  if (!state.school?.persistido) return;
  preceptorAEditar = null;
  document.querySelector('#modal-preceptor .sa-modal__title').textContent = 'Nueva cuenta de preceptor/a';
  document.getElementById('preceptor-subtitle').textContent = `Nueva cuenta para ${state.school.n}.`;
  ['campo-pre-nombre', 'campo-pre-apellido', 'campo-pre-dni', 'campo-pre-fecha',
    'campo-pre-telefono', 'campo-pre-email', 'campo-pre-password']
    .forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('campo-pre-password-wrap').classList.remove('hidden');
  document.getElementById('btn-pre-confirm').textContent = 'Crear preceptor/a';
  document.getElementById('modal-preceptor').classList.remove('hidden');
}

let preceptorAEditar = null;

function openEditPreceptorModal(id) {
  const preceptor = state.preceptores.find(item => String(item.id) === String(id));
  if (!preceptor) return;
  preceptorAEditar = preceptor.id;
  document.querySelector('#modal-preceptor .sa-modal__title').textContent = 'Editar perfil de preceptor/a';
  document.getElementById('preceptor-subtitle').textContent =
    `Actualizá los datos de ${preceptor.n}. El email también cambiará su acceso.`;
  document.getElementById('campo-pre-nombre').value = preceptor.nombre || '';
  document.getElementById('campo-pre-apellido').value = preceptor.apellido || '';
  document.getElementById('campo-pre-dni').value = preceptor.dni || '';
  document.getElementById('campo-pre-fecha').value = preceptor.fecha_nacimiento || '';
  document.getElementById('campo-pre-telefono').value = preceptor.telefono || '';
  document.getElementById('campo-pre-email').value = preceptor.email || '';
  document.getElementById('campo-pre-password').value = '';
  document.getElementById('campo-pre-password-wrap').classList.add('hidden');
  document.getElementById('btn-pre-confirm').textContent = 'Guardar cambios';
  document.getElementById('modal-preceptor').classList.remove('hidden');
}

function closeCreatePreceptorModal() {
  document.getElementById('modal-preceptor').classList.add('hidden');
  preceptorAEditar = null;
}

function bindCreatePreceptorModalEvents() {
  document.getElementById('modal-preceptor').addEventListener('click', event => {
    if (event.target === event.currentTarget) closeCreatePreceptorModal();
  });
  document.getElementById('btn-pre-cancel').addEventListener('click', closeCreatePreceptorModal);
  document.getElementById('btn-pre-confirm').addEventListener('click', async () => {
    const button = document.getElementById('btn-pre-confirm');
    const datos = {
      nombre: val('campo-pre-nombre'),
      apellido: val('campo-pre-apellido'),
      dni: val('campo-pre-dni'),
      fecha_nacimiento: document.getElementById('campo-pre-fecha').value,
      telefono: val('campo-pre-telefono'),
      email: val('campo-pre-email').toLowerCase(),
      colegio_id: state.school?.id
    };
    const editando = Boolean(preceptorAEditar);
    const password = document.getElementById('campo-pre-password').value;
    if (!editando) datos.password = password;
    if (!datos.nombre || !datos.apellido || !datos.dni || !datos.fecha_nacimiento ||
        !datos.telefono || !datos.email || (!editando && password.length < 8)) {
      showToast(editando
        ? 'Completá todos los datos del preceptor/a.'
        : 'Completá todos los datos y usá una contraseña de al menos 8 caracteres.');
      return;
    }
    button.disabled = true;
    button.textContent = editando ? 'Guardando...' : 'Creando...';
    const resultado = editando
      ? await modificarCuentaPreceptorDB(preceptorAEditar, datos)
      : await crearCuentaPreceptorDB(datos);
    if (!resultado.ok) {
      showToast(`No se pudo ${editando ? 'actualizar el perfil' : 'crear el preceptor/a'}: ${resultado.error}`);
      button.disabled = false;
      button.textContent = editando ? 'Guardar cambios' : 'Crear preceptor/a';
      return;
    }
    closeCreatePreceptorModal();
    try {
      await recargarColegioSeleccionado();
      showToast(editando ? 'Perfil de preceptor/a actualizado.' : 'Cuenta de preceptor/a creada.');
    } catch (error) {
      showToast(`El perfil se guardó, pero no se pudo actualizar la lista: ${error.message}`);
    } finally {
      button.disabled = false;
      button.textContent = 'Crear preceptor/a';
    }
  });
}

let preceptorAEliminar = null;

function openDeletePreceptorModal(id) {
  const preceptor = state.preceptores.find(item => String(item.id) === String(id));
  if (!preceptor) return;
  preceptorAEliminar = preceptor.id;
  document.getElementById('delete-preceptor-name').textContent =
    `Vas a eliminar a ${preceptor.n}. Las asignaciones se quitarán y sus registros se archivarán.`;
  document.getElementById('delete-preceptor-password').value = '';
  document.getElementById('modal-delete-preceptor').classList.remove('hidden');
}

function bindDeletePreceptorModalEvents() {
  const overlay = document.getElementById('modal-delete-preceptor');
  const close = () => {
    overlay.classList.add('hidden');
    document.getElementById('delete-preceptor-password').value = '';
    preceptorAEliminar = null;
  };
  overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
  document.getElementById('btn-pre-delete-cancel').addEventListener('click', close);
  document.getElementById('btn-pre-delete-confirm').addEventListener('click', async () => {
    if (!preceptorAEliminar) return;
    const button = document.getElementById('btn-pre-delete-confirm');
    const password = document.getElementById('delete-preceptor-password').value;
    if (!password) { showToast('Ingresá tu contraseña para confirmar.'); return; }
    button.disabled = true;
    const resultado = await eliminarCuentaPreceptorDB(preceptorAEliminar, password);
    if (!resultado.ok) {
      showToast(`No se pudo eliminar: ${resultado.error}`);
      document.getElementById('delete-preceptor-password').value = '';
      button.disabled = false;
      return;
    }
    close();
    button.disabled = false;
    try {
      await recargarColegioSeleccionado();
      showToast('Cuenta de preceptor/a eliminada.');
    } catch (error) {
      showToast(`La cuenta se eliminó, pero no se pudo actualizar la lista: ${error.message}`);
    }
  });
}

async function cargarCicloSuperadmin() {
  const colegioId = state.school?.id;
  if (!colegioId || !state.school.persistido) return;
  try {
    const [activo, ciclos] = await Promise.all([
      getCicloLectivoActivoDB(colegioId),
      getCiclosLectivosDB(colegioId)
    ]);
    document.getElementById('sa-ciclo-actual').textContent = activo
      ? `Año activo: ${activo.anio_lectivo}`
      : 'No hay año activo.';
    document.getElementById('sa-ciclo-historial').textContent = ciclos.length
      ? `Historial: ${ciclos.map(ciclo => ciclo.anio_lectivo).join(' · ')}`
      : 'Sin años registrados.';
  } catch (error) {
    document.getElementById('sa-ciclo-actual').textContent = `No se pudo cargar: ${error.message}`;
  }
}

async function abrirAnioSuperadmin() {
  const input = document.getElementById('sa-anio-lectivo');
  const year = Number(input.value);
  if (!Number.isInteger(year) || year < 2000 || year > 2200) {
    showToast('Ingresá un año entre 2000 y 2200.');
    return;
  }
  const result = await abrirAnioLectivoDB(state.school.id, year);
  if (!result.ok) {
    showToast(`No se pudo abrir el año: ${result.error}`);
    return;
  }
  await cargarCicloSuperadmin();
  showToast(`Año lectivo ${year} abierto.`);
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: DIRECTIVOS
// ══════════════════════════════════════════════════════════════════════════════

function renderDirectivos(el) {
  const puedeCrear = Boolean(state.school.persistido);
  el.innerHTML = `
    <div class="sa-dir-header">
      <div>
        <div class="sa-dir-title">Directivos del colegio</div>
        <div class="sa-dir-subtitle">Asigná y gestioná las cuentas de directivos para este colegio.</div>
      </div>
      <button class="sa-btn sa-btn--primary" id="btn-open-create" ${puedeCrear ? '' : 'disabled'}>
        + Crear cuenta directivo
      </button>
    </div>
    ${puedeCrear ? '' : '<p class="sa-empty__text">Este colegio de demostración no está guardado en Supabase. Creá un colegio nuevo para asignarle cuentas reales.</p>'}
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
        <button class="sa-btn sa-btn--primary" id="btn-open-create-2" ${state.school.persistido ? '' : 'disabled'}>
          + Crear primer directivo
        </button>
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
      const d = (state.dirs[state.school.id] || []).find(x => String(x.id) === btn.dataset.id);
      if (d) abrirFormDirectivo(d);
    });
  });

  el.querySelectorAll('.btn-revocar').forEach(btn => {
    btn.addEventListener('click', () => {
      openDeleteModal(
        '¿Revocar acceso de directivo?',
        btn.dataset.nombre,
        'Sí, revocar',
        async () => {
          const sid = state.school.id;
          if (state.school.persistido) {
            const resultado = await eliminarDirectivoSuperadminDB(btn.dataset.id);
            if (!resultado.ok) {
              showToast(`No se pudo revocar el acceso: ${resultado.error}`);
              return;
            }
            state.dirs[sid] = (state.dirs[sid] || [])
              .filter(directivo => String(directivo.id) !== btn.dataset.id);
            renderDirsContent();
            syncDirectivo();
            showToast('Acceso de directivo revocado');
            return;
          }
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
  const emailInput = document.getElementById('field-email');
  const passwordField = document.getElementById('field-password-container');

  document.getElementById('create-title').textContent =
    d ? 'Editar cuenta de directivo' : 'Crear cuenta de directivo';
  document.getElementById('modal-create-subtitle').innerHTML = d
    ? `Directivo de <strong style="color:#fff">${esc(state.school.n)}</strong>.`
    : `Se asignará a <strong style="color:#fff">${esc(state.school.n)}</strong> y se registrará en Supabase.`;
  document.getElementById('create-info').classList.toggle('hidden', !!d);
  document.getElementById('btn-create-confirm').textContent = d ? 'Guardar cambios' : 'Crear y asignar';

  document.getElementById('field-nombre').value = d ? (d.nombrePila || nombre) : '';
  document.getElementById('field-apellido').value = d ? (d.apellido || resto.join(' ')) : '';
  emailInput.value = d ? d.email : '';
  emailInput.disabled = Boolean(d);
  passwordField.classList.toggle('hidden', Boolean(d));
  document.getElementById('field-password').value = '';
  document.getElementById('field-password').placeholder =
    d ? 'Dejar vacío para no cambiarla' : 'Mínimo 8 caracteres';

  validarFormDir();
  document.getElementById('modal-create').classList.remove('hidden');
}

function openCreateModal() { abrirFormDirectivo(null); }

function closeCreateModal() {
  document.getElementById('modal-create').classList.add('hidden');
  document.getElementById('field-password').value = '';
}

function bindCreateModalEvents() {
  document.getElementById('modal-create').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeCreateModal();
  });
  document.getElementById('btn-create-cancel').addEventListener('click', closeCreateModal);
  CAMPOS_DIR.forEach(id => document.getElementById(id).addEventListener('input', validarFormDir));

  document.getElementById('btn-create-confirm').addEventListener('click', async () => {
    const nombre   = val('field-nombre');
    const apellido = val('field-apellido');
    const email    = val('field-email');
    const pass     = document.getElementById('field-password').value;
    const sid      = state.school.id;
    const boton = document.getElementById('btn-create-confirm');

    if (pass && pass.length < 8) {
      showToast('La contraseña debe tener al menos 8 caracteres');
      return;
    }

    boton.disabled = true;
    boton.textContent = state.editDirId !== null ? 'Guardando...' : 'Creando...';
    try {
      if (state.editDirId !== null) {
        const d = (state.dirs[sid] || []).find(x => x.id === state.editDirId);
        if (!d) return;
        const resultado = await modificarDirectivoSuperadminDB(d.id, { nombre, apellido });
        if (!resultado.ok) {
          showToast(`No se pudo actualizar el directivo: ${resultado.error}`);
          return;
        }
        d.nombre = `${nombre} ${apellido}`;
        d.nombrePila = nombre;
        d.apellido = apellido;
        closeCreateModal();
        if (state.tab === 'directivos') renderDirsContent();
        syncDirectivo();
        showToast(`✓ Directivo ${nombre} ${apellido} actualizado`);
        return;
      }

      const resultado = await crearDirectivoSuperadminDB(sid, {
        nombre, apellido, email, password: pass
      });
      if (!resultado.ok) {
        showToast(`No se pudo crear el directivo: ${resultado.error}`);
        return;
      }

      if (!state.dirs[sid]) state.dirs[sid] = [];
      state.dirs[sid].push({
        id: resultado.data.id,
        nombre: `${nombre} ${apellido}`,
        nombrePila: nombre,
        apellido,
        email: resultado.data.email,
        desde: new Date().getFullYear().toString()
      });
      closeCreateModal();
      if (state.tab === 'directivos') renderDirsContent();
      syncDirectivo();
      showToast(`✓ Cuenta de ${nombre} ${apellido} creada exitosamente`);
    } catch (error) {
      showToast(`No se pudo completar la operación: ${error.message}`);
    } finally {
      boton.textContent = state.editDirId !== null ? 'Guardar cambios' : 'Crear y asignar';
      if (!document.getElementById('modal-create').classList.contains('hidden')) {
        validarFormDir();
      }
    }
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

      <div class="sa-options-card">
        <div>
          <div class="sa-options-label">Cargar datos desde Excel</div>
          <div class="sa-options-text">Importá clases, alumnos, profesores y preceptores con sus cuentas de acceso.</div>
          <a class="sa-options-link" href="../plantilla-carga-colegio.xlsx" download>Descargar plantilla Excel</a>
        </div>
        <button class="sa-btn sa-btn--primary sa-btn--sm" id="btn-select-excel">Seleccionar Excel</button>
      </div>
    </div>
    <div id="excel-import-preview" aria-live="polite"></div>
  `;

  document.getElementById('btn-select-excel')?.addEventListener('click', () => {
    if (!state.school.persistido) {
      showToast('Este colegio de demostración no está guardado en Supabase. Creá un colegio nuevo para importar datos.');
      return;
    }
    document.getElementById('input-importar-excel').click();
  });
  renderImportacionPendiente();

  document.getElementById('btn-toggle-connection')?.addEventListener('click', async event => {
    const school = state.school;
    if (!school || !school.persistido) {
      showToast('Este colegio no está guardado en Supabase.');
      return;
    }

    const button = event.currentTarget;
    button.disabled = true;
    const nuevoEstado = !school.on;
    const resultado = await actualizarEstadoColegioSuperadminDB(school.id, nuevoEstado);
    if (!resultado.ok) {
      button.disabled = false;
      showToast(`No se pudo actualizar la conexión: ${resultado.error}`);
      return;
    }

    school.on = nuevoEstado;
    if (state.school === school) renderOpcionesContent();
    renderSidebar();
    showToast(`Conexión ${nuevoEstado ? 'activada' : 'desactivada'}`);
  });

  document.getElementById('btn-delete-school')?.addEventListener('click', () => {
    openDeleteModal(
      '¿Eliminar este colegio?',
      state.school.n,
      'Sí, eliminar',
      async () => {
        const schoolId = state.school.id;
        const schoolName = state.school.n;
        if (state.school.persistido) {
          const resultado = await eliminarColegioSuperadminDB(schoolId);
          if (!resultado.ok) {
            showToast(`No se pudo eliminar el colegio: ${resultado.error}`);
            return;
          }
        }
        const index = SCHOOLS.findIndex(s => s.id === schoolId);
        if (index !== -1) SCHOOLS.splice(index, 1);
        delete state.dirs[schoolId];
        delete datosPorColegio[schoolId];
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

async function cargarColegiosPersistidos() {
  try {
    const colegios = await getColegiosSuperadminDB();
    colegios.forEach(colegio => {
      if (SCHOOLS.some(school => school.id === colegio.id)) return;
      SCHOOLS.push({
        id: colegio.id, n: colegio.nombre, dir: null, al: 0, pr: 0, cl: 0,
        on: colegio.activo, ab: colegio.sigla, persistido: true
      });
      state.dirs[colegio.id] = [];
      datosPorColegio[colegio.id] = { clases: [], alums: [], profs: [], preceptores: [] };
    });
    renderSidebar();
    if (colegioRetornoFicha) {
      const item = Array.from(document.querySelectorAll('.sa-school-item'))
        .find(element => element.dataset.id === colegioRetornoFicha);
      if (item) item.click();
    }
  } catch (error) {
    console.warn('No se pudieron cargar los colegios persistidos:', error.message);
  }
}

function bindImportarExcelEvents() {
  document.getElementById('input-importar-excel').addEventListener('change', async event => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    if (!window.XLSX) {
      showToast('No se pudo cargar el lector Excel. Revisá tu conexión e intentá de nuevo.');
      return;
    }
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
      const resultado = analizarPlanillaExcel(workbook, XLSX);
      state.importacionPendiente = resultado.data
        ? { data: resultado.data, nombre: file.name }
        : { errores: resultado.errores, nombre: file.name };
      renderImportacionPendiente();
    } catch (error) {
      state.importacionPendiente = { errores: [`No se pudo leer el archivo: ${error.message}`], nombre: file.name };
      renderImportacionPendiente();
    }
  });
}

function renderImportacionPendiente() {
  const preview = document.getElementById('excel-import-preview');
  const pendiente = state.importacionPendiente;
  if (!preview || !pendiente) return;
  if (pendiente.errores) {
    preview.innerHTML = `<div class="sa-import-result sa-import-result--error"><strong>Revisá la planilla ${esc(pendiente.nombre)}:</strong><ul>${pendiente.errores.map(error => `<li>${esc(error)}</li>`).join('')}</ul></div>`;
    return;
  }
  const { clases, alumnos, profesores, preceptores } = pendiente.data;
  preview.innerHTML = `
    <div class="sa-import-result">
      <div><strong>${esc(pendiente.nombre)}</strong><span>${clases.length} clases · ${alumnos.length} alumnos · ${profesores.length} profesores · ${preceptores.length} preceptores</span></div>
      <button class="sa-btn sa-btn--primary sa-btn--sm" id="btn-confirm-excel">Importar datos</button>
    </div>
  `;
  document.getElementById('btn-confirm-excel').addEventListener('click', importarPlanillaValidada);
}

async function importarPlanillaValidada() {
  const boton = document.getElementById('btn-confirm-excel');
  if (!boton || !state.importacionPendiente?.data || !state.school?.persistido) return;
  boton.disabled = true;
  boton.textContent = 'Importando...';
  const datos = state.importacionPendiente.data;
  const escuela = state.school;
  const resultado = await importarColegioExcelDB(state.school.id, datos);
  if (!resultado.ok) {
    showToast(`No se importó ningún dato: ${resultado.error}`);
    boton.disabled = false;
    boton.textContent = 'Reintentar importación';
    return;
  }

  state.importacionPendiente = null;
  renderImportacionPendiente();
  try {
    if (state.school === escuela) await recargarColegioSeleccionado();
    showToast(`Importación completa: ${datos.clases.length} clases, ${datos.alumnos.length} alumnos, ${datos.profesores.length} profesores y ${datos.preceptores.length} preceptores.`);
  } catch (error) {
    showToast(`La importación se completó, pero no se pudo actualizar la lista: ${error.message}`);
  }
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

const CAMPOS_PROF = [
  'campo-prof-nombre', 'campo-prof-apellido', 'campo-prof-email', 'campo-prof-materia',
  'campo-prof-dni', 'campo-prof-fecha', 'campo-prof-telefono', 'campo-prof-password'
];

function validarFormProf() {
  const email = val('campo-prof-email');
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const requiereCuenta = state.editProfId === null && Boolean(state.school?.persistido);
  const password = document.getElementById('campo-prof-password').value;
  const cuentaOk = !requiereCuenta || (
    /^[\d.]{7,12}$/.test(val('campo-prof-dni')) &&
    document.getElementById('campo-prof-fecha').value &&
    val('campo-prof-telefono') &&
    password.length >= 8
  );
  document.getElementById('btn-prof-confirm').disabled =
    !(val('campo-prof-nombre') && val('campo-prof-apellido') && val('campo-prof-materia') && emailOk && cuentaOk);
}

function abrirFormProfesor(p) {
  state.editProfId = p ? p.id : null;
  const [nombre, ...resto] = p ? p.n.split(' ') : [''];

  document.getElementById('prof-title').textContent = p ? 'Editar profesor' : 'Nuevo profesor';
  document.getElementById('prof-subtitle').textContent =
    p ? 'Modificá los datos del docente.' : 'Registrá un nuevo docente en el sistema.';
  document.getElementById('prof-info').classList.toggle('hidden', !!p);
  if (!p && !state.school?.persistido) {
    document.getElementById('prof-info').textContent =
      'ℹ Este colegio de demostración no crea cuentas reales ni guarda cambios.';
  } else if (!p) {
    document.getElementById('prof-info').textContent =
      'ℹ Se creará una cuenta en Supabase Auth. Compartí la contraseña temporal por un canal seguro.';
  }
  document.getElementById('prof-account-fields').classList.toggle(
    'hidden',
    !!p || !state.school?.persistido
  );
  if (!p) {
    ['campo-prof-dni', 'campo-prof-fecha', 'campo-prof-telefono', 'campo-prof-password']
      .forEach(id => { document.getElementById(id).value = ''; });
  }
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
  const p = state.profs.find(x => String(x.id) === String(id));
  if (p) abrirFormProfesor(p);
}

function closeCreateProfesorModal() {
  document.getElementById('modal-profesor').classList.add('hidden');
  document.getElementById('campo-prof-password').value = '';
}

function bindCreateProfesorModalEvents() {
  document.getElementById('modal-profesor').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeCreateProfesorModal();
  });
  document.getElementById('btn-prof-cancel').addEventListener('click', closeCreateProfesorModal);
  CAMPOS_PROF.forEach(id => {
    document.getElementById(id).addEventListener('input', validarFormProf);
    document.getElementById(id).addEventListener('change', validarFormProf);
  });

  document.getElementById('btn-prof-confirm').addEventListener('click', async () => {
    const nombre = val('campo-prof-nombre');
    const apellido = val('campo-prof-apellido');
    const email = val('campo-prof-email');
    const materia = val('campo-prof-materia');
    const button = document.getElementById('btn-prof-confirm');

    if (state.editProfId !== null) {
      const p = state.profs.find(x => String(x.id) === String(state.editProfId));
      if (!p) return;
      Object.assign(p, { n: `${nombre} ${apellido}`, nombre, apellido, m: materia, email: email || p.email });
      closeCreateProfesorModal();
      if (state.tab === 'profesores') renderTabContent();
      showToast(`✓ Profesor ${nombre} ${apellido} actualizado`);
      return;
    }

    if (state.school?.persistido) {
      button.disabled = true;
      button.textContent = 'Creando...';
      const resultado = await crearCuentaProfesorDB({
        nombre,
        apellido,
        email,
        materia,
        dni: val('campo-prof-dni'),
        fecha_nacimiento: document.getElementById('campo-prof-fecha').value,
        telefono: val('campo-prof-telefono'),
        password: document.getElementById('campo-prof-password').value,
        colegio_id: state.school.id
      });
      if (!resultado.ok) {
        showToast(`No se pudo crear el profesor: ${resultado.error}`);
        validarFormProf();
        button.textContent = 'Crear profesor';
        return;
      }

      closeCreateProfesorModal();
      try {
        await recargarColegioSeleccionado();
        showToast(`Cuenta de profesor ${nombre} ${apellido} creada.`);
      } catch (error) {
        showToast(`La cuenta se creó, pero no se pudo actualizar la lista: ${error.message}`);
      } finally {
        button.disabled = false;
        button.textContent = 'Crear profesor';
      }
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

const CAMPOS_CLASE = ['campo-clase-nombre', 'campo-clase-nivel', 'campo-clase-turno', 'campo-clase-aula'];

function validarFormClase() {
document.getElementById('btn-clase-confirm').disabled =
  !['campo-clase-nombre', 'campo-clase-nivel', 'campo-clase-turno', 'campo-clase-aula'].every(val);
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
  const preceptorSelect = document.getElementById('campo-clase-preceptor');
  preceptorSelect.innerHTML = `<option value="">Sin asignar</option>${(state.preceptores || []).map(preceptor =>
    `<option value="${esc(preceptor.id)}">${esc(preceptor.n)}</option>`).join('')}`;
  preceptorSelect.value = c ? (c.preceptor_id || '') : '';
  document.getElementById('campo-clase-aula').value = c ? (c.a || '') : '';

  validarFormClase();
  document.getElementById('modal-clase').classList.remove('hidden');
}

function openCreateClaseModal() { abrirFormClase(null); }

function openEditClaseModal(id) {
  const c = state.clases.find(x => String(x.id) === String(id));
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

  document.getElementById('btn-clase-confirm').addEventListener('click', async () => {
    const nombre = val('campo-clase-nombre');
    const nivel = val('campo-clase-nivel');
    const turno = val('campo-clase-turno');
    const preceptorId = document.getElementById('campo-clase-preceptor').value || null;
    const aula = val('campo-clase-aula');

    if (state.clases.some(c => c.id !== state.editClaseId && c.n.toLowerCase() === nombre.toLowerCase())) {
      showToast('Ya existe una clase con ese nombre');
      return;
    }

    if (state.editClaseId !== null) {
      const c = state.clases.find(x => x.id === state.editClaseId);
      if (!c) return;
      const viejo = c.n;
      if (state.school.persistido) {
        const resultado = await modificarClaseDB(c.id, {
          nivel, turno, aula, preceptorId
        });
        if (!resultado.ok) { showToast(`No se pudo guardar la clase: ${resultado.error}`); return; }
        try {
          await recargarColegioSeleccionado();
        } catch (error) {
          showToast(`La clase se actualizó, pero no se pudo refrescar: ${error.message}`);
        }
      } else {
        const preceptor = state.preceptores.find(item => item.id === preceptorId);
        Object.assign(c, { n: nombre, nv: nivel, t: turno, a: aula,
          preceptor_id: preceptorId, prec: preceptor?.n || '' });
      }
      state.alums.forEach(a => { if (a.cl === viejo) a.cl = nombre; }); // mantiene la clase de los alumnos
      closeCreateClaseModal();
      if (state.tab === 'clases') renderTabContent();
      showToast(`✓ Clase ${nombre} actualizada`);
      return;
    }

    if (state.school.persistido) {
      const partes = nombre.match(/^\s*([1-7])\s*(?:°|º)?\s*([a-z])\s*$/i);
      if (!partes) {
        showToast('Usá el formato de clase 1° A (año 1–7 y división A–Z).');
        return;
      }
      const resultado = await crearClaseColegioSuperadminDB(state.school.id, {
        anio: partes[1], division: partes[2], nivel, turno, aula, preceptorId
      });
      if (!resultado.ok) { showToast(`No se pudo crear la clase: ${resultado.error}`); return; }
      try {
        await recargarColegioSeleccionado();
      } catch (error) {
        showToast(`La clase se creó, pero no se pudo refrescar: ${error.message}`);
      }
      closeCreateClaseModal();
      if (state.tab === 'clases') renderTabContent();
      showToast(`✓ Clase ${nombre} creada exitosamente`);
      return;
    }

    const preceptor = state.preceptores.find(item => item.id === preceptorId);
    state.clases.push({
      id: Date.now(),
      n: nombre,
      nv: nivel,
      t: turno,
      a: aula,
      preceptor_id: preceptorId,
      prec: preceptor?.n || '',
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