/**
 * ajustes.js — Ajustes de la cuenta propia (pages/ajustes.html)
 * Secciones (menú lateral, una visible a la vez, reflejada en el #hash):
 *  - Perfil:        foto + datos personales (lectura → "Editar datos" despliega el formulario)
 *  - Seguridad:     email y contraseña, cada uno detrás de su botón
 *  - Preferencias:  reducir animaciones, tamaño de letra, vista clásica (superadmin)
 *  - Sesión/cuenta: colegio, alta, último ingreso, cerrar sesión (local / global)
 * Depende de: supabase.js, auth.js, components.js
 */
(function () {
  'use strict';

  requireAuth();
  const usuario = getUsuarioActual();
  if (!usuario) return;

  renderNav('ajustes', true);
  renderFooter();

  const SECCIONES = ['perfil', 'seguridad', 'preferencias', 'sesion'];
  const VISTA_CLASICA_KEY = 'fichaula_sa_vista_clasica';
  const ROLES = {
    superadmin: 'Superadministrador',
    admin: 'Dirección / Administración',
    profesor: 'Profesor/a',
    preceptor: 'Preceptor/a'
  };

  const $ = (id) => document.getElementById(id);
  let perfil = null;
  let cuentaCargada = false;

  /* ── Utilidades ───────────────────────────────────────── */
  function mostrarMsg(id, texto, tipo) {
    const el = $(id);
    el.textContent = texto || '';
    el.className = `ajustes-msg${tipo ? ` ajustes-msg--${tipo}` : ''}`;
  }

  function ocupado(boton, si, textoOcupado) {
    if (si) {
      boton.dataset.texto = boton.textContent;
      boton.textContent = textoOcupado;
    } else if (boton.dataset.texto) {
      boton.textContent = boton.dataset.texto;
    }
    boton.disabled = si;
  }

  function formatearFecha(valor, conHora) {
    if (!valor) return '—';
    // Fechas 'YYYY-MM-DD' sin hora: armarlas en hora local para no correrlas un día
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(valor)
      ? new Date(...valor.split('-').map((n, i) => i === 1 ? Number(n) - 1 : Number(n)))
      : new Date(valor);
    if (Number.isNaN(fecha.getTime())) return '—';
    return fecha.toLocaleString('es-AR', conHora
      ? { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }
      : { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  /** Guarda el perfil en la sesión y refresca el nav (nombre/foto). */
  function refrescarSesion(nuevo) {
    perfil = { ...perfil, ...nuevo, rol: usuario.rol };
    iniciarSesion(perfil);
    renderNav('ajustes', true);
  }

  /* ── Navegación por secciones ─────────────────────────── */
  function mostrarSeccion(nombre) {
    if (!SECCIONES.includes(nombre)) nombre = 'perfil';
    document.querySelectorAll('.ajustes-seccion').forEach(sec => {
      sec.hidden = sec.dataset.seccion !== nombre;
    });
    document.querySelectorAll('.ajustes-menu__btn').forEach(btn => {
      const activo = btn.dataset.ir === nombre;
      btn.classList.toggle('activo', activo);
      if (activo) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    });
    if (nombre === 'sesion' && !cuentaCargada) cargarCuenta();
  }

  document.querySelectorAll('.ajustes-menu__btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (location.hash !== `#${btn.dataset.ir}`) location.hash = btn.dataset.ir;
      else mostrarSeccion(btn.dataset.ir);
    });
  });
  window.addEventListener('hashchange', () => mostrarSeccion(location.hash.slice(1)));

  /* ── Paneles plegables ────────────────────────────────── */
  // nombre → { boton, panel, msg, alAbrir, alCerrar }
  const paneles = {};

  function registrarPanel(nombre, opciones) {
    paneles[nombre] = opciones;
    opciones.boton.addEventListener('click', () => {
      if (opciones.panel.hidden) abrirPanel(nombre);
      else cerrarPanel(nombre);
    });
  }

  function abrirPanel(nombre) {
    const p = paneles[nombre];
    // En una misma tarjeta de lista (Seguridad / Sesión) solo un panel abierto a la vez
    const grupo = p.panel.closest('.ajustes-card--lista');
    if (grupo) {
      Object.keys(paneles).forEach(otro => {
        if (otro !== nombre && paneles[otro].panel.closest('.ajustes-card--lista') === grupo) cerrarPanel(otro);
      });
    }
    if (p.alAbrir) p.alAbrir();
    p.panel.hidden = false;
    p.boton.setAttribute('aria-expanded', 'true');
    if (p.ocultarBoton) p.boton.hidden = true;
    if (p.msg) mostrarMsg(p.msg, '');
    const primero = p.panel.querySelector('input:not([readonly]), button');
    if (primero) primero.focus();
  }

  function cerrarPanel(nombre) {
    const p = paneles[nombre];
    if (p.panel.hidden) return;
    p.panel.hidden = true;
    p.boton.setAttribute('aria-expanded', 'false');
    p.boton.hidden = false;
    const form = p.panel.querySelector('form');
    if (form) form.reset();
    p.panel.querySelectorAll('input[data-visible]').forEach(input => alternarVisibilidad(input, false));
    if (p.alCerrar) p.alCerrar();
  }

  document.querySelectorAll('[data-cancelar]').forEach(btn => {
    btn.addEventListener('click', () => {
      const nombre = btn.dataset.cancelar;
      cerrarPanel(nombre);
      paneles[nombre].boton.focus();
    });
  });

  /* ── Mostrar / ocultar contraseñas ────────────────────── */
  function alternarVisibilidad(input, visible) {
    input.type = visible ? 'text' : 'password';
    if (visible) input.dataset.visible = '1'; else delete input.dataset.visible;
    const ojo = document.querySelector(`[data-ojo="${input.id}"]`);
    if (ojo) {
      ojo.setAttribute('aria-label', visible ? 'Ocultar contraseña' : 'Mostrar contraseña');
      ojo.classList.toggle('activo', visible);
    }
  }
  document.querySelectorAll('[data-ojo]').forEach(ojo => {
    ojo.addEventListener('click', () => {
      const input = $(ojo.dataset.ojo);
      alternarVisibilidad(input, input.type === 'password');
    });
  });

  /* ── Medidor de seguridad de contraseña ───────────────── */
  function evaluarPassword(texto) {
    if (!texto) return { nivel: 0, etiqueta: 'Mínimo 8 caracteres.' };
    if (texto.length < 8) return { nivel: 1, etiqueta: `Muy débil · faltan ${8 - texto.length} caracteres` };
    let puntos = 0;
    if (texto.length >= 12) puntos++;
    if (/[a-z]/.test(texto) && /[A-Z]/.test(texto)) puntos++;
    if (/\d/.test(texto)) puntos++;
    if (/[^A-Za-z0-9]/.test(texto)) puntos++;
    if (puntos <= 1) return { nivel: 2, etiqueta: 'Débil · sumá mayúsculas, números o símbolos' };
    if (puntos === 2) return { nivel: 3, etiqueta: 'Media' };
    return { nivel: 4, etiqueta: 'Fuerte' };
  }
  function actualizarMedidor() {
    const { nivel, etiqueta } = evaluarPassword($('aj-pass-nueva').value);
    $('medidor').dataset.nivel = String(nivel);
    $('medidor-texto').textContent = etiqueta;
  }
  $('aj-pass-nueva').addEventListener('input', actualizarMedidor);

  /* ── Perfil: lectura y formulario ─────────────────────── */
  function pintarLectura() {
    $('lec-nombre').textContent = perfil.nombre || '—';
    $('lec-apellido').textContent = perfil.apellido || '—';
    $('lec-telefono').textContent = perfil.telefono || '—';
    $('lec-fecha').textContent = formatearFecha(perfil.fecha_nacimiento);
    $('lec-rol').textContent = usuario.rol === 'admin' && perfil.cargo ? perfil.cargo : (ROLES[usuario.rol] || usuario.rol);
    const extra = usuario.rol === 'profesor' ? ['Materia', perfil.materia]
      : usuario.rol === 'preceptor' ? ['DNI', perfil.dni]
      : null;
    if (extra && extra[1]) {
      $('lec-extra-label').textContent = extra[0];
      $('lec-extra').textContent = extra[1];
      $('lec-extra-wrap').hidden = false;
    }
    $('aj-email-actual').textContent = perfil.email || '';
  }

  function llenarFormularioDatos() {
    $('aj-nombre').value = perfil.nombre || '';
    $('aj-apellido').value = perfil.apellido || '';
    $('aj-telefono').value = perfil.telefono || '';
    $('aj-fecha').value = perfil.fecha_nacimiento || '';
    $('aj-fecha').max = new Date().toISOString().slice(0, 10);
    const obligatorio = usuario.rol === 'preceptor';
    $('aj-telefono').required = obligatorio;
    $('aj-fecha').required = obligatorio;
  }

  async function pintarAvatar() {
    const avatar = $('ajustes-avatar');
    avatar.textContent = `${(perfil.nombre || '?')[0]}${(perfil.apellido || '')[0] || ''}`.toUpperCase();
    $('btn-quitar-foto').hidden = !perfil.foto_path;
    if (!perfil.foto_path) return;
    try {
      const url = await getUrlFotoPerfil(perfil.foto_path);
      const img = new Image();
      img.alt = 'Tu foto de perfil';
      img.onload = () => { avatar.textContent = ''; avatar.appendChild(img); };
      img.src = url;
    } catch (_) { /* quedan las iniciales */ }
  }

  registrarPanel('datos', {
    boton: $('btn-editar-datos'),
    panel: $('panel-datos'),
    msg: 'msg-datos',
    ocultarBoton: true,
    alAbrir: () => { llenarFormularioDatos(); $('datos-lectura').hidden = true; },
    alCerrar: () => { $('datos-lectura').hidden = false; }
  });

  $('form-datos').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!perfil) return;
    const datos = {
      nombre: $('aj-nombre').value,
      apellido: $('aj-apellido').value,
      telefono: $('aj-telefono').value,
      fechaNacimiento: $('aj-fecha').value,
      fotoPath: perfil.foto_path || null
    };
    if (usuario.rol === 'preceptor' && (!datos.telefono.trim() || !datos.fechaNacimiento)) {
      mostrarMsg('msg-datos', 'El teléfono y la fecha de nacimiento son obligatorios.', 'error');
      return;
    }
    const boton = $('btn-guardar-datos');
    ocupado(boton, true, 'Guardando...');
    const r = await actualizarMiPerfilDB(datos);
    ocupado(boton, false);
    if (!r.ok) { mostrarMsg('msg-datos', r.error, 'error'); return; }
    refrescarSesion(r.data);
    pintarLectura();
    pintarAvatar();
    cerrarPanel('datos');
    mostrarMsg('msg-datos', 'Datos guardados.', 'ok');
  });

  /* ── Foto ─────────────────────────────────────────────── */
  $('btn-cambiar-foto').addEventListener('click', () => $('input-foto').click());

  $('input-foto').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file || !perfil) return;
    const boton = $('btn-cambiar-foto');
    ocupado(boton, true, 'Subiendo...');
    mostrarMsg('msg-foto', '');
    const r = await subirFotoPerfilDB(file);
    ocupado(boton, false);
    if (!r.ok) { mostrarMsg('msg-foto', r.error, 'error'); return; }
    refrescarSesion(r.data);
    await pintarAvatar();
    mostrarMsg('msg-foto', 'Foto actualizada.', 'ok');
  });

  $('btn-quitar-foto').addEventListener('click', async () => {
    if (!perfil) return;
    const boton = $('btn-quitar-foto');
    ocupado(boton, true, 'Quitando...');
    const r = await quitarFotoPerfilDB();
    ocupado(boton, false);
    if (!r.ok) { mostrarMsg('msg-foto', r.error, 'error'); return; }
    refrescarSesion(r.data);
    await pintarAvatar();
    mostrarMsg('msg-foto', 'Foto quitada.', 'ok');
  });

  /* ── Seguridad: email ─────────────────────────────────── */
  registrarPanel('email', { boton: $('btn-abrir-email'), panel: $('panel-email'), msg: 'msg-email' });

  $('form-email').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!perfil) return;
    const email = $('aj-email-nuevo').value.trim();
    const password = $('aj-email-pass').value;
    const boton = $('btn-guardar-email');
    ocupado(boton, true, 'Guardando...');
    const r = await cambiarMiEmailDB(email, password);
    ocupado(boton, false);
    $('aj-email-pass').value = '';
    if (!r.ok) { mostrarMsg('msg-email', r.error, 'error'); return; }
    refrescarSesion({ email: r.data?.email || email.toLowerCase() });
    $('aj-email-actual').textContent = perfil.email;
    cerrarPanel('email');
    mostrarMsg('msg-email', 'Email actualizado. La próxima vez ingresá con el email nuevo.', 'ok');
  });

  /* ── Seguridad: contraseña ────────────────────────────── */
  registrarPanel('pass', {
    boton: $('btn-abrir-pass'), panel: $('panel-pass'), msg: 'msg-pass',
    alCerrar: actualizarMedidor
  });

  $('form-pass').addEventListener('submit', async (event) => {
    event.preventDefault();
    const actual = $('aj-pass-actual').value;
    const nueva = $('aj-pass-nueva').value;
    if (nueva !== $('aj-pass-repetir').value) {
      mostrarMsg('msg-pass', 'Las contraseñas nuevas no coinciden.', 'error');
      return;
    }
    const boton = $('btn-guardar-pass');
    ocupado(boton, true, 'Guardando...');
    const r = await cambiarMiPasswordDB(actual, nueva);
    ocupado(boton, false);
    if (!r.ok) { mostrarMsg('msg-pass', r.error, 'error'); return; }
    cerrarPanel('pass');
    mostrarMsg('msg-pass', 'Contraseña actualizada.', 'ok');
  });

  /* ── Preferencias ─────────────────────────────────────── */
  function leerPref(clave) {
    try { return localStorage.getItem(clave); } catch (_) { return null; }
  }
  function guardarPref(clave, valor) {
    try { localStorage.setItem(clave, valor); } catch (_) {}
  }

  const chkAnimaciones = $('pref-animaciones');
  chkAnimaciones.checked = leerPref(PREF_ANIMACIONES_KEY) === '0';
  chkAnimaciones.addEventListener('change', () => {
    guardarPref(PREF_ANIMACIONES_KEY, chkAnimaciones.checked ? '0' : '1');
    aplicarPreferenciasUI();
  });

  const temaGuardado = leerPref(PREF_TEMA_KEY);
  const temaActual = ['claro', 'sistema'].includes(temaGuardado) ? temaGuardado : 'oscuro';
  document.querySelectorAll('input[name="pref-tema"]').forEach(radio => {
    radio.checked = radio.value === temaActual;
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      guardarPref(PREF_TEMA_KEY, radio.value);
      aplicarPreferenciasUI();
    });
  });

  // Con "Automático", mostrar qué modo informa el dispositivo (ayuda a entender
  // por qué no coincide con lo que se ve en Windows).
  function pintarTemaSistema() {
    const nota = $('pref-tema-sistema');
    const elegido = document.querySelector('input[name="pref-tema"]:checked');
    if (!elegido || elegido.value !== 'sistema') { nota.hidden = true; return; }
    const sistema = temaDelSistema();
    nota.hidden = false;
    nota.textContent = sistema
      ? `Tu navegador informa modo ${sistema}. En Windows se toma de Configuración → Personalización → Colores → "Elegir el modo de aplicación predeterminado" (o del tema elegido en los ajustes del navegador).`
      : 'Tu navegador no informa un modo claro u oscuro; se usa el oscuro.';
  }
  document.querySelectorAll('input[name="pref-tema"]').forEach(radio => {
    radio.addEventListener('change', pintarTemaSistema);
  });
  if (window.matchMedia) {
    const q = window.matchMedia('(prefers-color-scheme: light)');
    if (q.addEventListener) q.addEventListener('change', pintarTemaSistema);
    else if (q.addListener) q.addListener(pintarTemaSistema);
  }
  window.addEventListener('focus', pintarTemaSistema);
  pintarTemaSistema();

  const textoActual = leerPref(PREF_TEXTO_KEY) === 'grande' ? 'grande' : 'normal';
  document.querySelectorAll('input[name="pref-texto"]').forEach(radio => {
    radio.checked = radio.value === textoActual;
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      guardarPref(PREF_TEXTO_KEY, radio.value);
      aplicarPreferenciasUI();
    });
  });

  // Con la vista clásica (diseño original, siempre oscuro) el selector de tema no aplica
  function actualizarTemaSegunClasica() {
    const clasica = usuario.rol === 'superadmin' && leerPref(VISTA_CLASICA_KEY) === '1';
    document.querySelectorAll('input[name="pref-tema"]').forEach(radio => { radio.disabled = clasica; });
    $('pref-tema-grupo').classList.toggle('ajustes-segmentado--inactivo', clasica);
    $('pref-tema-nota').hidden = !clasica;
  }

  if (usuario.rol === 'superadmin') {
    $('fila-vista-clasica').hidden = false;
    const chkClasica = $('pref-vista-clasica');
    chkClasica.checked = leerPref(VISTA_CLASICA_KEY) === '1';
    chkClasica.addEventListener('change', () => {
      guardarPref(VISTA_CLASICA_KEY, chkClasica.checked ? '1' : '0');
      aplicarPreferenciasUI();      // se ve al instante en esta página
      actualizarTemaSegunClasica();
    });
  }
  actualizarTemaSegunClasica();

  // Preceptor: popup "¿Pasar asistencia hoy?" al entrar. Va en la CUENTA (no localStorage).
  const chkPopup = $('pref-popup-asistencia');
  if (usuario.rol === 'preceptor') {
    $('fila-popup-asistencia').hidden = false;
    $('pref-nota-guardado').textContent =
      'Las preferencias se guardan en este navegador, salvo la de asistencia, que se guarda en tu cuenta.';
    chkPopup.checked = usuario.popup_asistencia !== false;   // valor de la sesión hasta que cargue el perfil
    chkPopup.addEventListener('change', async () => {
      const activo = chkPopup.checked;
      chkPopup.disabled = true;
      mostrarMsg('msg-pref', '');
      const r = await actualizarMiPopupAsistenciaDB(activo);
      chkPopup.disabled = false;
      if (!r.ok) {
        chkPopup.checked = !activo;
        mostrarMsg('msg-pref', r.error, 'error');
        return;
      }
      if (perfil) refrescarSesion({ popup_asistencia: r.data });
      else iniciarSesion({ ...getUsuarioActual(), popup_asistencia: r.data });
      mostrarMsg('msg-pref', activo
        ? 'Listo: al entrar se te va a preguntar por la asistencia.'
        : 'Listo: ya no se va a mostrar el aviso al entrar.', 'ok');
    });
  }

  /* ── Sesión y cuenta ──────────────────────────────────── */
  async function cargarCuenta() {
    cuentaCargada = true;
    mostrarMsg('msg-cuenta', '');
    if (usuario.rol === 'superadmin') {
      $('cta-colegio').textContent = 'Todos los colegios (superadministrador)';
    } else {
      getMiColegioDB(usuario.colegio_id)
        .then(nombre => { $('cta-colegio').textContent = nombre || 'Sin colegio asociado'; })
        .catch(() => { $('cta-colegio').textContent = 'No se pudo cargar'; });
    }
    try {
      const cuenta = await getMiCuentaAuthDB();
      $('cta-creada').textContent = formatearFecha(cuenta.created_at);
      $('cta-ultimo').textContent = formatearFecha(cuenta.last_sign_in_at, true);
    } catch (e) {
      cuentaCargada = false; // reintentar la próxima vez que se abra la sección
      mostrarMsg('msg-cuenta', e.message, 'error');
    }
  }

  $('btn-cerrar-sesion').addEventListener('click', () => cerrarSesion());

  registrarPanel('global', { boton: $('btn-abrir-global'), panel: $('panel-global'), msg: 'msg-global' });

  $('btn-confirmar-global').addEventListener('click', async () => {
    const boton = $('btn-confirmar-global');
    ocupado(boton, true, 'Cerrando...');
    const r = await cerrarSesionGlobalDB();
    if (!r.ok) {
      ocupado(boton, false);
      mostrarMsg('msg-global', r.error, 'error');
      return;
    }
    cerrarSesion();
  });

  /* ── Inicio ───────────────────────────────────────────── */
  async function cargarPerfil() {
    try {
      perfil = await getMiPerfilDB();
    } catch (e) {
      mostrarMsg('msg-datos', 'No se pudo cargar tu perfil. Recargá la página.', 'error');
      return;
    }
    if (!perfil) {
      mostrarMsg('msg-datos', 'No se encontró tu perfil.', 'error');
      return;
    }
    pintarLectura();
    pintarAvatar();
    if (usuario.rol === 'preceptor') {
      chkPopup.checked = perfil.popup_asistencia !== false;
      chkPopup.disabled = false;
    }
  }

  mostrarSeccion(location.hash.slice(1));
  cargarPerfil();
})();
