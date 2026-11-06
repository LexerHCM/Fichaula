/**
 * clases.js — Grilla de cursos visibles al usuario.
 *  - admin / superadmin: todas las clases
 *  - profesor: solo las asignadas (lo garantiza RLS)
 * Depende de: supabase.js, auth.js, components.js
 */
(function () {
  'use strict';

  requireAuth();
  renderNav('clases', true);
  renderFooter();

  const user = getUsuarioActual();
  const esAdminOSuper = user.rol === 'admin' || user.rol === 'superadmin';

  const sub = document.getElementById('page-subtitle');
  sub.textContent = esAdminOSuper
    ? 'Todos los cursos del establecimiento. Hacé clic en uno para ver sus alumnos.'
    : `Cursos asignados a ${user.nombre} ${user.apellido} — ${user.materia || ''}`;

  const container = document.getElementById('cursos-container');

  // Escapa texto antes de interpolarlo en innerHTML (anti-XSS).
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function renderCursos(grupos) {
    if (!grupos || Object.keys(grupos).length === 0) {
      container.innerHTML = `
        <div class="seg-empty" style="max-width:520px;margin:40px auto;">
          ${esAdminOSuper
              ? 'No hay clases creadas todavía.'
              : 'Todavía no tenés cursos asignados.<br>Contactá al administrador.'}
        </div>`;
      return;
    }

    let html = '';
    let delay = 0;
    for (const [nivel, cursos] of Object.entries(grupos)) {
      html += `<div class="nivel-group"><div class="nivel-label">${esc(nivel)}</div><div class="cursos-grid">`;
      cursos.forEach(curso => {
        delay += 40;
        const cant = (curso.cantAlumnos != null) ? curso.cantAlumnos : '—';
        html += `
          <a href="curso.html?id=${encodeURIComponent(curso.id)}" class="curso-card"
             style="animation-delay:${delay}ms" title="Ver alumnos de ${esc(curso.nombre)}">
            <span class="curso-arrow">↗</span>
            <div class="curso-numero">${esc(curso.nombre)}</div>
            <div class="curso-nombre">${esc(curso.nivel)}</div>
            <div class="curso-meta">
              <div class="curso-meta-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
                Turno ${esc(curso.turno)}
              </div>
              <div class="curso-meta-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                </svg>
                Aula ${esc(curso.aula)}
              </div>
            </div>
            <div class="curso-alumnos-count">
              <span class="count-badge">${cant}</span> alumnos inscriptos
            </div>
          </a>`;
      });
      html += `</div></div>`;
    }
    container.innerHTML = html;
  }

  container.innerHTML = `<div class="seg-empty" style="margin:40px auto;">Cargando cursos...</div>`;

  getClasesVisiblesPorNivelDB()
    .then(renderCursos)
    .catch(err => {
      console.error('Error al cargar cursos:', err.message);
      container.innerHTML = `
        <div class="seg-empty" style="max-width:520px;margin:40px auto;">
          No se pudieron cargar los cursos.<br>Revisá tu conexión e intentá de nuevo.
        </div>`;
    });
})();
