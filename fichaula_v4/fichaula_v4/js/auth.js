/**
 * auth.js — Gestión de autenticación y permisos
 * ───────────────────────────────────────────────────────────
 * Maneja:
 *  - Login/logout contra FICHAULA_ADMINS y FICHAULA_PROFESORES
 *  - Sesión (sessionStorage → se pierde al cerrar navegador)
 *  - Guards por rol (requireAuth, requireAdmin)
 *  - Helpers de permisos (puede ver legajo, puede editar, etc.)
 *
 * Depende de: data.js (FICHAULA_ADMINS, FICHAULA_PROFESORES)
 */

/* ============================================================
   CONSTANTES
   ============================================================ */
const AUTH_STORAGE_KEY = 'fichaula_session';

/* ============================================================
   LOGIN / LOGOUT
   ============================================================ */

/**
 * Valida credenciales contra admins Y profesores.
 * Devuelve el usuario encontrado (con su rol) o null.
 * @param {string} email
 * @param {string} password
 * @returns {object|null}
 */
function validarCredenciales(email, password) {
  const mail = (email || '').trim().toLowerCase();
  if (!mail || !password) return null;

  // Primero busco en admins
  const admin = FICHAULA_ADMINS.find(u =>
    u.email.toLowerCase() === mail && u.password === password
  );
  if (admin) return admin;

  // Después en profesores
  const profe = FICHAULA_PROFESORES.find(u =>
    u.email.toLowerCase() === mail && u.password === password
  );
  if (profe) return profe;

  return null;
}

/**
 * Guarda la sesión en sessionStorage (sin la contraseña).
 * @param {object} usuario
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
    cargo: usuario.cargo || null,
    cursosAsignados: usuario.cursosAsignados || []
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
 * Exige que el usuario logueado sea admin.
 * Si no lo es, lo redirige al index (no al login).
 */
function requireAdmin() {
  const user = getUsuarioActual();
  if (!user) {
    const enPages = window.location.pathname.includes('/pages/');
    window.location.replace(enPages ? 'login.html' : 'pages/login.html');
    return;
  }
  if (user.rol !== 'admin') {
    const enPages = window.location.pathname.includes('/pages/');
    window.location.replace(enPages ? '../index.html' : 'index.html');
  }
}

/* ============================================================
   HELPERS DE ROL Y PERMISOS
   ============================================================ */

/**
 * @returns {boolean} true si el usuario actual es admin.
 */
function esAdmin() {
  const u = getUsuarioActual();
  return !!u && u.rol === 'admin';
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
 * ¿El usuario actual puede editar datos personales del alumno
 * (nombre, apellido, DNI, legajo, fechaNacimiento)?
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
 * ¿El usuario actual puede agregar seguimientos (conducta/actitud/nota)?
 * Solo profes — el admin tiene vista de solo lectura.
 * @returns {boolean}
 */
function puedeAgregarSeguimiento() {
  return esProfesor();
}

/**
 * ¿El usuario actual tiene acceso al curso con este id?
 * - Admin: siempre sí.
 * - Profesor: solo si el curso está en sus cursosAsignados.
 * @param {string} cursoId
 * @returns {boolean}
 */
function usuarioTieneAccesoACurso(cursoId) {
  const user = getUsuarioActual();
  if (!user) return false;
  if (user.rol === 'admin') return true;
  return (user.cursosAsignados || []).includes(cursoId);
}

/* ============================================================
   QUERIES FILTRADAS SEGÚN EL USUARIO LOGUEADO
   ============================================================ */

/**
 * Devuelve los cursos visibles para el usuario actual.
 * - Admin: todos.
 * - Profesor: solo los asignados.
 * @returns {Array}
 */
function getCursosVisibles() {
  const user = getUsuarioActual();
  if (!user) return [];
  if (user.rol === 'admin') return FICHAULA_DATA.cursos.slice();
  return FICHAULA_DATA.cursos.filter(c =>
    (user.cursosAsignados || []).includes(c.id)
  );
}

/**
 * Agrupa por nivel los cursos visibles al usuario actual.
 * @returns {object}
 */
function getCursosVisiblesPorNivel() {
  return getCursosVisibles().reduce((acc, curso) => {
    if (!acc[curso.nivel]) acc[curso.nivel] = [];
    acc[curso.nivel].push(curso);
    return acc;
  }, {});
}
