-- ============================================================
-- FichAula · 09b · PRECEPTORES, CICLO LECTIVO Y ASISTENCIAS
-- Requiere sql/08_colegios_importacion.sql y sql/09a_rol_preceptor.sql.
-- ============================================================

ALTER TABLE public.profesores
  ADD COLUMN IF NOT EXISTS dni text,
  ADD COLUMN IF NOT EXISTS fecha_nacimiento date,
  ADD COLUMN IF NOT EXISTS telefono text;

CREATE UNIQUE INDEX IF NOT EXISTS profesores_colegio_dni_key
  ON public.profesores (colegio_id, dni) WHERE dni IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.preceptores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  nombre text NOT NULL,
  apellido text NOT NULL,
  dni text NOT NULL,
  fecha_nacimiento date NOT NULL,
  telefono text NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado timestamptz NOT NULL DEFAULT now(),
  colegio_id uuid NOT NULL REFERENCES public.colegios(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS preceptores_colegio_dni_key
  ON public.preceptores (colegio_id, dni);
CREATE INDEX IF NOT EXISTS idx_preceptores_colegio ON public.preceptores (colegio_id);

ALTER TABLE public.profesores_papelera
  ADD COLUMN IF NOT EXISTS dni text,
  ADD COLUMN IF NOT EXISTS fecha_nacimiento date,
  ADD COLUMN IF NOT EXISTS telefono text;

ALTER TABLE public.clases
  ADD COLUMN IF NOT EXISTS preceptor_id uuid REFERENCES public.preceptores(id) ON DELETE SET NULL;
ALTER TABLE public.clases_papelera
  ADD COLUMN IF NOT EXISTS preceptor_id uuid;

CREATE TABLE IF NOT EXISTS public.preceptores_papelera (LIKE public.preceptores);
ALTER TABLE public.preceptores_papelera
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.comentarios
  ALTER COLUMN alumno_id DROP NOT NULL,
  ALTER COLUMN profesor_id DROP NOT NULL;
ALTER TABLE public.comentarios
  ADD COLUMN IF NOT EXISTS curso_id text REFERENCES public.clases(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS preceptor_id uuid REFERENCES public.preceptores(id) ON DELETE SET NULL;
ALTER TABLE public.comentarios_papelera
  ALTER COLUMN alumno_id DROP NOT NULL,
  ALTER COLUMN profesor_id DROP NOT NULL;
ALTER TABLE public.comentarios_papelera
  ADD COLUMN IF NOT EXISTS curso_id text,
  ADD COLUMN IF NOT EXISTS preceptor_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comentarios_un_destino') THEN
    ALTER TABLE public.comentarios
      ADD CONSTRAINT comentarios_un_destino CHECK (num_nonnulls(alumno_id, curso_id) = 1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comentarios_un_autor') THEN
    ALTER TABLE public.comentarios
      ADD CONSTRAINT comentarios_un_autor CHECK (num_nonnulls(profesor_id, preceptor_id) = 1);
  END IF;
END$$;

ALTER TABLE public.seguimientos
  ALTER COLUMN profesor_id DROP NOT NULL;
ALTER TABLE public.seguimientos
  ADD COLUMN IF NOT EXISTS preceptor_id uuid REFERENCES public.preceptores(id) ON DELETE SET NULL;
ALTER TABLE public.seguimientos_papelera
  ALTER COLUMN profesor_id DROP NOT NULL;
ALTER TABLE public.seguimientos_papelera
  ADD COLUMN IF NOT EXISTS preceptor_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'seguimientos_un_autor') THEN
    ALTER TABLE public.seguimientos
      ADD CONSTRAINT seguimientos_un_autor CHECK (num_nonnulls(profesor_id, preceptor_id) = 1);
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.ciclos_lectivos (
  colegio_id uuid NOT NULL REFERENCES public.colegios(id) ON DELETE CASCADE,
  anio_lectivo smallint NOT NULL CHECK (anio_lectivo BETWEEN 2000 AND 2200),
  activo boolean NOT NULL DEFAULT false,
  creado_por uuid,
  creado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (colegio_id, anio_lectivo)
);
CREATE UNIQUE INDEX IF NOT EXISTS ciclos_lectivos_un_activo_por_colegio
  ON public.ciclos_lectivos (colegio_id) WHERE activo;

CREATE TABLE IF NOT EXISTS public.asistencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id uuid NOT NULL REFERENCES public.alumnos(id) ON DELETE CASCADE,
  curso_id text NOT NULL REFERENCES public.clases(id) ON DELETE CASCADE,
  colegio_id uuid NOT NULL REFERENCES public.colegios(id) ON DELETE CASCADE,
  anio_lectivo smallint NOT NULL,
  fecha date NOT NULL,
  estado text NOT NULL CHECK (estado IN ('presente', 'tarde', 'ausente')),
  justificada boolean NOT NULL DEFAULT false,
  motivo text,
  adjuntos text[] NOT NULL DEFAULT ARRAY[]::text[],
  registrado_por uuid NOT NULL,
  actualizado_por uuid NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT asistencias_ciclo_fk FOREIGN KEY (colegio_id, anio_lectivo)
    REFERENCES public.ciclos_lectivos(colegio_id, anio_lectivo) ON DELETE CASCADE,
  CONSTRAINT asistencias_un_registro_diario UNIQUE (alumno_id, fecha, anio_lectivo),
  CONSTRAINT asistencias_justificacion_check CHECK (
    (justificada = false AND motivo IS NULL)
    OR (justificada = true AND estado = 'ausente' AND char_length(btrim(motivo)) > 0)
  )
);
CREATE INDEX IF NOT EXISTS idx_asistencias_curso_fecha
  ON public.asistencias (curso_id, fecha, anio_lectivo);
CREATE INDEX IF NOT EXISTS idx_asistencias_alumno_ciclo
  ON public.asistencias (alumno_id, anio_lectivo, fecha);

CREATE TABLE IF NOT EXISTS public.asistencias_papelera (LIKE public.asistencias);
ALTER TABLE public.asistencias_papelera
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.mi_rol()
RETURNS public.rol_usuario
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.superadmins WHERE id = auth.uid()) THEN 'superadmin'::public.rol_usuario
    WHEN EXISTS (SELECT 1 FROM public.admins WHERE id = auth.uid()) THEN 'admin'::public.rol_usuario
    WHEN EXISTS (SELECT 1 FROM public.profesores WHERE id = auth.uid()) THEN 'profesor'::public.rol_usuario
    WHEN EXISTS (SELECT 1 FROM public.preceptores WHERE id = auth.uid()) THEN 'preceptor'::public.rol_usuario
    ELSE NULL
  END;
$$;
REVOKE EXECUTE ON FUNCTION public.mi_rol() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mi_rol() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.vincular_perfil_auth()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE v_perfiles integer;
BEGIN
  SELECT count(*) INTO v_perfiles FROM (
    SELECT id FROM public.superadmins WHERE lower(email) = lower(NEW.email)
    UNION ALL SELECT id FROM public.admins WHERE lower(email) = lower(NEW.email)
    UNION ALL SELECT id FROM public.profesores WHERE lower(email) = lower(NEW.email)
    UNION ALL SELECT id FROM public.preceptores WHERE lower(email) = lower(NEW.email)
  ) perfiles;
  IF v_perfiles > 1 THEN RAISE EXCEPTION 'El email está asignado a más de un perfil'; END IF;
  UPDATE public.superadmins SET id = NEW.id WHERE lower(email) = lower(NEW.email);
  UPDATE public.admins SET id = NEW.id WHERE lower(email) = lower(NEW.email);
  UPDATE public.profesores SET id = NEW.id WHERE lower(email) = lower(NEW.email);
  UPDATE public.preceptores SET id = NEW.id WHERE lower(email) = lower(NEW.email);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.mi_colegio_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT COALESCE(
    (SELECT a.colegio_id FROM public.admins a WHERE a.id = auth.uid()),
    (SELECT p.colegio_id FROM public.profesores p WHERE p.id = auth.uid()),
    (SELECT p.colegio_id FROM public.preceptores p WHERE p.id = auth.uid())
  );
$$;
REVOKE EXECUTE ON FUNCTION public.mi_colegio_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mi_colegio_id() TO authenticated;

CREATE OR REPLACE FUNCTION public.preceptor_pertenece_a_colegio(p_preceptor_id uuid, p_colegio_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.preceptores p
    WHERE p.id = p_preceptor_id AND p.colegio_id = p_colegio_id
      AND (mi_rol() = 'superadmin' OR p_colegio_id = mi_colegio_id())
  );
$$;
REVOKE EXECUTE ON FUNCTION public.preceptor_pertenece_a_colegio(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preceptor_pertenece_a_colegio(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.usuario_asignado_a_clase(p_curso_id text, p_usuario_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profesor_curso pc
    JOIN public.profesores p ON p.id = pc.profesor_id
    JOIN public.clases c ON c.id = pc.curso_id
    WHERE pc.curso_id = p_curso_id AND pc.profesor_id = p_usuario_id
      AND p.colegio_id = c.colegio_id
  ) OR EXISTS (
    SELECT 1 FROM public.clases c
    JOIN public.preceptores p ON p.id = c.preceptor_id
    WHERE c.id = p_curso_id AND p.id = p_usuario_id
      AND p.colegio_id = c.colegio_id
  );
$$;
REVOKE EXECUTE ON FUNCTION public.usuario_asignado_a_clase(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.usuario_asignado_a_clase(text, uuid) TO authenticated;

DROP TRIGGER IF EXISTS trg_preceptores_upd ON public.preceptores;
CREATE TRIGGER trg_preceptores_upd BEFORE UPDATE ON public.preceptores
  FOR EACH ROW EXECUTE FUNCTION public.set_actualizado();

CREATE OR REPLACE FUNCTION public.set_asistencia_actualizado_en()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  NEW.actualizado_en = NOW();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_asistencias_upd ON public.asistencias;
CREATE TRIGGER trg_asistencias_upd BEFORE UPDATE ON public.asistencias
  FOR EACH ROW EXECUTE FUNCTION public.set_asistencia_actualizado_en();

ALTER TABLE public.preceptores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ciclos_lectivos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asistencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asistencias_papelera ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preceptores_papelera ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pre_select ON public.preceptores;
DROP POLICY IF EXISTS pre_insert ON public.preceptores;
DROP POLICY IF EXISTS pre_update ON public.preceptores;
DROP POLICY IF EXISTS pre_delete ON public.preceptores;
CREATE POLICY pre_select ON public.preceptores FOR SELECT
  USING (id = (select auth.uid()) OR (select mi_rol()) = 'superadmin'
         OR ((select mi_rol()) = 'admin' AND colegio_id = (select mi_colegio_id())));
CREATE POLICY pre_insert ON public.preceptores FOR INSERT
  WITH CHECK ((select mi_rol()) = 'superadmin'
              OR ((select mi_rol()) = 'admin' AND colegio_id = (select mi_colegio_id())));
CREATE POLICY pre_update ON public.preceptores FOR UPDATE
  USING ((select mi_rol()) = 'superadmin'
         OR ((select mi_rol()) = 'admin' AND colegio_id = (select mi_colegio_id())))
  WITH CHECK ((select mi_rol()) = 'superadmin'
              OR ((select mi_rol()) = 'admin' AND colegio_id = (select mi_colegio_id())));
CREATE POLICY pre_delete ON public.preceptores FOR DELETE
  USING (false);

DROP POLICY IF EXISTS cl_select ON public.clases;
DROP POLICY IF EXISTS cl_insert ON public.clases;
DROP POLICY IF EXISTS cl_update ON public.clases;
DROP POLICY IF EXISTS cl_delete ON public.clases;
CREATE POLICY cl_select ON public.clases FOR SELECT
  USING ((select mi_rol()) = 'superadmin'
         OR ((select mi_rol()) = 'admin' AND colegio_id = (select mi_colegio_id()))
         OR (colegio_id = (select mi_colegio_id())
             AND (id IN (SELECT pc.curso_id FROM public.profesor_curso pc WHERE pc.profesor_id = (select auth.uid()))
                  OR preceptor_id = (select auth.uid()))));
CREATE POLICY cl_insert ON public.clases FOR INSERT
  WITH CHECK ((select mi_rol()) = 'superadmin'
              OR ((select mi_rol()) = 'admin' AND colegio_id = (select mi_colegio_id())
                  AND (profesor_titular_id IS NULL
                       OR profesor_pertenece_a_colegio(profesor_titular_id, (select mi_colegio_id())))
                  AND (preceptor_id IS NULL
                       OR preceptor_pertenece_a_colegio(preceptor_id, (select mi_colegio_id())))));
CREATE POLICY cl_update ON public.clases FOR UPDATE
  USING ((select mi_rol()) = 'superadmin'
         OR ((select mi_rol()) = 'admin' AND colegio_id = (select mi_colegio_id())))
  WITH CHECK ((select mi_rol()) = 'superadmin'
              OR ((select mi_rol()) = 'admin' AND colegio_id = (select mi_colegio_id())
                  AND (profesor_titular_id IS NULL
                       OR profesor_pertenece_a_colegio(profesor_titular_id, (select mi_colegio_id())))
                  AND (preceptor_id IS NULL
                       OR preceptor_pertenece_a_colegio(preceptor_id, (select mi_colegio_id())))));
CREATE POLICY cl_delete ON public.clases FOR DELETE
  USING ((select mi_rol()) = 'superadmin'
         OR ((select mi_rol()) = 'admin' AND colegio_id = (select mi_colegio_id())));

DROP POLICY IF EXISTS al_select ON public.alumnos;
DROP POLICY IF EXISTS al_insert ON public.alumnos;
DROP POLICY IF EXISTS al_update ON public.alumnos;
DROP POLICY IF EXISTS al_delete ON public.alumnos;
CREATE POLICY al_select ON public.alumnos FOR SELECT
  USING ((select mi_rol()) = 'superadmin'
         OR ((select mi_rol()) = 'admin' AND colegio_id = (select mi_colegio_id()))
         OR (colegio_id = (select mi_colegio_id())
             AND usuario_asignado_a_clase(curso_id, (select auth.uid()))));
CREATE POLICY al_insert ON public.alumnos FOR INSERT
  WITH CHECK ((select mi_rol()) IN ('admin','superadmin')
              AND ((select mi_rol()) = 'superadmin'
                   OR colegio_id = (select mi_colegio_id()))
              AND EXISTS (SELECT 1 FROM public.clases c
                          WHERE c.id = curso_id
                            AND c.colegio_id = public.alumnos.colegio_id));
CREATE POLICY al_update ON public.alumnos FOR UPDATE
  USING ((select mi_rol()) = 'superadmin'
         OR ((select mi_rol()) = 'admin' AND colegio_id = (select mi_colegio_id())))
  WITH CHECK (((select mi_rol()) = 'superadmin'
               OR ((select mi_rol()) = 'admin' AND colegio_id = (select mi_colegio_id())))
              AND EXISTS (SELECT 1 FROM public.clases c
                          WHERE c.id = curso_id
                            AND c.colegio_id = public.alumnos.colegio_id));
CREATE POLICY al_delete ON public.alumnos FOR DELETE
  USING ((select mi_rol()) = 'superadmin'
         OR ((select mi_rol()) = 'admin' AND colegio_id = (select mi_colegio_id())));

DROP POLICY IF EXISTS ciclos_select ON public.ciclos_lectivos;
CREATE POLICY ciclos_select ON public.ciclos_lectivos FOR SELECT
  USING ((select mi_rol()) = 'superadmin'
         OR colegio_id = (select mi_colegio_id()));

DROP POLICY IF EXISTS asistencias_select ON public.asistencias;
DROP POLICY IF EXISTS asistencias_insert ON public.asistencias;
DROP POLICY IF EXISTS asistencias_update ON public.asistencias;
CREATE POLICY asistencias_select ON public.asistencias FOR SELECT
  USING ((select mi_rol()) = 'superadmin'
         OR ((select mi_rol()) = 'admin' AND colegio_id = (select mi_colegio_id()))
         OR (colegio_id = (select mi_colegio_id())
             AND (usuario_asignado_a_clase(curso_id, (select auth.uid()))
                  OR EXISTS (SELECT 1 FROM public.alumnos a
                             WHERE a.id = alumno_id
                               AND usuario_asignado_a_clase(a.curso_id, (select auth.uid()))))));
CREATE POLICY asistencias_insert ON public.asistencias FOR INSERT
  WITH CHECK (false);
CREATE POLICY asistencias_update ON public.asistencias FOR UPDATE
  USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS asistencias_papelera_select ON public.asistencias_papelera;
CREATE POLICY asistencias_papelera_select ON public.asistencias_papelera FOR SELECT
  USING ((select mi_rol()) = 'superadmin'
         OR ((select mi_rol()) = 'admin' AND colegio_id = (select mi_colegio_id())));
DROP POLICY IF EXISTS preceptores_papelera_select ON public.preceptores_papelera;
CREATE POLICY preceptores_papelera_select ON public.preceptores_papelera FOR SELECT
  USING ((select mi_rol()) = 'superadmin'
         OR ((select mi_rol()) = 'admin' AND colegio_id = (select mi_colegio_id())));

DROP POLICY IF EXISTS com_select ON public.comentarios;
DROP POLICY IF EXISTS com_insert ON public.comentarios;
DROP POLICY IF EXISTS com_update ON public.comentarios;
CREATE POLICY com_select ON public.comentarios FOR SELECT
  USING ((select mi_rol()) = 'superadmin'
         OR ((select mi_rol()) = 'admin' AND
             (CASE WHEN alumno_id IS NOT NULL THEN alumno_pertenece_a_colegio(alumno_id, (select mi_colegio_id()))
                   ELSE curso_pertenece_a_colegio(curso_id, (select mi_colegio_id())) END))
         OR ((select mi_rol()) IN ('profesor','preceptor')
             AND (profesor_id = (select auth.uid()) OR preceptor_id = (select auth.uid())
                  OR visible_para = 'profesor')
             AND usuario_asignado_a_clase(
               COALESCE(curso_id, (SELECT a.curso_id FROM public.alumnos a WHERE a.id = alumno_id)),
               (select auth.uid()))));
CREATE POLICY com_insert ON public.comentarios FOR INSERT
  WITH CHECK (
    ((profesor_id = (select auth.uid()) AND preceptor_id IS NULL AND (select mi_rol()) = 'profesor')
     OR (preceptor_id = (select auth.uid()) AND profesor_id IS NULL AND (select mi_rol()) = 'preceptor'))
    AND usuario_asignado_a_clase(
      COALESCE(curso_id, (SELECT a.curso_id FROM public.alumnos a WHERE a.id = alumno_id)),
      (select auth.uid())));
CREATE POLICY com_update ON public.comentarios FOR UPDATE
  USING ((profesor_id = (select auth.uid()) OR preceptor_id = (select auth.uid()))
         AND usuario_asignado_a_clase(
           COALESCE(curso_id, (SELECT a.curso_id FROM public.alumnos a WHERE a.id = alumno_id)),
           (select auth.uid())))
  WITH CHECK ((profesor_id = (select auth.uid()) OR preceptor_id = (select auth.uid()))
              AND usuario_asignado_a_clase(
                COALESCE(curso_id, (SELECT a.curso_id FROM public.alumnos a WHERE a.id = alumno_id)),
                (select auth.uid())));

DROP POLICY IF EXISTS seg_select ON public.seguimientos;
DROP POLICY IF EXISTS seg_insert ON public.seguimientos;
DROP POLICY IF EXISTS seg_update ON public.seguimientos;
CREATE POLICY seg_select ON public.seguimientos FOR SELECT
  USING ((select mi_rol()) = 'superadmin'
         OR ((select mi_rol()) = 'admin' AND alumno_pertenece_a_colegio(alumno_id, (select mi_colegio_id())))
         OR (((select mi_rol()) IN ('profesor','preceptor'))
             AND (profesor_id = (select auth.uid()) OR preceptor_id = (select auth.uid())
                  OR visible_para = 'profesor')
             AND EXISTS (SELECT 1 FROM public.alumnos a
                         WHERE a.id = alumno_id
                           AND usuario_asignado_a_clase(a.curso_id, (select auth.uid())))));
CREATE POLICY seg_insert ON public.seguimientos FOR INSERT
  WITH CHECK (
    ((profesor_id = (select auth.uid()) AND preceptor_id IS NULL AND (select mi_rol()) = 'profesor')
     OR (preceptor_id = (select auth.uid()) AND profesor_id IS NULL AND (select mi_rol()) = 'preceptor'))
    AND EXISTS (SELECT 1 FROM public.alumnos a
                WHERE a.id = alumno_id AND usuario_asignado_a_clase(a.curso_id, (select auth.uid()))));
CREATE POLICY seg_update ON public.seguimientos FOR UPDATE
  USING ((profesor_id = (select auth.uid()) OR preceptor_id = (select auth.uid()))
         AND EXISTS (SELECT 1 FROM public.alumnos a
                     WHERE a.id = alumno_id AND usuario_asignado_a_clase(a.curso_id, (select auth.uid()))))
  WITH CHECK ((profesor_id = (select auth.uid()) OR preceptor_id = (select auth.uid()))
              AND EXISTS (SELECT 1 FROM public.alumnos a
                          WHERE a.id = alumno_id AND usuario_asignado_a_clase(a.curso_id, (select auth.uid()))));

CREATE OR REPLACE FUNCTION public.datos_preceptor(p_preceptor_id uuid)
RETURNS TABLE (nombre text, apellido text, materia text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT p.nombre, p.apellido, 'Preceptor/a'::text
  FROM public.preceptores p
  WHERE p.id = p_preceptor_id
    AND mi_rol() IS NOT NULL
    AND (mi_rol() = 'superadmin' OR p.colegio_id = mi_colegio_id());
$$;
REVOKE EXECUTE ON FUNCTION public.datos_preceptor(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.datos_preceptor(uuid) TO authenticated;

CREATE OR REPLACE VIEW public.vista_seguimientos_completa
  WITH (security_invoker = true) AS
  SELECT s.id, s.categoria, s.texto, s.valor, s.creado_en,
         a.legajo AS alumno_legajo, a.nombre AS alumno_nombre, a.apellido AS alumno_apellido,
         c.id AS curso_id, (c.anio || '° ' || c.division) AS curso_nombre,
         COALESCE(s.profesor_id, s.preceptor_id) AS profesor_id,
         COALESCE(au.nombre, pr.nombre) AS profesor_nombre,
         COALESCE(au.apellido, pr.apellido) AS profesor_apellido,
         COALESCE(au.materia, pr.materia) AS materia,
         s.visible_para, s.alumno_id,
         CASE WHEN s.preceptor_id IS NOT NULL THEN 'preceptor' ELSE 'profesor' END AS autor_rol
  FROM public.seguimientos s
  JOIN public.alumnos a ON a.id = s.alumno_id
  JOIN public.clases c ON c.id = a.curso_id
  LEFT JOIN LATERAL public.datos_autor(s.profesor_id) au ON s.profesor_id IS NOT NULL
  LEFT JOIN LATERAL public.datos_preceptor(s.preceptor_id) pr ON s.preceptor_id IS NOT NULL;

CREATE OR REPLACE VIEW public.vista_seguimientos_papelera
  WITH (security_invoker = true) AS
  SELECT sp.papelera_id, sp.id, sp.categoria, sp.texto, sp.valor, sp.creado_en, sp.visible_para,
         sp.deleted_at, sp.eliminado_por,
         (sp.eliminado_por = COALESCE(sp.profesor_id, sp.preceptor_id)) AS eliminado_por_autor,
         sp.alumno_id,
         COALESCE(a.legajo, ap.legajo) AS alumno_legajo,
         COALESCE(a.nombre, ap.nombre) AS alumno_nombre,
         COALESCE(a.apellido, ap.apellido) AS alumno_apellido,
         COALESCE(a.dni, ap.dni) AS alumno_dni,
         COALESCE(a.curso_id, ap.curso_id) AS curso_id,
         (c.anio || '° ' || c.division) AS curso_nombre,
         (a.id IS NOT NULL) AS alumno_existe,
         COALESCE(sp.profesor_id, sp.preceptor_id) AS profesor_id,
         COALESCE(p.nombre, pp.nombre, pre.nombre, prep.nombre) AS profesor_nombre,
         COALESCE(p.apellido, pp.apellido, pre.apellido, prep.apellido) AS profesor_apellido,
         COALESCE(p.materia, pp.materia, 'Preceptor/a') AS materia,
         (p.id IS NOT NULL OR pre.id IS NOT NULL) AS profesor_existe
  FROM public.seguimientos_papelera sp
  LEFT JOIN public.alumnos a ON a.id = sp.alumno_id
  LEFT JOIN LATERAL (SELECT x.legajo,x.nombre,x.apellido,x.dni,x.curso_id FROM public.alumnos_papelera x
                     WHERE x.id = sp.alumno_id ORDER BY x.deleted_at DESC LIMIT 1) ap ON a.id IS NULL
  LEFT JOIN public.clases c ON c.id = COALESCE(a.curso_id, ap.curso_id)
  LEFT JOIN public.profesores p ON p.id = sp.profesor_id
  LEFT JOIN LATERAL (SELECT y.nombre,y.apellido,y.materia FROM public.profesores_papelera y
                     WHERE y.id = sp.profesor_id ORDER BY y.deleted_at DESC LIMIT 1) pp ON p.id IS NULL
  LEFT JOIN public.preceptores pre ON pre.id = sp.preceptor_id
  LEFT JOIN LATERAL (SELECT y.nombre,y.apellido FROM public.preceptores_papelera y
                     WHERE y.id = sp.preceptor_id ORDER BY y.deleted_at DESC LIMIT 1) prep ON pre.id IS NULL;

CREATE OR REPLACE VIEW public.vista_comentarios_completa
  WITH (security_invoker = true) AS
  SELECT c.id, c.alumno_id, c.curso_id, c.texto, c.visible_para, c.creado_en,
         COALESCE(c.profesor_id, c.preceptor_id) AS autor_id,
         CASE WHEN c.preceptor_id IS NOT NULL THEN 'preceptor' ELSE 'profesor' END AS autor_rol,
         COALESCE(p.nombre, autor_pre.nombre) AS autor_nombre,
         COALESCE(p.apellido, autor_pre.apellido) AS autor_apellido,
         a.nombre AS alumno_nombre, a.apellido AS alumno_apellido,
         cl.id AS clase_id, (cl.anio || '° ' || cl.division) AS clase_nombre
  FROM public.comentarios c
  LEFT JOIN public.profesores p ON p.id = c.profesor_id
  LEFT JOIN LATERAL public.datos_preceptor(c.preceptor_id) autor_pre ON c.preceptor_id IS NOT NULL
  LEFT JOIN public.alumnos a ON a.id = c.alumno_id
  LEFT JOIN public.clases cl ON cl.id = COALESCE(c.curso_id, a.curso_id);

CREATE OR REPLACE FUNCTION public.seguimientos_a_papelera(p_ids uuid[])
RETURNS void LANGUAGE sql SET search_path = 'public'
AS $$
  WITH movidos AS (
    DELETE FROM public.seguimientos s WHERE s.id = ANY (p_ids)
    RETURNING s.id, s.alumno_id, s.profesor_id, s.preceptor_id, s.categoria, s.texto,
              s.valor, s.creado_en, s.actualizado, s.visible_para
  )
  INSERT INTO public.seguimientos_papelera
    (id, alumno_id, profesor_id, preceptor_id, categoria, texto, valor,
     creado_en, actualizado, visible_para, deleted_at, eliminado_por)
  SELECT m.id, m.alumno_id, m.profesor_id, m.preceptor_id, m.categoria, m.texto, m.valor,
         m.creado_en, m.actualizado, m.visible_para, now(), auth.uid()
  FROM movidos m;
$$;

CREATE OR REPLACE FUNCTION public.eliminar_comentario(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE v comentarios%ROWTYPE;
BEGIN
  SELECT * INTO v FROM public.comentarios WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Comentario no encontrado'; END IF;
  IF NOT COALESCE(COALESCE(v.profesor_id, v.preceptor_id) = auth.uid()
                  OR mi_rol() IN ('admin','superadmin'), false) THEN
    RAISE EXCEPTION 'No tenés permiso para eliminar este comentario';
  END IF;
  INSERT INTO public.comentarios_papelera
    (id, alumno_id, profesor_id, texto, visible_para, creado_en, actualizado,
     deleted_at, curso_id, preceptor_id)
  VALUES (v.id, v.alumno_id, v.profesor_id, v.texto, v.visible_para, v.creado_en,
          v.actualizado, now(), v.curso_id, v.preceptor_id);
  DELETE FROM public.comentarios WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.eliminar_seguimiento(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE v_owner uuid;
BEGIN
  SELECT COALESCE(profesor_id, preceptor_id) INTO v_owner
  FROM public.seguimientos WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Seguimiento no encontrado'; END IF;
  IF NOT COALESCE(v_owner = auth.uid() OR mi_rol() IN ('admin','superadmin'), false) THEN
    RAISE EXCEPTION 'No tenés permiso para eliminar este seguimiento';
  END IF;
  PERFORM public.seguimientos_a_papelera(ARRAY[p_id]);
END;
$$;

CREATE OR REPLACE FUNCTION public.eliminar_alumno(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE v public.alumnos%ROWTYPE;
BEGIN
  IF mi_rol() IS NULL OR mi_rol() NOT IN ('admin','superadmin') THEN
    RAISE EXCEPTION 'No tenés permiso para eliminar alumnos';
  END IF;
  SELECT * INTO v FROM public.alumnos WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Alumno no encontrado'; END IF;
  IF mi_rol() = 'admin' AND v.colegio_id IS DISTINCT FROM mi_colegio_id() THEN
    RAISE EXCEPTION 'No tenés permiso para eliminar alumnos de otro colegio';
  END IF;
  PERFORM 1 FROM public.asistencias WHERE alumno_id = p_id FOR UPDATE;
  INSERT INTO public.asistencias_papelera
    (id, alumno_id, curso_id, colegio_id, anio_lectivo, fecha, estado, justificada,
     motivo, adjuntos, registrado_por, actualizado_por, creado_en, actualizado_en, deleted_at)
  SELECT id, alumno_id, curso_id, colegio_id, anio_lectivo, fecha, estado, justificada,
         motivo, adjuntos, registrado_por, actualizado_por, creado_en, actualizado_en, now()
  FROM public.asistencias WHERE alumno_id = p_id;
  DELETE FROM public.asistencias WHERE alumno_id = p_id;
  INSERT INTO public.comentarios_papelera
    (id, alumno_id, profesor_id, texto, visible_para, creado_en, actualizado,
     deleted_at, curso_id, preceptor_id)
  SELECT id, alumno_id, profesor_id, texto, visible_para, creado_en, actualizado,
         now(), curso_id, preceptor_id
  FROM public.comentarios WHERE alumno_id = p_id;
  PERFORM public.seguimientos_a_papelera(
    ARRAY(SELECT s.id FROM public.seguimientos s WHERE s.alumno_id = p_id));
  INSERT INTO public.alumnos_papelera
    (id, legajo, nombre, apellido, dni, fecha_nacimiento, curso_id, activo, creado_en,
     actualizado, deleted_at, colegio_id)
  VALUES (v.id, v.legajo, v.nombre, v.apellido, v.dni, v.fecha_nacimiento, v.curso_id,
          v.activo, v.creado_en, v.actualizado, now(), v.colegio_id);
  DELETE FROM public.alumnos WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.eliminar_clase(p_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE v public.clases%ROWTYPE;
BEGIN
  IF mi_rol() IS NULL OR mi_rol() NOT IN ('admin','superadmin') THEN
    RAISE EXCEPTION 'No tenés permiso para eliminar clases';
  END IF;
  SELECT * INTO v FROM public.clases WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Clase no encontrada'; END IF;
  IF mi_rol() = 'admin' AND v.colegio_id IS DISTINCT FROM mi_colegio_id() THEN
    RAISE EXCEPTION 'No tenés permiso para eliminar clases de otro colegio';
  END IF;
  IF EXISTS (SELECT 1 FROM public.alumnos WHERE curso_id = p_id) THEN
    RAISE EXCEPTION 'No se puede eliminar: la clase todavía tiene alumnos';
  END IF;
  INSERT INTO public.asistencias_papelera
    (id, alumno_id, curso_id, colegio_id, anio_lectivo, fecha, estado, justificada,
     motivo, adjuntos, registrado_por, actualizado_por, creado_en, actualizado_en, deleted_at)
  SELECT id, alumno_id, curso_id, colegio_id, anio_lectivo, fecha, estado, justificada,
         motivo, adjuntos, registrado_por, actualizado_por, creado_en, actualizado_en, now()
  FROM public.asistencias WHERE curso_id = p_id;
  DELETE FROM public.asistencias WHERE curso_id = p_id;
  INSERT INTO public.comentarios_papelera
    (id, alumno_id, profesor_id, texto, visible_para, creado_en, actualizado,
     deleted_at, curso_id, preceptor_id)
  SELECT id, alumno_id, profesor_id, texto, visible_para, creado_en, actualizado,
         now(), curso_id, preceptor_id
  FROM public.comentarios WHERE curso_id = p_id;
  DELETE FROM public.comentarios WHERE curso_id = p_id;
  INSERT INTO public.clases_papelera
    (id, anio, division, nivel, turno, aula, profesor_titular_id, activo, creado_en,
     deleted_at, colegio_id, preceptor_id)
  VALUES (v.id, v.anio, v.division, v.nivel, v.turno, v.aula, v.profesor_titular_id,
          v.activo, v.creado_en, now(), v.colegio_id, v.preceptor_id);
  DELETE FROM public.clases WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.eliminar_profesor(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE v public.profesores%ROWTYPE;
BEGIN
  IF mi_rol() IS NULL OR mi_rol() NOT IN ('admin','superadmin') THEN
    RAISE EXCEPTION 'No tenés permiso para eliminar profesores';
  END IF;
  SELECT * INTO v FROM public.profesores WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profesor no encontrado'; END IF;
  IF mi_rol() = 'admin' AND v.colegio_id IS DISTINCT FROM mi_colegio_id() THEN
    RAISE EXCEPTION 'No tenés permiso para eliminar profesores de otro colegio';
  END IF;
  INSERT INTO public.comentarios_papelera
    (id, alumno_id, profesor_id, texto, visible_para, creado_en, actualizado,
     deleted_at, curso_id, preceptor_id)
  SELECT id, alumno_id, profesor_id, texto, visible_para, creado_en, actualizado,
         now(), curso_id, preceptor_id
  FROM public.comentarios WHERE profesor_id = p_id;
  PERFORM public.seguimientos_a_papelera(
    ARRAY(SELECT s.id FROM public.seguimientos s WHERE s.profesor_id = p_id));
  INSERT INTO public.profesor_curso_papelera (profesor_id, curso_id, deleted_at, colegio_id)
  SELECT profesor_id, curso_id, now(), v.colegio_id
  FROM public.profesor_curso WHERE profesor_id = p_id;
  INSERT INTO public.profesores_papelera
    (id, email, nombre, apellido, materia, activo, creado_en, actualizado, deleted_at,
     colegio_id, dni, fecha_nacimiento, telefono)
  VALUES (v.id, v.email, v.nombre, v.apellido, v.materia, v.activo, v.creado_en,
          v.actualizado, now(), v.colegio_id, v.dni, v.fecha_nacimiento, v.telefono);
  DELETE FROM public.profesores WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.eliminar_preceptor(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE v public.preceptores%ROWTYPE;
BEGIN
  IF mi_rol() IS NULL OR mi_rol() NOT IN ('admin','superadmin') THEN
    RAISE EXCEPTION 'No tenés permiso para eliminar preceptores';
  END IF;
  SELECT * INTO v FROM public.preceptores WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Preceptor no encontrado'; END IF;
  IF mi_rol() = 'admin' AND v.colegio_id IS DISTINCT FROM mi_colegio_id() THEN
    RAISE EXCEPTION 'No tenés permiso para eliminar preceptores de otro colegio';
  END IF;
  INSERT INTO public.comentarios_papelera
    (id, alumno_id, profesor_id, texto, visible_para, creado_en, actualizado,
     deleted_at, curso_id, preceptor_id)
  SELECT id, alumno_id, profesor_id, texto, visible_para, creado_en, actualizado,
         now(), curso_id, preceptor_id
  FROM public.comentarios WHERE preceptor_id = p_id;
  PERFORM public.seguimientos_a_papelera(
    ARRAY(SELECT s.id FROM public.seguimientos s WHERE s.preceptor_id = p_id));
  INSERT INTO public.preceptores_papelera
    (id, email, nombre, apellido, dni, fecha_nacimiento, telefono, activo,
     creado_en, actualizado, colegio_id, deleted_at)
  VALUES (v.id, v.email, v.nombre, v.apellido, v.dni, v.fecha_nacimiento, v.telefono,
          v.activo, v.creado_en, v.actualizado, v.colegio_id, now());
  DELETE FROM public.comentarios WHERE preceptor_id = p_id;
  UPDATE public.clases SET preceptor_id = NULL WHERE preceptor_id = p_id;
  DELETE FROM public.preceptores WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.abrir_anio_lectivo(p_colegio_id uuid, p_anio_lectivo smallint)
RETURNS public.ciclos_lectivos
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE v public.ciclos_lectivos%ROWTYPE;
BEGIN
  IF mi_rol() IS NULL OR mi_rol() NOT IN ('admin','superadmin') THEN
    RAISE EXCEPTION 'Solo dirección puede abrir un año lectivo';
  END IF;
  IF mi_rol() = 'admin' AND p_colegio_id IS DISTINCT FROM mi_colegio_id() THEN
    RAISE EXCEPTION 'No tenés permiso para modificar otro colegio';
  END IF;
  IF p_anio_lectivo NOT BETWEEN 2000 AND 2200 THEN
    RAISE EXCEPTION 'El año lectivo no es válido';
  END IF;
  PERFORM 1 FROM public.colegios WHERE id = p_colegio_id AND activo = true FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El colegio no existe o está inactivo'; END IF;
  UPDATE public.ciclos_lectivos SET activo = false
  WHERE colegio_id = p_colegio_id AND activo = true;
  INSERT INTO public.ciclos_lectivos (colegio_id, anio_lectivo, activo, creado_por)
  VALUES (p_colegio_id, p_anio_lectivo, true, auth.uid())
  ON CONFLICT (colegio_id, anio_lectivo)
  DO UPDATE SET activo = true, creado_por = EXCLUDED.creado_por
  RETURNING * INTO v;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.guardar_asistencia(
  p_asistencia_id uuid,
  p_alumno_id uuid,
  p_curso_id text,
  p_fecha date,
  p_anio_lectivo smallint,
  p_estado text,
  p_justificada boolean,
  p_motivo text,
  p_adjuntos text[] DEFAULT ARRAY[]::text[]
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  v_colegio_id uuid;
  v_curso_actual text;
  v_curso_registrado text;
  v_id uuid;
  v_motivo text := NULLIF(btrim(p_motivo), '');
  v_adjuntos text[] := COALESCE(p_adjuntos, ARRAY[]::text[]);
BEGIN
  IF mi_rol() IS NULL OR mi_rol() NOT IN ('admin','superadmin','profesor','preceptor') THEN
    RAISE EXCEPTION 'No tenés permiso para cargar asistencia';
  END IF;
  IF p_estado NOT IN ('presente','tarde','ausente') THEN
    RAISE EXCEPTION 'El estado de asistencia no es válido';
  END IF;
  IF p_justificada AND p_estado <> 'ausente' THEN
    RAISE EXCEPTION 'Solo se puede justificar una ausencia';
  END IF;
  IF p_justificada AND v_motivo IS NULL THEN
    RAISE EXCEPTION 'Explicá el motivo de la justificación';
  END IF;
  IF NOT p_justificada AND (v_motivo IS NOT NULL OR cardinality(v_adjuntos) > 0) THEN
    RAISE EXCEPTION 'El motivo y los adjuntos requieren una ausencia justificada';
  END IF;
  IF cardinality(v_adjuntos) > 5 THEN RAISE EXCEPTION 'Se permiten hasta cinco imágenes'; END IF;

  SELECT colegio_id, curso_id INTO v_colegio_id, v_curso_actual
  FROM public.alumnos WHERE id = p_alumno_id AND activo = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Alumno no encontrado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clases c
                 WHERE c.id = p_curso_id AND c.colegio_id = v_colegio_id) THEN
    RAISE EXCEPTION 'La clase no pertenece al colegio del alumno';
  END IF;
  IF p_estado IS NULL THEN RAISE EXCEPTION 'El estado de asistencia no es válido'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ciclos_lectivos
                 WHERE colegio_id = v_colegio_id AND anio_lectivo = p_anio_lectivo) THEN
    RAISE EXCEPTION 'El año lectivo seleccionado no está registrado';
  END IF;
  IF mi_rol() = 'admin' AND v_colegio_id IS DISTINCT FROM mi_colegio_id() THEN
    RAISE EXCEPTION 'No tenés permiso para editar asistencia de otro colegio';
  END IF;
  IF mi_rol() IN ('profesor','preceptor')
     AND (v_colegio_id IS DISTINCT FROM mi_colegio_id()
          OR NOT usuario_asignado_a_clase(p_curso_id, auth.uid())) THEN
    RAISE EXCEPTION 'La clase no está asignada a tu cuenta';
  END IF;

  IF p_asistencia_id IS NOT NULL THEN
    SELECT id, curso_id INTO v_id, v_curso_registrado FROM public.asistencias
    WHERE id = p_asistencia_id AND alumno_id = p_alumno_id
      AND fecha = p_fecha AND anio_lectivo = p_anio_lectivo AND curso_id = p_curso_id
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'El registro de asistencia no existe'; END IF;
  ELSE
    SELECT id, curso_id INTO v_id, v_curso_registrado FROM public.asistencias
    WHERE alumno_id = p_alumno_id AND fecha = p_fecha AND anio_lectivo = p_anio_lectivo
    FOR UPDATE;
    IF FOUND AND v_curso_registrado IS DISTINCT FROM p_curso_id THEN
      RAISE EXCEPTION 'El registro pertenece a otra clase';
    END IF;
  END IF;

  IF v_id IS NULL AND v_curso_actual IS DISTINCT FROM p_curso_id THEN
    RAISE EXCEPTION 'El alumno ya no pertenece a esta clase';
  END IF;
  IF v_id IS NULL THEN
    v_id := gen_random_uuid();
    IF EXISTS (
      SELECT 1 FROM unnest(v_adjuntos) AS path
      WHERE path IS NULL OR path !~ ('^' || v_id::text || '/[A-Za-z0-9._-]+$')
    ) THEN
      RAISE EXCEPTION 'La ruta de una imagen no pertenece a esta asistencia';
    END IF;
    INSERT INTO public.asistencias
      (id, alumno_id, curso_id, colegio_id, anio_lectivo, fecha, estado, justificada,
       motivo, adjuntos, registrado_por, actualizado_por)
    VALUES (v_id, p_alumno_id, p_curso_id, v_colegio_id, p_anio_lectivo, p_fecha,
            p_estado, p_justificada, CASE WHEN p_justificada THEN v_motivo END,
            v_adjuntos, auth.uid(), auth.uid());
  ELSE
    IF EXISTS (
      SELECT 1 FROM unnest(v_adjuntos) AS path
      WHERE path IS NULL OR path !~ ('^' || v_id::text || '/[A-Za-z0-9._-]+$')
    ) THEN
      RAISE EXCEPTION 'La ruta de una imagen no pertenece a esta asistencia';
    END IF;
    UPDATE public.asistencias
    SET curso_id = p_curso_id,
        estado = p_estado,
        justificada = p_justificada,
        motivo = CASE WHEN p_justificada THEN v_motivo END,
        adjuntos = v_adjuntos,
        actualizado_por = auth.uid()
    WHERE id = v_id;
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.validar_colegio_borrado()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE v_colegio_id uuid; v_owner uuid; v_curso_id text;
BEGIN
  IF auth.uid() IS NULL OR mi_rol() = 'superadmin' THEN RETURN OLD; END IF;
  IF TG_TABLE_NAME IN ('admins','profesores','preceptores','clases','alumnos') THEN
    v_colegio_id := OLD.colegio_id;
  ELSIF TG_TABLE_NAME = 'asistencias' THEN
    v_colegio_id := OLD.colegio_id;
  ELSIF TG_TABLE_NAME = 'profesor_curso' THEN
    SELECT colegio_id INTO v_colegio_id FROM public.clases WHERE id = OLD.curso_id;
    IF v_colegio_id IS NULL THEN
      SELECT colegio_id INTO v_colegio_id FROM public.clases_papelera WHERE id = OLD.curso_id;
    END IF;
  ELSIF TG_TABLE_NAME IN ('comentarios','seguimientos') THEN
    v_owner := COALESCE(OLD.profesor_id, OLD.preceptor_id);
    IF OLD.alumno_id IS NOT NULL THEN
      SELECT colegio_id, curso_id INTO v_colegio_id, v_curso_id
      FROM public.alumnos WHERE id = OLD.alumno_id;
      IF v_colegio_id IS NULL THEN
        SELECT colegio_id, curso_id INTO v_colegio_id, v_curso_id
        FROM public.alumnos_papelera WHERE id = OLD.alumno_id;
      END IF;
    ELSE
      v_curso_id := OLD.curso_id;
      SELECT colegio_id INTO v_colegio_id FROM public.clases WHERE id = v_curso_id;
    END IF;
    IF mi_rol() IN ('profesor','preceptor') AND v_owner = auth.uid()
       AND v_colegio_id = mi_colegio_id()
       AND usuario_asignado_a_clase(v_curso_id, auth.uid()) THEN RETURN OLD; END IF;
  ELSIF TG_TABLE_NAME = 'seguimientos_papelera' THEN
    SELECT colegio_id INTO v_colegio_id FROM public.alumnos WHERE id = OLD.alumno_id;
    IF v_colegio_id IS NULL THEN
      SELECT colegio_id INTO v_colegio_id FROM public.alumnos_papelera WHERE id = OLD.alumno_id;
    END IF;
  END IF;
  IF mi_rol() IS DISTINCT FROM 'admin' OR v_colegio_id IS DISTINCT FROM mi_colegio_id() THEN
    RAISE EXCEPTION 'No tenés permiso para eliminar datos de otro colegio';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_colegio_borrado ON public.preceptores;
CREATE TRIGGER trg_validar_colegio_borrado BEFORE DELETE ON public.preceptores
  FOR EACH ROW EXECUTE FUNCTION public.validar_colegio_borrado();
DROP TRIGGER IF EXISTS trg_validar_colegio_borrado ON public.asistencias;
CREATE TRIGGER trg_validar_colegio_borrado BEFORE DELETE ON public.asistencias
  FOR EACH ROW EXECUTE FUNCTION public.validar_colegio_borrado();

REVOKE EXECUTE ON FUNCTION public.eliminar_preceptor(uuid), public.abrir_anio_lectivo(uuid, smallint),
  public.guardar_asistencia(uuid, uuid, text, date, smallint, text, boolean, text, text[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eliminar_preceptor(uuid), public.abrir_anio_lectivo(uuid, smallint),
  public.guardar_asistencia(uuid, uuid, text, date, smallint, text, boolean, text, text[])
  TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('asistencia-justificaciones', 'asistencia-justificaciones', false, 10485760,
        ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp'];

CREATE OR REPLACE FUNCTION public.puede_ver_asistencia(p_asistencia_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.asistencias a
                 WHERE a.id = p_asistencia_id
                   AND ((mi_rol() = 'superadmin')
                     OR (mi_rol() = 'admin' AND a.colegio_id = mi_colegio_id())
                     OR (mi_rol() IN ('profesor','preceptor')
                         AND a.colegio_id = mi_colegio_id()
                         AND (usuario_asignado_a_clase(a.curso_id, auth.uid())
                           OR EXISTS (SELECT 1 FROM public.alumnos al
                                      WHERE al.id = a.alumno_id
                                        AND usuario_asignado_a_clase(al.curso_id, auth.uid()))))));
$$;
REVOKE EXECUTE ON FUNCTION public.puede_ver_asistencia(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.puede_ver_asistencia(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.puede_editar_asistencia(p_asistencia_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.asistencias a
                 WHERE a.id = p_asistencia_id
                   AND ((mi_rol() = 'superadmin')
                     OR (mi_rol() = 'admin' AND a.colegio_id = mi_colegio_id())
                     OR (mi_rol() IN ('profesor','preceptor')
                         AND a.colegio_id = mi_colegio_id()
                         AND usuario_asignado_a_clase(a.curso_id, auth.uid()))));
$$;
REVOKE EXECUTE ON FUNCTION public.puede_editar_asistencia(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.puede_editar_asistencia(uuid) TO authenticated;

DROP POLICY IF EXISTS asistencia_adjuntos_select ON storage.objects;
DROP POLICY IF EXISTS asistencia_adjuntos_insert ON storage.objects;
DROP POLICY IF EXISTS asistencia_adjuntos_update ON storage.objects;
DROP POLICY IF EXISTS asistencia_adjuntos_delete ON storage.objects;
CREATE POLICY asistencia_adjuntos_select ON storage.objects FOR SELECT
  USING (bucket_id = 'asistencia-justificaciones'
         AND EXISTS (SELECT 1 FROM public.asistencias a
                     WHERE a.id::text = split_part(name, '/', 1)
                       AND public.puede_ver_asistencia(a.id)));
CREATE POLICY asistencia_adjuntos_insert ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'asistencia-justificaciones'
              AND EXISTS (SELECT 1 FROM public.asistencias a
                          WHERE a.id::text = split_part(name, '/', 1)
                            AND public.puede_editar_asistencia(a.id)));
CREATE POLICY asistencia_adjuntos_update ON storage.objects FOR UPDATE
  USING (bucket_id = 'asistencia-justificaciones'
         AND EXISTS (SELECT 1 FROM public.asistencias a
                     WHERE a.id::text = split_part(name, '/', 1)
                       AND public.puede_editar_asistencia(a.id)))
  WITH CHECK (bucket_id = 'asistencia-justificaciones'
              AND EXISTS (SELECT 1 FROM public.asistencias a
                          WHERE a.id::text = split_part(name, '/', 1)
                            AND public.puede_editar_asistencia(a.id)));
CREATE POLICY asistencia_adjuntos_delete ON storage.objects FOR DELETE
  USING (bucket_id = 'asistencia-justificaciones'
         AND EXISTS (SELECT 1 FROM public.asistencias a
                     WHERE a.id::text = split_part(name, '/', 1)
                       AND public.puede_editar_asistencia(a.id)));

CREATE OR REPLACE VIEW public.vista_ficha_alumno
  WITH (security_invoker = true) AS
  SELECT a.id, a.legajo, a.nombre, a.apellido, a.dni, a.fecha_nacimiento,
         date_part('year', age(a.fecha_nacimiento::timestamptz))::int AS edad,
         c.id AS curso_id, c.anio, c.division, c.nivel, c.turno, c.aula, a.colegio_id
  FROM public.alumnos a
  JOIN public.clases c ON c.id = a.curso_id
  WHERE a.activo = true;

