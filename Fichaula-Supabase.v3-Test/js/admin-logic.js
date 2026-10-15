/**
 * admin-logic.js — CRUD del panel de administración
 * ───────────────────────────────────────────────────────────
 * Operaciones sobre FICHAULA_DATA y FICHAULA_PROFESORES.
 * Todas las funciones mutan en memoria (no hay base de datos).
 * Los cambios persisten solo mientras no se recargue la página.
 *
 * Cada función verifica permisos con esAdmin() antes de mutar.
 * En caso de falta de permiso devuelve { ok:false, error:'...' }.
 *
 * Depende de: data.js, auth.js
 */

/* ============================================================
   HELPERS INTERNOS
   ============================================================ */

function _sinPermiso() {
  return { ok: false, error: 'No tenés permisos para esta acción.' };
}

function _respOk(data) {
  return { ok: true, data: data || null };
}

function _respError(msg) {
  return { ok: false, error: msg };
}

/** Genera un id de curso único a partir de nombre (ej "3° C" → "3C"). */
function _generarIdCurso(nombre) {
  const base = (nombre || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (!base) return 'X' + Date.now();
  let id = base;
  let n = 1;
  while (FICHAULA_DATA.cursos.some(c => c.id === id)) {
    id = base + '_' + (++n);
  }
  return id;
}

/** Genera el próximo legajo disponible (formato "001", "002", ...). */
function _proximoLegajo() {
  let max = 0;
  FICHAULA_DATA.cursos.forEach(c => {
    c.alumnos.forEach(a => {
      const n = parseInt(a.legajo, 10);
      if (!isNaN(n) && n > max) max = n;
    });
  });
  return String(max + 1).padStart(3, '0');
}

/* ============================================================
   CRUD DE CLASES
   ============================================================ */

/**
 * Crea una clase nueva.
 * @param {object} datos  { nombre, nivel, turno, aula, profesorId? }
 * @returns {{ok, data?, error?}}
 */
function crearClase(datos) {
  if (!esAdmin()) return _sinPermiso();

  const { nombre, nivel, turno, aula, profesorId } = datos || {};
  if (!nombre || !nivel || !turno || !aula) {
    return _respError('Faltan datos: nombre, nivel, turno o aula.');
  }
  if (FICHAULA_DATA.cursos.some(c =>
      c.nombre.toLowerCase() === nombre.toLowerCase())) {
    return _respError(`Ya existe una clase con el nombre "${nombre}".`);
  }

  const nuevo = {
    id: _generarIdCurso(nombre),
    nombre: nombre.trim(),
    nivel: nivel.trim(),
    turno: turno.trim(),
    aula: aula.trim(),
    profesorId: profesorId || null,
    alumnos: []
  };
  FICHAULA_DATA.cursos.push(nuevo);

  // Si se asignó profesor, agregar el curso a su lista también
  if (profesorId) {
    const p = getProfesorById(profesorId);
    if (p && !p.cursosAsignados.includes(nuevo.id)) {
      p.cursosAsignados.push(nuevo.id);
    }
  }

  return _respOk(nuevo);
}

/**
 * Modifica los datos generales de una clase.
 * @param {string} cursoId
 * @param {object} cambios  { nombre?, nivel?, turno?, aula?, profesorId? }
 */
function modificarClase(cursoId, cambios) {
  if (!esAdmin()) return _sinPermiso();

  const curso = getCursoById(cursoId);
  if (!curso) return _respError('Clase no encontrada.');

  // Si cambió el profesorId titular, actualizar las listas
  if (cambios.profesorId !== undefined && cambios.profesorId !== curso.profesorId) {
    // Remover de lista del profesor anterior
    if (curso.profesorId) {
      const prev = getProfesorById(curso.profesorId);
      if (prev) {
        prev.cursosAsignados = prev.cursosAsignados.filter(id => id !== cursoId);
      }
    }
    // Agregar a lista del nuevo profesor
    if (cambios.profesorId) {
      const next = getProfesorById(cambios.profesorId);
      if (next && !next.cursosAsignados.includes(cursoId)) {
        next.cursosAsignados.push(cursoId);
      }
    }
  }

  // Aplicar cambios (sin tocar id ni alumnos)
  ['nombre', 'nivel', 'turno', 'aula', 'profesorId'].forEach(k => {
    if (cambios[k] !== undefined) curso[k] = cambios[k];
  });

  return _respOk(curso);
}

/**
 * Elimina una clase (con todos sus alumnos y seguimientos).
 * @param {string} cursoId
 */
function eliminarClase(cursoId) {
  if (!esAdmin()) return _sinPermiso();

  const idx = FICHAULA_DATA.cursos.findIndex(c => c.id === cursoId);
  if (idx === -1) return _respError('Clase no encontrada.');

  const curso = FICHAULA_DATA.cursos[idx];
  FICHAULA_DATA.cursos.splice(idx, 1);

  // Quitar el curso de todos los profesores que lo tuvieran asignado
  FICHAULA_PROFESORES.forEach(p => {
    p.cursosAsignados = p.cursosAsignados.filter(id => id !== cursoId);
  });

  return _respOk(curso);
}

/* ============================================================
   CRUD DE ALUMNOS
   ============================================================ */

/**
 * Crea un alumno nuevo en una clase.
 * @param {string} cursoId
 * @param {object} datos  { nombre, apellido, dni, fechaNacimiento }
 */
function crearAlumno(cursoId, datos) {
  if (!esAdmin()) return _sinPermiso();

  const curso = getCursoById(cursoId);
  if (!curso) return _respError('Clase no encontrada.');

  const { nombre, apellido, dni, fechaNacimiento } = datos || {};
  if (!nombre || !apellido || !dni || !fechaNacimiento) {
    return _respError('Faltan datos: nombre, apellido, DNI o fecha de nacimiento.');
  }

  // Verificar que el DNI no esté usado en toda la escuela
  const dniNormalizado = dni.replace(/\./g, '');
  const duplicado = FICHAULA_DATA.cursos.some(c =>
    c.alumnos.some(a => a.dni.replace(/\./g, '') === dniNormalizado)
  );
  if (duplicado) {
    return _respError(`Ya existe un alumno con el DNI ${dni}.`);
  }

  const nuevo = {
    legajo: _proximoLegajo(),
    nombre: nombre.trim(),
    apellido: apellido.trim(),
    dni: dni.trim(),
    fechaNacimiento: fechaNacimiento,
    seguimientos: []
  };
  curso.alumnos.push(nuevo);
  return _respOk(nuevo);
}

/**
 * Modifica los datos personales de un alumno.
 * @param {string} cursoId
 * @param {string} legajo
 * @param {object} cambios  { nombre?, apellido?, dni?, fechaNacimiento? }
 */
function modificarAlumno(cursoId, legajo, cambios) {
  if (!esAdmin()) return _sinPermiso();

  const curso = getCursoById(cursoId);
  if (!curso) return _respError('Clase no encontrada.');

  const alumno = curso.alumnos.find(a => a.legajo === legajo);
  if (!alumno) return _respError('Alumno no encontrado.');

  // Si cambia el DNI, verificar unicidad
  if (cambios.dni && cambios.dni !== alumno.dni) {
    const dniNew = cambios.dni.replace(/\./g, '');
    const ocupado = FICHAULA_DATA.cursos.some(c =>
      c.alumnos.some(a =>
        a.legajo !== legajo && a.dni.replace(/\./g, '') === dniNew
      )
    );
    if (ocupado) return _respError(`El DNI ${cambios.dni} ya está en uso.`);
  }

  ['nombre', 'apellido', 'dni', 'fechaNacimiento'].forEach(k => {
    if (cambios[k] !== undefined) alumno[k] = cambios[k];
  });

  return _respOk(alumno);
}

/**
 * Elimina un alumno de una clase.
 * @param {string} cursoId
 * @param {string} legajo
 */
function eliminarAlumno(cursoId, legajo) {
  if (!esAdmin()) return _sinPermiso();

  const curso = getCursoById(cursoId);
  if (!curso) return _respError('Clase no encontrada.');

  const idx = curso.alumnos.findIndex(a => a.legajo === legajo);
  if (idx === -1) return _respError('Alumno no encontrado.');

  const alumno = curso.alumnos[idx];
  curso.alumnos.splice(idx, 1);
  return _respOk(alumno);
}

/**
 * Cambia un alumno de clase (traslado).
 * @param {string} legajo
 * @param {string} cursoOrigenId
 * @param {string} cursoDestinoId
 */
function trasladarAlumno(legajo, cursoOrigenId, cursoDestinoId) {
  if (!esAdmin()) return _sinPermiso();

  const origen  = getCursoById(cursoOrigenId);
  const destino = getCursoById(cursoDestinoId);
  if (!origen)  return _respError('Clase origen no encontrada.');
  if (!destino) return _respError('Clase destino no encontrada.');

  const idx = origen.alumnos.findIndex(a => a.legajo === legajo);
  if (idx === -1) return _respError('Alumno no encontrado en la clase origen.');

  const [alumno] = origen.alumnos.splice(idx, 1);
  destino.alumnos.push(alumno);
  return _respOk(alumno);
}

/* ============================================================
   ASIGNACIÓN DE CLASES A PROFESORES
   ============================================================ */

/**
 * Reemplaza la lista completa de cursos asignados a un profesor.
 * @param {string} profesorId
 * @param {string[]} cursoIds
 */
function asignarClasesAProfesor(profesorId, cursoIds) {
  if (!esAdmin()) return _sinPermiso();

  const profe = getProfesorById(profesorId);
  if (!profe) return _respError('Profesor no encontrado.');

  // Filtrar solo ids válidos
  const validos = (cursoIds || []).filter(id => !!getCursoById(id));
  profe.cursosAsignados = validos;

  return _respOk(profe);
}

/**
 * Agrega un curso a los asignados de un profesor.
 * @param {string} profesorId
 * @param {string} cursoId
 */
function agregarClaseAProfesor(profesorId, cursoId) {
  if (!esAdmin()) return _sinPermiso();

  const profe = getProfesorById(profesorId);
  if (!profe) return _respError('Profesor no encontrado.');
  if (!getCursoById(cursoId)) return _respError('Clase no encontrada.');

  if (!profe.cursosAsignados.includes(cursoId)) {
    profe.cursosAsignados.push(cursoId);
  }
  return _respOk(profe);
}

/**
 * Quita un curso de los asignados de un profesor.
 * @param {string} profesorId
 * @param {string} cursoId
 */
function quitarClaseAProfesor(profesorId, cursoId) {
  if (!esAdmin()) return _sinPermiso();

  const profe = getProfesorById(profesorId);
  if (!profe) return _respError('Profesor no encontrado.');

  profe.cursosAsignados = profe.cursosAsignados.filter(id => id !== cursoId);
  return _respOk(profe);
}

/* ============================================================
   SEGUIMIENTOS (los cargan los profes, admin los ve)
   ============================================================
   Un seguimiento es un registro sobre un alumno en una categoría:
     - 'conducta'     → comentario sobre comportamiento
     - 'actitud'      → comentario sobre actitud / participación
     - 'nota'         → evaluación numérica (0–10)
     - 'observacion'  → observación general libre
   ============================================================ */

const CATEGORIAS_SEGUIMIENTO = [
  { valor: 'conducta',    label: 'Conducta',    color: '#E24B4A' },
  { valor: 'actitud',     label: 'Actitud',     color: '#EF9F27' },
  { valor: 'nota',        label: 'Nota',        color: '#1D9E75' },
  { valor: 'observacion', label: 'Observación', color: '#7F77DD' }
];

let _contadorSeguimientoId = 0;

/**
 * Agrega un seguimiento sobre un alumno.
 * Permitido solo a profesores, y solo en sus cursos asignados.
 * @param {string} cursoId
 * @param {string} legajo
 * @param {object} datos  { categoria, texto, valor? (solo para 'nota') }
 */
function agregarSeguimiento(cursoId, legajo, datos) {
  const user = getUsuarioActual();
  if (!user) return _respError('Necesitás iniciar sesión.');
  if (user.rol !== 'profesor') {
    return _respError('Solo los profesores pueden agregar seguimientos.');
  }
  if (!usuarioTieneAccesoACurso(cursoId)) {
    return _respError('Esta clase no está asignada a tu cuenta.');
  }

  const curso = getCursoById(cursoId);
  if (!curso) return _respError('Clase no encontrada.');

  const alumno = curso.alumnos.find(a => a.legajo === legajo);
  if (!alumno) return _respError('Alumno no encontrado.');

  const { categoria, texto, valor } = datos || {};
  const catValida = CATEGORIAS_SEGUIMIENTO.some(c => c.valor === categoria);
  if (!catValida) return _respError('Categoría inválida.');
  if (!texto || !texto.trim()) return _respError('El texto no puede estar vacío.');

  // Para 'nota', valor debe ser numérico entre 0 y 10
  let valorFinal = null;
  if (categoria === 'nota') {
    const n = parseFloat(valor);
    if (isNaN(n) || n < 0 || n > 10) {
      return _respError('La nota debe ser un número entre 0 y 10.');
    }
    valorFinal = n;
  }

  const nuevo = {
    id: ++_contadorSeguimientoId,
    categoria,
    texto: texto.trim(),
    valor: valorFinal,
    autorId: user.id,
    autorNombre: `${user.nombre} ${user.apellido}`,
    autorMateria: user.materia || '',
    fecha: new Date().toISOString()
  };
  alumno.seguimientos.push(nuevo);
  return _respOk(nuevo);
}

/**
 * Elimina un seguimiento por id.
 * Un profesor solo puede borrar los suyos; un admin puede borrar cualquiera.
 * @param {string} cursoId
 * @param {string} legajo
 * @param {number} seguimientoId
 */
function eliminarSeguimiento(cursoId, legajo, seguimientoId) {
  const user = getUsuarioActual();
  if (!user) return _respError('Necesitás iniciar sesión.');

  const curso = getCursoById(cursoId);
  if (!curso) return _respError('Clase no encontrada.');

  const alumno = curso.alumnos.find(a => a.legajo === legajo);
  if (!alumno) return _respError('Alumno no encontrado.');

  const idx = alumno.seguimientos.findIndex(s => s.id === seguimientoId);
  if (idx === -1) return _respError('Seguimiento no encontrado.');

  const seg = alumno.seguimientos[idx];
  // Profesor solo puede borrar los suyos; admin siempre puede
  if (user.rol === 'profesor' && seg.autorId !== user.id) {
    return _respError('Solo podés eliminar tus propios seguimientos.');
  }

  alumno.seguimientos.splice(idx, 1);
  return _respOk(seg);
}

/**
 * Devuelve todos los seguimientos del sistema, enriquecidos con
 * datos del curso y alumno. Útil para la vista global del admin.
 * @returns {Array}
 */
function getTodosLosSeguimientos() {
  const out = [];
  FICHAULA_DATA.cursos.forEach(curso => {
    curso.alumnos.forEach(alumno => {
      alumno.seguimientos.forEach(seg => {
        out.push({
          ...seg,
          cursoId: curso.id,
          cursoNombre: curso.nombre,
          alumnoLegajo: alumno.legajo,
          alumnoNombre: `${alumno.apellido}, ${alumno.nombre}`
        });
      });
    });
  });
  return out.sort((a, b) => b.fecha.localeCompare(a.fecha));
}
