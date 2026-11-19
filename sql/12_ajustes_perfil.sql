-- ============================================================
-- FichAula · 12 · AJUSTES DE PERFIL PROPIO  (DESPUÉS de 11)
-- ============================================================
-- Permite que cada usuario (superadmin, admin, profesor, preceptor)
-- edite SU PROPIO perfil desde pages/ajustes.html:
--   - foto de perfil (bucket privado 'fotos-perfil')
--   - nombre, apellido, teléfono y fecha de nacimiento
-- El email de acceso se cambia con la Edge Function
-- 'actualizar-mi-email' (necesita tocar Supabase Auth).
-- La contraseña se cambia desde el cliente con Supabase Auth.
-- ============================================================

-- ── Columnas nuevas ─────────────────────────────────────────
ALTER TABLE public.superadmins
  ADD COLUMN IF NOT EXISTS telefono text,
  ADD COLUMN IF NOT EXISTS fecha_nacimiento date,
  ADD COLUMN IF NOT EXISTS foto_path text;

ALTER TABLE public.admins
  ADD COLUMN IF NOT EXISTS telefono text,
  ADD COLUMN IF NOT EXISTS fecha_nacimiento date,
  ADD COLUMN IF NOT EXISTS foto_path text;

ALTER TABLE public.profesores  ADD COLUMN IF NOT EXISTS foto_path text;
ALTER TABLE public.preceptores ADD COLUMN IF NOT EXISTS foto_path text;

-- Las papeleras copian columnas por nombre; se agregan para no perder datos.
ALTER TABLE public.admins_papelera
  ADD COLUMN IF NOT EXISTS telefono text,
  ADD COLUMN IF NOT EXISTS fecha_nacimiento date,
  ADD COLUMN IF NOT EXISTS foto_path text;
ALTER TABLE public.profesores_papelera  ADD COLUMN IF NOT EXISTS foto_path text;
ALTER TABLE public.preceptores_papelera ADD COLUMN IF NOT EXISTS foto_path text;

-- ── Bucket de fotos de perfil ───────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('fotos-perfil', 'fotos-perfil', false, 2097152,
        ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 2097152,
  allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp'];

-- Cualquier usuario logueado puede VER las fotos; cada uno solo
-- puede escribir dentro de su carpeta "<auth.uid()>/...".
DROP POLICY IF EXISTS fotos_perfil_select ON storage.objects;
DROP POLICY IF EXISTS fotos_perfil_insert ON storage.objects;
DROP POLICY IF EXISTS fotos_perfil_update ON storage.objects;
DROP POLICY IF EXISTS fotos_perfil_delete ON storage.objects;

CREATE POLICY fotos_perfil_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'fotos-perfil');
CREATE POLICY fotos_perfil_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'fotos-perfil'
              AND split_part(name, '/', 1) = (select auth.uid())::text);
CREATE POLICY fotos_perfil_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'fotos-perfil'
         AND split_part(name, '/', 1) = (select auth.uid())::text)
  WITH CHECK (bucket_id = 'fotos-perfil'
              AND split_part(name, '/', 1) = (select auth.uid())::text);
CREATE POLICY fotos_perfil_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'fotos-perfil'
         AND split_part(name, '/', 1) = (select auth.uid())::text);

-- ── RPC: actualizar el perfil propio ────────────────────────
-- SECURITY DEFINER porque RLS no deja a un usuario editar su fila;
-- la función SOLO toca la fila id = auth.uid() y solo estos campos.
CREATE OR REPLACE FUNCTION public.actualizar_mi_perfil(
  p_nombre text,
  p_apellido text,
  p_telefono text,
  p_fecha_nacimiento date,
  p_foto_path text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_rol public.rol_usuario := public.mi_rol();
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_apellido text := btrim(coalesce(p_apellido, ''));
  v_telefono text := nullif(btrim(coalesce(p_telefono, '')), '');
  v_foto text := nullif(btrim(coalesce(p_foto_path, '')), '');
  v_resultado jsonb;
BEGIN
  IF v_uid IS NULL OR v_rol IS NULL THEN
    RAISE EXCEPTION 'Necesitás iniciar sesión.' USING ERRCODE = '42501';
  END IF;
  IF char_length(v_nombre) NOT BETWEEN 1 AND 100 OR char_length(v_apellido) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Ingresá un nombre y apellido válidos.' USING ERRCODE = '22023';
  END IF;
  IF v_telefono IS NOT NULL AND char_length(v_telefono) > 30 THEN
    RAISE EXCEPTION 'El teléfono puede tener hasta 30 caracteres.' USING ERRCODE = '22023';
  END IF;
  IF p_fecha_nacimiento IS NOT NULL AND
     (p_fecha_nacimiento > current_date OR p_fecha_nacimiento < date '1900-01-01') THEN
    RAISE EXCEPTION 'La fecha de nacimiento no es válida.' USING ERRCODE = '22023';
  END IF;
  IF v_foto IS NOT NULL AND
     (left(v_foto, char_length(v_uid::text) + 1) <> v_uid::text || '/' OR char_length(v_foto) > 200) THEN
    RAISE EXCEPTION 'La foto de perfil no es válida.' USING ERRCODE = '22023';
  END IF;

  IF v_rol = 'superadmin' THEN
    UPDATE public.superadmins
       SET nombre = v_nombre, apellido = v_apellido, telefono = v_telefono,
           fecha_nacimiento = p_fecha_nacimiento, foto_path = v_foto
     WHERE id = v_uid
    RETURNING to_jsonb(superadmins.*) INTO v_resultado;
  ELSIF v_rol = 'admin' THEN
    UPDATE public.admins
       SET nombre = v_nombre, apellido = v_apellido, telefono = v_telefono,
           fecha_nacimiento = p_fecha_nacimiento, foto_path = v_foto
     WHERE id = v_uid
    RETURNING to_jsonb(admins.*) INTO v_resultado;
  ELSIF v_rol = 'profesor' THEN
    UPDATE public.profesores
       SET nombre = v_nombre, apellido = v_apellido, telefono = v_telefono,
           fecha_nacimiento = p_fecha_nacimiento, foto_path = v_foto
     WHERE id = v_uid
    RETURNING to_jsonb(profesores.*) INTO v_resultado;
  ELSIF v_rol = 'preceptor' THEN
    IF v_telefono IS NULL OR p_fecha_nacimiento IS NULL THEN
      RAISE EXCEPTION 'El teléfono y la fecha de nacimiento son obligatorios.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.preceptores
       SET nombre = v_nombre, apellido = v_apellido, telefono = v_telefono,
           fecha_nacimiento = p_fecha_nacimiento, foto_path = v_foto
     WHERE id = v_uid
    RETURNING to_jsonb(preceptores.*) INTO v_resultado;
  END IF;

  IF v_resultado IS NULL THEN
    RAISE EXCEPTION 'No se encontró tu perfil.' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_resultado || jsonb_build_object('rol', v_rol::text);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.actualizar_mi_perfil(text, text, text, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.actualizar_mi_perfil(text, text, text, date, text) TO authenticated;
