/**
 * index.js — Página principal. Botones del hero según el rol.
 * Preceptor: además, popup "¿Pasar asistencia hoy?" (una vez por sesión,
 * se puede desactivar en Ajustes → Preferencias; se guarda en la cuenta)
 * y botón "Pasar asistencia" que abre el mismo popup.
 * Depende de: supabase.js, auth.js, components.js
 */
(function () {
  'use strict';

  requireAuth();
  renderNav('', false);
  renderFooter();

  const POPUP_VISTO_KEY = 'fichaula_popup_asistencia_visto';

  const user = getUsuarioActual();
  const cont = document.getElementById('hero-btns');
  if (!cont || !user) return;

  if (user.rol === 'admin' || user.rol === 'superadmin') {
    cont.innerHTML = `
      <a href="pages/admin.html" class="btn-primary">Panel de administración</a>
      <a href="pages/clases.html" class="btn-secondary">Ver clases</a>
    `;
  } else if (user.rol === 'preceptor') {
    cont.innerHTML = `
      <button type="button" class="btn-primary" id="btn-pasar-asistencia">Pasar asistencia</button>
      <a href="pages/alumnos.html" class="btn-secondary">Mis alumnos</a>
      <a href="pages/clases.html" class="btn-secondary">Mis clases</a>
    `;
    document.getElementById('btn-pasar-asistencia')
      .addEventListener('click', () => abrirPopupAsistencia({ automatico: false }));

    let yaVisto = false;
    try { yaVisto = sessionStorage.getItem(POPUP_VISTO_KEY) === '1'; } catch (_) {}
    if (user.popup_asistencia !== false && !yaVisto) {
      try { sessionStorage.setItem(POPUP_VISTO_KEY, '1'); } catch (_) {}
      abrirPopupAsistencia({ automatico: true });
    }
  } else {
    cont.innerHTML = `
      <a href="pages/alumnos.html" class="btn-primary">Mis alumnos</a>
      <a href="pages/clases.html" class="btn-secondary">Mis clases</a>
    `;
  }

  /* ─────────────── POPUP DE ASISTENCIA ─────────────── */
  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function fechaLocal() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  function fechaLarga() {
    const txt = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
    return txt.charAt(0).toUpperCase() + txt.slice(1);
  }

  function saludo() {
    const h = new Date().getHours();
    return h < 12 ? 'Buen día' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
  }

  /**
   * @param {{automatico: boolean}} opciones  automatico = se abrió solo al entrar
   *   (solo en ese caso se ofrece "No volver a preguntar").
   */
  async function abrirPopupAsistencia({ automatico }) {
    const anterior = document.getElementById('popup-asistencia');
    if (anterior) anterior.remove();

    const nombre = user.nombre ? `, ${user.nombre}` : '';
    const dialog = document.createElement('dialog');
    dialog.id = 'popup-asistencia';
    dialog.className = 'popup-asistencia';
    dialog.setAttribute('aria-labelledby', 'popup-asistencia-titulo');
    dialog.innerHTML = `
      <div class="popup-asistencia__caja">
        <button type="button" class="popup-asistencia__x" id="popup-asistencia-x" aria-label="Cerrar">✕</button>
        <div class="popup-asistencia__icono" aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            <polyline points="9 16 11 18 15 14"/>
          </svg>
        </div>
        <p class="popup-asistencia__saludo">${escapeHtml(saludo() + nombre)} 👋</p>
        <h2 id="popup-asistencia-titulo">¿Pasamos asistencia <span>hoy</span>?</h2>
        <p class="popup-asistencia__fecha">${escapeHtml(fechaLarga())} · Elegí el curso</p>

        <div class="popup-asistencia__cursos" id="popup-asistencia-cursos" role="list" aria-busy="true">
          <div class="popup-asistencia__cargando">Cargando tus cursos...</div>
        </div>
        <p class="popup-asistencia__msg" id="popup-asistencia-msg" role="status"></p>

        <div class="popup-asistencia__pie">
          ${automatico ? `
          <label class="popup-asistencia__check">
            <input type="checkbox" id="popup-asistencia-no-mostrar">
            <span>No volver a preguntar <small>(se reactiva en Ajustes)</small></span>
          </label>` : '<span></span>'}
          <button type="button" class="btn-secondary" id="popup-asistencia-cerrar">Ahora no</button>
        </div>
      </div>`;
    document.body.appendChild(dialog);

    const lista = dialog.querySelector('#popup-asistencia-cursos');
    const msg = dialog.querySelector('#popup-asistencia-msg');
    const chkNoMostrar = dialog.querySelector('#popup-asistencia-no-mostrar');

    // Si marcó "No volver a preguntar", se guarda en la cuenta antes de cerrar o ir.
    async function guardarPreferenciaSiCorresponde() {
      if (!chkNoMostrar || !chkNoMostrar.checked) return true;
      const r = await actualizarMiPopupAsistenciaDB(false);
      if (!r.ok) {
        msg.textContent = `No se pudo guardar la preferencia: ${r.error}`;
        msg.className = 'popup-asistencia__msg error';
        return false;
      }
      const sesion = getUsuarioActual();
      if (sesion) iniciarSesion({ ...sesion, popup_asistencia: false });
      return true;
    }

    async function cerrar() {
      if (await guardarPreferenciaSiCorresponde()) dialog.close();
    }

    dialog.querySelector('#popup-asistencia-cerrar').addEventListener('click', cerrar);
    dialog.querySelector('#popup-asistencia-x').addEventListener('click', cerrar);
    dialog.addEventListener('cancel', e => { e.preventDefault(); cerrar(); });   // tecla Esc
    dialog.addEventListener('click', e => { if (e.target === dialog) cerrar(); }); // clic fuera
    dialog.addEventListener('close', () => dialog.remove());

    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    dialog.querySelector('#popup-asistencia-cerrar').focus();

    try {
      const clases = await getClasesDB();   // RLS: solo los cursos a cargo del preceptor
      lista.removeAttribute('aria-busy');
      if (!clases.length) {
        lista.innerHTML = `<div class="popup-asistencia__vacio">
          Todavía no tenés cursos asignados.<br>Pedile a dirección que te asigne uno.</div>`;
        return;
      }
      let progreso = null;
      try { progreso = await getProgresoAsistenciaDB(fechaLocal(), clases.map(c => c.id)); }
      catch (_) { /* el indicador es opcional: sin él se muestran las tarjetas sin estado */ }

      // 'completa' solo si TODOS los alumnos del curso tienen asistencia hoy
      const estadoDe = c => {
        const p = progreso && progreso.get(c.id);
        if (!p) return { clase: '', texto: '', orden: 1 };
        if (!p.total) return { clase: ' popup-curso--vacio', texto: 'Sin alumnos', orden: 3 };
        if (p.registrados >= p.total) return { clase: ' popup-curso--tomada', texto: '✓ Ya registrada', orden: 2 };
        if (p.registrados > 0) return { clase: ' popup-curso--parcial', texto: `Parcial · ${p.registrados}/${p.total}`, orden: 0 };
        return { clase: '', texto: 'Pendiente', orden: 1 };
      };

      // Primero los incompletos, después los ya registrados
      const ordenadas = [...clases].sort((a, b) => estadoDe(a).orden - estadoDe(b).orden);
      lista.innerHTML = ordenadas.map(c => {
        const est = estadoDe(c);
        const extra = [c.nivel, c.turno && `Turno ${c.turno}`].filter(Boolean).join(' · ');
        return `
          <a role="listitem" class="popup-curso${est.clase}"
             href="pages/curso.html?id=${encodeURIComponent(c.id)}#asistencia">
            <span class="popup-curso__nombre">${escapeHtml(c.nombre)}</span>
            <span class="popup-curso__info">${escapeHtml(extra)}</span>
            ${est.texto ? `<span class="popup-curso__estado">${escapeHtml(est.texto)}</span>` : '<span></span>'}
            <span class="popup-curso__flecha" aria-hidden="true">→</span>
          </a>`;
      }).join('');

      lista.querySelectorAll('a.popup-curso').forEach(enlace => {
        enlace.addEventListener('click', async e => {
          e.preventDefault();
          enlace.classList.add('popup-curso--yendo');
          await guardarPreferenciaSiCorresponde();   // si falla, igual se navega
          window.location.href = enlace.href;
        });
      });

      const completas = clases.filter(c => estadoDe(c).clase.includes('tomada')).length;
      if (progreso && completas && clases.every(c => /tomada|vacio/.test(estadoDe(c).clase))) {
        msg.textContent = '¡Todo al día! Ya se registró la asistencia de hoy en tus cursos.';
        msg.className = 'popup-asistencia__msg ok';
      }
      lista.querySelector('a.popup-curso').focus();
    } catch (error) {
      lista.removeAttribute('aria-busy');
      lista.innerHTML = '';
      msg.textContent = 'No se pudieron cargar tus cursos. Revisá tu conexión e intentá de nuevo.';
      msg.className = 'popup-asistencia__msg error';
    }
  }
})();
