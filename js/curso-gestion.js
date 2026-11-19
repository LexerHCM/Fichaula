/**
 * curso-gestion.js — Gestión completa de una clase desde pages/curso.html
 * (solo superadmin; se entra con el botón "Ver" de superadmin.html).
 *  - Datos de la clase: nombre, nivel, turno, aula.
 *  - Quién está a cargo: preceptor/a y profesores asignados; con acceso
 *    a editar los datos de cada uno.
 *  - Alumnos: alta, edición (incluye legajo y cambio de clase) y baja
 *    (la baja va a la papelera).
 * La autorización real la hace RLS en Supabase; esto es la interfaz.
 * Expone window.CursoGestion. Depende de: supabase.js, auth.js
 */
(function () {
  'use strict';

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');

  let curso = null;
  let alCambiar = async () => {};   // curso.js recarga la clase y vuelve a pintar
  let preceptores = [];
  let profesores = [];
  let asignados = [];
  let clasesColegio = [];

  /* ─────────────── MODAL GENÉRICO ─────────────── */
  /**
   * @param {{titulo, subtitulo?, cuerpo, confirmar, peligro?, alAbrir?, alConfirmar}} o
   *   alConfirmar(dialog) devuelve un mensaje de error (string) o nada si salió bien.
   */
  function abrirModal(o) {
    const dialog = document.createElement('dialog');
    dialog.className = 'gestion-modal';
    dialog.innerHTML = `
      <form method="dialog" class="gestion-modal__caja" novalidate>
        <button type="button" class="popup-asistencia__x" data-cerrar aria-label="Cerrar">✕</button>
        <h2>${o.titulo}</h2>
        ${o.subtitulo ? `<p class="gestion-modal__sub">${o.subtitulo}</p>` : ''}
        <div class="gestion-modal__cuerpo">${o.cuerpo || ''}</div>
        <p class="gestion-modal__error" role="alert"></p>
        <div class="gestion-modal__acciones">
          <button type="button" class="btn-secondary" data-cerrar>Cancelar</button>
          <button type="submit" class="btn-primary${o.peligro ? ' gestion-btn-peligro' : ''}">${esc(o.confirmar || 'Guardar')}</button>
        </div>
      </form>`;
    document.body.appendChild(dialog);
    const error = dialog.querySelector('.gestion-modal__error');
    const confirmar = dialog.querySelector('button[type="submit"]');
    dialog.querySelectorAll('[data-cerrar]').forEach(b => b.addEventListener('click', () => dialog.close()));
    dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
    dialog.addEventListener('close', () => dialog.remove());
    dialog.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault();
      if (confirmar.disabled) return;
      error.textContent = '';
      confirmar.disabled = true;
      const texto = confirmar.textContent;
      confirmar.textContent = 'Guardando...';
      let fallo;
      try { fallo = await o.alConfirmar(dialog); }
      catch (err) { fallo = err.message || 'Ocurrió un error.'; }
      if (fallo) {
        error.textContent = fallo;
        confirmar.disabled = false;
        confirmar.textContent = texto;
        return;
      }
      dialog.close();
    });
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
    if (o.alAbrir) o.alAbrir(dialog);
    const primero = dialog.querySelector('.gestion-modal__cuerpo input, .gestion-modal__cuerpo select');
    if (primero) primero.focus();
    return dialog;
  }

  const valor = (dialog, id) => dialog.querySelector(`#${id}`).value;

  function campo(id, etiqueta, value, extra) {
    return `<label class="gestion-campo"><span>${etiqueta}</span>
      <input id="${id}" value="${esc(value)}" ${extra || ''}></label>`;
  }

  function aviso(mensaje, tipo) {
    const el = document.getElementById('gestion-aviso');
    if (!el) return;
    el.textContent = mensaje;
    el.className = `seg-aviso visible ${tipo}`;
    clearTimeout(el._ocultar);
    if (tipo === 'ok') el._ocultar = setTimeout(() => { el.className = 'seg-aviso'; }, 5000);
  }

  /* ─────────────── SECCIÓN "GESTIÓN DE LA CLASE" ─────────────── */
  async function iniciar(cursoActual, opciones) {
    curso = cursoActual;
    alCambiar = opciones.alCambiar;
    const seccion = document.getElementById('gestion-section');
    seccion.hidden = false;
    seccion.innerHTML = `<div class="seg-empty">Cargando datos de gestión...</div>`;
    try {
      [preceptores, profesores, asignados, clasesColegio] = await Promise.all([
        getPreceptoresDB(curso.colegio_id),
        getProfesoresDB(curso.colegio_id),
        getProfesoresDeCursoDB(curso.id),
        curso.colegio_id ? getClasesDeColegioDB(curso.colegio_id) : Promise.resolve([curso])
      ]);
    } catch (e) {
      seccion.innerHTML = `<div class="seg-empty">No se pudieron cargar los datos de gestión: ${esc(e.message)}</div>`;
      return;
    }
    pintar();
    const btnAgregar = document.getElementById('btn-agregar-alumno');
    btnAgregar.hidden = false;
    btnAgregar.onclick = () => abrirAlumno(null);
  }

  function nombrePersona(p) { return p ? `${p.apellido}, ${p.nombre}` : ''; }

  function pintar() {
    const seccion = document.getElementById('gestion-section');
    const opcionesPreceptor = preceptores.map(p =>
      `<option value="${esc(p.id)}" ${p.id === curso.preceptor_id ? 'selected' : ''}>${esc(nombrePersona(p))}</option>`).join('');
    const chipsProfes = profesores.length
      ? profesores.map(p => `
          <div class="gestion-chip">
            <label>
              <input type="checkbox" value="${esc(p.id)}" data-profe-asignado ${asignados.includes(p.id) ? 'checked' : ''}>
              <span><strong>${esc(nombrePersona(p))}</strong><small>${esc(p.materia)}</small></span>
            </label>
            <button type="button" class="gestion-link" data-editar-profe="${esc(p.id)}" aria-label="Editar datos de ${esc(p.nombre)} ${esc(p.apellido)}">Editar</button>
          </div>`).join('')
      : '<p class="gestion-vacio">Este colegio no tiene profesores cargados.</p>';

    seccion.innerHTML = `
      <div class="seguimientos-header">
        <h2 class="seguimientos-title">Gestión de la <span>clase</span></h2>
        <span class="seguimientos-hint">Vista de superadmin — los cambios se guardan en el colegio</span>
      </div>
      <div class="seg-aviso" id="gestion-aviso" role="status"></div>
      <div class="gestion-grid">
        <div class="gestion-card">
          <h3>Datos de la clase</h3>
          <div class="gestion-form">
            ${campo('g-nombre', 'Nombre', curso.nombre, 'maxlength="40" autocomplete="off"')}
            ${campo('g-nivel', 'Nivel', curso.nivel, 'maxlength="60"')}
            <label class="gestion-campo"><span>Turno</span>
              <select id="g-turno">
                ${['Mañana', 'Tarde', 'Noche'].map(t => `<option ${t === curso.turno ? 'selected' : ''}>${t}</option>`).join('')}
              </select></label>
            ${campo('g-aula', 'Aula', curso.aula, 'maxlength="30"')}
          </div>
        </div>
        <div class="gestion-card">
          <h3>A cargo</h3>
          <div class="gestion-form">
            <div class="gestion-campo"><span>Preceptor/a</span>
              <div class="gestion-fila">
                <select id="g-preceptor"><option value="">Sin preceptor/a</option>${opcionesPreceptor}</select>
                <button type="button" class="btn-secondary gestion-btn-sm" id="g-editar-preceptor">Editar datos</button>
              </div></div>
          </div>
        </div>
        <div class="gestion-card gestion-card--ancha">
          <h3>Profesores que dictan en esta clase <small id="g-cant-profes"></small></h3>
          <p class="gestion-ayuda">Los profesores marcados ven la clase, sus alumnos y pueden cargar seguimientos.</p>
          <div class="gestion-chips">${chipsProfes}</div>
        </div>
      </div>
      <div class="gestion-pie">
        <span class="gestion-sin-guardar" id="g-sin-guardar"></span>
        <button type="button" class="btn-seg" id="g-guardar">Guardar cambios de la clase</button>
      </div>`;

    const actualizarCant = () => {
      const n = seccion.querySelectorAll('[data-profe-asignado]:checked').length;
      document.getElementById('g-cant-profes').textContent = `(${n} asignado${n === 1 ? '' : 's'})`;
    };
    actualizarCant();
    seccion.querySelectorAll('input, select').forEach(el => {
      el.addEventListener('input', () => { marcarSinGuardar(); actualizarCant(); });
      el.addEventListener('change', () => { marcarSinGuardar(); actualizarCant(); });
    });
    const syncBotones = () => {
      document.getElementById('g-editar-preceptor').disabled = !document.getElementById('g-preceptor').value;
    };
    syncBotones();
    document.getElementById('g-preceptor').addEventListener('change', syncBotones);
    document.getElementById('g-editar-preceptor').addEventListener('click', () =>
      abrirPreceptor(preceptores.find(p => p.id === document.getElementById('g-preceptor').value)));
    seccion.querySelectorAll('[data-editar-profe]').forEach(b => b.addEventListener('click', () =>
      abrirProfesor(profesores.find(p => p.id === b.dataset.editarProfe))));
    document.getElementById('g-guardar').addEventListener('click', guardarClase);
  }

  function marcarSinGuardar() {
    const el = document.getElementById('g-sin-guardar');
    if (el) el.textContent = 'Hay cambios sin guardar';
  }

  async function guardarClase() {
    const boton = document.getElementById('g-guardar');
    const nombre = document.getElementById('g-nombre').value;
    const nivel = document.getElementById('g-nivel').value;
    const aula = document.getElementById('g-aula').value;
    if (!nombre.trim() || !nivel.trim() || !aula.trim()) {
      aviso('Completá nombre, nivel y aula.', 'error');
      return;
    }
    boton.disabled = true;
    boton.textContent = 'Guardando...';
    const profes = Array.from(document.querySelectorAll('[data-profe-asignado]:checked')).map(c => c.value);
    const r1 = await modificarClaseDB(curso.id, {
      nombre, nivel, aula,
      turno: document.getElementById('g-turno').value,
      preceptorId: document.getElementById('g-preceptor').value || null
    });
    const r2 = r1.ok ? await asignarProfesoresACursoDB(curso.id, profes) : { ok: true };
    boton.disabled = false;
    boton.textContent = 'Guardar cambios de la clase';
    if (!r1.ok || !r2.ok) { aviso(`No se pudo guardar: ${(r1.ok ? r2 : r1).error}`, 'error'); return; }
    asignados = profes;
    await alCambiar();
    aviso('Cambios de la clase guardados.', 'ok');
  }

  /** Curso recargado desde curso.js: se vuelve a pintar con los datos nuevos. */
  function actualizar(cursoActual) {
    curso = cursoActual;
    pintar();
  }

  /* ─────────────── PRECEPTOR ─────────────── */
  function abrirPreceptor(p) {
    if (!p) return;
    abrirModal({
      titulo: 'Editar <span>preceptor/a</span>',
      subtitulo: 'Si cambiás el email, la próxima vez ingresa con el nuevo.',
      confirmar: 'Guardar',
      cuerpo: `
        <div class="gestion-form gestion-form--2">
          ${campo('m-nombre', 'Nombre', p.nombre, 'maxlength="100"')}
          ${campo('m-apellido', 'Apellido', p.apellido, 'maxlength="100"')}
          ${campo('m-dni', 'DNI', p.dni, 'maxlength="12" inputmode="numeric"')}
          ${campo('m-fecha', 'Fecha de nacimiento', p.fecha_nacimiento, 'type="date"')}
          ${campo('m-telefono', 'Teléfono', p.telefono, 'type="tel" maxlength="30"')}
          ${campo('m-email', 'Email', p.email, 'type="email" maxlength="254"')}
        </div>`,
      alConfirmar: async (d) => {
        const datos = {
          nombre: valor(d, 'm-nombre').trim(), apellido: valor(d, 'm-apellido').trim(),
          dni: valor(d, 'm-dni').trim(), fecha_nacimiento: valor(d, 'm-fecha'),
          telefono: valor(d, 'm-telefono').trim(), email: valor(d, 'm-email').trim().toLowerCase()
        };
        if (!datos.nombre || !datos.apellido || !datos.dni || !datos.fecha_nacimiento || !datos.telefono || !datos.email)
          return 'Completá todos los campos.';
        const r = await modificarCuentaPreceptorDB(p.id, datos);
        if (!r.ok) return r.error;
        Object.assign(p, datos);
        pintar();
        aviso(`Datos de ${datos.nombre} ${datos.apellido} guardados.`, 'ok');
      }
    });
  }

  /* ─────────────── PROFESOR ─────────────── */
  function abrirProfesor(p) {
    if (!p) return;
    abrirModal({
      titulo: 'Editar <span>profesor/a</span>',
      subtitulo: esc(`Email de acceso: ${p.email || '—'} (se cambia desde la propia cuenta del profesor).`),
      confirmar: 'Guardar',
      cuerpo: `
        <div class="gestion-form gestion-form--2">
          ${campo('m-nombre', 'Nombre', p.nombre, 'maxlength="100"')}
          ${campo('m-apellido', 'Apellido', p.apellido, 'maxlength="100"')}
          ${campo('m-materia', 'Materia', p.materia, 'maxlength="100"')}
        </div>`,
      alConfirmar: async (d) => {
        const datos = { nombre: valor(d, 'm-nombre'), apellido: valor(d, 'm-apellido'), materia: valor(d, 'm-materia') };
        const r = await modificarProfesorDB(p.id, datos);
        if (!r.ok) return r.error;
        Object.assign(p, r.data);
        pintar();
        aviso(`Datos de ${r.data.nombre} ${r.data.apellido} guardados.`, 'ok');
      }
    });
  }

  /* ─────────────── ALUMNOS ─────────────── */
  function abrirAlumno(alumnoId) {
    const a = alumnoId ? curso.alumnos.find(x => x.id === alumnoId) : null;
    const opcionesClase = clasesColegio.map(c =>
      `<option value="${esc(c.id)}" ${c.id === (a ? a.curso_id : curso.id) ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('');
    abrirModal({
      titulo: a ? 'Editar <span>alumno/a</span>' : 'Nuevo <span>alumno/a</span>',
      subtitulo: a ? esc(`${a.apellido}, ${a.nombre}`) : esc(`Se agrega a ${curso.nombre}.`),
      confirmar: a ? 'Guardar' : 'Agregar alumno',
      cuerpo: `
        <div class="gestion-form gestion-form--2">
          ${campo('m-nombre', 'Nombre', a?.nombre, 'maxlength="100"')}
          ${campo('m-apellido', 'Apellido', a?.apellido, 'maxlength="100"')}
          ${campo('m-dni', 'DNI', a?.dni, 'maxlength="12" inputmode="numeric"')}
          ${campo('m-fecha', 'Fecha de nacimiento', a?.fecha_nacimiento, 'type="date"')}
          ${campo('m-legajo', 'Legajo', a?.legajo, 'maxlength="30"')}
          <label class="gestion-campo"><span>Clase</span><select id="m-clase">${opcionesClase}</select></label>
        </div>`,
      alConfirmar: async (d) => {
        const datos = {
          nombre: valor(d, 'm-nombre').trim(), apellido: valor(d, 'm-apellido').trim(),
          dni: valor(d, 'm-dni'), fechaNacimiento: valor(d, 'm-fecha'),
          legajo: valor(d, 'm-legajo'), cursoId: valor(d, 'm-clase')
        };
        if (!datos.nombre || !datos.apellido) return 'Nombre y apellido son obligatorios.';
        const r = a ? await modificarAlumnoDB(a.id, datos) : await crearAlumnoDB(datos);
        if (!r.ok) return r.error;
        await alCambiar();
        const movido = datos.cursoId !== curso.id;
        aviso(a
          ? (movido ? `${datos.nombre} ${datos.apellido} pasó a otra clase.` : `Datos de ${datos.nombre} ${datos.apellido} guardados.`)
          : `${datos.nombre} ${datos.apellido} agregado/a.`, 'ok');
      }
    });
  }

  function eliminarAlumno(alumnoId) {
    const a = curso.alumnos.find(x => x.id === alumnoId);
    if (!a) return;
    abrirModal({
      titulo: 'Eliminar <span>alumno/a</span>',
      subtitulo: esc(`¿Eliminar a ${a.apellido}, ${a.nombre}? Va a la papelera junto con sus seguimientos y se puede restaurar por 30 días.`),
      confirmar: 'Sí, eliminar',
      peligro: true,
      cuerpo: '',
      alConfirmar: async () => {
        const r = await eliminarAlumnoDB(a.id);
        if (!r.ok) return r.error;
        await alCambiar();
        aviso(`${a.nombre} ${a.apellido} eliminado/a.`, 'ok');
      }
    });
  }

  window.CursoGestion = { iniciar, actualizar, editarAlumno: abrirAlumno, eliminarAlumno };
})();
