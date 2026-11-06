/**
 * filtros.js — Búsqueda de alumnos y filtros de seguimientos
 * ═══════════════════════════════════════════════════════════
 * Código compartido por alumnos.js, curso.js y admin.js para que
 * las tres pantallas busquen y filtren igual.
 *
 *   - buscarAlumnos        → búsqueda por nombre, apellido, curso
 *                            y (solo dirección) legajo o DNI.
 *   - filtrarSeguimientos  → nota, alumno, profesor, fecha, categoría
 *                            y texto libre.
 *   - leerFiltros / conectarFiltros / llenarSelectFiltro
 *                          → manejo de la barra de filtros (HTML).
 *   - ETIQUETA_* / formatearFechaHora → textos de presentación.
 *
 * IMPORTANTE: acá se filtra SOLO lo que el servidor ya devolvió.
 * Qué filas puede ver cada usuario lo decide Row Level Security en
 * Supabase; ningún filtro puede traer algo que el servidor no entregó.
 *
 * No depende de otros scripts.
 * ═══════════════════════════════════════════════════════════
 */

/* ============================================================
   TEXTOS DE PRESENTACIÓN
   ============================================================ */
const ETIQUETA_CATEGORIA = {
  conducta: 'Conducta', actitud: 'Actitud', nota: 'Nota', observacion: 'Observación'
};

// Valores de la columna visible_para de un seguimiento.
const ETIQUETA_VISIBILIDAD = { admin: 'Dirección', profesor: 'Todos' };

/** "2026-08-07T15:00:00+00:00" → "07/08/2026 12:00" (hora local). */
function formatearFechaHora(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const dd = n => String(n).padStart(2, '0');
  return `${dd(d.getDate())}/${dd(d.getMonth() + 1)}/${d.getFullYear()} ${dd(d.getHours())}:${dd(d.getMinutes())}`;
}

/** Día local de una fecha ISO, como "AAAA-MM-DD" (comparable con un <input type="date">). */
function _diaLocal(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const dd = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dd(d.getMonth() + 1)}-${dd(d.getDate())}`;
}

/* ============================================================
   NORMALIZACIÓN DE TEXTO
   ============================================================ */

/**
 * Minúsculas, sin acentos, sin apóstrofos y sin espacios de más, para
 * comparar lo que escribe el usuario con los datos:
 * "Hernán " → "hernan", "D’Angelo" → "dangelo".
 * @param {*} s
 * @returns {string}
 */
function normalizarTexto(s) {
  return String(s == null ? '' : s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/['‘’´`]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Separa la consulta en palabras. Un curso escrito en partes se une:
 * "2° A", "2°a" y "2 a" quedan como "2a".
 */
function _palabrasDeBusqueda(consulta) {
  return normalizarTexto(consulta)
    .replace(/\b(\d+)\s*[°º]?\s*([a-z])(?![a-z0-9])/g, '$1$2')
    .split(/[\s,;]+/)
    .map(p => p.replace(/^\.+|\.+$/g, ''))
    .filter(Boolean);
}

/* ============================================================
   BÚSQUEDA DE ALUMNOS
   ============================================================ */

/**
 * Filtra una lista de alumnos según lo que escribió el usuario.
 * Cada palabra tiene que coincidir con algo del alumno, así que
 * "romero agustina", "Agustina Romero" y "Romero, Agustina" encuentran
 * a la misma persona, con o sin acentos.
 *
 * Una palabra coincide si:
 *   - está contenida en el nombre o en el apellido,
 *   - es el curso del alumno ("2a", "2°A", "2° A", "2 a") o solo su
 *     año ("2", "2°"),
 *   - y, solo si opciones.identificadores es true (dirección):
 *       · es su legajo ("16" y "016" son el mismo), o
 *       · es el comienzo de su DNI, con o sin puntos (4 dígitos o más).
 *
 * @param {Array<object>} lista  filas de vista_alumnos_completa
 * @param {string} consulta
 * @param {{identificadores?: boolean}} [opciones]
 * @returns {Array<object>} nueva lista, en el mismo orden
 */
function buscarAlumnos(lista, consulta, opciones) {
  const palabras = _palabrasDeBusqueda(consulta);
  if (palabras.length === 0) return lista.slice();
  const conIdentificadores = !!(opciones && opciones.identificadores);

  return lista.filter(a => {
    const nombre = normalizarTexto(a.nombre);
    const apellido = normalizarTexto(a.apellido);
    const anio = a.anio != null ? String(a.anio) : '';
    const curso = (anio && a.division)
      ? normalizarTexto(`${anio}${a.division}`)
      : normalizarTexto(a.curso_id).replace(/[°º\s]/g, '');
    const legajo = normalizarTexto(a.legajo);
    const dni = String(a.dni == null ? '' : a.dni).replace(/\D/g, '');

    return palabras.every(p => {
      if (nombre.includes(p) || apellido.includes(p)) return true;
      if (p === curso) return true;
      if (anio && p.replace(/[°º]$/, '') === anio) return true;
      if (!conIdentificadores) return false;

      const digitos = p.replace(/\./g, '');
      if (!/^\d+$/.test(digitos)) return p === legajo;
      if (/^\d+$/.test(legajo) && parseInt(digitos, 10) === parseInt(legajo, 10)) return true;
      const pareceDni = digitos.length >= 4 || p.includes('.');
      return pareceDni && dni.startsWith(digitos);
    });
  });
}

/* ============================================================
   FILTROS DE SEGUIMIENTOS
   ============================================================ */

function _numeroONull(v) {
  if (v === '' || v == null) return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

/**
 * Aplica los filtros a una lista de seguimientos (filas de
 * vista_seguimientos_completa o de vista_seguimientos_papelera).
 *
 * @param {Array<object>} lista
 * @param {object} filtros
 *   texto       palabras sueltas: buscan en texto, alumno, profesor, categoría y clase
 *   categoria   'conducta' | 'actitud' | 'nota' | 'observacion'
 *   notaMin, notaMax   rango de calificación (deja solo los de categoría "nota")
 *   alumnoId    id del alumno
 *   profesorId  id del profesor que lo cargó
 *   desde, hasta   'AAAA-MM-DD' (fecha de carga, ambos días incluidos)
 * @returns {Array<object>}
 */
function filtrarSeguimientos(lista, filtros) {
  const f = filtros || {};
  const palabras = _palabrasDeBusqueda(f.texto);
  const notaMin = _numeroONull(f.notaMin);
  const notaMax = _numeroONull(f.notaMax);

  return lista.filter(s => {
    if (f.categoria && s.categoria !== f.categoria) return false;

    if (notaMin !== null || notaMax !== null) {
      if (s.categoria !== 'nota' || s.valor == null) return false;
      const valor = Number(s.valor);
      if (notaMin !== null && valor < notaMin) return false;
      if (notaMax !== null && valor > notaMax) return false;
    }

    if (f.alumnoId && s.alumno_id !== f.alumnoId) return false;
    if (f.profesorId && s.profesor_id !== f.profesorId) return false;

    if (f.desde || f.hasta) {
      const dia = _diaLocal(s.creado_en);
      if (f.desde && dia < f.desde) return false;
      if (f.hasta && dia > f.hasta) return false;
    }

    if (palabras.length) {
      // La clase va también sin "°" ni espacio ("2a"), como la deja _palabrasDeBusqueda.
      const pajar = normalizarTexto([
        s.texto, s.alumno_apellido, s.alumno_nombre,
        s.profesor_nombre, s.profesor_apellido,
        ETIQUETA_CATEGORIA[s.categoria], s.curso_nombre,
        String(s.curso_nombre || '').replace(/[°º\s]/g, '')
      ].join(' '));
      if (!palabras.every(p => pajar.includes(p))) return false;
    }
    return true;
  });
}

/**
 * Opciones únicas {id, etiqueta} para un <select>, ordenadas por etiqueta.
 * Se arman a partir de las filas que el usuario YA puede ver.
 * @param {Array<object>} lista
 * @param {string} campoId              ej: 'profesor_id'
 * @param {function(object):string} etiquetaDe
 */
function opcionesUnicas(lista, campoId, etiquetaDe) {
  const vistos = new Map();
  lista.forEach(fila => {
    const id = fila[campoId];
    if (id && !vistos.has(id)) vistos.set(id, etiquetaDe(fila));
  });
  return Array.from(vistos, ([id, etiqueta]) => ({ id, etiqueta }))
    .sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, 'es'));
}

/* ============================================================
   BARRA DE FILTROS (HTML)
   ------------------------------------------------------------
   Cada control lleva data-filtro="<nombre>" y el botón de limpiar,
   data-filtro-limpiar. Así curso.html y admin.html comparten el
   mismo manejo sin repetir código.
   ============================================================ */

/** Lee los valores actuales: { texto, categoria, notaMin, ... }. */
function leerFiltros(contenedor) {
  const valores = {};
  contenedor.querySelectorAll('[data-filtro]').forEach(el => {
    valores[el.dataset.filtro] = el.value.trim();
  });
  return valores;
}

/** Vuelve todos los controles a su valor inicial. */
function limpiarFiltros(contenedor) {
  contenedor.querySelectorAll('[data-filtro]').forEach(el => {
    el.value = el.dataset.filtroDefecto || '';
  });
}

/**
 * Conecta la barra: avisa con alCambiar() cada vez que cambia un filtro.
 * La nota solo aplica a la categoría "Nota": al escribir un rango se
 * elige esa categoría, y al elegir otra categoría se borra el rango.
 */
function conectarFiltros(contenedor, alCambiar) {
  const categoria = contenedor.querySelector('[data-filtro="categoria"]');
  const notas = contenedor.querySelectorAll('[data-filtro="notaMin"], [data-filtro="notaMax"]');

  contenedor.querySelectorAll('[data-filtro]').forEach(el => {
    const evento = (el.tagName === 'SELECT' || el.type === 'date') ? 'change' : 'input';
    el.addEventListener(evento, () => {
      const esNota = el.dataset.filtro === 'notaMin' || el.dataset.filtro === 'notaMax';
      if (categoria && esNota && el.value !== '') categoria.value = 'nota';
      if (el === categoria && el.value !== '' && el.value !== 'nota') {
        notas.forEach(n => { n.value = ''; });
      }
      alCambiar();
    });
  });

  const limpiar = contenedor.querySelector('[data-filtro-limpiar]');
  if (limpiar) {
    limpiar.addEventListener('click', () => { limpiarFiltros(contenedor); alCambiar(); });
  }
}

/**
 * Rellena un <select> de la barra conservando lo que estaba elegido
 * (si esa opción sigue existiendo).
 * @param {HTMLSelectElement} select
 * @param {Array<{id:string, etiqueta:string}>} opciones
 * @param {string} etiquetaTodos  texto de la opción vacía
 */
function llenarSelectFiltro(select, opciones, etiquetaTodos) {
  const elegido = select.value;
  select.innerHTML = '';
  const todos = document.createElement('option');
  todos.value = '';
  todos.textContent = etiquetaTodos;
  select.appendChild(todos);
  opciones.forEach(o => {
    const opt = document.createElement('option');
    opt.value = o.id;
    opt.textContent = o.etiqueta;
    select.appendChild(opt);
  });
  select.value = opciones.some(o => o.id === elegido) ? elegido : '';
}
