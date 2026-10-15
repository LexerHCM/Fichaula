/**
 * alumnos.js — Tabla global de alumnos.
 *  - admin / superadmin: todos los alumnos, con legajo y DNI
 *  - profesor: solo alumnos de sus cursos (lo filtra RLS), sin legajo ni DNI
 * La búsqueda (filtros.js) acepta nombre y apellido en cualquier orden,
 * con o sin acentos, y el curso; el legajo y el DNI solo para dirección.
 * Usa la vista vista_alumnos_completa (trae edad calculada).
 * Depende de: supabase.js, auth.js, components.js, filtros.js
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

  // Escapa texto antes de interpolarlo en innerHTML (anti-XSS).
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

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
            <div class="alumno-avatar">${esc(iniciales(a.nombre, a.apellido))}</div>
            <span>${esc(a.apellido)}, ${esc(a.nombre)}</span>
          </div>
        </td>`;
      const curso = `<td><a href="curso.html?id=${encodeURIComponent(a.curso_id)}"
                            style="color:var(--violet-light);text-decoration:none;font-size:13px;">${esc(cursoNom)}</a></td>`;
      const turno = `<td style="font-size:13px;color:var(--white-40);">${esc(a.turno)}</td>`;
      const edadCell = `<td style="font-size:13px;">${edad} años</td>`;

      if (verLegajo) {
        return `<tr>
          <td style="color:var(--white-40);font-size:13px;">${i + 1}</td>
          <td><span class="legajo-badge">${esc(a.legajo)}</span></td>
          ${nombre}${curso}${turno}${edadCell}
          <td style="font-family:'Courier New',monospace;font-size:13px;">${esc(a.dni)}</td>
        </tr>`;
      }
      return `<tr>
        <td style="color:var(--white-40);font-size:13px;">${i + 1}</td>
        ${nombre}${curso}${turno}${edadCell}
      </tr>`;
    }).join('');
  }

  // Legajo y DNI solo se pueden buscar si el usuario puede verlos.
  function filtrar(q) {
    renderTabla(buscarAlumnos(todos, q, { identificadores: verLegajo }));
  }

  const buscador = document.getElementById('search-input');
  buscador.placeholder = verLegajo
    ? 'Buscar por nombre, apellido, curso, legajo o DNI...'
    : 'Buscar por nombre, apellido o curso...';
  buscador.addEventListener('input', e => filtrar(e.target.value));

  document.getElementById('tbody').innerHTML =
    `<tr><td colspan="${verLegajo ? 7 : 5}" class="no-results">Cargando alumnos...</td></tr>`;

  getAlumnosVisiblesDB()
    .then(lista => { todos = lista; filtrar(buscador.value); })
    .catch(err => {
      console.error('Error al cargar alumnos:', err.message);
      document.getElementById('tbody').innerHTML =
        `<tr><td colspan="${verLegajo ? 7 : 5}" class="no-results">
           No se pudieron cargar los alumnos. Revisá tu conexión.
         </td></tr>`;
    });
})();
