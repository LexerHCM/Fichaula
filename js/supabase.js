/**
 * supabase.js — Capa de acceso a datos de Fichaula
 * ═══════════════════════════════════════════════════════════
 * Arquitectura:
 *   - Autenticación vía Supabase Auth (bcrypt + JWT en el servidor).
 *   - Toda la autorización REAL la hace Row Level Security (RLS) en
 *     Supabase, usando el JWT del usuario. Los chequeos de rol en JS
 *     son solo para la UX; el servidor es la fuente de verdad.
 *   - Sin librerías externas: solo fetch.
 *
 * CONFIGURACIÓN: editá SUPABASE_URL y SUPABASE_ANON_KEY abajo.
 * La anon key es PÚBLICA por diseño; la seguridad viene de RLS.
 *
 * Carga este archivo ANTES de auth.js y del resto de scripts.
 * ═══════════════════════════════════════════════════════════
 */

// ╔══════════════════════════════════════════════════════════╗
// ║  CONFIGURACIÓN — editá estos dos valores                ║
// ╚══════════════════════════════════════════════════════════╝
const SUPABASE_URL = 'https://cbxejlckxkznwvlxgtde.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNieGVqbGNreGt6bnd2bHhndGRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczOTk0MzAsImV4cCI6MjA5Mjk3NTQzMH0.71pmkZ8-SxjDBUK5zOdUELcvrjWKjbXkDFOHn5ol6ag';

// Claves de almacenamiento de sesión (las usa también auth.js)
const SB_ACCESS_KEY  = 'fichaula_access_token';
const SB_REFRESH_KEY = 'fichaula_refresh_token';
const SB_PERFIL_KEY  = 'fichaula_session';

// Timeout de red (ms) para que la app nunca quede colgada
const SB_TIMEOUT_MS = 12000;


// ╔══════════════════════════════════════════════════════════╗
// ║  CAPA DE RED RESILIENTE                                  ║
// ╚══════════════════════════════════════════════════════════╝

/** Devuelve el token de usuario si hay sesión, o la anon key si no. */
function _accessToken() {
  return sessionStorage.getItem(SB_ACCESS_KEY) || SUPABASE_ANON_KEY;
}

function _headers(extra) {
  return Object.assign({
    'Content-Type': 'application/json',
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${_accessToken()}`
  }, extra || {});
}

/**
 * fetch con timeout (AbortController). Lanza un Error con .status
 * para que las capas superiores puedan distinguir 401, 404, etc.
 * Nunca loguea tokens ni contraseñas.
 */
async function _fetch(url, options) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SB_TIMEOUT_MS);
  try {
    const res = await fetch(url, Object.assign({}, options, { signal: ctrl.signal }));
    return res;
  } catch (e) {
    if (e.name === 'AbortError') {
      const err = new Error('La solicitud tardó demasiado. Revisá tu conexión.');
      err.status = 0;
      throw err;
    }
    const err = new Error('No se pudo conectar con el servidor.');
    err.status = 0;
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Intenta renovar el access token con el refresh token.
 * @returns {Promise<boolean>} true si se renovó con éxito.
 */
async function _intentarRefresh() {
  const refresh = sessionStorage.getItem(SB_REFRESH_KEY);
  if (!refresh) return false;
  try {
    const res = await _fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
      body: JSON.stringify({ refresh_token: refresh })
    });
    if (!res.ok) return false;
    const data = await res.json();
    sessionStorage.setItem(SB_ACCESS_KEY, data.access_token);
    sessionStorage.setItem(SB_REFRESH_KEY, data.refresh_token);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Cliente REST. Cada método lanza un Error en caso de fallo
 * (las funciones públicas lo capturan y devuelven {ok,error}).
 * Maneja 401 reintentando una vez tras refrescar el token.
 */
const sb = {
  async _req(method, path, body, _reintento) {
    const opts = { method, headers: _headers() };
    if (body !== undefined) opts.body = JSON.stringify(body);
    if (method === 'POST' || method === 'PATCH') {
      opts.headers['Prefer'] = 'return=representation';
    }
    const res = await _fetch(`${SUPABASE_URL}/rest/v1/${path}`, opts);

    // Token vencido → refrescar y reintentar una sola vez
    if (res.status === 401 && !_reintento) {
      const ok = await _intentarRefresh();
      if (ok) return sb._req(method, path, body, true);
      const err = new Error('Tu sesión expiró. Iniciá sesión de nuevo.');
      err.status = 401;
      throw err;
    }

    if (!res.ok) {
      let detalle = '';
      try { detalle = (await res.json()).message || ''; } catch (_) {}
      const err = new Error(detalle || `Error del servidor (${res.status}).`);
      err.status = res.status;
      throw err;
    }
    if (method === 'DELETE') return null;
    const text = await res.text();          // RPC con RETURNS void puede venir vacío
    return text ? JSON.parse(text) : null;
  },
  get(path)        { return sb._req('GET', path); },
  post(path, body) { return sb._req('POST', path, body); },
  patch(path, body){ return sb._req('PATCH', path, body); },
  delete(path)     { return sb._req('DELETE', path); },
  /** Llama a una función de Postgres (RPC). Corre en una transacción. */
  rpc(fn, args)    { return sb._req('POST', `rpc/${fn}`, args || {}); }
};


// ╔══════════════════════════════════════════════════════════╗
// ║  VALIDACIÓN DE ENTRADA (defensa en el cliente)           ║
// ║  El servidor revalida con CHECK + RLS; esto mejora la UX.║
// ╚══════════════════════════════════════════════════════════╝
const validar = {
  textoNoVacio(s, max = 1000) {
    const v = (s || '').trim();
    if (!v) return { ok: false, error: 'El texto no puede estar vacío.' };
    if (v.length > max) return { ok: false, error: `Máximo ${max} caracteres.` };
    return { ok: true, value: v };
  },
  email(s) {
    const v = (s || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))
      return { ok: false, error: 'Email inválido.' };
    return { ok: true, value: v };
  },
  dni(s) {
    const v = (s || '').trim();
    if (!/^[\d.]{7,12}$/.test(v))
      return { ok: false, error: 'DNI inválido (solo números y puntos).' };
    return { ok: true, value: v };
  },
  fecha(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s || ''))
      return { ok: false, error: 'Fecha inválida.' };
    return { ok: true, value: s };
  },
  nota(valor) {
    const n = parseFloat(valor);
    if (isNaN(n) || n < 0 || n > 10)
      return { ok: false, error: 'La nota debe ser un número entre 0 y 10.' };
    return { ok: true, value: n };
  },
  anio(valor) {
    const n = parseInt(valor, 10);
    if (isNaN(n) || n < 1 || n > 7)
      return { ok: false, error: 'El año debe estar entre 1 y 7.' };
    return { ok: true, value: n };
  },
  division(s) {
    const v = (s || '').trim().toUpperCase();
    if (!/^[A-Z]$/.test(v))
      return { ok: false, error: 'La división debe ser una letra (A–Z).' };
    return { ok: true, value: v };
  }
};

const CATEGORIAS_VALIDAS = ['conducta', 'actitud', 'nota', 'observacion'];


// ╔══════════════════════════════════════════════════════════╗
// ║  AUTENTICACIÓN (Supabase Auth)                           ║
// ╚══════════════════════════════════════════════════════════╝

/**
 * Inicia sesión contra Supabase Auth y resuelve el perfil + rol.
 * Reemplaza la antigua comparación de contraseñas en texto plano.
 *
 * @param {string} email
 * @param {string} password
 * @returns {Promise<object|null>} perfil con `rol`, o null si falla.
 */
async function validarCredencialesDB(email, password) {
  const ve = validar.email(email);
  if (!ve.ok || !password) return null;

  try {
    const res = await _fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
      body: JSON.stringify({ email: ve.value, password })
    });

    if (!res.ok) return null; // credenciales inválidas

    const data = await res.json();
    // Guardar tokens ANTES de pedir el perfil (las consultas usan el token)
    sessionStorage.setItem(SB_ACCESS_KEY, data.access_token);
    sessionStorage.setItem(SB_REFRESH_KEY, data.refresh_token);

    const perfil = await _resolverPerfil(data.user.id);
    if (!perfil) {
      // Usuario en Auth pero sin fila de perfil → sesión inválida
      sessionStorage.removeItem(SB_ACCESS_KEY);
      sessionStorage.removeItem(SB_REFRESH_KEY);
      return null;
    }
    return perfil;
  } catch (err) {
    console.error('Error de autenticación:', err.message); // sin datos sensibles
    return null;
  }
}

/**
 * Determina el rol consultando en qué tabla de perfil está el UUID.
 * Cada usuario solo puede leer su propia fila (RLS).
 * @param {string} uid
 * @returns {Promise<object|null>}
 */
async function _resolverPerfil(uid) {
  const u = encodeURIComponent(uid);

  let rows = await sb.get(`superadmins?id=eq.${u}&select=*`);
  if (rows.length) return { ...rows[0], rol: 'superadmin' };

  rows = await sb.get(`admins?id=eq.${u}&select=*`);
  if (rows.length) return { ...rows[0], rol: 'admin' };

  rows = await sb.get(`profesores?id=eq.${u}&select=*`);
  if (rows.length) return { ...rows[0], rol: 'profesor' };

  return null;
}

/** Cierra la sesión también del lado de Supabase Auth. */
async function logoutDB() {
  try {
    await _fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: 'POST', headers: _headers()
    });
  } catch (_) { /* no bloquear el logout local por un fallo de red */ }
}


// ╔══════════════════════════════════════════════════════════╗
// ║  CLASES (lectura para profesores y admins)               ║
// ╚══════════════════════════════════════════════════════════╝

function _normalizarClase(c) {
  return { ...c, nombre: `${c.anio}° ${c.division}` };
}

/** Trae las clases activas visibles según RLS (todas para admin). */
async function getClasesDB() {
  const clases = await sb.get('clases?activo=eq.true&select=*&order=anio.asc,division.asc');
  return clases.map(_normalizarClase);
}

/** Trae una clase por ID con sus alumnos (vía vista). */
async function getClaseByIdDB(id) {
  const rows = await sb.get(`clases?id=eq.${encodeURIComponent(id)}&select=*`);
  if (!rows.length) return null;
  const clase = _normalizarClase(rows[0]);
  clase.alumnos = await sb.get(
    `vista_alumnos_completa?curso_id=eq.${encodeURIComponent(id)}&select=*&order=apellido.asc`);
  return clase;
}

/**
 * Clases visibles para el usuario actual, con cantidad de alumnos.
 * RLS ya filtra por rol; el conteo se hace en una sola consulta extra.
 */
async function getClasesVisiblesDB() {
  const clases = await getClasesDB(); // RLS decide qué clases ve cada quién
  try {
    const alumnos = await sb.get('vista_alumnos_completa?select=curso_id');
    const conteo = {};
    alumnos.forEach(a => { conteo[a.curso_id] = (conteo[a.curso_id] || 0) + 1; });
    clases.forEach(c => { c.cantAlumnos = conteo[c.id] || 0; });
  } catch (_) {
    clases.forEach(c => { c.cantAlumnos = null; }); // si falla, no rompemos la grilla
  }
  return clases;
}

async function getClasesVisiblesPorNivelDB() {
  const clases = await getClasesVisiblesDB();
  return clases.reduce((acc, c) => {
    (acc[c.nivel] = acc[c.nivel] || []).push(c);
    return acc;
  }, {});
}

/** ¿El usuario puede ver esta clase? Admin sí; profe si la dicta. */
async function usuarioTieneAccesoAClaseDB(cursoId) {
  const rows = await sb.get(`clases?id=eq.${encodeURIComponent(cursoId)}&select=id`);
  return rows.length > 0; // si RLS la devolvió, tiene acceso
}


// ╔══════════════════════════════════════════════════════════╗
// ║  ALUMNOS                                                 ║
// ╚══════════════════════════════════════════════════════════╝

/** Alumnos visibles para el usuario (RLS filtra por rol). */
async function getAlumnosVisiblesDB() {
  return sb.get('vista_alumnos_completa?select=*&order=apellido.asc');
}


// ╔══════════════════════════════════════════════════════════╗
// ║  SEGUIMIENTOS                                            ║
// ╚══════════════════════════════════════════════════════════╝

/** Seguimientos de una clase (los borrados se movieron a la papelera). */
async function getSeguimientosDeClaseDB(cursoId) {
  return sb.get(
    `vista_seguimientos_completa?curso_id=eq.${encodeURIComponent(cursoId)}&select=*&order=creado_en.desc`);
}

/**
 * Agrega un seguimiento. Solo profesores (RLS lo refuerza en servidor).
 * @returns {Promise<{ok, data?, error?}>}
 */
async function agregarSeguimientoDB(cursoId, legajo, datos) {
  const user = getUsuarioActual();
  if (!user) return { ok: false, error: 'Necesitás iniciar sesión.' };

  const { categoria, texto, valor } = datos || {};
  if (!CATEGORIAS_VALIDAS.includes(categoria))
    return { ok: false, error: 'Categoría inválida.' };

  const vt = validar.textoNoVacio(texto);
  if (!vt.ok) return vt;

  let valorFinal = null;
  if (categoria === 'nota') {
    const vn = validar.nota(valor);
    if (!vn.ok) return vn;
    valorFinal = vn.value;
  }

  try {
    const alumnos = await sb.get(
      `vista_alumnos_completa?legajo=eq.${encodeURIComponent(legajo)}&curso_id=eq.${encodeURIComponent(cursoId)}&select=id`);
    if (!alumnos.length) return { ok: false, error: 'Alumno no encontrado.' };

    const nuevo = await sb.post('seguimientos', {
      alumno_id: alumnos[0].id,
      profesor_id: user.id,
      categoria,
      texto: vt.value,
      valor: valorFinal
    });
    return { ok: true, data: Array.isArray(nuevo) ? nuevo[0] : nuevo };
  } catch (e) {
    return { ok: false, error: _msg(e) };
  }
}

/**
 * Borra un seguimiento moviéndolo a la papelera (transacción en el
 * servidor). RLS/SECURITY DEFINER valida que sea el autor o un admin.
 */
async function eliminarSeguimientoDB(seguimientoId) {
  const user = getUsuarioActual();
  if (!user) return { ok: false, error: 'Necesitás iniciar sesión.' };
  try {
    await sb.rpc('eliminar_seguimiento', { p_id: seguimientoId });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: _msg(e) };
  }
}


// ╔══════════════════════════════════════════════════════════╗
// ║  COMENTARIOS (crear / editar / borrar→papelera) — Nivel 1║
// ╚══════════════════════════════════════════════════════════╝

/** Comentarios de un alumno (los borrados ya no están en la tabla). */
async function getComentariosDeAlumnoDB(alumnoId) {
  return sb.get(
    `comentarios?alumno_id=eq.${encodeURIComponent(alumnoId)}&select=*&order=creado_en.desc`);
}

async function agregarComentarioDB(alumnoId, texto, visiblePara = 'profesor') {
  const user = getUsuarioActual();
  if (!user) return { ok: false, error: 'Necesitás iniciar sesión.' };
  const vt = validar.textoNoVacio(texto);
  if (!vt.ok) return vt;
  try {
    const nuevo = await sb.post('comentarios', {
      alumno_id: alumnoId,
      profesor_id: user.id,
      texto: vt.value,
      visible_para: visiblePara
    });
    return { ok: true, data: Array.isArray(nuevo) ? nuevo[0] : nuevo };
  } catch (e) {
    return { ok: false, error: _msg(e) };
  }
}

async function editarComentarioDB(comentarioId, texto) {
  const user = getUsuarioActual();
  if (!user) return { ok: false, error: 'Necesitás iniciar sesión.' };
  const vt = validar.textoNoVacio(texto);
  if (!vt.ok) return vt;
  try {
    const upd = await sb.patch(`comentarios?id=eq.${encodeURIComponent(comentarioId)}`,
      { texto: vt.value });
    return { ok: true, data: upd };
  } catch (e) {
    return { ok: false, error: _msg(e) };
  }
}

/** Borra un comentario moviéndolo a la papelera (transacción en servidor). */
async function eliminarComentarioDB(comentarioId) {
  const user = getUsuarioActual();
  if (!user) return { ok: false, error: 'Necesitás iniciar sesión.' };
  try {
    await sb.rpc('eliminar_comentario', { p_id: comentarioId });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: _msg(e) };
  }
}


// ╔══════════════════════════════════════════════════════════╗
// ║  PANEL ADMIN — CRUD de clases, alumnos y profesores      ║
// ║  (RLS exige rol admin/superadmin para escribir)          ║
// ╚══════════════════════════════════════════════════════════╝

/** Clases con nombre del titular y cantidad de alumnos. */
async function getClasesAdminDB() {
  const [clases, profes, alumnos] = await Promise.all([
    sb.get('clases?select=*&order=anio.asc,division.asc'),
    sb.get('profesores?select=id,nombre,apellido'),
    sb.get('vista_alumnos_completa?select=curso_id')
  ]);
  const profeMap = Object.fromEntries(profes.map(p => [p.id, `${p.nombre} ${p.apellido}`]));
  const conteo = {};
  alumnos.forEach(a => { conteo[a.curso_id] = (conteo[a.curso_id] || 0) + 1; });
  return clases.map(c => ({
    ..._normalizarClase(c),
    titularNombre: c.profesor_titular_id ? (profeMap[c.profesor_titular_id] || null) : null,
    cantAlumnos: conteo[c.id] || 0
  }));
}

/**
 * Crea una clase. Requiere anio + division (UNIQUE) según el esquema.
 * @param {object} d {anio, division, nivel, turno, aula, profesorTitularId?}
 */
async function crearClaseDB(d) {
  const va = validar.anio(d.anio);       if (!va.ok) return va;
  const vd = validar.division(d.division); if (!vd.ok) return vd;
  if (!d.nivel || !d.turno || !d.aula)
    return { ok: false, error: 'Faltan datos: nivel, turno o aula.' };

  const id = `${va.value}${vd.value}`;
  try {
    const nueva = await sb.post('clases', {
      id, anio: va.value, division: vd.value,
      nivel: d.nivel.trim(), turno: d.turno, aula: d.aula.trim(),
      profesor_titular_id: d.profesorTitularId || null
    });
    return { ok: true, data: Array.isArray(nueva) ? nueva[0] : nueva };
  } catch (e) {
    const m = _msg(e);
    if (/duplicate|unique/i.test(m))
      return { ok: false, error: `Ya existe la clase ${id} (año/división repetidos).` };
    return { ok: false, error: m };
  }
}

async function modificarClaseDB(id, cambios) {
  const patch = {};
  if (cambios.nivel !== undefined) patch.nivel = cambios.nivel.trim();
  if (cambios.turno !== undefined) patch.turno = cambios.turno;
  if (cambios.aula  !== undefined) patch.aula = cambios.aula.trim();
  if (cambios.profesorTitularId !== undefined)
    patch.profesor_titular_id = cambios.profesorTitularId || null;
  try {
    const upd = await sb.patch(`clases?id=eq.${encodeURIComponent(id)}`, patch);
    return { ok: true, data: upd };
  } catch (e) {
    return { ok: false, error: _msg(e) };
  }
}

async function eliminarClaseDB(id) {
  try {
    await sb.rpc('eliminar_clase', { p_id: id });
    return { ok: true };
  } catch (e) {
    const m = _msg(e);
    if (/foreign key|violates/i.test(m))
      return { ok: false, error: 'No se puede eliminar: la clase todavía tiene alumnos.' };
    return { ok: false, error: m };
  }
}

/** Alumnos para el panel admin (todos, con nombre de clase). */
async function getAlumnosAdminDB() {
  return sb.get('vista_alumnos_completa?select=*&order=apellido.asc');
}

async function crearAlumnoDB(d) {
  if (!d.nombre || !d.apellido) return { ok: false, error: 'Nombre y apellido son obligatorios.' };
  const vdni = validar.dni(d.dni);            if (!vdni.ok) return vdni;
  const vf = validar.fecha(d.fechaNacimiento); if (!vf.ok) return vf;
  if (!d.cursoId) return { ok: false, error: 'Tenés que seleccionar una clase.' };
  if (!d.legajo)  return { ok: false, error: 'El legajo es obligatorio.' };
  try {
    const nuevo = await sb.post('alumnos', {
      legajo: d.legajo.trim(),
      nombre: d.nombre.trim(),
      apellido: d.apellido.trim(),
      dni: vdni.value,
      fecha_nacimiento: vf.value,
      curso_id: d.cursoId
    });
    return { ok: true, data: Array.isArray(nuevo) ? nuevo[0] : nuevo };
  } catch (e) {
    const m = _msg(e);
    if (/legajo/i.test(m)) return { ok: false, error: 'Ese legajo ya existe.' };
    if (/dni/i.test(m))    return { ok: false, error: 'Ese DNI ya está registrado.' };
    return { ok: false, error: m };
  }
}

async function modificarAlumnoDB(alumnoId, cambios) {
  const patch = {};
  if (cambios.nombre   !== undefined) patch.nombre = cambios.nombre.trim();
  if (cambios.apellido !== undefined) patch.apellido = cambios.apellido.trim();
  if (cambios.dni !== undefined) {
    const v = validar.dni(cambios.dni); if (!v.ok) return v; patch.dni = v.value;
  }
  if (cambios.fechaNacimiento !== undefined) {
    const v = validar.fecha(cambios.fechaNacimiento); if (!v.ok) return v;
    patch.fecha_nacimiento = v.value;
  }
  if (cambios.cursoId !== undefined) patch.curso_id = cambios.cursoId;
  try {
    const upd = await sb.patch(`alumnos?id=eq.${encodeURIComponent(alumnoId)}`, patch);
    return { ok: true, data: upd };
  } catch (e) {
    return { ok: false, error: _msg(e) };
  }
}

async function eliminarAlumnoDB(alumnoId) {
  try {
    await sb.rpc('eliminar_alumno', { p_id: alumnoId });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: _msg(e) };
  }
}

/** Profesores activos. */
async function getProfesoresDB() {
  return sb.get('profesores?activo=eq.true&select=*&order=apellido.asc');
}

/** IDs de cursos asignados a un profesor. */
async function getCursosDeProfesorDB(profesorId) {
  const filas = await sb.get(
    `profesor_curso?profesor_id=eq.${encodeURIComponent(profesorId)}&select=curso_id`);
  return filas.map(f => f.curso_id);
}

/**
 * Reemplaza el set completo de cursos de un profesor.
 * Borra los actuales e inserta los nuevos.
 */
async function asignarCursosAProfesorDB(profesorId, cursoIds) {
  try {
    await sb.delete(`profesor_curso?profesor_id=eq.${encodeURIComponent(profesorId)}`);
    const lista = (cursoIds || []).map(cid => ({ profesor_id: profesorId, curso_id: cid }));
    if (lista.length) await sb.post('profesor_curso', lista);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: _msg(e) };
  }
}

/** Todos los seguimientos para la vista del admin (sin los de la papelera). */
async function getTodosLosSeguimientosDB() {
  return sb.get('vista_seguimientos_completa?select=*&order=creado_en.desc');
}


// ╔══════════════════════════════════════════════════════════╗
// ║  Helper de mensajes de error legibles                    ║
// ╚══════════════════════════════════════════════════════════╝
function _msg(e) {
  if (e && e.status === 401) return 'Tu sesión expiró. Iniciá sesión de nuevo.';
  if (e && e.status === 0)   return e.message; // conexión/timeout
  return (e && e.message) ? e.message : 'Ocurrió un error inesperado.';
}
