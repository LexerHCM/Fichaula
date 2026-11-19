/**
 * tema.js — Preferencias de interfaz (Ajustes → Preferencias)
 * ───────────────────────────────────────────────────────────
 * Se carga en el <head> de cada página, ANTES de pintar, para que el
 * modo claro / letra grande / sin animaciones no "parpadeen".
 * Se guardan en este navegador (localStorage) y se aplican como clases
 * en <html>: tema-claro, pref-texto-grande, pref-sin-animaciones.
 * Lo usan components.js, superadmin.html y ajustes.js.
 */
var PREF_ANIMACIONES_KEY = 'fichaula_pref_animaciones'; // '0' = reducir animaciones
var PREF_TEXTO_KEY = 'fichaula_pref_texto';             // 'grande' | 'normal'
var PREF_TEMA_KEY = 'fichaula_pref_tema';               // 'oscuro' | 'claro' | 'sistema'
var PREF_VISTA_CLASICA_KEY = 'fichaula_sa_vista_clasica'; // '1' = diseño original (solo superadmin)

/**
 * ¿Corresponde la "vista clásica"? Solo para superadmin, y solo en las páginas
 * que la usan: el panel (superadmin.html cambia su hoja de estilos) y Ajustes
 * (que se pinta con la clase html.vista-clasica de style.css).
 */
function vistaClasicaActiva() {
  try {
    if (localStorage.getItem(PREF_VISTA_CLASICA_KEY) !== '1') return false;
    var perfil = JSON.parse(sessionStorage.getItem('fichaula_session') || 'null');
    return !!perfil && perfil.rol === 'superadmin';
  } catch (_) {
    return false;
  }
}

/** ¿Corresponde el modo claro según la preferencia guardada? */
function temaClaroActivo(tema) {
  if (tema === 'claro') return true;
  if (tema === 'sistema') return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches);
  return false; // 'oscuro' o sin preferencia: el diseño original
}

function aplicarPreferenciasUI() {
  var sinAnimaciones = false;
  var textoGrande = false;
  var tema = 'oscuro';
  try {
    sinAnimaciones = localStorage.getItem(PREF_ANIMACIONES_KEY) === '0';
    textoGrande = localStorage.getItem(PREF_TEXTO_KEY) === 'grande';
    tema = localStorage.getItem(PREF_TEMA_KEY) || 'oscuro';
  } catch (_) { /* sin storage: valores por defecto */ }
  var html = document.documentElement;
  // La vista clásica es un diseño oscuro: si está activa en esta página, manda sobre el tema
  var clasica = vistaClasicaActiva() && /\/ajustes\.html$/i.test(location.pathname);
  html.classList.toggle('pref-sin-animaciones', sinAnimaciones);
  html.classList.toggle('pref-texto-grande', textoGrande);
  html.classList.toggle('vista-clasica', clasica);
  html.classList.toggle('tema-claro', !clasica && temaClaroActivo(tema));
}

aplicarPreferenciasUI();

/**
 * Modo que informa el sistema: 'claro' | 'oscuro' | null (no lo informa).
 * OJO: en Windows, Chrome/Edge siguen "Elegir el modo de aplicación
 * predeterminado" (no el color de la barra de tareas) o el tema propio
 * del navegador si se fijó en sus ajustes.
 */
function temaDelSistema() {
  if (!window.matchMedia) return null;
  if (window.matchMedia('(prefers-color-scheme: light)').matches) return 'claro';
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'oscuro';
  return null;
}

// En modo "Automático", seguir los cambios del sistema operativo en vivo
if (window.matchMedia) {
  var consultaTema = window.matchMedia('(prefers-color-scheme: light)');
  if (consultaTema.addEventListener) consultaTema.addEventListener('change', aplicarPreferenciasUI);
  else if (consultaTema.addListener) consultaTema.addListener(aplicarPreferenciasUI);
}
// Re-chequear al volver a la pestaña / desde el historial (por si el cambio
// del sistema ocurrió con la pestaña en segundo plano) y cuando otra pestaña
// cambia la preferencia.
window.addEventListener('pageshow', aplicarPreferenciasUI);
window.addEventListener('focus', aplicarPreferenciasUI);
document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'visible') aplicarPreferenciasUI();
});
window.addEventListener('storage', function (e) {
  if (!e.key || e.key.indexOf('fichaula_pref_') === 0 || e.key === PREF_VISTA_CLASICA_KEY) aplicarPreferenciasUI();
});
