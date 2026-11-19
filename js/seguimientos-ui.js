/**
 * seguimientos-ui.js — Tarjetas de seguimiento y comentario compartidas
 * ───────────────────────────────────────────────────────────
 * Un mismo diseño para los seguimientos en:
 *   - curso.html  (Clases → curso → Seguimiento de alumnos)
 *   - ficha-alumno.html  (Ficha del alumno → Seguimientos)
 * Etiqueta de categoría con color, nota destacada, visibilidad
 * (Dirección / Todos), autor y fecha, y botón de eliminar con
 * confirmación en dos clics para quien tenga permiso.
 * Depende de: filtros.js (ETIQUETA_CATEGORIA, ETIQUETA_VISIBILIDAD,
 * formatearFechaHora), auth.js (puedeEliminarSeguimiento, esAdmin)
 * y supabase.js (eliminarSeguimientoDB).
 */

const SEG_CONFIRMAR_MS = 4000;  // cuánto queda armado el "¿Eliminar?" antes de volver a la normalidad

function _escSeg(valor) {
  return String(valor == null ? '' : valor)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

/** Nombre del autor de un seguimiento (profesor o preceptor). */
function nombreAutorSeguimiento(s) {
  return `${s.profesor_nombre || ''} ${s.profesor_apellido || ''}`.trim() || 'Profesor';
}

/**
 * HTML de un seguimiento.
 * @param {object} s  fila de vista_seguimientos_completa
 * @param {{mostrarAlumno?: boolean}} [opciones]
 *   mostrarAlumno: muestra avatar y nombre del alumno (en la ficha del
 *   alumno no hace falta: ya se sabe de quién es).
 */
function renderSeguimientoItem(s, opciones) {
  const mostrarAlumno = !opciones || opciones.mostrarAlumno !== false;
  const catLabel = ETIQUETA_CATEGORIA[s.categoria] || s.categoria || 'Seguimiento';
  const valorPrefix = s.categoria === 'nota' && s.valor != null
    ? `<span class="seg-nota-valor">${_escSeg(s.valor)}</span>` : '';
  const visLabel = ETIQUETA_VISIBILIDAD[s.visible_para] || s.visible_para;
  const visTitle = s.visible_para === 'profesor'
    ? 'Lo ven dirección y los profesores del curso'
    : 'Lo ven dirección y su autor';
  const alumno = mostrarAlumno && s.alumno_nombre
    ? `<div class="alumno-avatar seg-avatar">${_escSeg(((s.alumno_nombre[0] || '') + (s.alumno_apellido?.[0] || '')).toUpperCase())}</div>
       <span class="seg-alumno">${_escSeg(s.alumno_apellido)}, ${_escSeg(s.alumno_nombre)}</span>`
    : '';
  const curso = !mostrarAlumno && s.curso_nombre
    ? `<span class="seg-curso">${_escSeg(s.curso_nombre)}</span>` : '';
  const btnBorrar = typeof puedeEliminarSeguimiento === 'function' && puedeEliminarSeguimiento(s)
    ? _botonEliminarSeg(s.id, 'seguimiento')
    : '';

  return `<div class="seg-item">
    <span class="seg-cat-badge seg-cat-${_escSeg(s.categoria)}">${_escSeg(catLabel)}</span>
    <div class="seg-body">
      <div class="seg-top">
        <div class="seg-top-left">
          ${alumno}${curso}
          <span class="seg-vis-badge seg-vis-${_escSeg(s.visible_para)}" title="${visTitle}">${_escSeg(visLabel)}</span>
        </div>
        <span class="seg-meta">
          <span class="seg-autor">${_escSeg(nombreAutorSeguimiento(s))}</span><span>·</span>
          <span>${formatearFechaHora(s.creado_en)}</span>
        </span>
      </div>
      <div class="seg-texto">${valorPrefix}${_escSeg(s.texto)}</div>
    </div>
    ${btnBorrar}
  </div>`;
}

function _cancelarConfirmacionSeg(btn) {
  clearTimeout(btn._desarmar);
  btn.classList.remove('confirmar');
  btn.title = 'Eliminar';
  btn.setAttribute('aria-label', btn.dataset.etiqueta || 'Eliminar');
}

/** Botón de eliminar (mismo en seguimientos y comentarios). */
function _botonEliminarSeg(id, etiqueta) {
  return `<button class="btn-seg-eliminar" data-id="${_escSeg(id)}" data-etiqueta="Eliminar ${etiqueta}" title="Eliminar" aria-label="Eliminar ${etiqueta}">
     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
       <polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/>
     </svg>
     <span class="btn-seg-eliminar-texto">¿Eliminar?</span>
   </button>`;
}

/**
 * HTML de un comentario, con el mismo diseño que un seguimiento.
 * Muestra sobre qué es (un alumno o la clase), a quién se envió
 * (Dirección / Todos), autor, fecha y — para su autor o dirección —
 * el botón de eliminar.
 * @param {object} c  fila de vista_comentarios_completa
 * @param {{mostrarAlumno?: boolean}} [opciones]
 *   mostrarAlumno: nombre del alumno en los comentarios sobre alumnos
 *   (en su ficha no hace falta).
 */
function renderComentarioItem(c, opciones) {
  const mostrarAlumno = !opciones || opciones.mostrarAlumno !== false;
  const esDeAlumno = !!c.alumno_id;
  const tipo = esDeAlumno
    ? '<span class="seg-cat-badge com-tipo-alumno" title="Comentario sobre un alumno">Alumno</span>'
    : '<span class="seg-cat-badge com-tipo-clase" title="Comentario sobre la clase">Clase</span>';
  let destino = '';
  if (esDeAlumno && mostrarAlumno && c.alumno_nombre) {
    destino = `<div class="alumno-avatar seg-avatar">${_escSeg(((c.alumno_nombre[0] || '') + (c.alumno_apellido?.[0] || '')).toUpperCase())}</div>
       <span class="seg-alumno">${_escSeg(c.alumno_apellido)}, ${_escSeg(c.alumno_nombre)}</span>`;
  } else if (!esDeAlumno) {
    destino = `<span class="seg-alumno">${_escSeg(c.clase_nombre ? `Clase ${c.clase_nombre}` : 'Toda la clase')}</span>`;
  }
  const visLabel = ETIQUETA_VISIBILIDAD[c.visible_para] || c.visible_para;
  const visTitle = c.visible_para === 'profesor'
    ? 'Enviado a todos: dirección, docentes y preceptores del curso'
    : 'Enviado solo a dirección (y lo ve su autor)';
  const autor = `${c.autor_nombre || ''} ${c.autor_apellido || ''}`.trim() || 'Equipo escolar';
  const rolAutor = c.autor_rol === 'preceptor' ? 'Preceptor/a' : 'Docente';
  const usuario = typeof getUsuarioActual === 'function' ? getUsuarioActual() : null;
  const puedeBorrar = !!usuario && ((typeof esAdmin === 'function' && esAdmin()) || c.autor_id === usuario.id);

  return `<div class="seg-item">
    ${tipo}
    <div class="seg-body">
      <div class="seg-top">
        <div class="seg-top-left">
          ${destino}
          <span class="seg-vis-badge seg-vis-${_escSeg(c.visible_para)}" title="${visTitle}">${_escSeg(visLabel)}</span>
        </div>
        <span class="seg-meta">
          <span class="seg-autor" title="${rolAutor}">${_escSeg(autor)}</span><span>·</span>
          <span>${formatearFechaHora(c.creado_en)}</span>
        </span>
      </div>
      <div class="seg-texto">${_escSeg(c.texto)}</div>
    </div>
    ${puedeBorrar ? _botonEliminarSeg(c.id, 'comentario') : ''}
  </div>`;
}

const AYUDA_VISIBILIDAD_COMENTARIO = {
  admin: 'Solo lo ven dirección y vos.',
  profesor: 'Lo ven dirección y los docentes y preceptores del curso.'
};

/**
 * HTML del formulario para comentar (mismo diseño que el de seguimientos).
 * @param {string} prefijo  prefijo de los ids (para tener varios en una página)
 * @param {{alumnos?: Array<{id:string,nombre:string,apellido:string}>, placeholder?: string}} [opciones]
 *   alumnos: si viene, agrega el selector "Sobre" (toda la clase o un alumno).
 */
function renderFormComentario(prefijo, opciones) {
  const op = opciones || {};
  const sobre = Array.isArray(op.alumnos)
    ? `<select id="${prefijo}-sobre" class="seg-select com-sobre" aria-label="Sobre quién es el comentario">
         <option value="">Sobre toda la clase</option>
         <optgroup label="Sobre un alumno">
           ${op.alumnos.map(a => `<option value="${_escSeg(a.id)}">${_escSeg(a.apellido)}, ${_escSeg(a.nombre)}</option>`).join('')}
         </optgroup>
       </select>`
    : '';
  return `<div class="seg-form com-form" id="${prefijo}-form">
    <div class="com-form-row${sobre ? '' : ' com-form-row--solo'}">
      ${sobre}
      <textarea id="${prefijo}-texto" class="seg-input com-texto" maxlength="1000" rows="2"
                placeholder="${_escSeg(op.placeholder || 'Escribí el comentario...')}"></textarea>
    </div>
    <div class="seg-form-pie">
      <div class="seg-visibilidad">
        <span class="seg-visibilidad-label" id="${prefijo}-vis-label">Enviar a</span>
        <div class="seg-visibilidad-opciones" role="radiogroup"
             aria-labelledby="${prefijo}-vis-label" aria-describedby="${prefijo}-vis-ayuda">
          <label class="seg-vis-opcion"><input type="radio" name="${prefijo}-vis" value="admin" checked><span>Dirección</span></label>
          <label class="seg-vis-opcion"><input type="radio" name="${prefijo}-vis" value="profesor"><span>Todos</span></label>
        </div>
        <span class="seg-visibilidad-ayuda" id="${prefijo}-vis-ayuda">${AYUDA_VISIBILIDAD_COMENTARIO.admin}</span>
      </div>
      <button type="button" class="btn-seg" id="${prefijo}-agregar">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Agregar comentario
      </button>
    </div>
  </div>`;
}

/**
 * Conecta el formulario de renderFormComentario.
 * @param {string} prefijo
 * @param {{guardar: function({sobre:string, texto:string, visiblePara:string}): Promise<{ok:boolean,error?:string}>,
 *          alGuardar: function(): (void|Promise<void>), avisar: function(string, string): void}} cfg
 *   guardar: hace el alta (sobre = id de alumno, o '' para toda la clase).
 */
function conectarFormComentario(prefijo, cfg) {
  const texto = document.getElementById(`${prefijo}-texto`);
  const boton = document.getElementById(`${prefijo}-agregar`);
  const sobre = document.getElementById(`${prefijo}-sobre`);
  const ayuda = document.getElementById(`${prefijo}-vis-ayuda`);
  const radios = document.querySelectorAll(`input[name="${prefijo}-vis"]`);
  if (!texto || !boton) return;

  const elegida = () => (document.querySelector(`input[name="${prefijo}-vis"]:checked`) || {}).value || 'admin';
  radios.forEach(r => r.addEventListener('change', () => { ayuda.textContent = AYUDA_VISIBILIDAD_COMENTARIO[elegida()] || ''; }));
  if (sobre) {
    const placeholderClase = texto.placeholder;
    sobre.addEventListener('change', () => {
      const opcion = sobre.options[sobre.selectedIndex];
      texto.placeholder = sobre.value ? `Comentario sobre ${opcion.textContent}...` : placeholderClase;
    });
  }
  texto.addEventListener('input', () => texto.classList.remove('seg-campo-error'));

  boton.addEventListener('click', async () => {
    if (boton.disabled) return;
    const contenido = texto.value.trim();
    if (!contenido) {
      texto.classList.add('seg-campo-error');
      texto.focus();
      cfg.avisar('Escribí un comentario antes de agregarlo.', 'error');
      return;
    }
    boton.disabled = true;
    const r = await cfg.guardar({ sobre: sobre ? sobre.value : '', texto: contenido, visiblePara: elegida() });
    boton.disabled = false;
    if (!r.ok) { cfg.avisar(r.error || 'No se pudo guardar el comentario.', 'error'); return; }
    texto.value = '';
    // Compartir con todos es siempre una decisión explícita: vuelve a "Dirección"
    const porDefecto = document.querySelector(`input[name="${prefijo}-vis"][value="admin"]`);
    if (porDefecto) { porDefecto.checked = true; ayuda.textContent = AYUDA_VISIBILIDAD_COMENTARIO.admin; }
    await cfg.alGuardar();
  });
}

/**
 * Activa los botones de eliminar dentro de `contenedor`.
 * Eliminar pide confirmación en el mismo botón: el primer clic lo
 * transforma en "¿Eliminar?" y recién el segundo borra. El pedido se
 * desarma solo a los pocos segundos o al salir del botón, y un doble
 * clic no alcanza para confirmar.
 * @param {HTMLElement} contenedor
 * @param {{alEliminar: function(string): (void|Promise<void>), alFallar: function(string): void}} callbacks
 *   alEliminar recibe el mensaje de éxito; alFallar el de error.
 */
function conectarBorradoSeguimientos(contenedor, callbacks) {
  conectarBorrado(contenedor, {
    eliminar: (id) => eliminarSeguimientoDB(id),
    mensajeOk: () => esAdmin()
      ? 'Seguimiento movido a la papelera. Podés restaurarlo desde Panel Admin → Papelera.'
      : 'Seguimiento eliminado. Dirección puede restaurarlo desde la papelera.',
    ...callbacks
  });
}

/** Igual que conectarBorradoSeguimientos, para comentarios. */
function conectarBorradoComentarios(contenedor, callbacks) {
  conectarBorrado(contenedor, {
    eliminar: (id) => eliminarComentarioDB(id),
    mensajeOk: () => 'Comentario eliminado. Dirección puede restaurarlo desde la papelera.',
    ...callbacks
  });
}

/**
 * Borrado con confirmación en dos clics (base de las dos funciones de arriba).
 * @param {HTMLElement} contenedor
 * @param {{eliminar: function(string): Promise<{ok:boolean,error?:string}>, mensajeOk: function(): string,
 *          alEliminar: function(string), alFallar: function(string)}} cfg
 */
function conectarBorrado(contenedor, cfg) {
  const callbacks = cfg;
  contenedor.querySelectorAll('.btn-seg-eliminar').forEach(btn => {
    btn.addEventListener('blur', () => _cancelarConfirmacionSeg(btn));
    btn.addEventListener('click', async () => {
      if (btn.disabled) return;
      if (!btn.classList.contains('confirmar')) {
        btn.classList.add('confirmar');
        btn.title = 'Hacé clic otra vez para confirmar';
        btn.setAttribute('aria-label', `Confirmar: ${(btn.dataset.etiqueta || 'eliminar').toLowerCase()}`);
        btn._armadoEn = Date.now();
        btn._desarmar = setTimeout(() => _cancelarConfirmacionSeg(btn), SEG_CONFIRMAR_MS);
        return;
      }
      if (Date.now() - btn._armadoEn < 500) return;   // segundo clic de un doble clic

      clearTimeout(btn._desarmar);
      btn.disabled = true;
      const r = await callbacks.eliminar(btn.dataset.id);
      if (!r.ok) {
        btn.disabled = false;
        _cancelarConfirmacionSeg(btn);
        callbacks.alFallar(r.error);
        return;
      }
      await callbacks.alEliminar(callbacks.mensajeOk());
    });
  });
}
