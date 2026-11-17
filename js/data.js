/**
 * data.js — Fuente de verdad de Fichaula v4
 * ───────────────────────────────────────────────────────────
 * Estructura:
 *   FICHAULA_ADMINS      → directivos (control total)
 *   FICHAULA_PROFESORES  → docentes (seguimiento de sus clases)
 *   FICHAULA_DATA.cursos → clases con profesorId y alumnos
 *   Cada alumno tiene un array de `seguimientos` (temporales).
 *
 * En un entorno real, esto vendría de una API REST/GraphQL.
 * Los datos viven en memoria durante la sesión del navegador.
 */

/* ============================================================
   ADMINISTRADORES (Directivos)
   ============================================================ */
const FICHAULA_ADMINS = [
  {
    id: "a1",
    email: "admin@sagradocorazon.edu.ar",
    password: "123",
    nombre: "Laura",
    apellido: "Méndez",
    cargo: "Directora",
    rol: "admin"
  }
];

/* ============================================================
   PROFESORES
   ------------------------------------------------------------
   Cada profesor tiene una lista de IDs de cursos asignados.
   IMPORTANTE: María y Lucas comparten "2A" y "4B" a propósito,
   para poder visualizar cómo dos docentes trabajan con los
   mismos alumnos.
   ============================================================ */
const FICHAULA_PROFESORES = [
  {
    id: "p1",
    email: "profe@sagradocorazon.edu.ar",
    password: "123",
    nombre: "María",
    apellido: "González",
    materia: "Matemática",
    rol: "profesor",
    cursosAsignados: ["1A", "1B", "2A", "3A", "4B"]
  },
  {
    id: "p2",
    email: "lucas@sagradocorazon.edu.ar",
    password: "123",
    nombre: "Lucas",
    apellido: "Fernández",
    materia: "Lengua y Literatura",
    rol: "profesor",
    cursosAsignados: ["2A", "2B", "4B", "5A", "6B"]
  }
];

/* ============================================================
   CURSOS Y ALUMNOS
   ------------------------------------------------------------
   profesorId: profesor "titular" del curso (para visualización).
               Los cursos pueden aparecer en cursosAsignados de
               varios profesores igualmente.
   seguimientos (en cada alumno): categorías formales
               → 'conducta' | 'actitud' | 'nota' | 'observacion'
   ============================================================ */
const FICHAULA_DATA = {
  cursos: [
    {
      id: "1A", nombre: "1° A", nivel: "Primer Año",
      turno: "Mañana", aula: "101", profesorId: "p1",
      alumnos: [
        { legajo: "001", nombre: "Agustina", apellido: "Romero", dni: "44.123.456", fechaNacimiento: "2011-03-14", seguimientos: [] },
        { legajo: "002", nombre: "Bruno",    apellido: "Fernández", dni: "44.234.567", fechaNacimiento: "2011-05-22", seguimientos: [] },
        { legajo: "003", nombre: "Camila",   apellido: "López",     dni: "44.345.678", fechaNacimiento: "2011-01-08", seguimientos: [] },
        { legajo: "004", nombre: "Diego",    apellido: "Martínez",  dni: "44.456.789", fechaNacimiento: "2011-07-30", seguimientos: [] },
        { legajo: "005", nombre: "Elena",    apellido: "García",    dni: "44.567.890", fechaNacimiento: "2011-02-17", seguimientos: [] },
        { legajo: "006", nombre: "Franco",   apellido: "Sánchez",   dni: "44.678.901", fechaNacimiento: "2011-09-05", seguimientos: [] },
        { legajo: "007", nombre: "Giuliana", apellido: "Torres",    dni: "44.789.012", fechaNacimiento: "2011-11-28", seguimientos: [] },
        { legajo: "008", nombre: "Hernán",   apellido: "Díaz",      dni: "44.890.123", fechaNacimiento: "2011-04-11", seguimientos: [] }
      ]
    },
    {
      id: "1B", nombre: "1° B", nivel: "Primer Año",
      turno: "Tarde", aula: "102", profesorId: "p1",
      alumnos: [
        { legajo: "009", nombre: "Iara",     apellido: "Moreno",   dni: "44.901.234", fechaNacimiento: "2011-06-19", seguimientos: [] },
        { legajo: "010", nombre: "Joaquín",  apellido: "Herrera",  dni: "45.012.345", fechaNacimiento: "2011-08-03", seguimientos: [] },
        { legajo: "011", nombre: "Karen",    apellido: "Ruiz",     dni: "45.123.456", fechaNacimiento: "2011-10-25", seguimientos: [] },
        { legajo: "012", nombre: "Lucas",    apellido: "Jiménez",  dni: "45.234.567", fechaNacimiento: "2011-12-12", seguimientos: [] },
        { legajo: "013", nombre: "Martina",  apellido: "Álvarez",  dni: "45.345.678", fechaNacimiento: "2011-02-07", seguimientos: [] },
        { legajo: "014", nombre: "Nicolás",  apellido: "Torres",   dni: "45.456.789", fechaNacimiento: "2011-05-16", seguimientos: [] },
        { legajo: "015", nombre: "Oriana",   apellido: "Flores",   dni: "45.567.890", fechaNacimiento: "2011-07-09", seguimientos: [] }
      ]
    },
    {
      id: "2A", nombre: "2° A", nivel: "Segundo Año",
      turno: "Mañana", aula: "201", profesorId: "p1",
      alumnos: [
        { legajo: "016", nombre: "Pablo",      apellido: "Castro",   dni: "43.678.901", fechaNacimiento: "2010-04-22", seguimientos: [] },
        { legajo: "017", nombre: "Quimey",     apellido: "Ríos",     dni: "43.789.012", fechaNacimiento: "2010-06-15", seguimientos: [] },
        { legajo: "018", nombre: "Rocío",      apellido: "Vargas",   dni: "43.890.123", fechaNacimiento: "2010-08-30", seguimientos: [] },
        { legajo: "019", nombre: "Santiago",   apellido: "Molina",   dni: "43.901.234", fechaNacimiento: "2010-01-11", seguimientos: [] },
        { legajo: "020", nombre: "Tamara",     apellido: "Ortiz",    dni: "44.012.345", fechaNacimiento: "2010-03-27", seguimientos: [] },
        { legajo: "021", nombre: "Ulises",     apellido: "Medina",   dni: "44.123.456", fechaNacimiento: "2010-09-14", seguimientos: [] },
        { legajo: "022", nombre: "Valentina",  apellido: "Gómez",    dni: "44.234.567", fechaNacimiento: "2010-11-02", seguimientos: [] },
        { legajo: "023", nombre: "Walter",     apellido: "Suárez",   dni: "44.345.678", fechaNacimiento: "2010-05-18", seguimientos: [] },
        { legajo: "024", nombre: "Ximena",     apellido: "Reyes",    dni: "44.456.789", fechaNacimiento: "2010-07-25", seguimientos: [] }
      ]
    },
    {
      id: "2B", nombre: "2° B", nivel: "Segundo Año",
      turno: "Tarde", aula: "202", profesorId: "p2",
      alumnos: [
        { legajo: "025", nombre: "Yamila",   apellido: "Cruz",     dni: "43.567.890", fechaNacimiento: "2010-10-08", seguimientos: [] },
        { legajo: "026", nombre: "Zaira",    apellido: "Núñez",    dni: "43.678.901", fechaNacimiento: "2010-12-21", seguimientos: [] },
        { legajo: "027", nombre: "Alexis",   apellido: "Pereyra",  dni: "43.789.012", fechaNacimiento: "2010-02-14", seguimientos: [] },
        { legajo: "028", nombre: "Belén",    apellido: "Aguirre",  dni: "43.890.123", fechaNacimiento: "2010-04-06", seguimientos: [] },
        { legajo: "029", nombre: "César",    apellido: "Miranda",  dni: "43.901.234", fechaNacimiento: "2010-06-29", seguimientos: [] },
        { legajo: "030", nombre: "Daiana",   apellido: "Villalba", dni: "44.012.345", fechaNacimiento: "2010-08-17", seguimientos: [] }
      ]
    },
    {
      id: "3A", nombre: "3° A", nivel: "Tercer Año",
      turno: "Mañana", aula: "301", profesorId: "p1",
      alumnos: [
        { legajo: "031", nombre: "Emanuel",  apellido: "Cabrera",  dni: "42.123.456", fechaNacimiento: "2009-03-11", seguimientos: [] },
        { legajo: "032", nombre: "Fiorella", apellido: "Benítez",  dni: "42.234.567", fechaNacimiento: "2009-05-28", seguimientos: [] },
        { legajo: "033", nombre: "Gastón",   apellido: "Ibáñez",   dni: "42.345.678", fechaNacimiento: "2009-07-04", seguimientos: [] },
        { legajo: "034", nombre: "Hilda",    apellido: "Ponce",    dni: "42.456.789", fechaNacimiento: "2009-09-19", seguimientos: [] },
        { legajo: "035", nombre: "Ignacio",  apellido: "Rojas",    dni: "42.567.890", fechaNacimiento: "2009-11-23", seguimientos: [] },
        { legajo: "036", nombre: "Julia",    apellido: "Acosta",   dni: "42.678.901", fechaNacimiento: "2009-01-16", seguimientos: [] },
        { legajo: "037", nombre: "Kevin",    apellido: "Ledesma",  dni: "42.789.012", fechaNacimiento: "2009-04-02", seguimientos: [] }
      ]
    },
    {
      id: "3B", nombre: "3° B", nivel: "Tercer Año",
      turno: "Tarde", aula: "302", profesorId: "p2",
      alumnos: [
        { legajo: "038", nombre: "Laura",    apellido: "Sandoval", dni: "42.890.123", fechaNacimiento: "2009-06-10", seguimientos: [] },
        { legajo: "039", nombre: "Marcos",   apellido: "Paredes",  dni: "42.901.234", fechaNacimiento: "2009-08-25", seguimientos: [] },
        { legajo: "040", nombre: "Natalia",  apellido: "Esquivel", dni: "43.012.345", fechaNacimiento: "2009-10-13", seguimientos: [] },
        { legajo: "041", nombre: "Omar",     apellido: "Figueroa", dni: "43.123.456", fechaNacimiento: "2009-12-07", seguimientos: [] },
        { legajo: "042", nombre: "Patricia", apellido: "Luna",     dni: "43.234.567", fechaNacimiento: "2009-02-20", seguimientos: [] },
        { legajo: "043", nombre: "Rodrigo",  apellido: "Campos",   dni: "43.345.678", fechaNacimiento: "2009-05-14", seguimientos: [] },
        { legajo: "044", nombre: "Sofía",    apellido: "Vega",     dni: "43.456.789", fechaNacimiento: "2009-07-31", seguimientos: [] },
        { legajo: "045", nombre: "Tomás",    apellido: "Mendoza",  dni: "43.567.890", fechaNacimiento: "2009-09-08", seguimientos: [] }
      ]
    },
    {
      id: "4A", nombre: "4° A", nivel: "Cuarto Año",
      turno: "Mañana", aula: "401", profesorId: "p1",
      alumnos: [
        { legajo: "046", nombre: "Úrsula",   apellido: "Coronel",  dni: "41.678.901", fechaNacimiento: "2008-04-17", seguimientos: [] },
        { legajo: "047", nombre: "Víctor",   apellido: "Soria",    dni: "41.789.012", fechaNacimiento: "2008-06-25", seguimientos: [] },
        { legajo: "048", nombre: "Wanda",    apellido: "Paz",      dni: "41.890.123", fechaNacimiento: "2008-08-12", seguimientos: [] },
        { legajo: "049", nombre: "Axel",     apellido: "Moya",     dni: "41.901.234", fechaNacimiento: "2008-10-29", seguimientos: [] },
        { legajo: "050", nombre: "Bianca",   apellido: "Ríos",     dni: "42.012.345", fechaNacimiento: "2008-12-05", seguimientos: [] }
      ]
    },
    {
      id: "4B", nombre: "4° B", nivel: "Cuarto Año",
      turno: "Tarde", aula: "402", profesorId: "p2",
      alumnos: [
        { legajo: "051", nombre: "Carlos",    apellido: "Guerrero", dni: "41.123.456", fechaNacimiento: "2008-01-22", seguimientos: [] },
        { legajo: "052", nombre: "Débora",    apellido: "Salazar",  dni: "41.234.567", fechaNacimiento: "2008-03-09", seguimientos: [] },
        { legajo: "053", nombre: "Ernesto",   apellido: "Tapia",    dni: "41.345.678", fechaNacimiento: "2008-05-26", seguimientos: [] },
        { legajo: "054", nombre: "Fernanda",  apellido: "Cáceres",  dni: "41.456.789", fechaNacimiento: "2008-07-14", seguimientos: [] },
        { legajo: "055", nombre: "Germán",    apellido: "Navarro",  dni: "41.567.890", fechaNacimiento: "2008-09-01", seguimientos: [] },
        { legajo: "056", nombre: "Ingrid",    apellido: "Palma",    dni: "41.678.901", fechaNacimiento: "2008-11-18", seguimientos: [] }
      ]
    },
    {
      id: "5A", nombre: "5° A", nivel: "Quinto Año",
      turno: "Mañana", aula: "501", profesorId: "p2",
      alumnos: [
        { legajo: "057", nombre: "Juliana",  apellido: "Espinoza", dni: "40.789.012", fechaNacimiento: "2007-02-04", seguimientos: [] },
        { legajo: "058", nombre: "Leandro",  apellido: "Carrizo",  dni: "40.890.123", fechaNacimiento: "2007-04-21", seguimientos: [] },
        { legajo: "059", nombre: "Melisa",   apellido: "Salas",    dni: "40.901.234", fechaNacimiento: "2007-06-08", seguimientos: [] },
        { legajo: "060", nombre: "Norberto", apellido: "Aranda",   dni: "41.012.345", fechaNacimiento: "2007-08-25", seguimientos: [] },
        { legajo: "061", nombre: "Olga",     apellido: "Cano",     dni: "41.123.456", fechaNacimiento: "2007-10-12", seguimientos: [] },
        { legajo: "062", nombre: "Pedro",    apellido: "Barrios",  dni: "41.234.567", fechaNacimiento: "2007-12-30", seguimientos: [] },
        { legajo: "063", nombre: "Rebeca",   apellido: "Contreras",dni: "41.345.678", fechaNacimiento: "2007-01-17", seguimientos: [] },
        { legajo: "064", nombre: "Sergio",   apellido: "Delgado",  dni: "41.456.789", fechaNacimiento: "2007-03-05", seguimientos: [] },
        { legajo: "065", nombre: "Teresa",   apellido: "Escobar",  dni: "41.567.890", fechaNacimiento: "2007-05-22", seguimientos: [] }
      ]
    },
    {
      id: "5B", nombre: "5° B", nivel: "Quinto Año",
      turno: "Tarde", aula: "502", profesorId: "p1",
      alumnos: [
        { legajo: "066", nombre: "Uriel",    apellido: "Flores",   dni: "40.678.901", fechaNacimiento: "2007-07-09", seguimientos: [] },
        { legajo: "067", nombre: "Verónica", apellido: "Gil",      dni: "40.789.012", fechaNacimiento: "2007-09-26", seguimientos: [] },
        { legajo: "068", nombre: "Wilmer",   apellido: "Heredia",  dni: "40.890.123", fechaNacimiento: "2007-11-13", seguimientos: [] },
        { legajo: "069", nombre: "Ángela",   apellido: "Ibarra",   dni: "40.901.234", fechaNacimiento: "2007-01-30", seguimientos: [] },
        { legajo: "070", nombre: "Boris",    apellido: "Jaramillo",dni: "41.012.345", fechaNacimiento: "2007-04-07", seguimientos: [] },
        { legajo: "071", nombre: "Claudia",  apellido: "Lara",     dni: "41.123.456", fechaNacimiento: "2007-06-24", seguimientos: [] }
      ]
    },
    {
      id: "6A", nombre: "6° A", nivel: "Sexto Año",
      turno: "Mañana", aula: "601", profesorId: "p1",
      alumnos: [
        { legajo: "072", nombre: "Daniel",  apellido: "Macias",   dni: "39.234.567", fechaNacimiento: "2006-08-11", seguimientos: [] },
        { legajo: "073", nombre: "Erica",   apellido: "Nava",     dni: "39.345.678", fechaNacimiento: "2006-10-28", seguimientos: [] },
        { legajo: "074", nombre: "Felipe",  apellido: "Ojeda",    dni: "39.456.789", fechaNacimiento: "2006-12-15", seguimientos: [] },
        { legajo: "075", nombre: "Gloria",  apellido: "Peña",     dni: "39.567.890", fechaNacimiento: "2006-02-02", seguimientos: [] },
        { legajo: "076", nombre: "Héctor",  apellido: "Quiroga",  dni: "39.678.901", fechaNacimiento: "2006-04-19", seguimientos: [] },
        { legajo: "077", nombre: "Isabel",  apellido: "Ramírez",  dni: "39.789.012", fechaNacimiento: "2006-06-06", seguimientos: [] },
        { legajo: "078", nombre: "Javier",  apellido: "Serrano",  dni: "39.890.123", fechaNacimiento: "2006-08-23", seguimientos: [] }
      ]
    },
    {
      id: "6B", nombre: "6° B", nivel: "Sexto Año",
      turno: "Tarde", aula: "602", profesorId: "p2",
      alumnos: [
        { legajo: "079", nombre: "Karla",   apellido: "Torres",   dni: "39.901.234", fechaNacimiento: "2006-10-10", seguimientos: [] },
        { legajo: "080", nombre: "Luis",    apellido: "Ugarte",   dni: "40.012.345", fechaNacimiento: "2006-12-27", seguimientos: [] },
        { legajo: "081", nombre: "Marina",  apellido: "Valencia", dni: "40.123.456", fechaNacimiento: "2006-01-14", seguimientos: [] },
        { legajo: "082", nombre: "Nelson",  apellido: "Wald",     dni: "40.234.567", fechaNacimiento: "2006-03-31", seguimientos: [] },
        { legajo: "083", nombre: "Ofelia",  apellido: "Yáñez",    dni: "40.345.678", fechaNacimiento: "2006-05-18", seguimientos: [] },
        { legajo: "084", nombre: "Paulo",   apellido: "Zapata",   dni: "40.456.789", fechaNacimiento: "2006-07-05", seguimientos: [] },
        { legajo: "085", nombre: "Renata",  apellido: "Alonso",   dni: "40.567.890", fechaNacimiento: "2006-09-22", seguimientos: [] },
        { legajo: "086", nombre: "Samuel",  apellido: "Bravo",    dni: "40.678.901", fechaNacimiento: "2006-11-08", seguimientos: [] }
      ]
    }
  ]
};

/* ============================================================
   HELPERS BÁSICOS (consulta pura, no dependen de sesión)
   ============================================================ */

/**
 * Obtiene un curso por su ID.
 * @param {string} id
 * @returns {object|null}
 */
function getCursoById(id) {
  return FICHAULA_DATA.cursos.find(c => c.id === id) || null;
}

/**
 * Agrupa TODOS los cursos por nivel.
 * @returns {object}
 */
function getCursosPorNivel() {
  return FICHAULA_DATA.cursos.reduce((acc, curso) => {
    if (!acc[curso.nivel]) acc[curso.nivel] = [];
    acc[curso.nivel].push(curso);
    return acc;
  }, {});
}

/**
 * Busca un profesor por su id.
 * @param {string} id
 * @returns {object|null}
 */
function getProfesorById(id) {
  return FICHAULA_PROFESORES.find(p => p.id === id) || null;
}

/**
 * Calcula la edad a partir de una fecha ISO (YYYY-MM-DD).
 * La edad se computa dinámicamente: siempre es correcta.
 * @param {string} fechaISO
 * @returns {number}
 */
function calcularEdad(fechaISO) {
  if (!fechaISO) return 0;
  const hoy = new Date();
  const nac = new Date(fechaISO);
  let edad = hoy.getFullYear() - nac.getFullYear();
  const m = hoy.getMonth() - nac.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
  return edad;
}

/**
 * Formatea una fecha ISO a formato local legible (dd/mm/yyyy).
 * @param {string} fechaISO
 * @returns {string}
 */
function formatearFecha(fechaISO) {
  if (!fechaISO) return '—';
  const [y, m, d] = fechaISO.split('-');
  return `${d}/${m}/${y}`;
}
