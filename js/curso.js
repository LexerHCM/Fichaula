/**
 * curso.js — Detalle de un curso.
 *  - Tabla de alumnos (sin legajo si es profesor).
 *  - Seguimientos: profe puede agregar, admin solo lee.
 *  - Bloqueo si el curso no está asignado al usuario.
 */
(function () {
  'use strict';

  requireAuth();
  renderNav('clases', true);
  renderFooter();

  // Botones "Volver a clases" (HTML los tiene sin onclick por modularización)
  const btnBackTop = document.getElementById('btn-back-top');
  const btnBackBot = document.getElementById('btn-back-bottom');
  if (btnBackTop) btnBackTop.addEventListener('click', () => history.back());
  if (btnBackBot) btnBackBot.addEventListener('click', () => history.back());

  const user = getUsuarioActual();
  const verLegajo = puedeVerLegajo();
  const puedeAgregar = puedeAgregarSeguimiento();

  const params = new URLSearchParams(window.location.search);
  const cursoId = params.get('id');
  const curso = cursoId ? getCursoById(cursoId) : null;

  // Validaciones de acceso
  if (!curso) {
    document.getElementById('curso-header').innerHTML = `
      <p style="color:var(--white-40);margin-top:16px;">
        Curso no encontrado.
        <a href="clases.html" style="color:var(--violet-light);">Ver todos los cursos</a>.
      </p>`;
    return;
  }

  if (!usuarioTieneAccesoACurso(cursoId)) {
    document.getElementById('curso-header').innerHTML = `
      <div class="badge acceso-denegado-badge">ACCESO DENEGADO</div>
      <h1 class="page-title">Curso <span>${curso.nombre}</span></h1>
      <p class="page-subtitle" style="margin-top:20px;">
        No tenés asignado este curso.
        <a href="clases.html" style="color:var(--violet-light);">Ver tus clases</a>.
      </p>`;
    return;
  }

  document.title = `${curso.nombre} — Fichaula`;

  // ── HEADER DEL CURSO ──
  document.getElementById('curso-header').innerHTML = `
    <div class="badge">${curso.nivel.toUpperCase()}</div>
    <h1 class="page-title">Curso <span>${curso.nombre}</span></h1>
    <div class="page-meta-pills">
      <span class="meta-pill violet">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
        </svg>
        ${curso.alumnos.length} alumnos
      </span>
      <span class="meta-pill">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
        </svg>
        Turno ${curso.turno}
      </span>
      <span class="meta-pill">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        </svg>
        Aula ${curso.aula}
      </span>
    </div>`;

  // ── TABLA DE ALUMNOS ──
  const thead = document.getElementById('thead-row');
  thead.innerHTML = verLegajo
    ? `<th>#</th><th>Legajo</th><th>Nombre y Apellido</th><th>Edad</th><th>DNI</th>`
    : `<th>#</th><th>Nombre y Apellido</th><th>Edad</th>`;

  function iniciales(n, ap) { return (n[0] + ap[0]).toUpperCase(); }

  function crearFila(a, i) {
    const edad = calcularEdad(a.fechaNacimiento);
    const nombre = `
      <td>
        <div class="alumno-nombre-cell">
          <div class="alumno-avatar">${iniciales(a.nombre, a.apellido)}</div>
          <span>${a.apellido}, ${a.nombre}</span>
        </div>
      </td>`;
    if (verLegajo) {
      return `<tr>
        <td style="color:var(--white-40);font-size:13px;">${i + 1}</td>
        <td><span class="legajo-badge">${a.legajo}</span></td>
        ${nombre}
        <td style="font-size:13px;">${edad} años</td>
        <td style="font-family:'Courier New',monospace;font-size:13px;">${a.dni}</td>
      </tr>`;
    }
    return `<tr>
      <td style="color:var(--white-40);font-size:13px;">${i + 1}</td>
      ${nombre}
      <td style="font-size:13px;">${edad} años</td>
    </tr>`;
  }

  function actualizarContador(n) {
    document.getElementById('alumnos-count-label').innerHTML =
      `Mostrando <strong>${n}</strong> de <strong>${curso.alumnos.length}</strong> alumnos`;
  }

  function renderAlumnos(lista) {
    const tbody = document.getElementById('alumnos-tbody');
    const colspan = verLegajo ? 5 : 3;
    tbody.innerHTML = lista.length === 0
      ? `<tr><td colspan="${colspan}" class="no-results">No se encontraron alumnos.</td></tr>`
      : lista.map((a, i) => crearFila(a, i)).join('');
    actualizarContador(lista.length);
  }

  function filtrarAlumnos(q) {
    const term = q.toLowerCase().trim();
    if (!term) { renderAlumnos(curso.alumnos); return; }
    renderAlumnos(curso.alumnos.filter(a =>
      a.nombre.toLowerCase().includes(term) ||
      a.apellido.toLowerCase().includes(term) ||
      (verLegajo && a.legajo.includes(term))
    ));
  }

  document.getElementById('search-input').addEventListener('input', e => filtrarAlumnos(e.target.value));
  renderAlumnos(curso.alumnos);

  // ════════════════════════════════════════════════════════
  // SEGUIMIENTOS
  // ════════════════════════════════════════════════════════
  const secSeg = document.getElementById('seguimientos-section');
  secSeg.style.display = 'block';

  const formWrap = document.getElementById('seg-form-wrapper');
  const hint = document.getElementById('seguimientos-hint');

  if (!puedeAgregar) {
    // Admin: ocultar formulario, ajustar hint
    formWrap.style.display = 'none';
    hint.textContent = 'Solo lectura — los seguimientos los cargan los profesores';
  }

  // Poblar select de alumnos (solo si hay form)
  if (puedeAgregar) {
    const sel = document.getElementById('seg-alumno');
    curso.alumnos.forEach(a => {
      const opt = document.createElement('option');
      opt.value = a.legajo;
      opt.textContent = `${a.apellido}, ${a.nombre}`;
      sel.appendChild(opt);
    });

    // Habilitar/deshabilitar campo "valor" según categoría
    const selCat = document.getElementById('seg-categoria');
    const inpVal = document.getElementById('seg-valor');
    selCat.addEventListener('change', () => {
      if (selCat.value === 'nota') {
        inpVal.disabled = false;
        inpVal.focus();
      } else {
        inpVal.disabled = true;
        inpVal.value = '';
      }
    });

    document.getElementById('btn-agregar-seg').addEventListener('click', agregarSeg);

    document.getElementById('seg-texto').addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); agregarSeg(); }
    });
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatearHora(iso) {
    const d = new Date(iso);
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }

  function recolectarTodosLosSeguimientos() {
    const all = [];
    curso.alumnos.forEach(a => {
      a.seguimientos.forEach(s => {
        all.push({ ...s, _legajo: a.legajo, _nombre: a.nombre, _apellido: a.apellido });
      });
    });
    // más nuevos primero
    return all.sort((a, b) => b.fecha.localeCompare(a.fecha));
  }

  function renderSeguimientos() {
    const lista = document.getElementById('seguimientos-list');
    const todos = recolectarTodosLosSeguimientos();

    if (todos.length === 0) {
      lista.innerHTML = `<div class="seg-empty">
        ${puedeAgregar
          ? 'Todavía no hay seguimientos en esta clase.<br>Agregá el primero usando el formulario de arriba.'
          : 'Todavía no hay seguimientos cargados en esta clase.'}
      </div>`;
      return;
    }

    lista.innerHTML = todos.map(s => {
      const ini = (s._nombre[0] + s._apellido[0]).toUpperCase();
      const catLabel = {
        conducta: 'Conducta', actitud: 'Actitud',
        nota: 'Nota', observacion: 'Observación'
      }[s.categoria] || s.categoria;

      const valorPrefix = s.categoria === 'nota'
        ? `<span class="seg-nota-valor">${s.valor}</span>`
        : '';

      // Profe puede borrar solo los suyos; admin puede borrar todo (pero como decisión de UX, en admin no mostramos el botón borrar para no confundir el rol — admin es solo lectura)
      const puedeBorrar = puedeAgregar && s.autorId === user.id;
      const btnBorrar = puedeBorrar
        ? `<button class="btn-seg-eliminar" data-legajo="${s._legajo}" data-id="${s.id}" title="Eliminar">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
               <polyline points="3 6 5 6 21 6"/>
               <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/>
             </svg>
           </button>`
        : '';

      return `<div class="seg-item">
        <span class="seg-cat-badge seg-cat-${s.categoria}">${catLabel}</span>
        <div class="seg-body">
          <div class="seg-top">
            <div class="seg-top-left">
              <div class="alumno-avatar" style="width:28px;height:28px;font-size:10px;">${ini}</div>
              <span class="seg-alumno">${s._apellido}, ${s._nombre}</span>
            </div>
            <span class="seg-meta">
              <span class="seg-autor">${escapeHtml(s.autorNombre)}</span>
              <span>·</span>
              <span>${formatearHora(s.fecha)}</span>
            </span>
          </div>
          <div class="seg-texto">${valorPrefix}${escapeHtml(s.texto)}</div>
        </div>
        ${btnBorrar}
      </div>`;
    }).join('');

    // Listeners de eliminar
    lista.querySelectorAll('.btn-seg-eliminar').forEach(btn => {
      btn.addEventListener('click', () => {
        const legajo = btn.dataset.legajo;
        const id = parseInt(btn.dataset.id, 10);
        const r = eliminarSeguimiento(cursoId, legajo, id);
        if (!r.ok) alert(r.error);
        renderSeguimientos();
      });
    });
  }

  function agregarSeg() {
    const legajo = document.getElementById('seg-alumno').value;
    const categoria = document.getElementById('seg-categoria').value;
    const texto = document.getElementById('seg-texto').value.trim();
    const valor = document.getElementById('seg-valor').value;

    // limpiar errores visuales
    ['seg-alumno', 'seg-categoria', 'seg-texto', 'seg-valor'].forEach(id => {
      document.getElementById(id).style.borderColor = '';
    });

    if (!legajo) {
      document.getElementById('seg-alumno').style.borderColor = '#E24B4A'; return;
    }
    if (!categoria) {
      document.getElementById('seg-categoria').style.borderColor = '#E24B4A'; return;
    }
    if (categoria === 'nota' && !valor) {
      document.getElementById('seg-valor').style.borderColor = '#E24B4A'; return;
    }
    if (!texto) {
      document.getElementById('seg-texto').style.borderColor = '#E24B4A'; return;
    }

    const r = agregarSeguimiento(cursoId, legajo, { categoria, texto, valor });
    if (!r.ok) {
      alert(r.error);
      return;
    }

    // Reset form
    document.getElementById('seg-texto').value = '';
    document.getElementById('seg-valor').value = '';
    document.getElementById('seg-categoria').value = '';
    document.getElementById('seg-alumno').value = '';
    document.getElementById('seg-valor').disabled = true;
    renderSeguimientos();
  }

  renderSeguimientos();
})();
