-- ============================================================
-- FichAula · 05 · PERFILES (cuentas reales)  (DESPUÉS de 04)
-- ============================================================
-- Inserta las filas de perfil de las cuentas del instituto.
--
-- IMPORTANTE — ORDEN:
--   1) Correr ESTE script (crea las filas con un UUID provisorio).
--   2) Crear en el Dashboard de Supabase un usuario de Auth por cada
--      email de abajo (Authentication -> Add user, "Auto Confirm" ON).
--      El trigger on_auth_user_created reemplaza el UUID provisorio
--      por el de auth.users (enlace automático por email).
--   3) Recién entonces correr 06_datos_demo.sql (opcional).
--
-- Editá los emails/nombres para adaptarlos a tu institución. Los
-- emails DEBEN coincidir EXACTO con los usuarios que crees en Auth.
-- ============================================================

-- Nivel 3 — Superadmin (cuenta de sistema)
INSERT INTO superadmins (email, nombre, apellido) VALUES
  ('superadmin@fichaula.app', 'Sistema', 'FichAula')
ON CONFLICT (email) DO NOTHING;

-- Nivel 2 — Administración / Dirección
INSERT INTO admins (email, nombre, apellido, cargo) VALUES
  ('admin@sagradocorazon.edu.ar', 'Laura', 'Méndez', 'Directora')
ON CONFLICT (email) DO NOTHING;

-- Nivel 1 — Profesores
INSERT INTO profesores (email, nombre, apellido, materia) VALUES
  ('profe@sagradocorazon.edu.ar',  'María', 'González',  'Matemática'),
  ('lucas@sagradocorazon.edu.ar',  'Lucas', 'Fernández', 'Lengua y Literatura')
ON CONFLICT (email) DO NOTHING;
