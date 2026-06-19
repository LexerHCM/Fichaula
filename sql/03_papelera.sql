-- ============================================================
-- FichAula · 03 · PAPELERA POR TABLAS ESPEJO  (DESPUÉS de 02)
-- ============================================================
-- Borrado = MOVER, no marcar. Cada tabla "borrable" tiene una
-- espejo `<tabla>_papelera` con las mismas columnas + deleted_at.
--
-- Una función SECURITY DEFINER copia la(s) fila(s) a la espejo y
-- las borra de la original DENTRO DE LA MISMA TRANSACCIÓN (el
-- cuerpo plpgsql es atómico: si algo falla, se revierte todo).
-- El cliente la invoca por RPC. Cada función valida el rol a mano
-- porque SECURITY DEFINER saltea el RLS.
--
-- Retención: 30 días, vía purgar_papeleras() + el cron del script 04.
-- ============================================================

-- ============================================================
-- 1. TABLAS ESPEJO  (estructura idéntica + deleted_at al final)
--    `LIKE <tabla>` copia las columnas en el mismo orden; así
--    `INSERT ... SELECT origen.*, now()` calza exactamente.
--    Sin PK ni índices a propósito: son tablas de auditoría
--    append-only, de acceso poco frecuente y solo por admin.
-- ============================================================
CREATE TABLE IF NOT EXISTS comentarios_papelera     (LIKE comentarios);
CREATE TABLE IF NOT EXISTS seguimientos_papelera    (LIKE seguimientos);
CREATE TABLE IF NOT EXISTS alumnos_papelera         (LIKE alumnos);
CREATE TABLE IF NOT EXISTS clases_papelera          (LIKE clases);
CREATE TABLE IF NOT EXISTS profesores_papelera      (LIKE profesores);
CREATE TABLE IF NOT EXISTS admins_papelera          (LIKE admins);
CREATE TABLE IF NOT EXISTS profesor_curso_papelera  (LIKE profesor_curso);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['comentarios_papelera','seguimientos_papelera','alumnos_papelera',
                           'clases_papelera','profesores_papelera','admins_papelera','profesor_curso_papelera']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name=t AND column_name='deleted_at') THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN deleted_at timestamptz NOT NULL DEFAULT now()', t);
    END IF;
  END LOOP;
END$$;

-- ============================================================
-- 2. RLS de las espejo: solo admin/superadmin pueden leerlas.
--    Nadie escribe directo (solo las funciones SECURITY DEFINER).
-- ============================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['comentarios_papelera','seguimientos_papelera','alumnos_papelera',
                           'clases_papelera','profesores_papelera','admins_papelera','profesor_curso_papelera']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS pap_select ON %I', t);
    EXECUTE format('CREATE POLICY pap_select ON %I FOR SELECT USING ((select mi_rol()) IN (''admin'',''superadmin''))', t);
  END LOOP;
END$$;

-- ============================================================
-- 3. FUNCIONES DE BORRADO  (mover a papelera, atómico)
-- ============================================================

-- COMENTARIO: lo borra su autor (profesor) o un admin/superadmin.
CREATE OR REPLACE FUNCTION public.eliminar_comentario(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE v_owner uuid;
BEGIN
  SELECT profesor_id INTO v_owner FROM comentarios WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Comentario no encontrado'; END IF;
  IF NOT (v_owner = auth.uid() OR mi_rol() IN ('admin','superadmin')) THEN
    RAISE EXCEPTION 'No tenés permiso para eliminar este comentario';
  END IF;
  INSERT INTO comentarios_papelera SELECT c.*, now() FROM comentarios c WHERE c.id = p_id;
  DELETE FROM comentarios WHERE id = p_id;
END; $$;

-- SEGUIMIENTO: lo borra su autor (profesor) o un admin/superadmin.
CREATE OR REPLACE FUNCTION public.eliminar_seguimiento(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE v_owner uuid;
BEGIN
  SELECT profesor_id INTO v_owner FROM seguimientos WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Seguimiento no encontrado'; END IF;
  IF NOT (v_owner = auth.uid() OR mi_rol() IN ('admin','superadmin')) THEN
    RAISE EXCEPTION 'No tenés permiso para eliminar este seguimiento';
  END IF;
  INSERT INTO seguimientos_papelera SELECT s.*, now() FROM seguimientos s WHERE s.id = p_id;
  DELETE FROM seguimientos WHERE id = p_id;
END; $$;

-- ALUMNO: solo admin/superadmin. Arrastra comentarios y seguimientos
-- a sus papeleras ANTES del CASCADE que los borra de las tablas vivas.
CREATE OR REPLACE FUNCTION public.eliminar_alumno(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
BEGIN
  IF mi_rol() NOT IN ('admin','superadmin') THEN
    RAISE EXCEPTION 'No tenés permiso para eliminar alumnos';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM alumnos WHERE id = p_id) THEN
    RAISE EXCEPTION 'Alumno no encontrado';
  END IF;
  INSERT INTO comentarios_papelera  SELECT c.*, now() FROM comentarios  c WHERE c.alumno_id = p_id;
  INSERT INTO seguimientos_papelera SELECT s.*, now() FROM seguimientos s WHERE s.alumno_id = p_id;
  INSERT INTO alumnos_papelera      SELECT a.*, now() FROM alumnos      a WHERE a.id = p_id;
  DELETE FROM alumnos WHERE id = p_id;  -- el CASCADE borra los hijos ya copiados
END; $$;

-- CLASE: solo admin/superadmin. La FK alumnos->clases es RESTRICT, así
-- que no se puede borrar una clase con alumnos (la app avisa). Arrastra
-- las asignaciones profesor_curso a su papelera.
CREATE OR REPLACE FUNCTION public.eliminar_clase(p_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
BEGIN
  IF mi_rol() NOT IN ('admin','superadmin') THEN
    RAISE EXCEPTION 'No tenés permiso para eliminar clases';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM clases WHERE id = p_id) THEN
    RAISE EXCEPTION 'Clase no encontrada';
  END IF;
  INSERT INTO profesor_curso_papelera SELECT pc.*, now() FROM profesor_curso pc WHERE pc.curso_id = p_id;
  INSERT INTO clases_papelera SELECT c.*, now() FROM clases c WHERE c.id = p_id;
  DELETE FROM clases WHERE id = p_id;
END; $$;

-- PROFESOR: solo admin/superadmin. Arrastra comentarios, seguimientos
-- y asignaciones a sus papeleras antes del CASCADE.
CREATE OR REPLACE FUNCTION public.eliminar_profesor(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
BEGIN
  IF mi_rol() NOT IN ('admin','superadmin') THEN
    RAISE EXCEPTION 'No tenés permiso para eliminar profesores';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM profesores WHERE id = p_id) THEN
    RAISE EXCEPTION 'Profesor no encontrado';
  END IF;
  INSERT INTO comentarios_papelera     SELECT c.*,  now() FROM comentarios     c  WHERE c.profesor_id = p_id;
  INSERT INTO seguimientos_papelera    SELECT s.*,  now() FROM seguimientos    s  WHERE s.profesor_id = p_id;
  INSERT INTO profesor_curso_papelera  SELECT pc.*, now() FROM profesor_curso  pc WHERE pc.profesor_id = p_id;
  INSERT INTO profesores_papelera      SELECT p.*,  now() FROM profesores      p  WHERE p.id = p_id;
  DELETE FROM profesores WHERE id = p_id;
END; $$;

-- ADMIN: solo un superadmin puede borrar administradores.
CREATE OR REPLACE FUNCTION public.eliminar_admin(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
BEGIN
  IF mi_rol() <> 'superadmin' THEN
    RAISE EXCEPTION 'Solo un superadmin puede eliminar administradores';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM admins WHERE id = p_id) THEN
    RAISE EXCEPTION 'Administrador no encontrado';
  END IF;
  INSERT INTO admins_papelera SELECT a.*, now() FROM admins a WHERE a.id = p_id;
  DELETE FROM admins WHERE id = p_id;
END; $$;

-- PURGA: borra de las espejo lo que tenga más de 30 días.
CREATE OR REPLACE FUNCTION public.purgar_papeleras()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
BEGIN
  DELETE FROM comentarios_papelera     WHERE deleted_at < now() - INTERVAL '30 days';
  DELETE FROM seguimientos_papelera    WHERE deleted_at < now() - INTERVAL '30 days';
  DELETE FROM alumnos_papelera         WHERE deleted_at < now() - INTERVAL '30 days';
  DELETE FROM clases_papelera          WHERE deleted_at < now() - INTERVAL '30 days';
  DELETE FROM profesores_papelera      WHERE deleted_at < now() - INTERVAL '30 days';
  DELETE FROM admins_papelera          WHERE deleted_at < now() - INTERVAL '30 days';
  DELETE FROM profesor_curso_papelera  WHERE deleted_at < now() - INTERVAL '30 days';
END; $$;

-- ============================================================
-- 4. PERMISOS DE EJECUCIÓN
-- ============================================================
-- Las funciones de borrado las llama la app estando logueada;
-- validan el rol internamente. Solo 'authenticated' (no anon/PUBLIC).
REVOKE EXECUTE ON FUNCTION
  public.eliminar_comentario(uuid), public.eliminar_seguimiento(uuid),
  public.eliminar_alumno(uuid), public.eliminar_clase(text),
  public.eliminar_profesor(uuid), public.eliminar_admin(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.eliminar_comentario(uuid), public.eliminar_seguimiento(uuid),
  public.eliminar_alumno(uuid), public.eliminar_clase(text),
  public.eliminar_profesor(uuid), public.eliminar_admin(uuid)
  TO authenticated;

-- La purga solo la dispara el cron (corre como 'postgres'). La API no.
REVOKE EXECUTE ON FUNCTION public.purgar_papeleras() FROM PUBLIC, anon, authenticated;
