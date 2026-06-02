/**
 * index.js — Lógica de la página principal
 * Renderiza nav, footer y los botones del hero según el rol.
 */
(function () {
  'use strict';

  requireAuth();
  renderNav('', false);
  renderFooter();

  const user = getUsuarioActual();
  const cont = document.getElementById('hero-btns');

  if (user.rol === 'admin' || user.rol === 'superadmin') {
    cont.innerHTML = `
      <a href="pages/admin.html" class="btn-primary">Panel de administración</a>
      <a href="pages/clases.html" class="btn-secondary">Ver clases</a>
    `;
  } else {
    cont.innerHTML = `
      <a href="pages/alumnos.html" class="btn-primary">Mis alumnos</a>
      <a href="pages/clases.html" class="btn-secondary">Mis clases</a>
    `;
  }
})();
