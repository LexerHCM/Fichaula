/**
 * clases.js — Render de la grilla de cursos visibles al usuario.
 *  - Admin: ve todos los cursos
 *  - Profesor: solo los asignados a su cuenta
 */
(function () {
  'use strict';

  requireAuth();
  renderNav('clases', true);
  renderFooter();

  const user = getUsuarioActual();

  // Subtítulo personalizado
  const sub = document.getElementById('page-subtitle');
  if (user.rol === 'admin') {
    sub.textContent = 'Todos los cursos del establecimiento. Hacé clic en uno para ver sus alumnos.';
  } else {
    sub.textContent = `Cursos asignados a ${user.nombre} ${user.apellido} — ${user.materia}`;
  }

  function renderCursos() {
    const container = document.getElementById('cursos-container');
    const grupos = getCursosVisiblesPorNivel();

    if (Object.keys(grupos).length === 0) {
      container.innerHTML = `
        <div class="seg-empty" style="max-width:520px;margin:40px auto;">
          ${user.rol === 'admin'
              ? 'No hay clases creadas todavía.'
              : 'Todavía no tenés cursos asignados.<br>Contactá al administrador.'}
        </div>`;
      return;
    }

    let html = '';
    let delay = 0;

    for (const [nivel, cursos] of Object.entries(grupos)) {
      html += `
        <div class="nivel-group">
          <div class="nivel-label">${nivel}</div>
          <div class="cursos-grid">`;

      cursos.forEach(curso => {
        delay += 40;
        html += `
          <a href="curso.html?id=${curso.id}"
             class="curso-card"
             style="animation-delay:${delay}ms"
             title="Ver alumnos de ${curso.nombre}">
            <span class="curso-arrow">↗</span>
            <div class="curso-numero">${curso.nombre}</div>
            <div class="curso-nombre">${curso.nivel}</div>
            <div class="curso-meta">
              <div class="curso-meta-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
                Turno ${curso.turno}
              </div>
              <div class="curso-meta-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                </svg>
                Aula ${curso.aula}
              </div>
            </div>
            <div class="curso-alumnos-count">
              <span class="count-badge">${curso.alumnos.length}</span>
              alumnos inscriptos
            </div>
          </a>`;
      });
      html += `</div></div>`;
    }
    container.innerHTML = html;
  }

  renderCursos();
})();
