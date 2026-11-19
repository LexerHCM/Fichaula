/**
 * alumnos.js — Tabla global de alumnos.
 *  - admin / superadmin: todos los alumnos; solo superadmin ve legajo
 *  - profesor: solo alumnos de sus cursos (lo filtra RLS), sin identificadores
 * La búsqueda (filtros.js) acepta nombre y apellido en cualquier orden,
 * con o sin acentos, y el curso; los identificadores según el rol.
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
  const verDni = puedeVerDni();

  const sub = document.getElementById('page-subtitle');
  sub.textContent = verDni
    ? 'Listado completo de alumnos del establecimiento'
    : `Alumnos de los cursos asignados a ${user.nombre} ${user.apellido}`;

  const thead = document.getElementById('thead-row');
  thead.innerHTML = [
    '<th>#</th>',
    verLegajo ? '<th>Legajo</th>' : '',
    '<th>Nombre y Apellido</th><th>Curso</th><th>Turno</th><th>Edad</th>',
    verDni ? '<th>DNI</th>' : '',
    '<th>Ficha</th>'
  ].join('');

  let todos = [];

  function iniciales(n, ap) { return (n[0] + ap[0]).toUpperCase(); }

  // Escapa texto antes de interpolarlo en innerHTML (anti-XSS).
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function nombreCurso(a) {
    if (a.curso_nombre) return a.curso_nombre;
    if (a.anio != null && a.division) return `${a.anio}° ${a.division}`;
    return a.curso_id || '—';
  }

  function renderTabla(lista) {
    const tbody = document.getElementById('tbody');
    document.getElementById('count-label').innerHTML =
      `Mostrando <strong>${lista.length}</strong> de <strong>${todos.length}</strong> alumnos`;

    const colspan = 6 + Number(verLegajo) + Number(verDni);
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
      const ficha = `<td><a href="ficha-alumno.html?id=${encodeURIComponent(a.id)}&volver=alumnos" class="btn-ficha">Ver ficha</a></td>`;

      return `<tr>
        <td style="color:var(--white-40);font-size:13px;">${i + 1}</td>
        ${verLegajo ? `<td><span class="legajo-badge">${esc(a.legajo)}</span></td>` : ''}
        ${nombre}${curso}${turno}${edadCell}
        ${verDni ? `<td style="font-family:'Courier New',monospace;font-size:13px;">${esc(a.dni)}</td>` : ''}
        ${ficha}
      </tr>`;
    }).join('');
  }

  // La búsqueda respeta los permisos independientes de legajo y DNI.
  function filtrar(q) {
    renderTabla(buscarAlumnos(todos, q, { legajo: verLegajo, dni: verDni }));
  }

  const buscador = document.getElementById('search-input');
  buscador.placeholder = verLegajo
    ? 'Buscar por nombre, apellido, curso, legajo o DNI...'
    : verDni
      ? 'Buscar por nombre, apellido, curso o DNI...'
      : 'Buscar por nombre, apellido o curso...';
  buscador.addEventListener('input', e => filtrar(e.target.value));

  document.getElementById('tbody').innerHTML =
    `<tr><td colspan="${6 + Number(verLegajo) + Number(verDni)}" class="no-results">Cargando alumnos...</td></tr>`;

  getAlumnosVisiblesDB()
    .then(lista => { todos = lista; filtrar(buscador.value); })
    .catch(err => {
      console.error('Error al cargar alumnos:', err.message);
      document.getElementById('tbody').innerHTML =
        `<tr><td colspan="${6 + Number(verLegajo) + Number(verDni)}" class="no-results">
           No se pudieron cargar los alumnos. Revisá tu conexión.
         </td></tr>`;
    });
})();
