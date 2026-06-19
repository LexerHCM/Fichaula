/**
 * auth.js — Sesión y permisos (Supabase Auth)
 * ═══════════════════════════════════════════════════════════
 * Maneja la SESIÓN del lado del cliente:
 *   - Cachea el perfil del usuario (id, rol, nombre…) para la UI.
 *   - Los tokens (access/refresh) los guarda supabase.js.
 *   - Guards por rol para proteger cada página.
 *
 * IMPORTANTE: estos chequeos son de UX. La autorización real la
 * aplica Row Level Security en Supabase con el JWT del usuario.
 *
 * Roles: 'superadmin' | 'admin' | 'profesor'
 * Depende de: supabase.js (iniciarSesion guarda el perfil que
 * devuelve validarCredencialesDB; logoutDB cierra en el servidor).
 * ═══════════════════════════════════════════════════════════
 */

// SB_PERFIL_KEY / SB_ACCESS_KEY / SB_REFRESH_KEY vienen de supabase.js

/**
 * Guarda el perfil del usuario en sessionStorage (sin tokens ni datos
 * sensibles; los tokens los gestiona supabase.js).
 * @param {object} perfil  objeto devuelto por validarCredencialesDB
 */
function iniciarSesion(perfil) {
  const payload = {
    id: perfil.id,
    email: perfil.email,
    nombre: perfil.nombre,
    apellido: perfil.apellido,
    rol: perfil.rol,
    materia: perfil.materia || null,
    cargo: perfil.cargo || null
  };
  sessionStorage.setItem(SB_PERFIL_KEY, JSON.stringify(payload));
}

/** Cierra sesión (local + Supabase Auth) y vuelve al login. */
function cerrarSesion() {
  try { if (typeof logoutDB === 'function') logoutDB(); } catch (_) {}
  sessionStorage.removeItem(SB_PERFIL_KEY);
  sessionStorage.removeItem(SB_ACCESS_KEY);
  sessionStorage.removeItem(SB_REFRESH_KEY);
  const enPages = window.location.pathname.includes('/pages/');
  window.location.replace(enPages ? 'login.html' : 'pages/login.html');
}

/** Perfil del usuario logueado (o null). Síncrono, para la UI. */
function getUsuarioActual() {
  const raw = sessionStorage.getItem(SB_PERFIL_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); }
  catch (_) { return null; }
}

/* ============================================================
   GUARDS
   ============================================================ */

/** Exige sesión activa (cualquier rol). */
function requireAuth() {
  if (!getUsuarioActual()) {
    const enPages = window.location.pathname.includes('/pages/');
    window.location.replace(enPages ? 'login.html' : 'pages/login.html');
  }
}

/** Exige rol admin o superadmin. */
function requireAdmin() {
  const user = getUsuarioActual();
  if (!user) {
    const enPages = window.location.pathname.includes('/pages/');
    window.location.replace(enPages ? 'login.html' : 'pages/login.html');
    return;
  }
  if (user.rol !== 'admin' && user.rol !== 'superadmin') {
    const enPages = window.location.pathname.includes('/pages/');
    window.location.replace(enPages ? '../index.html' : 'index.html');
  }
}

/** Exige rol superadmin (gestión de administradores). */
function requireSuperadmin() {
  const user = getUsuarioActual();
  if (!user || user.rol !== 'superadmin') {
    const enPages = window.location.pathname.includes('/pages/');
    window.location.replace(enPages ? '../index.html' : 'index.html');
  }
}

/* ============================================================
   HELPERS DE ROL
   ============================================================ */
function esAdmin() {
  const u = getUsuarioActual();
  return !!u && (u.rol === 'admin' || u.rol === 'superadmin');
}
function esSuperadmin() {
  const u = getUsuarioActual();
  return !!u && u.rol === 'superadmin';
}
function esProfesor() {
  const u = getUsuarioActual();
  return !!u && u.rol === 'profesor';
}

/** Solo admin/superadmin ven el legajo. */
function puedeVerLegajo()        { return esAdmin(); }
/** Solo admin/superadmin editan datos del alumno. */
function puedeEditarAlumno()     { return esAdmin(); }
/** Solo admin/superadmin gestionan clases. */
function puedeGestionarClases()  { return esAdmin(); }
/** Solo profesores cargan seguimientos. */
function puedeAgregarSeguimiento() { return esProfesor(); }
/** Solo profesores dejan comentarios. */
function puedeComentar()         { return esProfesor(); }
