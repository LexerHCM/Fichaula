-- ============================================================
-- FichAula · 04 · CRON DE PURGA  (DESPUÉS de 03)
-- ============================================================
-- Programa la limpieza diaria de las papeleras (retención 30 días)
-- usando pg_cron. El job corre como 'postgres', por eso puede
-- ejecutar purgar_papeleras() aunque la API tenga el EXECUTE revocado.
--
-- En Supabase, pg_cron se habilita en:
--   Dashboard -> Database -> Extensions -> "pg_cron" (Enable)
-- o con la sentencia de abajo (requiere permisos de administrador).
-- ============================================================

-- 1. Habilitar la extensión (idempotente).
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. (Re)programar el job. Se desagenda primero para no duplicarlo
--    si este script se corre más de una vez.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purga-papeleras-diaria') THEN
    PERFORM cron.unschedule('purga-papeleras-diaria');
  END IF;
END$$;

-- Todos los días a las 03:00 (hora del servidor).
SELECT cron.schedule('purga-papeleras-diaria', '0 3 * * *', 'SELECT purgar_papeleras()');
