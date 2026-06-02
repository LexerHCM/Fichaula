/**
 * supabase.js — Integración de Fichaula con Supabase
 * ─────────────────────────────────────────────────────────
 * Adaptado al esquema real:
 *   superadmins · admins · profesores · clases · alumnos
 *   profesor_curso (pivot) · seguimientos · comentarios · papelera
 *   vistas: vista_alumnos_completa · vista_seguimientos_completa
 *
 * CONFIGURACIÓN:
 * 1. Reemplazá SUPABASE_URL y SUPABASE_KEY con los de tu proyecto
 *    (Settings → API en el panel de Supabase).
 * 2. Cargá este archivo ANTES de auth.js y los demás scripts.
 * ─────────────────────────────────────────────────────────
 */

// ╔══════════════════════════════════════════════════════════╗
// ║  1. CONFIGURACIÓN — EDITÁ ESTOS DOS VALORES             ║
// ╚══════════════════════════════════════════════════════════╝
const SUPABASE_URL = 'https://cbxejlckxkznwvlxgtde.supabase.co/rest/v1';   // ← reemplazá
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNieGVqbGNreGt6bnd2bHhndGRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczOTk0MzAsImV4cCI6MjA5Mjk3NTQzMH0.71pmkZ8-SxjDBUK5zOdUELcvrjWKjbXkDFOHn5ol6ag';                        // ← reemplazá

// ─── Cliente liviano (sin SDK, solo fetch) ───────────────────
const sb = {
  async get(tabla, query = '') {
    const url = `${SUPABASE_URL}/rest/v1/${tabla}?${query}`;
    const res = await fetch(url, { headers: _headers() });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async post(tabla, body) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${tabla}`, {
      method: 'POST',
      headers: { ..._headers(), 'Prefer': 'return=representation' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return Array.isArray(data) ? data[0] : data;
  },

  async patch(tabla, filtro, body) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${tabla}?${filtro}`, {
      method: 'PATCH',
      headers: { ..._headers(), 'Prefer': 'return=representation' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async delete(tabla, filtro) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${tabla}?${filtro}`, {
      method: 'DELETE',
      headers: _headers()
    });
    if (!res.ok) throw new Error(await res.text());
  }
};

function _headers() {
  return {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`
  };
}


// ╔══════════════════════════════════════════════════════════╗
// ║  2. AUTENTICACIÓN                                        ║
// ╚══════════════════════════════════════════════════════════╝

/**
 * Valida credenciales buscando en las 3 tablas de usuarios:
 * superadmins, admins y profesores (en ese orden de prioridad).
 * Reemplaza validarCredenciales() de auth.js.
 *
 * @param {string} email
 * @param {string} password
 * @returns {Promise<object|null>}  usuario con campo `rol` agregado, o null
 */
async function validarCredencialesDB(email, password) {
  const mail = (email || '').trim().toLowerCase();
  if (!mail || !password) return null;

  const e = encodeURIComponent(mail);
  const p = encodeURIComponent(password);

  try {
    // 1) Superadmin
    let rows = await sb.get('superadmins',
      `email=eq.${e}&password=eq.${p}&activo=eq.true&select=*`);
    if (rows.length) return { ...rows[0], rol: 'superadmin' };

    // 2) Admin
    rows = await sb.get('admins',
      `email=eq.${e}&password=eq.${p}&activo=eq.true&select=*`);
    if (rows.length) return { ...rows[0], rol: 'admin' };

    // 3) Profesor
    rows = await sb.get('profesores',
      `email=eq.${e}&password=eq.${p}&activo=eq.true&select=*`);
    if (rows.length) return { ...rows[0], rol: 'profesor' };

    return null;
  } catch (err) {
    console.error('Error al validar credenciales:', err);
    return null;
  }
}


// ╔══════════════════════════════════════════════════════════╗
// ║  3. CLASES (cursos)                                      ║
// ╚══════════════════════════════════════════════════════════╝

/**
 * Trae todas las clases activas.
 * Cada clase incluye `nombre` derivado ("1° A") para compatibilidad.
 * @returns {Promise<Array>}
 */
async function getClasesDB() {
  const clases = await sb.get('clases', 'activo=eq.true&select=*&order=anio.asc,division.asc');
  return clases.map(_normalizarClase);
}

/**
 * Trae una clase por ID, con su lista de alumnos.
 * Reemplaza getCursoById() de data.js.
 * @param {string} id  ej: '1A'
 * @returns {Promise<object|null>}
 */
async function getClaseByIdDB(id) {
  const rows = await sb.get('clases', `id=eq.${id}&select=*`);
  if (!rows.length) return null;
  const clase = _normalizarClase(rows[0]);
  clase.alumnos = await sb.get('vista_alumnos_completa',
    `curso_id=eq.${id}&select=*&order=apellido.asc`);
  return clase;
}

/**
 * Trae las clases visibles para el usuario actual.
 * - superadmin / admin: todas.
 * - profesor: solo las de la tabla pivot profesor_curso.
 * Reemplaza getCursosVisibles() de auth.js.
 * @returns {Promise<Array>}
 */
async function getClasesVisiblesDB() {
  const user = getUsuarioActual();
  if (!user) return [];

  if (user.rol === 'superadmin' || user.rol === 'admin') {
    return getClasesDB();
  }

  // Profesor → cursos asignados vía pivot
  const asignaciones = await sb.get('profesor_curso',
    `profesor_id=eq.${user.id}&select=curso_id`);
  const ids = asignaciones.map(a => a.curso_id);
  if (!ids.length) return [];

  const clases = await sb.get('clases',
    `id=in.(${ids.join(',')})&activo=eq.true&select=*&order=anio.asc,division.asc`);
  return clases.map(_normalizarClase);
}

/**
 * Agrupa las clases visibles por nivel.
 * @returns {Promise<object>}
 */
async function getClasesVisiblesPorNivelDB() {
  const clases = await getClasesVisiblesDB();
  return clases.reduce((acc, clase) => {
    if (!acc[clase.nivel]) acc[clase.nivel] = [];
    acc[clase.nivel].push(clase);
    return acc;
  }, {});
}

/**
 * ¿El usuario actual tiene acceso a esta clase?
 * Reemplaza usuarioTieneAccesoACurso() de auth.js.
 * @param {string} cursoId
 * @returns {Promise<boolean>}
 */
async function usuarioTieneAccesoAClaseDB(cursoId) {
  const user = getUsuarioActual();
  if (!user) return false;
  if (user.rol === 'superadmin' || user.rol === 'admin') return true;

  const filas = await sb.get('profesor_curso',
    `profesor_id=eq.${user.id}&curso_id=eq.${cursoId}&select=curso_id`);
  return filas.length > 0;
}

/** Agrega campos derivados ("nombre") a una fila de `clases`. */
function _normalizarClase(c) {
  return { ...c, nombre: `${c.anio}° ${c.division}` };
}


// ╔══════════════════════════════════════════════════════════╗
// ║  4. ALUMNOS                                              ║
// ╚══════════════════════════════════════════════════════════╝

/**
 * Trae los alumnos visibles para el usuario actual.
 * Usa la vista `vista_alumnos_completa` (ya trae edad y datos de clase).
 * Reemplaza la lógica de aplanar alumnos en alumnos.js.
 * @returns {Promise<Array>}
 */
async function getAlumnosVisiblesDB() {
  const user = getUsuarioActual();
  if (!user) return [];

  if (user.rol === 'superadmin' || user.rol === 'admin') {
    return sb.get('vista_alumnos_completa', 'select=*&order=apellido.asc');
  }

  // Profesor → solo alumnos de sus cursos asignados
  const asignaciones = await sb.get('profesor_curso',
    `profesor_id=eq.${user.id}&select=curso_id`);
  const ids = asignaciones.map(a => a.curso_id);
  if (!ids.length) return [];

  return sb.get('vista_alumnos_completa',
    `curso_id=in.(${ids.join(',')})&select=*&order=apellido.asc`);
}

/**
 * Trae un alumno por su legajo.
 * @param {string} legajo
 * @returns {Promise<object|null>}
 */
async function getAlumnoPorLegajoDB(legajo) {
  const rows = await sb.get('vista_alumnos_completa',
    `legajo=eq.${legajo}&select=*`);
  return rows.length ? rows[0] : null;
}


// ╔══════════════════════════════════════════════════════════╗
// ║  5. SEGUIMIENTOS                                         ║
// ╚══════════════════════════════════════════════════════════╝

/**
 * Trae todos los seguimientos de una clase.
 * Usa la vista `vista_seguimientos_completa`.
 * @param {string} cursoId
 * @returns {Promise<Array>}
 */
async function getSeguimientosDeClaseDB(cursoId) {
  return sb.get('vista_seguimientos_completa',
    `curso_id=eq.${cursoId}&select=*&order=creado_en.desc`);
}

/**
 * Trae los seguimientos de un alumno puntual.
 * @param {string} alumnoId  UUID del alumno
 * @returns {Promise<Array>}
 */
async function getSeguimientosDeAlumnoDB(alumnoId) {
  return sb.get('seguimientos',
    `alumno_id=eq.${alumnoId}&select=*&order=creado_en.desc`);
}

/**
 * Agrega un seguimiento a un alumno.
 * Solo profesores, y solo en sus cursos asignados.
 * Reemplaza agregarSeguimiento() de admin-logic.js.
 *
 * @param {string} cursoId
 * @param {string} legajo
 * @param {object} datos  { categoria, texto, valor? }
 * @returns {Promise<object>}  { ok: boolean, data?, error? }
 */
async function agregarSeguimientoDB(cursoId, legajo, datos) {
  const user = getUsuarioActual();
  if (!user) return { ok: false, error: 'Necesitás iniciar sesión.' };
  if (user.rol !== 'profesor')
    return { ok: false, error: 'Solo los profesores pueden agregar seguimientos.' };

  if (!(await usuarioTieneAccesoAClaseDB(cursoId)))
    return { ok: false, error: 'Esta clase no está asignada a tu cuenta.' };

  const { categoria, texto, valor } = datos || {};
  if (!texto?.trim()) return { ok: false, error: 'El texto no puede estar vacío.' };

  // Buscar el alumno (la vista incluye id y curso_id)
  const alumnos = await sb.get('vista_alumnos_completa',
    `legajo=eq.${legajo}&curso_id=eq.${cursoId}&select=id`);
  if (!alumnos.length) return { ok: false, error: 'Alumno no encontrado.' };

  let valorFinal = null;
  if (categoria === 'nota') {
    const n = parseFloat(valor);
    if (isNaN(n) || n < 0 || n > 10)
      return { ok: false, error: 'La nota debe ser un número entre 0 y 10.' };
    valorFinal = n;
  }

  try {
    const nuevo = await sb.post('seguimientos', {
      alumno_id:   alumnos[0].id,
      profesor_id: user.id,
      categoria,
      texto: texto.trim(),
      valor: valorFinal
    });
    return { ok: true, data: nuevo };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Elimina un seguimiento.
 * El profesor solo puede borrar los suyos; admin/superadmin cualquiera.
 *
 * @param {string} seguimientoId  UUID
 * @returns {Promise<object>}  { ok: boolean, error? }
 */
async function eliminarSeguimientoDB(seguimientoId) {
  const user = getUsuarioActual();
  if (!user) return { ok: false, error: 'Necesitás iniciar sesión.' };

  try {
    if (user.rol === 'superadmin' || user.rol === 'admin') {
      await sb.delete('seguimientos', `id=eq.${seguimientoId}`);
    } else {
      await sb.delete('seguimientos',
        `id=eq.${seguimientoId}&profesor_id=eq.${user.id}`);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}


// ╔══════════════════════════════════════════════════════════╗
// ║  6. COMENTARIOS (notas libres entre docentes)            ║
// ╚══════════════════════════════════════════════════════════╝

/**
 * Trae los comentarios de un alumno.
 * @param {string} alumnoId  UUID
 * @returns {Promise<Array>}
 */
async function getComentariosDeAlumnoDB(alumnoId) {
  return sb.get('comentarios',
    `alumno_id=eq.${alumnoId}&select=*&order=creado_en.desc`);
}

/**
 * Agrega un comentario libre sobre un alumno.
 * @param {string} alumnoId  UUID
 * @param {string} texto
 * @param {string} [visiblePara]  'profesor' | 'admin' | 'superadmin'
 * @returns {Promise<object>}  { ok, data?, error? }
 */
async function agregarComentarioDB(alumnoId, texto, visiblePara = 'profesor') {
  const user = getUsuarioActual();
  if (!user) return { ok: false, error: 'Necesitás iniciar sesión.' };
  if (user.rol !== 'profesor')
    return { ok: false, error: 'Solo los profesores pueden dejar comentarios.' };
  if (!texto?.trim()) return { ok: false, error: 'El comentario no puede estar vacío.' };

  try {
    const nuevo = await sb.post('comentarios', {
      alumno_id:    alumnoId,
      profesor_id:  user.id,
      texto:        texto.trim(),
      visible_para: visiblePara
    });
    return { ok: true, data: nuevo };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}


// ╔══════════════════════════════════════════════════════════╗
// ║  7. PANEL ADMIN — Profesores y asignación de cursos      ║
// ╚══════════════════════════════════════════════════════════╝

/**
 * Trae todos los profesores activos.
 * @returns {Promise<Array>}
 */
async function getProfesoresDB() {
  return sb.get('profesores', 'activo=eq.true&select=*&order=apellido.asc');
}

/**
 * Trae los IDs de cursos asignados a un profesor.
 * @param {string} profesorId  UUID
 * @returns {Promise<string[]>}
 */
async function getCursosDeProfesorDB(profesorId) {
  const filas = await sb.get('profesor_curso',
    `profesor_id=eq.${profesorId}&select=curso_id`);
  return filas.map(f => f.curso_id);
}

/**
 * Asigna un curso a un profesor.
 * @param {string} profesorId  UUID
 * @param {string} cursoId
 */
async function asignarCursoAProfesorDB(profesorId, cursoId) {
  try {
    await sb.post('profesor_curso',
      { profesor_id: profesorId, curso_id: cursoId });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Quita un curso a un profesor.
 * @param {string} profesorId  UUID
 * @param {string} cursoId
 */
async function quitarCursoAProfesorDB(profesorId, cursoId) {
  try {
    await sb.delete('profesor_curso',
      `profesor_id=eq.${profesorId}&curso_id=eq.${cursoId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
