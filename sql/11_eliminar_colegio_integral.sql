-- Ejecutar después de sql/10_importacion_cuentas_excel.sql.
-- Extiende la eliminación de colegios para purgar los datos archivados
-- agregados por las migraciones de preceptores y asistencia. Las RPC de borrado
-- quedan reservadas a service_role y solo se invocan desde la Edge Function,
-- que verifica la sesión de superadmin y su contraseña actual.

CREATE OR REPLACE FUNCTION public.verificar_eliminacion_colegio(p_colegio_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Función reservada al servidor';
  END IF;
  PERFORM 1 FROM public.colegios WHERE id = p_colegio_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Colegio no encontrado'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.eliminar_colegio_superadmin(p_colegio_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Función reservada al servidor';
  END IF;
  PERFORM 1 FROM public.colegios WHERE id = p_colegio_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Colegio no encontrado'; END IF;

  DELETE FROM public.comentarios_papelera cp
  WHERE cp.alumno_id IN (
    SELECT id FROM public.alumnos WHERE colegio_id = p_colegio_id
    UNION
    SELECT id FROM public.alumnos_papelera WHERE colegio_id = p_colegio_id
  ) OR cp.profesor_id IN (
    SELECT id FROM public.profesores WHERE colegio_id = p_colegio_id
    UNION
    SELECT id FROM public.profesores_papelera WHERE colegio_id = p_colegio_id
  ) OR cp.preceptor_id IN (
    SELECT id FROM public.preceptores WHERE colegio_id = p_colegio_id
    UNION
    SELECT id FROM public.preceptores_papelera WHERE colegio_id = p_colegio_id
  ) OR cp.curso_id IN (
    SELECT id FROM public.clases WHERE colegio_id = p_colegio_id
    UNION
    SELECT id FROM public.clases_papelera WHERE colegio_id = p_colegio_id
  );
  DELETE FROM public.seguimientos_papelera sp
  WHERE sp.alumno_id IN (
    SELECT id FROM public.alumnos WHERE colegio_id = p_colegio_id
    UNION
    SELECT id FROM public.alumnos_papelera WHERE colegio_id = p_colegio_id
  ) OR sp.profesor_id IN (
    SELECT id FROM public.profesores WHERE colegio_id = p_colegio_id
    UNION
    SELECT id FROM public.profesores_papelera WHERE colegio_id = p_colegio_id
  ) OR sp.preceptor_id IN (
    SELECT id FROM public.preceptores WHERE colegio_id = p_colegio_id
    UNION
    SELECT id FROM public.preceptores_papelera WHERE colegio_id = p_colegio_id
  );
  DELETE FROM public.profesor_curso_papelera WHERE colegio_id = p_colegio_id;
  DELETE FROM public.asistencias_papelera WHERE colegio_id = p_colegio_id;
  DELETE FROM public.preceptores_papelera WHERE colegio_id = p_colegio_id;
  DELETE FROM public.alumnos_papelera WHERE colegio_id = p_colegio_id;
  DELETE FROM public.clases_papelera WHERE colegio_id = p_colegio_id;
  DELETE FROM public.profesores_papelera WHERE colegio_id = p_colegio_id;
  DELETE FROM public.admins_papelera WHERE colegio_id = p_colegio_id;

  DELETE FROM public.comentarios c
  WHERE c.alumno_id IN (SELECT id FROM public.alumnos WHERE colegio_id = p_colegio_id)
     OR c.profesor_id IN (SELECT id FROM public.profesores WHERE colegio_id = p_colegio_id)
     OR c.preceptor_id IN (SELECT id FROM public.preceptores WHERE colegio_id = p_colegio_id)
     OR c.curso_id IN (SELECT id FROM public.clases WHERE colegio_id = p_colegio_id);
  DELETE FROM public.seguimientos
  WHERE alumno_id IN (SELECT id FROM public.alumnos WHERE colegio_id = p_colegio_id)
     OR profesor_id IN (SELECT id FROM public.profesores WHERE colegio_id = p_colegio_id)
     OR preceptor_id IN (SELECT id FROM public.preceptores WHERE colegio_id = p_colegio_id);
  DELETE FROM public.profesor_curso
  WHERE curso_id IN (SELECT id FROM public.clases WHERE colegio_id = p_colegio_id);
  DELETE FROM public.alumnos WHERE colegio_id = p_colegio_id;
  DELETE FROM public.clases WHERE colegio_id = p_colegio_id;
  DELETE FROM public.profesores WHERE colegio_id = p_colegio_id;
  DELETE FROM public.admins WHERE colegio_id = p_colegio_id;
  DELETE FROM public.preceptores WHERE colegio_id = p_colegio_id;
  DELETE FROM public.colegios WHERE id = p_colegio_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.eliminar_colegio_superadmin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.eliminar_colegio_superadmin(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.eliminar_colegio_superadmin(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.verificar_eliminacion_colegio(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verificar_eliminacion_colegio(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
