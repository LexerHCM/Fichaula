function normalizarEncabezado(valor) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function valorTexto(valor) {
  return String(valor ?? '').trim();
}

function parsearNombreClase(valor) {
  const match = valorTexto(valor).match(/^(\d)\s*(?:°|º)?\s*([a-z])$/i);
  if (!match) return null;
  const anio = Number(match[1]);
  if (anio < 1 || anio > 7) return null;
  return { anio, division: match[2].toUpperCase(), nombre: `${anio}° ${match[2].toUpperCase()}` };
}

function nombreClaseCanonico(valor) {
  return parsearNombreClase(valor)?.nombre || valorTexto(valor);
}

function parsearFechaImportacion(valor) {
  let fecha;
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    fecha = valor.toISOString().slice(0, 10);
  } else {
    const texto = valorTexto(valor);
    let match = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (match) fecha = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
    else {
      match = texto.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
      if (!match) return null;
      fecha = `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
    }
  }
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const comprobacion = new Date(Date.UTC(anio, mes - 1, dia));
  return comprobacion.getUTCFullYear() === anio && comprobacion.getUTCMonth() === mes - 1 && comprobacion.getUTCDate() === dia
    ? fecha
    : null;
}

function leerFilasPlanilla(workbook, XLSX) {
  const alias = {
    clases: 'clases',
    alumnos: 'alumnos',
    profesores: 'profesores',
    preceptores: 'preceptores'
  };
  const hojas = {};
  const errores = [];

  Object.entries(alias).forEach(([nombre, key]) => {
    const sheetName = workbook.SheetNames.find(name => normalizarEncabezado(name) === key);
    if (!sheetName) {
      errores.push(`Falta la pestaña "${nombre[0].toUpperCase()}${nombre.slice(1)}".`);
      return;
    }
    const sheet = workbook.Sheets[sheetName];
    hojas[key] = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
    if (key === 'preceptores' && !hojas[key].length) {
      const encabezados = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false })[0] || [];
      hojas[key] = [Object.fromEntries(encabezados.map(encabezado => [encabezado, '']))];
    }
  });

  if (errores.length) return { hojas: null, errores };
  return { hojas, errores };
}

function validarDatosPlanilla(hojas) {
  const errores = [];
  const requeridos = {
    clases: ['nombre', 'nivel', 'turno', 'aula', 'preceptor/a', 'email preceptor/a'],
    alumnos: ['nombre', 'apellido', 'clase', 'dni', 'legajo', 'fecha de nacimiento'],
    profesores: [
      'nombre', 'apellido', 'email', 'materia', 'clases asignadas', 'dni',
      'fecha de nacimiento', 'teléfono', 'contraseña temporal'
    ],
    preceptores: [
      'nombre', 'apellido', 'dni', 'fecha de nacimiento', 'teléfono', 'email',
      'contraseña temporal'
    ]
  };

  Object.entries(requeridos).forEach(([hoja, columnas]) => {
    const filas = hojas[hoja] || [];
    if (!filas.length && hoja !== 'preceptores') {
      errores.push(`${hoja}: agregá al menos una fila con datos.`);
      return;
    }
    const encabezados = new Set(Object.keys(filas[0] || {}).map(normalizarEncabezado));
    columnas.forEach(columna => {
      if (!encabezados.has(normalizarEncabezado(columna))) {
        errores.push(`${hoja}: falta la columna "${columna}".`);
      }
    });
  });
  if (errores.length) return { data: null, errores };

  const filas = hoja => (hojas[hoja] || []).map((fila, indice) => ({
    fila: indice + 2,
    valores: Object.fromEntries(Object.entries(fila).map(([clave, valor]) => [normalizarEncabezado(clave), valor]))
  })).filter(({ valores }) => Object.values(valores).some(valor => valorTexto(valor)));

  const clasesEntrada = filas('clases');
  const alumnosEntrada = filas('alumnos');
  const profesoresEntrada = filas('profesores');
  const preceptoresEntrada = filas('preceptores');
  const profesPorEmail = new Map();
  const preceptoresPorEmail = new Map();
  const clasesPorNombre = new Map();
  const dniVistos = new Set();
  const legajosVistos = new Set();

  const profesores = profesoresEntrada.map(({ fila, valores }) => {
    const nombre = valorTexto(valores.nombre);
    const apellido = valorTexto(valores.apellido);
    const email = valorTexto(valores.email).toLowerCase();
    const materia = valorTexto(valores.materia);
    const dni = valorTexto(valores.dni).replace(/[.\s-]/g, '');
    const fechaNacimiento = parsearFechaImportacion(valores['fecha de nacimiento']);
    const telefono = valorTexto(valores.telefono);
    const password = String(valores['contrasena temporal'] ?? '');
    const clasesAsignadas = valorTexto(valores['clases asignadas'])
      .split(/[;,]/).map(nombreClase => nombreClaseCanonico(nombreClase)).filter(Boolean);
    if (!nombre || !apellido || !materia || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        !/^\d{7,12}$/.test(dni) || !fechaNacimiento || !telefono || telefono.length > 30 ||
        password.trim().length < 8) {
      errores.push(`Profesores, fila ${fila}: completá nombre, apellido, email válido, materia, DNI, fecha de nacimiento, teléfono y contraseña temporal (mínimo 8 caracteres).`);
    }
    if (email && profesPorEmail.has(email)) errores.push(`Profesores, fila ${fila}: email duplicado "${email}".`);
    if (email && preceptoresPorEmail.has(email)) errores.push(`Profesores, fila ${fila}: el email "${email}" también está asignado a un preceptor.`);
    if (email) profesPorEmail.set(email, { nombre, apellido });
    return { nombre, apellido, email, materia, dni, fechaNacimiento, telefono, password, clasesAsignadas };
  });

  const preceptores = preceptoresEntrada.map(({ fila, valores }) => {
    const nombre = valorTexto(valores.nombre);
    const apellido = valorTexto(valores.apellido);
    const dni = valorTexto(valores.dni).replace(/[.\s-]/g, '');
    const fechaNacimiento = parsearFechaImportacion(valores['fecha de nacimiento']);
    const telefono = valorTexto(valores.telefono);
    const email = valorTexto(valores.email).toLowerCase();
    const password = String(valores['contrasena temporal'] ?? '');
    if (!nombre || !apellido || !/^\d{7,12}$/.test(dni) || !fechaNacimiento ||
        !telefono || telefono.length > 30 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        password.trim().length < 8) {
      errores.push(`Preceptores, fila ${fila}: completá nombre, apellido, DNI, fecha de nacimiento, teléfono, email válido y contraseña temporal (mínimo 8 caracteres).`);
    }
    if (email && (preceptoresPorEmail.has(email) || profesPorEmail.has(email))) {
      errores.push(`Preceptores, fila ${fila}: email duplicado "${email}".`);
    }
    if (email) preceptoresPorEmail.set(email, { nombre, apellido });
    return { nombre, apellido, dni, fechaNacimiento, telefono, email, password };
  });

  const clases = clasesEntrada.map(({ fila, valores }) => {
    const clase = parsearNombreClase(valores.nombre);
    const nombre = clase?.nombre || valorTexto(valores.nombre);
    const nivel = valorTexto(valores.nivel);
    const turnoEntrada = valorTexto(valores.turno);
    const turno = {
      manana: 'Mañana',
      tarde: 'Tarde',
      noche: 'Noche'
    }[normalizarEncabezado(turnoEntrada)] || turnoEntrada;
    const aula = valorTexto(valores.aula);
    const preceptor = valorTexto(valores['preceptor/a']);
    const preceptorEmail = valorTexto(valores['email preceptor/a']).toLowerCase();
    if (!clase) errores.push(`Clases, fila ${fila}: el nombre debe tener formato "1° A" a "7° Z".`);
    if (!nivel || !aula || !['manana', 'tarde', 'noche'].includes(normalizarEncabezado(turnoEntrada))) {
      errores.push(`Clases, fila ${fila}: nivel y aula son obligatorios; el turno debe ser Mañana, Tarde o Noche.`);
    }
    if (preceptorEmail && !preceptoresPorEmail.has(preceptorEmail)) {
      errores.push(`Clases, fila ${fila}: el email del preceptor no aparece en la pestaña Preceptores.`);
    }
    if (preceptor && !preceptorEmail) {
      errores.push(`Clases, fila ${fila}: indicá el email del preceptor para vincularlo con su cuenta.`);
    }
    if (preceptorEmail && preceptoresPorEmail.has(preceptorEmail) && preceptor) {
      const cuentaPreceptor = preceptoresPorEmail.get(preceptorEmail);
      if (normalizarEncabezado(`${cuentaPreceptor.nombre} ${cuentaPreceptor.apellido}`) !== normalizarEncabezado(preceptor)) {
        errores.push(`Clases, fila ${fila}: el nombre del preceptor no coincide con la cuenta del email indicado.`);
      }
    }
    const llave = clase?.nombre.toLowerCase();
    if (llave && clasesPorNombre.has(llave)) errores.push(`Clases, fila ${fila}: clase duplicada "${nombre}".`);
    if (llave) clasesPorNombre.set(llave, clase);
    return { ...clase, nombre, nivel, turno, aula, preceptor, preceptorEmail };
  });

  profesores.forEach((profesor, indice) => {
    profesor.clasesAsignadas.forEach(nombreClase => {
      if (!clasesPorNombre.has(nombreClaseCanonico(nombreClase).toLowerCase())) {
        errores.push(`Profesores, fila ${indice + 2}: la clase "${nombreClase}" no existe en la pestaña Clases.`);
      }
    });
  });

  const alumnos = alumnosEntrada.map(({ fila, valores }) => {
    const nombre = valorTexto(valores.nombre);
    const apellido = valorTexto(valores.apellido);
    const nombreClase = nombreClaseCanonico(valores.clase);
    const dni = valorTexto(valores.dni).replace(/[.\s-]/g, '');
    const legajo = valorTexto(valores.legajo);
    const fechaNacimiento = parsearFechaImportacion(valores['fecha de nacimiento']);
    if (!nombre || !apellido || !nombreClase || !/^\d{7,8}$/.test(dni) || !legajo || !fechaNacimiento) {
      errores.push(`Alumnos, fila ${fila}: completá nombre, apellido, clase, DNI (7-8 dígitos), legajo y fecha válida.`);
    }
    if (!clasesPorNombre.has(nombreClase.toLowerCase())) {
      errores.push(`Alumnos, fila ${fila}: la clase "${nombreClase}" no existe en la pestaña Clases.`);
    }
    if (dniVistos.has(dni)) errores.push(`Alumnos, fila ${fila}: DNI repetido "${dni}".`);
    if (legajosVistos.has(legajo.toLowerCase())) errores.push(`Alumnos, fila ${fila}: legajo repetido "${legajo}".`);
    if (dni) dniVistos.add(dni);
    if (legajo) legajosVistos.add(legajo.toLowerCase());
    return { nombre, apellido, clase: nombreClase, dni, legajo, fechaNacimiento };
  });

  return errores.length
    ? { data: null, errores }
    : { data: { clases, alumnos, profesores, preceptores }, errores };
}

function analizarPlanillaExcel(workbook, XLSX) {
  const leida = leerFilasPlanilla(workbook, XLSX);
  if (leida.errores.length) return { data: null, errores: leida.errores };
  return validarDatosPlanilla(leida.hojas);
}

if (typeof module !== 'undefined') {
  module.exports = { analizarPlanillaExcel, validarDatosPlanilla, parsearNombreClase, parsearFechaImportacion };
}