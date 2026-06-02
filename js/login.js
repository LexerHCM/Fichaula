/**
 * login.js — Lógica de la pantalla de login (versión Supabase)
 * ───────────────────────────────────────────────────────────
 * Valida credenciales contra Supabase (superadmins, admins, profesores).
 * Redirige según el rol:
 *   superadmin / admin → pages/admin.html
 *   profesor           → ../index.html
 *
 * Depende de: supabase.js, auth.js
 */

(function () {
  'use strict';

  // Si ya hay sesión activa, redirigir directamente.
  const actual = getUsuarioActual();
  if (actual) {
    if (actual.rol === 'admin' || actual.rol === 'superadmin')
      window.location.replace('admin.html');
    else
      window.location.replace('../index.html');
    return;
  }

  // ── Referencias a elementos ──
  const card        = document.getElementById('login-card');
  const errBox      = document.getElementById('error-msg');
  const errTxt      = document.getElementById('error-text');
  const emailInput  = document.getElementById('email');
  const passInput   = document.getElementById('password');
  const btnLogin    = document.getElementById('btn-login');
  const btnGoogle   = document.getElementById('btn-google');

  // ── Funciones auxiliares ──
  function mostrarError(msg) {
    errTxt.textContent = msg;
    errBox.classList.add('visible');
    emailInput.classList.add('input-error');
    passInput.classList.add('input-error');

    // Reinicia la animación shake
    card.classList.remove('shake');
    void card.offsetWidth;
    card.classList.add('shake');
  }

  function ocultarError() {
    errBox.classList.remove('visible');
    emailInput.classList.remove('input-error');
    passInput.classList.remove('input-error');
  }

  async function intentarLogin() {
    const email = emailInput.value.trim().toLowerCase();
    const pass  = passInput.value;

    ocultarError();

    if (!email) { mostrarError('Ingresá tu correo electrónico.'); return; }
    if (!pass)  { mostrarError('Ingresá tu contraseña.'); return; }

    // Feedback visual mientras consulta la base de datos
    btnLogin.disabled = true;
    btnLogin.textContent = 'Verificando...';

    const user = await validarCredencialesDB(email, pass);

    if (!user) {
      btnLogin.disabled = false;
      btnLogin.textContent = 'Ingresar';
      mostrarError('Correo o contraseña incorrectos. Intentá de nuevo.');
      return;
    }

    // Login correcto
    btnLogin.textContent = 'Ingresando...';
    iniciarSesion(user);

    // Redirección según rol (pequeño delay para feedback visual)
    setTimeout(() => {
      if (user.rol === 'admin' || user.rol === 'superadmin')
        window.location.replace('admin.html');
      else
        window.location.replace('../index.html');
    }, 500);
  }

  // ── Event listeners ──
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
