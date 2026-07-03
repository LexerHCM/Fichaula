/**
 * login.js — Pantalla de login (Supabase Auth)
 * ═══════════════════════════════════════════════════════════
 * Autentica vía validarCredencialesDB (Supabase Auth) y redirige
 * según rol. Incluye guard contra envíos múltiples.
 * Depende de: supabase.js, auth.js
 */
(function () {
  'use strict';

  // Si ya hay sesión, redirigir directo.
  const actual = getUsuarioActual();
  if (actual) {
    redirigirPorRol(actual.rol);
    return;
  }

  const card       = document.getElementById('login-card');
  const errBox     = document.getElementById('error-msg');
  const errTxt     = document.getElementById('error-text');
  const emailInput = document.getElementById('email');
  const passInput  = document.getElementById('password');
  const btnLogin   = document.getElementById('btn-login');
  const btnGoogle  = document.getElementById('btn-google');

  let enviando = false; // guard anti doble-submit

  function mostrarError(msg) {
    errTxt.textContent = msg;
    errBox.classList.add('visible');
    emailInput.classList.add('input-error');
    passInput.classList.add('input-error');
    card.classList.remove('shake');
    void card.offsetWidth;
    card.classList.add('shake');
  }

  function ocultarError() {
    errBox.classList.remove('visible');
    emailInput.classList.remove('input-error');
    passInput.classList.remove('input-error');
  }

function redirigirPorRol(rol) {
    if (rol === 'admin' )
      window.location.replace('admin.html');
    else if (rol === 'superadmin')
      window.location.replace('superadmin.html');
    else
      window.location.replace('../index.html');
  }

  async function intentarLogin() {
    if (enviando) return;              // ← evita logins concurrentes
    const email = emailInput.value.trim().toLowerCase();
    const pass  = passInput.value;

    ocultarError();
    if (!email) { mostrarError('Ingresá tu correo electrónico.'); return; }
    if (!pass)  { mostrarError('Ingresá tu contraseña.'); return; }

    enviando = true;
    btnLogin.disabled = true;
    btnLogin.textContent = 'Verificando...';

    try {
      const user = await validarCredencialesDB(email, pass);
      if (!user) {
        mostrarError('Correo o contraseña incorrectos. Intentá de nuevo.');
        return;
      }
      btnLogin.textContent = 'Ingresando...';
      iniciarSesion(user);
      setTimeout(() => redirigirPorRol(user.rol), 400);
    } catch (e) {
      mostrarError('No se pudo conectar. Revisá tu conexión e intentá de nuevo.');
    } finally {
      if (enviando) {
        enviando = false;
        if (!sessionStorage.getItem(SB_PERFIL_KEY)) {
          btnLogin.disabled = false;
          btnLogin.textContent = 'Ingresar';
        }
      }
    }
  }

  btnLogin.addEventListener('click', intentarLogin);
  btnGoogle.addEventListener('click', () => {
    mostrarError('Google no está disponible en este sistema.');
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter') intentarLogin();
  });
  emailInput.addEventListener('input', ocultarError);
  passInput.addEventListener('input', ocultarError);
})();
