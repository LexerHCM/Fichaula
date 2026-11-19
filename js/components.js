/**
 * components.js — Componentes reutilizables de UI (nav y footer)
 * ───────────────────────────────────────────────────────────
 * El nav se adapta al rol:
 *   - admin / superadmin → link "PANEL ADMIN" + "CLASES"
 *   - profesor / preceptor → "ALUMNOS" + "CLASES"
 * Depende de: auth.js (getUsuarioActual, cerrarSesion)
 */

// Las preferencias de interfaz (tema, letra, animaciones) las aplica
// js/tema.js, que cada página carga en su <head>.

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
  const isSuperadminPage = window.location.pathname.toLowerCase().endsWith('/superadmin.html');
  const isSuperadminMenu = !!user && user.rol === 'superadmin' && !isSuperadminPage;
  const homeLabel = isSuperadminMenu ? 'Menú Superadmin' : 'Inicio';
  const homeHref = isSuperadminMenu ? `${base}pages/superadmin.html` : `${base}index.html`;
  const isAjustesPage = window.location.pathname.toLowerCase().endsWith('/ajustes.html');

  // Escapa texto antes de interpolarlo en innerHTML (anti-XSS).
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  const esAdminOSuper = user && (user.rol === 'admin' || user.rol === 'superadmin');

  // Superadmin en "Ver como directivo": muestra qué colegio está viendo y permite salir
  const preview = typeof getColegioPreview === 'function' ? getColegioPreview() : null;
  const previewChip = preview && isSuperadminMenu
    ? `<a href="${base}pages/superadmin.html" class="chip-vista-directivo"
          title="Salir y volver al panel de superadmin">
         Viendo como directivo: ${esc(preview.nombre)} <span aria-hidden="true">✕</span>
       </a>`
    : '';

  // Logo: el superadmin vuelve a su panel. Solo mientras recorre un colegio con
  // "Ver como directivo" lleva al inicio de ese colegio (Ajustes es su página
  // personal, no parte de esa vista, así que desde ahí también vuelve al panel).
  const logoHref = isSuperadminMenu && (!preview || isAjustesPage)
    ? `${base}pages/superadmin.html`
    : `${base}index.html`;

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
    else if (user.rol === 'preceptor') rolTexto = 'Preceptor/a';
    else rolTexto = user.materia || 'Docente';
  }

  const userChip = user
    ? `<div class="user-chip" id="user-menu-trigger">
         <div class="user-chip-avatar">${esc((user.nombre[0] + user.apellido[0]).toUpperCase())}</div>
         <div class="user-chip-text">
           <span class="user-chip-name">${esc(user.nombre)} ${esc(user.apellido)}</span>
           <span class="user-chip-role">${esc(rolTexto)}</span>
         </div>
       </div>`
    : '<a href="#">v</a>';

  header.innerHTML = `
    <nav>
      <a class="logo" href="${logoHref}">Ficha<span>ula</span></a>
      <div class="navder">
        ${previewChip}
        ${linksPrincipales}
        <div class="dropdown">
          ${userChip}
          <div class="dropdown-content">
            <a href="${homeHref}">${homeLabel}</a>
            <!-- "Ajustes" siempre va anteúltimo, justo antes de "Cerrar Sesión" -->
            <a href="${base}pages/ajustes.html"
               class="${activeLink === 'ajustes' ? 'active' : ''}">Ajustes</a>
            <a href="#" onclick="cerrarSesion(); return false;">Cerrar Sesión</a>
          </div>
        </div>
      </div>
    </nav>
  `;
  setupDropdownToggle();
  if (user) mostrarFotoPerfil(header.querySelector('.user-chip-avatar'), user.foto_path);
}

/**
 * Reemplaza las iniciales de un avatar por la foto de perfil (si hay).
 * Si la foto no carga, quedan las iniciales.
 * @param {HTMLElement|null} contenedor
 * @param {string|null} fotoPath
 */
async function mostrarFotoPerfil(contenedor, fotoPath) {
  if (!contenedor || !fotoPath || typeof getUrlFotoPerfil !== 'function') return;
  try {
    const url = await getUrlFotoPerfil(fotoPath);
    if (!url) return;
    const img = new Image();
    img.alt = '';
    img.className = 'avatar-foto';
    img.onload = () => {
      contenedor.textContent = '';
      contenedor.appendChild(img);
    };
    img.src = url;
  } catch (_) { /* sin foto: quedan las iniciales */ }
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
      ? 'rgba(var(--bg-rgb),0.98)'
      : 'rgba(var(--bg-rgb),0.85)';
  }
});
