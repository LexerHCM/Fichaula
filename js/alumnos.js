/**
 * alumnos.js — Tabla global de alumnos.
 *  - admin / superadmin: todos los alumnos, con legajo y DNI
 *  - profesor: solo alumnos de sus cursos, sin legajo (lo filtra RLS)
 * Usa la vista vista_alumnos_completa (trae edad calculada).
 * Depende de: supabase.js, auth.js, components.js
 */
(function () {
  'use strict';

  requireAuth();
  renderNav('alumnos', true);
  renderFooter();

  const user = getUsuarioActual();
  const verLegajo = puedeVerLegajo();

  const sub = document.getElementById('page-subtitle');
  sub.textContent = verLegajo
    ? 'Listado completo de alumnos del establecimiento'
    : `Alumnos de los cursos asignados a ${user.nombre} ${user.apellido}`;

  const thead = document.getElementById('thead-row');
  thead.innerHTML = verLegajo
    ? `<th>#</th><th>Legajo</th><th>Nombre y Apellido</th><th>Curso</th><th>Turno</th><th>Edad</th><th>DNI</th>`
    : `<th>#</th><th>Nombre y Apellido</th><th>Curso</th><th>Turno</th><th>Edad</th>`;

  let todos = [];

  function iniciales(n, ap) { return (n[0] + ap[0]).toUpperCase(); }

  function nombreCurso(a) {
    if (a.anio != null && a.division) return `${a.anio}° ${a.division}`;
    return a.curso_id || '—';
  }

  function renderTabla(lista) {
    const tbody = document.getElementById('tbody');
    document.getElementById('count-label').innerHTML =
      `Mostrando <strong>${lista.length}</strong> de <strong>${todos.length}</strong> alumnos`;

    const colspan = verLegajo ? 7 : 5;
    if (lista.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${colspan}" class="no-results">No se encontraron alumnos.</td></tr>`;
      return;
    }

    tbody.innerHTML = lista.map((a, i) => {
      const edad = a.edad != null ? a.edad : '—';
      const cursoNom = nombreCurso(a);
      const nombre = `
        <td>
          <div class="alumno-nombre-cell">
            <div class="alumno-avatar">${iniciales(a.nombre, a.apellido)}</div>
            <span>${a.apellido}, ${a.nombre}</span>
          </div>
        </td>`;
      const curso = `<td><a href="curso.html?id=${a.curso_id}"
                            style="color:var(--violet-light);text-decoration:none;font-size:13px;">${cursoNom}</a></td>`;
      const turno = `<td style="font-size:13px;color:var(--white-40);">${a.turno}</td>`;
      const edadCell = `<td style="font-size:13px;">${edad} años</td>`;

      if (verLegajo) {
        return `<tr>
          <td style="color:var(--white-40);font-size:13px;">${i + 1}</td>
          <td><span class="legajo-badge">${a.legajo}</span></td>
          ${nombre}${curso}${turno}${edadCell}
          <td style="font-family:'Courier New',monospace;font-size:13px;">${a.dni}</td>
        </tr>`;
      }
      return `<tr>
        <td style="color:var(--white-40);font-size:13px;">${i + 1}</td>
        ${nombre}${curso}${turno}${edadCell}
      </tr>`;
    }).join('');
  }

  function filtrar(q) {
    const term = q.toLowerCase().trim();
    if (!term) { renderTabla(todos); return; }
    renderTabla(todos.filter(a =>
      a.nombre.toLowerCase().includes(term) ||
      a.apellido.toLowerCase().includes(term) ||
      (verLegajo && String(a.legajo).includes(term)) ||
      nombreCurso(a).toLowerCase().includes(term)
    ));
  }

  document.getElementById('search-input').addEventListener('input', e => filtrar(e.target.value));

  document.getElementById('tbody').innerHTML =
    `<tr><td colspan="${verLegajo ? 7 : 5}" class="no-results">Cargando alumnos...</td></tr>`;

  getAlumnosVisiblesDB()
    .then(lista => { todos = lista; renderTabla(todos); })
    .catch(err => {
      console.error('Error al cargar alumnos:', err.message);
      document.getElementById('tbody').innerHTML =
        `<tr><td colspan="${verLegajo ? 7 : 5}" class="no-results">
           No se pudieron cargar los alumnos. Revisá tu conexión.
         </td></tr>`;
    });
})();
