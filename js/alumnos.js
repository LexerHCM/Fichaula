/**
 * alumnos.js — Tabla global de alumnos.
 *  - Admin: ve todos los alumnos, todas las columnas (incluido legajo).
 *  - Profesor: solo alumnos de sus cursos, sin la columna legajo.
 */
(function () {
  'use strict';

  requireAuth();
  renderNav('alumnos', true);
  renderFooter();

  const user = getUsuarioActual();
  const verLegajo = puedeVerLegajo(); // true solo para admin

  // Subtítulo
  const sub = document.getElementById('page-subtitle');
  sub.textContent = user.rol === 'admin'
    ? 'Listado completo de alumnos del establecimiento'
    : `Alumnos de los cursos asignados a ${user.nombre} ${user.apellido}`;

  // Construir headers según rol
  const thead = document.getElementById('thead-row');
  thead.innerHTML = verLegajo
    ? `<th>#</th><th>Legajo</th><th>Nombre y Apellido</th><th>Curso</th><th>Turno</th><th>Edad</th><th>DNI</th>`
    : `<th>#</th><th>Nombre y Apellido</th><th>Curso</th><th>Turno</th><th>Edad</th>`;

  // Aplanar alumnos visibles
  const todos = [];
  getCursosVisibles().forEach(curso => {
    curso.alumnos.forEach(a => {
      todos.push({
        ...a,
        curso: curso.nombre,
        cursoId: curso.id,
        turno: curso.turno
      });
    });
  });

  function iniciales(n, ap) { return (n[0] + ap[0]).toUpperCase(); }

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
      const edad = calcularEdad(a.fechaNacimiento);
      const nombre = `
        <td>
          <div class="alumno-nombre-cell">
            <div class="alumno-avatar">${iniciales(a.nombre, a.apellido)}</div>
            <span>${a.apellido}, ${a.nombre}</span>
          </div>
        </td>`;
      const curso = `<td><a href="curso.html?id=${a.cursoId}"
                            style="color:var(--violet-light);text-decoration:none;font-size:13px;">
                            ${a.curso}</a></td>`;
      const turno = `<td style="font-size:13px;color:var(--white-40);">${a.turno}</td>`;
      const edadCell = `<td style="font-size:13px;">${edad} años</td>`;

      if (verLegajo) {
        return `<tr>
          <td style="color:var(--white-40);font-size:13px;">${i + 1}</td>
          <td><span class="legajo-badge">${a.legajo}</span></td>
          ${nombre}${curso}${turno}${edadCell}
          <td style="font-family:'Courier New',monospace;font-size:13px;">${a.dni}</td>
        </tr>`;
      } else {
        return `<tr>
          <td style="color:var(--white-40);font-size:13px;">${i + 1}</td>
          ${nombre}${curso}${turno}${edadCell}
        </tr>`;
      }
    }).join('');
  }

  function filtrar(q) {
    const term = q.toLowerCase().trim();
    if (!term) { renderTabla(todos); return; }
    renderTabla(todos.filter(a =>
      a.nombre.toLowerCase().includes(term) ||
      a.apellido.toLowerCase().includes(term) ||
      (verLegajo && a.legajo.includes(term)) ||
      a.curso.toLowerCase().includes(term)
    ));
  }

  document.getElementById('search-input').addEventListener('input', e => filtrar(e.target.value));
  renderTabla(todos);
})();
