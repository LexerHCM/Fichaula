/**
 * components.js — Componentes reutilizables de UI
 * ───────────────────────────────────────────────────────────
 * Nav y footer para todas las páginas autenticadas.
 * El nav se adapta según el rol del usuario:
 *   - Admin    → muestra link "ADMIN" al panel
 *   - Profesor → muestra links "ALUMNOS" y "CLASES"
 *
 * Depende de: auth.js (getUsuarioActual, cerrarSesion)
 */

/**
 * Renderiza el nav en el <header> de la página.
 * @param {string} activeLink - 'alumnos'|'clases'|'admin'|''
 * @param {boolean} enPages   - true si la página está en /pages/
 */
function renderNav(activeLink = '', enPages = true) {
  const header = document.querySelector('header');
  if (!header) return;

  const base = enPages ? '../' : '';
  const user = getUsuarioActual();

  // Links principales según rol
  let linksPrincipales = '';
  if (user) {
    if (user.rol === 'admin') {
      linksPrincipales = `
        <a href="${base}pages/admin.html"
           class="${activeLink === 'admin' ? 'active' : ''}">PANEL ADMIN</a>
        <a href="${base}pages/clases.html"
           class="${activeLink === 'clases' ? 'active' : ''}">CLASES</a>
      `;
    } else {
      linksPrincipales = `
        <a href="${base}pages/alumnos.html"
           class="${activeLink === 'alumnos' ? 'active' : ''}">ALUMNOS</a>
        <a href="${base}pages/clases.html"
           class="${activeLink === 'clases' ? 'active' : ''}">CLASES</a>
      `;
    }
  }

  // User chip con avatar + nombre + rol
  const userChip = user
    ? `<div class="user-chip">
         <div class="user-chip-avatar">${(user.nombre[0] + user.apellido[0]).toUpperCase()}</div>
         <div class="user-chip-text">
           <span class="user-chip-name">${user.nombre} ${user.apellido}</span>
           <span class="user-chip-role">${user.rol === 'admin' ? (user.cargo || 'Administrador') : (user.materia || 'Docente')}</span>
         </div>
       </div>`
    : '<a href="#">v</a>';

  header.innerHTML = `
    <nav>
      <a class="logo" href="${base}index.html">Ficha<span>ula</span></a>
      <div class="navder">
        ${linksPrincipales}
        <div class="dropdown">
          ${userChip}
          <div class="dropdown-content">
            <a href="${base}index.html">Inicio</a>
            <a href="#" onclick="cerrarSesion(); return false;">Cerrar Sesión</a>
          </div>
        </div>
      </div>
    </nav>
  `;
}

/**
 * Renderiza el footer en el <footer> de la página.
 */
function renderFooter() {
  const footer = document.querySelector('footer');
  if (!footer) return;
  footer.innerHTML = `
    <div class="footer-logo">Ficha<span>ula</span></div>
    <div class="footer-copy">© 2026 Fichaula — Sistema de gestión escolar</div>
  `;
}

// Fijar nav al hacer scroll (compartido)
window.addEventListener('scroll', () => {
  const nav = document.querySelector('nav');
  if (nav) {
    nav.style.background = window.scrollY > 10
      ? 'rgba(14,18,40,0.98)'
      : 'rgba(14,18,40,0.85)';
  }
});
