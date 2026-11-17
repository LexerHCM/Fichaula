-- Ejecutar una vez antes de sql/09b_preceptores_asistencia.sql.
-- Se separa para que Postgres confirme el valor ENUM antes de usarlo.
ALTER TYPE public.rol_usuario ADD VALUE IF NOT EXISTS 'preceptor';
