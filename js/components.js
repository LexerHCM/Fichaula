/**
 * components.js — Componentes reutilizables de UI (nav y footer)
 * ───────────────────────────────────────────────────────────
 * El nav se adapta al rol:
 *   - admin / superadmin → link "PANEL ADMIN" + "CLASES"
 *   - profesor           → "ALUMNOS" + "CLASES"
 * Depende de: auth.js (getUsuarioActual, cerrarSesion)
 */

/**
 * Renderiza el nav en el <header>.
 * @param {string} activeLink - 'alumnos'|'clases'|'admin'|''
 * @param {boolean} enPages   - true si la página está en /pages/
 */
function renderNav(activeLink = '', enPages = true) {
  const header = document.querySelector('header');
  if (!header) return;

  const base = enPages ? '../' : '';
  const user = getUsuarioActual();
  const esAdminOSuper = user && (user.rol === 'admin' || user.rol === 'superadmin');

  let linksPrincipales = '';
  if (user) {
    if (esAdminOSuper) {
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

  // Etiqueta de rol para el chip de usuario
  let rolTexto = 'Docente';
  if (user) {
    if (user.rol === 'superadmin') rolTexto = 'Superadministrador';
    else if (user.rol === 'admin') rolTexto = user.cargo || 'Administrador';
    else rolTexto = user.materia || 'Docente';
  }

  const userChip = user
    ? `<div class="user-chip" id="user-menu-trigger">
         <div class="user-chip-avatar">${(user.nombre[0] + user.apellido[0]).toUpperCase()}</div>
         <div class="user-chip-text">
           <span class="user-chip-name">${user.nombre} ${user.apellido}</span>
           <span class="user-chip-role">${rolTexto}</span>
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
  setupDropdownToggle();
}

/** Renderiza el footer en el <footer>. */
function renderFooter() {
  const footer = document.querySelector('footer');
  if (!footer) return;
  footer.innerHTML = `
    <div class="footer-logo">Ficha<span>ula</span></div>
    <div class="footer-copy">© 2026 Fichaula — Sistema de gestión escolar</div>
  `;
}

function setupDropdownToggle() {
  const dropdown = document.querySelector('.dropdown');
  if (!dropdown || dropdown.dataset.dropdownSetup === 'true') return;
  dropdown.dataset.dropdownSetup = 'true';

  const trigger = document.getElementById('user-menu-trigger');
  const content = dropdown.querySelector('.dropdown-content');
  if (!trigger || !content) return;

  trigger.addEventListener('click', (event) => {
    event.stopPropagation();
    dropdown.classList.toggle('show');
  });
  content.addEventListener('click', (event) => event.stopPropagation());
  document.addEventListener('click', () => dropdown.classList.remove('show'));
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
