-- Ejecutar después de sql/09b_preceptores_asistencia.sql.
-- Los usuarios de profesores y preceptores se crean en la Edge Function,
-- que administra Supabase Auth; esta función importa las relaciones y los datos escolares.

CREATE OR REPLACE FUNCTION public.importar_colegio_excel(p_colegio_id uuid, p_datos jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  v_profesor jsonb;
  v_preceptor jsonb;
  v_clase jsonb;
  v_alumno jsonb;
  v_profesor_id uuid;
  v_preceptor_id uuid;
  v_clase_id text;
  v_nombre_clase text;
  v_importadas_clases integer := 0;
  v_importados_alumnos integer := 0;
  v_ids_clases jsonb := '{}'::jsonb;
BEGIN
  IF mi_rol() IS DISTINCT FROM 'superadmin' THEN
    RAISE EXCEPTION 'Solo superadmin puede importar datos';
  END IF;
  PERFORM 1 FROM public.colegios WHERE id = p_colegio_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Colegio no encontrado'; END IF;

  IF jsonb_typeof(p_datos->'clases') IS DISTINCT FROM 'array'
     OR COALESCE(jsonb_array_length(p_datos->'clases'), 0) = 0
     OR jsonb_typeof(p_datos->'alumnos') IS DISTINCT FROM 'array'
     OR COALESCE(jsonb_array_length(p_datos->'alumnos'), 0) = 0
     OR jsonb_typeof(p_datos->'profesores') IS DISTINCT FROM 'array'
     OR COALESCE(jsonb_array_length(p_datos->'profesores'), 0) = 0
     OR jsonb_typeof(p_datos->'preceptores') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'La planilla debe contener clases, alumnos, profesores y preceptores';
  END IF;

  FOR v_profesor IN SELECT value FROM jsonb_array_elements(p_datos->'profesores') LOOP
    SELECT id INTO v_profesor_id
    FROM public.profesores
    WHERE colegio_id = p_colegio_id AND lower(email) = lower(v_profesor->>'email');
    IF v_profesor_id IS NULL THEN
      RAISE EXCEPTION 'No se encontró la cuenta de profesor % en este colegio', v_profesor->>'email';
    END IF;
    v_profesor_id := NULL;
  END LOOP;

  FOR v_preceptor IN SELECT value FROM jsonb_array_elements(p_datos->'preceptores') LOOP
    SELECT id INTO v_preceptor_id
    FROM public.preceptores
    WHERE colegio_id = p_colegio_id AND lower(email) = lower(v_preceptor->>'email');
    IF v_preceptor_id IS NULL THEN
      RAISE EXCEPTION 'No se encontró la cuenta de preceptor % en este colegio', v_preceptor->>'email';
    END IF;
    v_preceptor_id := NULL;
  END LOOP;

  FOR v_clase IN SELECT value FROM jsonb_array_elements(p_datos->'clases') LOOP
    IF EXISTS (
      SELECT 1 FROM public.clases
      WHERE colegio_id = p_colegio_id
        AND anio = (v_clase->>'anio')::smallint
        AND division = upper(v_clase->>'division')
    ) THEN
      RAISE EXCEPTION 'La clase % ya existe en este colegio', v_clase->>'nombre';
    END IF;
    IF nullif(btrim(v_clase->>'preceptorEmail'), '') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.preceptores
      WHERE colegio_id = p_colegio_id
        AND lower(email) = lower(v_clase->>'preceptorEmail')
    ) THEN
      RAISE EXCEPTION 'No se encontró el preceptor % en este colegio', v_clase->>'preceptorEmail';
    END IF;
  END LOOP;

  FOR v_alumno IN SELECT value FROM jsonb_array_elements(p_datos->'alumnos') LOOP
    IF EXISTS (
      SELECT 1 FROM public.alumnos
      WHERE colegio_id = p_colegio_id AND lower(legajo) = lower(v_alumno->>'legajo')
    ) THEN
      RAISE EXCEPTION 'El legajo % ya está registrado en este colegio', v_alumno->>'legajo';
    END IF;
    IF EXISTS (SELECT 1 FROM public.alumnos WHERE dni = v_alumno->>'dni') THEN
      RAISE EXCEPTION 'El DNI % ya está registrado', v_alumno->>'dni';
    END IF;
  END LOOP;

  FOR v_clase IN SELECT value FROM jsonb_array_elements(p_datos->'clases') LOOP
    v_clase_id := p_colegio_id::text || '-' || (v_clase->>'anio') || upper(v_clase->>'division');
    v_preceptor_id := NULL;
    IF nullif(btrim(v_clase->>'preceptorEmail'), '') IS NOT NULL THEN
      SELECT id INTO v_preceptor_id
      FROM public.preceptores
      WHERE colegio_id = p_colegio_id
        AND lower(email) = lower(v_clase->>'preceptorEmail');
    END IF;
    INSERT INTO public.clases
      (id, anio, division, nivel, turno, aula, preceptor_id, colegio_id)
    VALUES (
      v_clase_id,
      (v_clase->>'anio')::smallint,
      upper(v_clase->>'division'),
      btrim(v_clase->>'nivel'),
      (v_clase->>'turno')::public.turno_clase,
      btrim(v_clase->>'aula'),
      v_preceptor_id,
      p_colegio_id
    );
    v_ids_clases := v_ids_clases ||
      jsonb_build_object(lower(btrim(v_clase->>'nombre')), v_clase_id);
    v_importadas_clases := v_importadas_clases + 1;
  END LOOP;

  FOR v_profesor IN SELECT value FROM jsonb_array_elements(p_datos->'profesores') LOOP
    SELECT id INTO v_profesor_id
    FROM public.profesores
    WHERE colegio_id = p_colegio_id AND lower(email) = lower(v_profesor->>'email');
    FOR v_nombre_clase IN
      SELECT value FROM jsonb_array_elements_text(v_profesor->'clasesAsignadas')
    LOOP
      v_clase_id := v_ids_clases->>lower(btrim(v_nombre_clase));
      IF v_clase_id IS NULL THEN
        RAISE EXCEPTION 'La clase asignada % no existe', v_nombre_clase;
      END IF;
      INSERT INTO public.profesor_curso (profesor_id, curso_id)
      VALUES (v_profesor_id, v_clase_id);
    END LOOP;
  END LOOP;

  FOR v_alumno IN SELECT value FROM jsonb_array_elements(p_datos->'alumnos') LOOP
    v_clase_id := v_ids_clases->>lower(btrim(v_alumno->>'clase'));
    IF v_clase_id IS NULL THEN
      RAISE EXCEPTION 'La clase del alumno % no existe', v_alumno->>'nombre';
    END IF;
    INSERT INTO public.alumnos
      (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id, colegio_id)
    VALUES (
      btrim(v_alumno->>'legajo'),
      btrim(v_alumno->>'nombre'),
      btrim(v_alumno->>'apellido'),
      btrim(v_alumno->>'dni'),
      (v_alumno->>'fechaNacimiento')::date,
      v_clase_id,
      p_colegio_id
    );
    v_importados_alumnos := v_importados_alumnos + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'colegioId', p_colegio_id,
    'clases', v_importadas_clases,
    'alumnos', v_importados_alumnos,
    'profesores', jsonb_array_length(p_datos->'profesores'),
    'preceptores', jsonb_array_length(p_datos->'preceptores')
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.importar_colegio_excel(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.importar_colegio_excel(uuid, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
