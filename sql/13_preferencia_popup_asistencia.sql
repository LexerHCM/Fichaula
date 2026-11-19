-- ============================================================
-- FichAula · 13 · POPUP DE ASISTENCIA DEL PRECEPTOR  (DESPUÉS de 12)
-- ============================================================
-- Al entrar a la página de inicio, el preceptor ve un popup que le
-- pregunta si quiere pasar asistencia hoy. Desde Ajustes → Preferencias
-- puede desactivarlo. La preferencia se guarda EN LA CUENTA (no en el
-- navegador), así vale en cualquier dispositivo.
-- ============================================================

ALTER TABLE public.preceptores
  ADD COLUMN IF NOT EXISTS popup_asistencia boolean NOT NULL DEFAULT true;

-- Las papeleras copian columnas por nombre; se agrega para no perder datos.
ALTER TABLE public.preceptores_papelera
  ADD COLUMN IF NOT EXISTS popup_asistencia boolean;

-- ── RPC: activar / desactivar el popup propio ───────────────
-- SECURITY DEFINER porque RLS no deja a un preceptor editar su fila;
-- la función SOLO toca la fila id = auth.uid() y solo esta columna.
CREATE OR REPLACE FUNCTION public.actualizar_mi_popup_asistencia(p_activo boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_resultado boolean;
BEGIN
  IF v_uid IS NULL OR public.mi_rol() IS DISTINCT FROM 'preceptor' THEN
    RAISE EXCEPTION 'Solo los preceptores pueden cambiar esta preferencia.' USING ERRCODE = '42501';
  END IF;
  IF p_activo IS NULL THEN
    RAISE EXCEPTION 'Valor inválido.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.preceptores
     SET popup_asistencia = p_activo
   WHERE id = v_uid
  RETURNING popup_asistencia INTO v_resultado;

  IF v_resultado IS NULL THEN
    RAISE EXCEPTION 'No se encontró tu perfil.' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_resultado;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.actualizar_mi_popup_asistencia(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.actualizar_mi_popup_asistencia(boolean) TO authenticated;
