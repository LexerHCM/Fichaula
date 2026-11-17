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

// Filas por pedido al traer una lista completa (el máximo por defecto de la API de Supabase)
const SB_FILAS_POR_PEDIDO = 1000;


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
async function _fetch(url, options, timeoutMs = SB_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
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
  rpc(fn, args)    { return sb._req('POST', `rpc/${fn}`, args || {}); },
  async invoke(fn, args, timeoutMs = SB_TIMEOUT_MS) {
    const url = `${SUPABASE_URL}/functions/v1/${encodeURIComponent(fn)}`;
    const request = () => _fetch(url, {
      method: 'POST',
      headers: _headers(),
      body: JSON.stringify(args || {})
    }, timeoutMs);
    let res = await request();
    let functionError = false;
    if (res.status === 401) {
      try {
        const payload = await res.clone().json();
        functionError = payload && typeof payload.error === 'string';
      } catch (_) {}
      if (!functionError && await _intentarRefresh()) res = await request();
    }
    let data = null;
    try { data = await res.json(); } catch (_) {}
    if (!res.ok) {
      const err = new Error(data && (data.error || data.message) || `Error del servidor (${res.status}).`);
      err.status = res.status;
      err.functionError = data && typeof data.error === 'string';
      throw err;
    }
    return data;
  },
  async storageUpload(bucket, path, file) {
    const encodedPath = path.split('/').map(encodeURIComponent).join('/');
    const url = `${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath}`;
    const request = () => _fetch(url, {
      method: 'POST',
      headers: _headers({ 'Content-Type': file.type, 'x-upsert': 'false' }),
      body: file
    });
    let res = await request();
    if (res.status === 401 && await _intentarRefresh()) res = await request();
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json()).message || ''; } catch (_) {}
      const error = new Error(detail || `No se pudo subir la imagen (${res.status}).`);
      error.status = res.status;
      throw error;
    }
    return res.json();
  },
  async storageSignedUrl(bucket, path) {
    const encodedPath = path.split('/').map(encodeURIComponent).join('/');
    const url = `${SUPABASE_URL}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${encodedPath}`;
    const request = () => _fetch(url, {
      method: 'POST', headers: _headers(), body: JSON.stringify({ expiresIn: 3600 })
    });
    let res = await request();
    if (res.status === 401 && await _intentarRefresh()) res = await request();
    let data = null;
    try { data = await res.json(); } catch (_) {}
    if (!res.ok || !data?.signedURL) {
      throw new Error(data?.message || `No se pudo abrir la imagen (${res.status}).`);
    }
    return data.signedURL.startsWith('http')
      ? data.signedURL
      : `${SUPABASE_URL}/storage/v1${data.signedURL}`;
  },
  async storageRemove(bucket, paths) {
    const res = await _fetch(`${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(bucket)}`, {
      method: 'DELETE', headers: _headers(), body: JSON.stringify({ prefixes: paths })
    });
    let data = null;
    try { data = await res.json(); } catch (_) {}
    if (!res.ok) throw new Error(data?.message || `No se pudieron eliminar las imágenes (${res.status}).`);
  },
  /**
   * GET que trae TODAS las filas, pidiéndolas de a tandas: la API corta
   * cada respuesta en SB_FILAS_POR_PEDIDO. El `path` tiene que llevar un
   * `order` sin empates (terminado en una columna única) para que las
   * tandas no se pisen.
   */
  async getTodo(path) {
    const filas = [];
    for (;;) {
      const tanda = await sb.get(`${path}&limit=${SB_FILAS_POR_PEDIDO}&offset=${filas.length}`);
      filas.push(...tanda);
      if (tanda.length < SB_FILAS_POR_PEDIDO) return filas;
    }
  }
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

    const fecha = new Date(`${s}T00:00:00`);
    if (Number.isNaN(fecha.getTime()))
      return { ok: false, error: 'Fecha inválida.' };

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    if (fecha > hoy)
      return { ok: false, error: 'La fecha de nacimiento no puede ser futura.' };

    let edad = hoy.getFullYear() - fecha.getFullYear();
    const cumpleEsteAnio = new Date(hoy.getFullYear(), fecha.getMonth(), fecha.getDate());
    if (hoy < cumpleEsteAnio) edad--;

    if (edad < 1)
      return { ok: false, error: 'La fecha de nacimiento no puede corresponder a un alumno de 0 años.' };

    return { ok: true, value: s };
  }, 
  fechaNacimiento(s) {
    const base = validar.fecha(s);
    if (!base.ok) return base;

    // Se arma con partes numéricas para evitar desfases de zona horaria
    const [y, m, d] = s.split('-').map(Number);
    const nac = new Date(y, m - 1, d);
    if (nac.getFullYear() !== y || nac.getMonth() !== m - 1 || nac.getDate() !== d)
      return { ok: false, error: 'La fecha de nacimiento no existe.' };

    const hoy = new Date();
    const hoySinHora = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    if (nac > hoySinHora)
      return { ok: false, error: 'La fecha de nacimiento no puede ser futura.' };

    let edad = hoySinHora.getFullYear() - y;
    if (hoySinHora.getMonth() < m - 1 ||
        (hoySinHora.getMonth() === m - 1 && hoySinHora.getDate() < d)) edad--;
    if (edad < 1)
      return { ok: false, error: 'La fecha de nacimiento no es válida: el alumno tendría 0 años.' };

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

// Quién puede ver un seguimiento (columna visible_para):
//   'admin'    → "Dirección": su autor y la dirección.
//   'profesor' → "Todos": además, los profesores que dictan el curso del alumno.
// La regla la aplica RLS en el servidor (política seg_select, sql/02_seguridad_rls.sql).
const VISIBILIDADES_VALIDAS = ['admin', 'profesor'];
const VISIBILIDAD_POR_DEFECTO = 'admin';


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

    if (!res.ok) {
      if (res.status === 400 || res.status === 401) return null;
      const error = new Error('No se pudo verificar la cuenta.');
      error.status = res.status;
      throw error;
    }

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

    if (perfil.rol !== 'superadmin' && perfil.colegio_id) {
      const colegios = await sb.get(
        `colegios?id=eq.${encodeURIComponent(perfil.colegio_id)}&select=nombre,activo`
      );
      if (!colegios.length) {
        throw new Error('No se pudo verificar el estado del colegio asociado a tu cuenta.');
      }
      if (!colegios[0].activo) {
        const error = new Error(`El colegio "${colegios[0].nombre}" está desactivado. No podés iniciar sesión temporalmente.`);
        error.code = 'COLEGIO_DESACTIVADO';
        throw error;
      }
    }

    return perfil;
  } catch (err) {
    sessionStorage.removeItem(SB_ACCESS_KEY);
    sessionStorage.removeItem(SB_REFRESH_KEY);
    if (err.code !== 'COLEGIO_DESACTIVADO') {
      console.error('Error de autenticación:', err.message); // sin datos sensibles
    }
    throw err;
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

  rows = await sb.get(`preceptores?id=eq.${u}&select=*`);
  if (rows.length) return { ...rows[0], rol: 'preceptor' };

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

/**
 * Seguimientos de una clase (los borrados se movieron a la papelera).
 * RLS devuelve a dirección todos y a un profesor solo los propios más
 * los que otro profesor marcó como visibles para "Todos".
 */
async function getSeguimientosDeClaseDB(cursoId) {
  return sb.getTodo(
    `vista_seguimientos_completa?curso_id=eq.${encodeURIComponent(cursoId)}&select=*&order=creado_en.desc,id.desc`);
}

/**
 * Agrega un seguimiento. Solo profesores y solo sobre alumnos de sus
 * cursos (RLS lo refuerza en servidor).
 * @param {string} cursoId
 * @param {string} legajo
 * @param {object} datos {categoria, texto, valor?, visiblePara?}
 *   visiblePara: 'admin' (Dirección, por defecto) | 'profesor' (Todos)
 * @returns {Promise<{ok, data?, error?}>}
 */
async function agregarSeguimientoDB(cursoId, alumnoId, datos) {
  const user = getUsuarioActual();
  if (!user) return { ok: false, error: 'Necesitás iniciar sesión.' };

  const { categoria, texto, valor } = datos || {};
  if (!CATEGORIAS_VALIDAS.includes(categoria))
    return { ok: false, error: 'Categoría inválida.' };

  const visiblePara = (datos && datos.visiblePara) || VISIBILIDAD_POR_DEFECTO;
  if (!VISIBILIDADES_VALIDAS.includes(visiblePara))
    return { ok: false, error: 'Elegí quién puede ver el seguimiento.' };

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
      `vista_alumnos_completa?id=eq.${encodeURIComponent(alumnoId)}&curso_id=eq.${encodeURIComponent(cursoId)}&select=id`);
    if (!alumnos.length) return { ok: false, error: 'Alumno no encontrado.' };

    const nuevo = await sb.post('seguimientos', {
      alumno_id: alumnos[0].id,
      profesor_id: user.rol === 'profesor' ? user.id : null,
      preceptor_id: user.rol === 'preceptor' ? user.id : null,
      categoria,
      texto: vt.value,
      valor: valorFinal,
      visible_para: visiblePara
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

/**
 * Seguimientos eliminados, con los datos del alumno y del profesor.
 * Cada entrada de la papelera se identifica por su `papelera_id`.
 * Solo dirección: al resto RLS le devuelve una lista vacía.
 */
async function getSeguimientosPapeleraDB() {
  return sb.getTodo('vista_seguimientos_papelera?select=*&order=deleted_at.desc,papelera_id.desc');
}

/**
 * Devuelve una entrada de la papelera a su lugar. Solo dirección.
 * @param {string} papeleraId  `papelera_id` de la entrada
 */
async function restaurarSeguimientoDB(papeleraId) {
  const user = getUsuarioActual();
  if (!user) return { ok: false, error: 'Necesitás iniciar sesión.' };
  try {
    await sb.rpc('restaurar_seguimiento', { p_papelera_id: papeleraId });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: _msg(e) };
  }
}

/**
 * Borra una entrada de la papelera para siempre. Solo dirección.
 * @param {string} papeleraId  `papelera_id` de la entrada
 */
async function purgarSeguimientoDB(papeleraId) {
  const user = getUsuarioActual();
  if (!user) return { ok: false, error: 'Necesitás iniciar sesión.' };
  try {
    await sb.rpc('purgar_seguimiento', { p_papelera_id: papeleraId });
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
    `vista_comentarios_completa?alumno_id=eq.${encodeURIComponent(alumnoId)}&select=*&order=creado_en.desc`);
}

async function agregarComentarioDB(alumnoId, texto, visiblePara = 'profesor') {
  const user = getUsuarioActual();
  if (!user) return { ok: false, error: 'Necesitás iniciar sesión.' };
  const vt = validar.textoNoVacio(texto);
  if (!vt.ok) return vt;
  try {
    const nuevo = await sb.post('comentarios', {
      alumno_id: alumnoId,
      profesor_id: user.rol === 'profesor' ? user.id : null,
      preceptor_id: user.rol === 'preceptor' ? user.id : null,
      texto: vt.value,
      visible_para: visiblePara
    });
    return { ok: true, data: Array.isArray(nuevo) ? nuevo[0] : nuevo };
  } catch (e) {
    return { ok: false, error: _msg(e) };
  }
}

async function getComentariosDeClaseDB(cursoId) {
  return sb.get(
    `vista_comentarios_completa?clase_id=eq.${encodeURIComponent(cursoId)}&select=*&order=creado_en.desc`);
}

async function agregarComentarioClaseDB(cursoId, texto, visiblePara = 'admin') {
  const user = getUsuarioActual();
  if (!user || !puedeComentar()) return { ok: false, error: 'Solo docentes y preceptores pueden comentar.' };
  const vt = validar.textoNoVacio(texto);
  if (!vt.ok) return vt;
  try {
    const nuevo = await sb.post('comentarios', {
      curso_id: cursoId,
      profesor_id: user.rol === 'profesor' ? user.id : null,
      preceptor_id: user.rol === 'preceptor' ? user.id : null,
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

/** Clases con nombre de preceptor y cantidad de alumnos. */
async function getClasesAdminDB() {
  const [clases, preceptores, alumnos] = await Promise.all([
    sb.get('clases?select=*&order=anio.asc,division.asc'),
    sb.get('preceptores?select=id,nombre,apellido'),
    sb.get('vista_alumnos_completa?select=curso_id')
  ]);
  const preceptorMap = Object.fromEntries(preceptores.map(p => [p.id, `${p.nombre} ${p.apellido}`]));
  const conteo = {};
  alumnos.forEach(a => { conteo[a.curso_id] = (conteo[a.curso_id] || 0) + 1; });
  return clases.map(c => ({
    ..._normalizarClase(c),
    preceptorNombre: c.preceptor_id ? (preceptorMap[c.preceptor_id] || null) : null,
    cantAlumnos: conteo[c.id] || 0
  }));
}

/**
 * Crea una clase. Requiere anio + division (UNIQUE) según el esquema.
 * @param {object} d {anio, division, nivel, turno, aula, preceptorId?}
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
      preceptor_id: d.preceptorId || null
    });
    return { ok: true, data: Array.isArray(nueva) ? nueva[0] : nueva };
  } catch (e) {
    const m = _msg(e);
    if (/duplicate|unique/i.test(m))
      return { ok: false, error: `Ya existe la clase ${id} (año/división repetidos).` };
    return { ok: false, error: m };
  }
}

async function crearClaseColegioSuperadminDB(colegioId, d) {
  const va = validar.anio(d.anio); if (!va.ok) return va;
  const vd = validar.division(d.division); if (!vd.ok) return vd;
  if (!d.nivel || !d.turno || !d.aula) {
    return { ok: false, error: 'Faltan datos: nivel, turno o aula.' };
  }
  try {
    const data = await sb.post('clases', {
      id: `${va.value}${vd.value}`,
      anio: va.value,
      division: vd.value,
      nivel: d.nivel.trim(),
      turno: d.turno,
      aula: d.aula.trim(),
      preceptor_id: d.preceptorId || null,
      colegio_id: colegioId
    });
    return { ok: true, data: Array.isArray(data) ? data[0] : data };
  } catch (e) {
    const message = _msg(e);
    if (/duplicate|unique/i.test(message)) {
      return { ok: false, error: `Ya existe la clase ${va.value}° ${vd.value} en este colegio.` };
    }
    return { ok: false, error: message };
  }
}

async function modificarClaseDB(id, cambios) {
  const patch = {};
  if (cambios.nivel !== undefined) patch.nivel = cambios.nivel.trim();
  if (cambios.turno !== undefined) patch.turno = cambios.turno;
  if (cambios.aula  !== undefined) patch.aula = cambios.aula.trim();
  if (cambios.preceptorId !== undefined)
    patch.preceptor_id = cambios.preceptorId || null;
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
  const vf = validar.fechaNacimiento(d.fechaNacimiento); if (!vf.ok) return vf;
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
    const v = validar.fechaNacimiento(cambios.fechaNacimiento); if (!v.ok) return v;
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

async function crearCuentaProfesorDB(datos) {
  try {
    const data = await sb.invoke('crear-profesor', datos);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: _msg(e) };
  }
}

async function getPreceptoresDB(colegioId) {
  const filtro = colegioId ? `&colegio_id=eq.${encodeURIComponent(colegioId)}` : '';
  return sb.get(`preceptores?activo=eq.true${filtro}&select=*&order=apellido.asc`);
}

async function crearCuentaPreceptorDB(datos) {
  try {
    const data = await sb.invoke('crear-preceptor', datos);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: _msg(e) };
  }
}

async function modificarCuentaPreceptorDB(preceptorId, datos) {
  try {
    const data = await sb.invoke('editar-preceptor', {
      preceptor_id: preceptorId,
      nombre: datos.nombre,
      apellido: datos.apellido,
      dni: datos.dni,
      fecha_nacimiento: datos.fecha_nacimiento,
      telefono: datos.telefono,
      email: datos.email
    });
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: _msg(e) };
  }
}

async function eliminarCuentaPreceptorDB(preceptorId, password) {
  try {
    const data = await sb.invoke('eliminar-preceptor', {
      preceptor_id: preceptorId,
      password
    });
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: _msg(e) };
  }
}

async function eliminarCuentaProfesorDB(profesorId, password) {
  try {
    const data = await sb.invoke('eliminar-profesor', {
      profesor_id: profesorId,
      password
    });
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: _msg(e) };
  }
}

async function getCicloLectivoActivoDB(colegioId) {
  const rows = await sb.get(
    `ciclos_lectivos?colegio_id=eq.${encodeURIComponent(colegioId)}&activo=eq.true&select=colegio_id,anio_lectivo`);
  return rows[0] || null;
}

async function getCiclosLectivosDB(colegioId) {
  return sb.get(
    `ciclos_lectivos?colegio_id=eq.${encodeURIComponent(colegioId)}&select=anio_lectivo,activo,creado_en&order=anio_lectivo.desc`);
}

async function abrirAnioLectivoDB(colegioId, anioLectivo) {
  try {
    const data = await sb.rpc('abrir_anio_lectivo', {
      p_colegio_id: colegioId,
      p_anio_lectivo: Number(anioLectivo)
    });
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: _msg(e) };
  }
}

async function getAsistenciasDelCursoDB(cursoId, fecha, anioLectivo, alumnoIds) {
  const filtroCiclo = `anio_lectivo=eq.${encodeURIComponent(anioLectivo)}`;
  const ids = [...new Set(alumnoIds || [])];
  const [delDia, delCiclo] = await Promise.all([
    sb.get(`asistencias?curso_id=eq.${encodeURIComponent(cursoId)}&fecha=eq.${encodeURIComponent(fecha)}&${filtroCiclo}&select=*`),
    ids.length
      ? sb.getTodo(`asistencias?${filtroCiclo}&alumno_id=in.(${ids.map(encodeURIComponent).join(',')})&select=alumno_id,estado&order=id.asc`)
      : Promise.resolve([])
  ]);
  const totales = {};
  delCiclo.forEach(registro => {
    const valor = registro.estado === 'ausente' ? 1 : registro.estado === 'tarde' ? 0.25 : 0;
    totales[registro.alumno_id] = (totales[registro.alumno_id] || 0) + valor;
  });
  return { delDia, totales };
}

async function guardarAsistenciaDB(datos) {
  try {
    const data = await sb.rpc('guardar_asistencia', {
      p_asistencia_id: datos.id || null,
      p_alumno_id: datos.alumnoId,
      p_curso_id: datos.cursoId,
      p_fecha: datos.fecha,
      p_anio_lectivo: Number(datos.anioLectivo),
      p_estado: datos.estado,
      p_justificada: Boolean(datos.justificada),
      p_motivo: datos.justificada ? datos.motivo : null,
      p_adjuntos: datos.adjuntos || []
    });
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: _msg(e) };
  }
}

async function subirImagenJustificacion(asistenciaId, file) {
  const cryptoId = window.crypto && typeof window.crypto.randomUUID === 'function'
    ? window.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const extension = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1];
  const nombre = `${cryptoId}.${extension}`;
  const path = `${asistenciaId}/${nombre}`;
  try {
    await sb.storageUpload('asistencia-justificaciones', path, file);
    return { ok: true, path };
  } catch (e) {
    return { ok: false, error: _msg(e) };
  }
}

async function getFichaAlumnoDB(alumnoId) {
  const filtroId = encodeURIComponent(alumnoId);
  const [alumnos, seguimientos, comentarios, asistencias] = await Promise.all([
    sb.get(`vista_ficha_alumno?id=eq.${filtroId}&select=*`),
    sb.getTodo(`vista_seguimientos_completa?alumno_id=eq.${filtroId}&select=*&order=creado_en.desc,id.desc`),
    sb.getTodo(`vista_comentarios_completa?alumno_id=eq.${filtroId}&select=*&order=creado_en.desc,id.desc`),
    sb.getTodo(`asistencias?alumno_id=eq.${filtroId}&select=*&order=anio_lectivo.desc,fecha.desc,id.desc`)
  ]);
  if (!alumnos.length) return null;
  const cursoIds = [...new Set(asistencias.map(registro => registro.curso_id))];
  if (cursoIds.length) {
    const filtroClases = `in.(${cursoIds.map(id => `"${String(id).replace(/"/g, '\\"')}"`).join(',')})`;
    const clases = await sb.get(`clases?id=${encodeURIComponent(filtroClases)}&select=id,anio,division`);
    const nombresClases = new Map(clases.map(clase => [clase.id, `${clase.anio}° ${clase.division}`]));
    asistencias.forEach(registro => {
      registro.curso_nombre = nombresClases.get(registro.curso_id) || registro.curso_id;
    });
  }
  return { ...alumnos[0], seguimientos, comentarios, asistencias };
}

async function getUrlImagenJustificacion(path) {
  return sb.storageSignedUrl('asistencia-justificaciones', path);
}

async function eliminarImagenesJustificacion(paths) {
  if (!paths || paths.length === 0) return { ok: true };
  try {
    await sb.storageRemove('asistencia-justificaciones', paths);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: _msg(e) };
  }
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

async function getColegiosSuperadminDB() {
  return sb.get('colegios?select=id,nombre,sigla,activo&order=nombre.asc');
}

async function actualizarEstadoColegioSuperadminDB(colegioId, activo) {
  try {
    const data = await sb.patch(
      `colegios?id=eq.${encodeURIComponent(colegioId)}`,
      { activo }
    );
    if (!data || !data.length) {
      return { ok: false, error: 'No se encontró el colegio para actualizar.' };
    }
    return { ok: true, data: data[0] };
  } catch (e) {
    return { ok: false, error: _msg(e) };
  }
}

async function getDatosColegioSuperadminDB(colegioId) {
  const filtro = encodeURIComponent(colegioId);
  const [clases, alumnos, profesores, preceptores, asignaciones] = await Promise.all([
    sb.get(`clases?colegio_id=eq.${filtro}&select=*&order=anio.asc,division.asc`),
    sb.get(`alumnos?colegio_id=eq.${filtro}&select=id,nombre,apellido,dni,legajo,curso_id,fecha_nacimiento,creado_en&order=apellido.asc`),
    sb.get(`profesores?colegio_id=eq.${filtro}&select=id,nombre,apellido,email,materia&order=apellido.asc`),
    sb.get(`preceptores?colegio_id=eq.${filtro}&select=id,nombre,apellido,email,dni,telefono,fecha_nacimiento&order=apellido.asc`),
    sb.get('profesor_curso?select=profesor_id,curso_id')
  ]);
  const clasesPorId = new Map(clases.map(clase => [clase.id, clase]));
  const profesoresPorId = new Map(profesores.map(profesor => [profesor.id, profesor]));
  const preceptoresPorId = new Map(preceptores.map(preceptor => [preceptor.id, preceptor]));
  const alumnosPorClase = new Map();
  alumnos.forEach(alumno => alumnosPorClase.set(alumno.curso_id, (alumnosPorClase.get(alumno.curso_id) || 0) + 1));
  const cursosPorProfesor = new Map();
  asignaciones.forEach(({ profesor_id, curso_id }) => {
    if (!clasesPorId.has(curso_id)) return;
    if (!cursosPorProfesor.has(profesor_id)) cursosPorProfesor.set(profesor_id, []);
    cursosPorProfesor.get(profesor_id).push(`${clasesPorId.get(curso_id).anio}° ${clasesPorId.get(curso_id).division}`);
  });
  return {
    clases: clases.map(clase => ({
      id: clase.id,
      n: `${clase.anio}° ${clase.division}`,
      nv: clase.nivel,
      t: clase.turno,
      a: clase.aula,
      preceptor_id: clase.preceptor_id,
      prec: preceptoresPorId.get(clase.preceptor_id)
        ? `${preceptoresPorId.get(clase.preceptor_id).nombre} ${preceptoresPorId.get(clase.preceptor_id).apellido}`
        : '—',
      al: alumnosPorClase.get(clase.id) || 0
    })),
    alums: alumnos.map(alumno => {
      const clase = clasesPorId.get(alumno.curso_id);
      return {
        id: alumno.id,
        n: `${alumno.apellido}, ${alumno.nombre}`,
        cl: clase ? `${clase.anio}° ${clase.division}` : '—',
        dni: alumno.dni,
        legajo: alumno.legajo,
        fecha_nacimiento: alumno.fecha_nacimiento,
        creado_en: alumno.creado_en,
        curso_id: alumno.curso_id
      };
    }),
    profs: profesores.map(profesor => ({
      id: profesor.id,
      n: `${profesor.nombre} ${profesor.apellido}`,
      nombre: profesor.nombre,
      apellido: profesor.apellido,
      m: profesor.materia,
      email: profesor.email,
      cl: (cursosPorProfesor.get(profesor.id) || []).join(', ')
    })),
    preceptores: preceptores.map(preceptor => ({
      id: preceptor.id,
      n: `${preceptor.nombre} ${preceptor.apellido}`,
      nombre: preceptor.nombre,
      apellido: preceptor.apellido,
      email: preceptor.email,
      dni: preceptor.dni,
      telefono: preceptor.telefono,
      fecha_nacimiento: preceptor.fecha_nacimiento,
      cl: clases.filter(clase => clase.preceptor_id === preceptor.id)
        .map(clase => `${clase.anio}° ${clase.division}`).join(', ')
    }))
  };
}

async function crearColegioSuperadminDB(nombre, sigla) {
  try {
    const data = await sb.rpc('crear_colegio_superadmin', { p_nombre: nombre, p_sigla: sigla });
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: _msg(e) };
  }
}

async function getDirectivosColegioSuperadminDB(colegioId) {
  const filtro = encodeURIComponent(colegioId);
  const filas = await sb.get(
    `admins?colegio_id=eq.${filtro}&select=id,email,nombre,apellido,creado_en&order=apellido.asc,nombre.asc`
  );
  return filas.map(directivo => ({
    id: directivo.id,
    nombre: `${directivo.nombre} ${directivo.apellido}`,
    nombrePila: directivo.nombre,
    apellido: directivo.apellido,
    email: directivo.email,
    desde: directivo.creado_en ? new Date(directivo.creado_en).getFullYear().toString() : ''
  }));
}

async function crearDirectivoSuperadminDB(colegioId, datos) {
  try {
    const data = await sb.invoke('crear-directivo', {
      colegio_id: colegioId,
      nombre: datos.nombre,
      apellido: datos.apellido,
      email: datos.email,
      password: datos.password
    });
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: _msg(e) };
  }
}

async function modificarDirectivoSuperadminDB(id, cambios) {
  try {
    await sb.patch(`admins?id=eq.${encodeURIComponent(id)}`, {
      nombre: cambios.nombre,
      apellido: cambios.apellido
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: _msg(e) };
  }
}

async function eliminarDirectivoSuperadminDB(id) {
  try {
    await sb.rpc('eliminar_admin', { p_id: id });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: _msg(e) };
  }
}

async function importarColegioExcelDB(colegioId, datos) {
  try {
    const data = await sb.invoke('importar-colegio-excel', {
      colegio_id: colegioId,
      datos
    });
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: _msg(e) };
  }
}

async function eliminarColegioSuperadminDB(colegioId, password) {
  try {
    const data = await sb.invoke('eliminar-colegio', {
      colegio_id: colegioId,
      password
    }, 60000);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: _msg(e) };
  }
}

/** Todos los seguimientos para la vista del admin (sin los de la papelera). */
async function getTodosLosSeguimientosDB() {
  return sb.getTodo('vista_seguimientos_completa?select=*&order=creado_en.desc,id.desc');
}


// ╔══════════════════════════════════════════════════════════╗
// ║  Helper de mensajes de error legibles                    ║
// ╚══════════════════════════════════════════════════════════╝
function _msg(e) {
  if (e && e.status === 401 && !e.functionError) return 'Tu sesión expiró. Iniciá sesión de nuevo.';
  if (e && e.status === 0)   return e.message; // conexión/timeout
  return (e && e.message) ? e.message : 'Ocurrió un error inesperado.';
}
