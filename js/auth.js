/**
 * auth.js — Gestión de autenticación y permisos (versión Supabase)
 * ───────────────────────────────────────────────────────────
 * Maneja:
 *  - Sesión (sessionStorage → se pierde al cerrar navegador)
 *  - Guards por rol (requireAuth, requireAdmin)
 *  - Helpers de permisos (puede ver legajo, puede editar, etc.)
 *
 * La validación de credenciales ahora vive en supabase.js
 * (validarCredencialesDB). Este archivo solo maneja la SESIÓN
 * una vez que el usuario ya fue autenticado.
 *
 * Roles posibles: 'superadmin' | 'admin' | 'profesor'
 */

/* ============================================================
   CONSTANTES
   ============================================================ */
const AUTH_STORAGE_KEY = 'fichaula_session';

/* ============================================================
   LOGIN / LOGOUT
   ============================================================ */

/**
 * Guarda la sesión en sessionStorage (sin la contraseña).
 * @param {object} usuario  objeto devuelto por validarCredencialesDB
 */
function iniciarSesion(usuario) {
  const payload = {
    id: usuario.id,
    email: usuario.email,
    nombre: usuario.nombre,
    apellido: usuario.apellido,
    rol: usuario.rol,
    // campos opcionales según rol
    materia: usuario.materia || null,
    cargo: usuario.cargo || null
  };
  sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(payload));
}

/**
 * Cierra sesión y redirige al login.
 */
function cerrarSesion() {
  sessionStorage.removeItem(AUTH_STORAGE_KEY);
  const enPages = window.location.pathname.includes('/pages/');
  window.location.replace(enPages ? 'login.html' : 'pages/login.html');
}

/**
 * Devuelve el usuario actualmente logueado (o null).
 * @returns {object|null}
 */
function getUsuarioActual() {
  const raw = sessionStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); }
  catch (e) { return null; }
}

/* ============================================================
   GUARDS (para llamar al inicio de cada página)
   ============================================================ */

/**
 * Exige que haya un usuario logueado (cualquier rol).
 * Si no lo hay, redirige al login.
 */
function requireAuth() {
  if (!getUsuarioActual()) {
    const enPages = window.location.pathname.includes('/pages/');
    window.location.replace(enPages ? 'login.html' : 'pages/login.html');
  }
}

/**
 * Exige que el usuario logueado sea admin o superadmin.
 * Si no lo es, lo redirige al index (no al login).
 */
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

/* ============================================================
   HELPERS DE ROL Y PERMISOS
   ============================================================ */

/**
 * @returns {boolean} true si el usuario actual es admin o superadmin.
 */
function esAdmin() {
  const u = getUsuarioActual();
  return !!u && (u.rol === 'admin' || u.rol === 'superadmin');
}

/**
 * @returns {boolean} true si el usuario actual es profesor.
 */
function esProfesor() {
  const u = getUsuarioActual();
  return !!u && u.rol === 'profesor';
}

/**
 * ¿El usuario actual puede ver el legajo/ID del alumno?
 * Solo admins. (Regla del sprint: profes NO ven legajo.)
 * @returns {boolean}
 */
function puedeVerLegajo() {
  return esAdmin();
}

/**
 * ¿El usuario actual puede editar datos personales del alumno?
 * Solo admins.
 * @returns {boolean}
 */
function puedeEditarAlumno() {
  return esAdmin();
}

/**
 * ¿El usuario actual puede crear/borrar/modificar clases?
 * Solo admins.
 * @returns {boolean}
 */
function puedeGestionarClases() {
  return esAdmin();
}

/**
 * ¿El usuario actual puede agregar seguimientos?
 * Solo profes — el admin tiene vista de solo lectura.
 * @returns {boolean}
 */
function puedeAgregarSeguimiento() {
  return esProfesor();
}

/* ============================================================
   NOTA: las consultas de cursos/alumnos (antes getCursosVisibles,
   usuarioTieneAccesoACurso, etc.) ahora son ASYNC y viven en
   supabase.js:
     - getClasesVisiblesDB()
     - getClasesVisiblesPorNivelDB()
     - usuarioTieneAccesoAClaseDB()
     - getAlumnosVisiblesDB()
   ============================================================ */
