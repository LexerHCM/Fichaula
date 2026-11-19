-- ============================================================
-- FichAula · 08 · COLEGIOS E IMPORTACIÓN XLSX
-- Ejecutar después de 03_papelera.sql y de 07_privacidad_seguimientos.sql (si aplica).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.colegios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL UNIQUE,
  sigla text NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admins ADD COLUMN IF NOT EXISTS colegio_id uuid REFERENCES public.colegios(id);
ALTER TABLE public.profesores ADD COLUMN IF NOT EXISTS colegio_id uuid REFERENCES public.colegios(id);
ALTER TABLE public.clases ADD COLUMN IF NOT EXISTS colegio_id uuid REFERENCES public.colegios(id);
ALTER TABLE public.alumnos ADD COLUMN IF NOT EXISTS colegio_id uuid REFERENCES public.colegios(id);

INSERT INTO public.colegios (nombre, sigla)
VALUES ('Colegio actual', 'CA')
ON CONFLICT (nombre) DO NOTHING;

UPDATE public.admins SET colegio_id = (SELECT id FROM public.colegios WHERE nombre = 'Colegio actual')
WHERE colegio_id IS NULL;
UPDATE public.profesores SET colegio_id = (SELECT id FROM public.colegios WHERE nombre = 'Colegio actual')
WHERE colegio_id IS NULL;
UPDATE public.clases SET colegio_id = (SELECT id FROM public.colegios WHERE nombre = 'Colegio actual')
WHERE colegio_id IS NULL;
UPDATE public.alumnos a SET colegio_id = c.colegio_id
FROM public.clases c WHERE a.curso_id = c.id AND a.colegio_id IS NULL;

ALTER TABLE public.admins_papelera ADD COLUMN IF NOT EXISTS colegio_id uuid REFERENCES public.colegios(id);
ALTER TABLE public.profesores_papelera ADD COLUMN IF NOT EXISTS colegio_id uuid REFERENCES public.colegios(id);
ALTER TABLE public.clases_papelera ADD COLUMN IF NOT EXISTS colegio_id uuid REFERENCES public.colegios(id);
ALTER TABLE public.alumnos_papelera ADD COLUMN IF NOT EXISTS colegio_id uuid REFERENCES public.colegios(id);
ALTER TABLE public.profesor_curso_papelera ADD COLUMN IF NOT EXISTS colegio_id uuid REFERENCES public.colegios(id);

UPDATE public.admins_papelera SET colegio_id = (SELECT id FROM public.colegios WHERE nombre = 'Colegio actual') WHERE colegio_id IS NULL;
UPDATE public.profesores_papelera SET colegio_id = (SELECT id FROM public.colegios WHERE nombre = 'Colegio actual') WHERE colegio_id IS NULL;
UPDATE public.clases_papelera SET colegio_id = (SELECT id FROM public.colegios WHERE nombre = 'Colegio actual') WHERE colegio_id IS NULL;
UPDATE public.alumnos_papelera SET colegio_id = (SELECT id FROM public.colegios WHERE nombre = 'Colegio actual') WHERE colegio_id IS NULL;
UPDATE public.profesor_curso_papelera SET colegio_id = (SELECT id FROM public.colegios WHERE nombre = 'Colegio actual') WHERE colegio_id IS NULL;

ALTER TABLE public.clases DROP CONSTRAINT IF EXISTS clases_anio_division_key;
CREATE UNIQUE INDEX IF NOT EXISTS clases_colegio_anio_division_key
  ON public.clases (colegio_id, anio, division);
ALTER TABLE public.alumnos DROP CONSTRAINT IF EXISTS alumnos_legajo_key;
CREATE UNIQUE INDEX IF NOT EXISTS alumnos_colegio_legajo_key
  ON public.alumnos (colegio_id, legajo);
CREATE INDEX IF NOT EXISTS idx_admins_colegio ON public.admins (colegio_id);
CREATE INDEX IF NOT EXISTS idx_profesores_colegio ON public.profesores (colegio_id);
CREATE INDEX IF NOT EXISTS idx_clases_colegio ON public.clases (colegio_id);
CREATE INDEX IF NOT EXISTS idx_alumnos_colegio ON public.alumnos (colegio_id);

CREATE OR REPLACE FUNCTION public.asignar_colegio_a_fila()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
BEGIN
  IF TG_TABLE_NAME = 'clases' THEN
    NEW.colegio_id := COALESCE(NEW.colegio_id, mi_colegio_id());
    IF NEW.colegio_id IS NOT NULL AND NEW.id NOT LIKE NEW.colegio_id::text || '-%' THEN
      NEW.id := NEW.colegio_id::text || '-' || NEW.id;
    END IF;
  ELSIF TG_TABLE_NAME = 'alumnos' THEN
    NEW.colegio_id := COALESCE(NEW.colegio_id,
      (SELECT c.colegio_id FROM public.clases c WHERE c.id = NEW.curso_id));
  ELSE
    NEW.colegio_id := COALESCE(NEW.colegio_id, mi_colegio_id());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admins_colegio ON public.admins;
CREATE TRIGGER trg_admins_colegio BEFORE INSERT ON public.admins
  FOR EACH ROW EXECUTE FUNCTION public.asignar_colegio_a_fila();
DROP TRIGGER IF EXISTS trg_profesores_colegio ON public.profesores;
CREATE TRIGGER trg_profesores_colegio BEFORE INSERT ON public.profesores
  FOR EACH ROW EXECUTE FUNCTION public.asignar_colegio_a_fila();
DROP TRIGGER IF EXISTS trg_clases_colegio ON public.clases;
CREATE TRIGGER trg_clases_colegio BEFORE INSERT ON public.clases
  FOR EACH ROW EXECUTE FUNCTION public.asignar_colegio_a_fila();
DROP TRIGGER IF EXISTS trg_alumnos_colegio ON public.alumnos;
CREATE TRIGGER trg_alumnos_colegio BEFORE INSERT ON public.alumnos
  FOR EACH ROW EXECUTE FUNCTION public.asignar_colegio_a_fila();

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
  ) perfiles;
  IF v_perfiles > 1 THEN RAISE EXCEPTION 'El email está asignado a más de un perfil'; END IF;
  UPDATE public.superadmins SET id = NEW.id WHERE lower(email) = lower(NEW.email);
  UPDATE public.admins SET id = NEW.id WHERE lower(email) = lower(NEW.email);
  UPDATE public.profesores SET id = NEW.id WHERE lower(email) = lower(NEW.email);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.mi_colegio_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT COALESCE(
    (SELECT a.colegio_id FROM public.admins a WHERE a.id = auth.uid()),
    (SELECT p.colegio_id FROM public.profesores p WHERE p.id = auth.uid())
  );
$$;
REVOKE EXECUTE ON FUNCTION public.mi_colegio_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mi_colegio_id() TO authenticated;

CREATE OR REPLACE FUNCTION public.curso_pertenece_a_colegio(p_curso_id text, p_colegio_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$ SELECT (mi_rol() = 'superadmin' OR p_colegio_id = mi_colegio_id()) AND (
  EXISTS (SELECT 1 FROM public.clases WHERE id = p_curso_id AND colegio_id = p_colegio_id)
  OR EXISTS (SELECT 1 FROM public.clases_papelera WHERE id = p_curso_id AND colegio_id = p_colegio_id)); $$;

CREATE OR REPLACE FUNCTION public.profesor_pertenece_a_colegio(p_profesor_id uuid, p_colegio_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM public.profesores WHERE id = p_profesor_id AND colegio_id = p_colegio_id
  AND (mi_rol() = 'superadmin' OR p_colegio_id = mi_colegio_id()))
  OR ((mi_rol() = 'superadmin' OR p_colegio_id = mi_colegio_id())
      AND EXISTS (SELECT 1 FROM public.profesores_papelera WHERE id = p_profesor_id AND colegio_id = p_colegio_id)); $$;

CREATE OR REPLACE FUNCTION public.alumno_pertenece_a_colegio(p_alumno_id uuid, p_colegio_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$ SELECT (mi_rol() = 'superadmin' OR p_colegio_id = mi_colegio_id()) AND (
  EXISTS (SELECT 1 FROM public.alumnos WHERE id = p_alumno_id AND colegio_id = p_colegio_id)
  OR EXISTS (SELECT 1 FROM public.alumnos_papelera WHERE id = p_alumno_id AND colegio_id = p_colegio_id)); $$;

REVOKE EXECUTE ON FUNCTION public.curso_pertenece_a_colegio(text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.profesor_pertenece_a_colegio(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.alumno_pertenece_a_colegio(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.curso_pertenece_a_colegio(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.profesor_pertenece_a_colegio(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.alumno_pertenece_a_colegio(uuid, uuid) TO authenticated;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['comentarios_papelera','seguimientos_papelera','alumnos_papelera',
                           'clases_papelera','profesores_papelera','admins_papelera','profesor_curso_papelera']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS pap_select ON public.%I', t);
    IF t = 'admins_papelera' THEN
      EXECUTE format('CREATE POLICY pap_select ON public.%I FOR SELECT USING ((select mi_rol()) = ''superadmin'')', t);
    ELSIF t IN ('comentarios_papelera','seguimientos_papelera') THEN
      EXECUTE format('CREATE POLICY pap_select ON public.%I FOR SELECT USING ((select mi_rol()) = ''superadmin'' OR ((select mi_rol()) = ''admin'' AND alumno_pertenece_a_colegio(alumno_id, (select mi_colegio_id()))))', t);
    ELSE
      EXECUTE format('CREATE POLICY pap_select ON public.%I FOR SELECT USING ((select mi_rol()) = ''superadmin'' OR ((select mi_rol()) = ''admin'' AND colegio_id = (select mi_colegio_id())))', t);
    END IF;
  END LOOP;
END$$;

CREATE OR REPLACE FUNCTION public.validar_colegio_borrado()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE v_colegio_id uuid; v_owner uuid;
BEGIN
  IF auth.uid() IS NULL OR mi_rol() = 'superadmin' THEN RETURN OLD; END IF;
  IF TG_TABLE_NAME IN ('admins','profesores','clases','alumnos') THEN
    v_colegio_id := OLD.colegio_id;
  ELSIF TG_TABLE_NAME = 'profesor_curso' THEN
    SELECT c.colegio_id INTO v_colegio_id FROM public.clases c WHERE c.id = OLD.curso_id;
    IF v_colegio_id IS NULL THEN
      SELECT c.colegio_id INTO v_colegio_id FROM public.clases_papelera c WHERE c.id = OLD.curso_id;
    END IF;
    IF NOT profesor_pertenece_a_colegio(OLD.profesor_id, v_colegio_id) THEN
      RAISE EXCEPTION 'No se pueden eliminar asignaciones de otro colegio';
    END IF;
  ELSIF TG_TABLE_NAME IN ('comentarios','seguimientos') THEN
    SELECT a.colegio_id INTO v_colegio_id FROM public.alumnos a WHERE a.id = OLD.alumno_id;
    IF v_colegio_id IS NULL THEN
      SELECT a.colegio_id INTO v_colegio_id FROM public.alumnos_papelera a WHERE a.id = OLD.alumno_id;
    END IF;
    v_owner := OLD.profesor_id;
    IF mi_rol() = 'profesor' AND v_owner = auth.uid()
       AND v_colegio_id = mi_colegio_id() THEN RETURN OLD; END IF;
  ELSIF TG_TABLE_NAME = 'seguimientos_papelera' THEN
    SELECT a.colegio_id INTO v_colegio_id FROM public.alumnos a WHERE a.id = OLD.alumno_id;
    IF v_colegio_id IS NULL THEN
      SELECT a.colegio_id INTO v_colegio_id FROM public.alumnos_papelera a WHERE a.id = OLD.alumno_id;
    END IF;
  END IF;
  IF mi_rol() IS DISTINCT FROM 'admin' OR v_colegio_id IS DISTINCT FROM mi_colegio_id() THEN
    RAISE EXCEPTION 'No tenés permiso para eliminar datos de otro colegio';
  END IF;
  RETURN OLD;
END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['admins','profesores','clases','alumnos','profesor_curso','comentarios','seguimientos']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_validar_colegio_borrado ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_validar_colegio_borrado BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.validar_colegio_borrado()', t);
  END LOOP;
  DROP TRIGGER IF EXISTS trg_validar_colegio_borrado ON public.seguimientos_papelera;
  CREATE TRIGGER trg_validar_colegio_borrado BEFORE DELETE ON public.seguimientos_papelera
    FOR EACH ROW EXECUTE FUNCTION public.validar_colegio_borrado();
END$$;

DO $$
BEGIN
  ALTER TABLE public.clases DROP CONSTRAINT IF EXISTS clases_profesor_titular_id_fkey;
  ALTER TABLE public.clases ADD CONSTRAINT clases_profesor_titular_id_fkey
    FOREIGN KEY (profesor_titular_id) REFERENCES public.profesores(id) ON DELETE SET NULL ON UPDATE CASCADE;
  ALTER TABLE public.profesor_curso DROP CONSTRAINT IF EXISTS profesor_curso_profesor_id_fkey;
  ALTER TABLE public.profesor_curso ADD CONSTRAINT profesor_curso_profesor_id_fkey
    FOREIGN KEY (profesor_id) REFERENCES public.profesores(id) ON DELETE CASCADE ON UPDATE CASCADE;
  ALTER TABLE public.comentarios DROP CONSTRAINT IF EXISTS comentarios_profesor_id_fkey;
  ALTER TABLE public.comentarios ADD CONSTRAINT comentarios_profesor_id_fkey
    FOREIGN KEY (profesor_id) REFERENCES public.profesores(id) ON DELETE CASCADE ON UPDATE CASCADE;
  ALTER TABLE public.seguimientos DROP CONSTRAINT IF EXISTS seguimientos_profesor_id_fkey;
  ALTER TABLE public.seguimientos ADD CONSTRAINT seguimientos_profesor_id_fkey
    FOREIGN KEY (profesor_id) REFERENCES public.profesores(id) ON DELETE CASCADE ON UPDATE CASCADE;
END$$;

ALTER TABLE public.colegios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS colegios_select ON public.colegios;
DROP POLICY IF EXISTS colegios_insert ON public.colegios;
DROP POLICY IF EXISTS colegios_update ON public.colegios;
DROP POLICY IF EXISTS colegios_delete ON public.colegios;
CREATE POLICY colegios_select ON public.colegios FOR SELECT
  USING ((select mi_rol()) = 'superadmin' OR id = (select mi_colegio_id()));
CREATE POLICY colegios_insert ON public.colegios FOR INSERT
  WITH CHECK ((select mi_rol()) = 'superadmin');
CREATE POLICY colegios_update ON public.colegios FOR UPDATE
  USING ((select mi_rol()) = 'superadmin') WITH CHECK ((select mi_rol()) = 'superadmin');
CREATE POLICY colegios_delete ON public.colegios FOR DELETE
  USING ((select mi_rol()) = 'superadmin');

DROP POLICY IF EXISTS ad_select ON public.admins;
DROP POLICY IF EXISTS ad_insert ON public.admins;
DROP POLICY IF EXISTS ad_update ON public.admins;
DROP POLICY IF EXISTS ad_delete ON public.admins;
CREATE POLICY ad_select ON public.admins FOR SELECT
  USING (id = (select auth.uid()) OR (select mi_rol()) = 'superadmin'
         OR ((select mi_rol()) = 'admin' AND colegio_id = (select mi_colegio_id())));
CREATE POLICY ad_insert ON public.admins FOR INSERT
  WITH CHECK ((select mi_rol()) = 'superadmin');
CREATE POLICY ad_update ON public.admins FOR UPDATE
  USING ((select mi_rol()) = 'superadmin') WITH CHECK ((select mi_rol()) = 'superadmin');
CREATE POLICY ad_delete ON public.admins FOR DELETE
  USING ((select mi_rol()) = 'superadmin');

DROP POLICY IF EXISTS pr_select ON public.profesores;
DROP POLICY IF EXISTS pr_insert ON public.profesores;
DROP POLICY IF EXISTS pr_update ON public.profesores;
DROP POLICY IF EXISTS pr_delete ON public.profesores;
CREATE POLICY pr_select ON public.profesores FOR SELECT
  USING (id = (select auth.uid()) OR (select mi_rol()) = 'superadmin'
         OR ((select mi_rol()) = 'admin' AND colegio_id = (select mi_colegio_id())));
CREATE POLICY pr_insert ON public.profesores FOR INSERT
  WITH CHECK ((select mi_rol()) = 'superadmin'
              OR ((select mi_rol()) = 'admin' AND colegio_id = (select mi_colegio_id())));
CREATE POLICY pr_update ON public.profesores FOR UPDATE
  USING ((select mi_rol()) = 'superadmin'
         OR ((select mi_rol()) = 'admin' AND colegio_id = (select mi_colegio_id())))
  WITH CHECK ((select mi_rol()) = 'superadmin'
              OR ((select mi_rol()) = 'admin' AND colegio_id = (select mi_colegio_id())));
CREATE POLICY pr_delete ON public.profesores FOR DELETE
  USING ((select mi_rol()) = 'superadmin'
         OR ((select mi_rol()) = 'admin' AND colegio_id = (select mi_colegio_id())));

DROP POLICY IF EXISTS cl_select ON public.clases;
DROP POLICY IF EXISTS cl_insert ON public.clases;
DROP POLICY IF EXISTS cl_update ON public.clases;
DROP POLICY IF EXISTS cl_delete ON public.clases;
CREATE POLICY cl_select ON public.clases FOR SELECT
  USING ((select mi_rol()) = 'superadmin'
         OR ((select mi_rol()) = 'admin' AND colegio_id = (select mi_colegio_id()))
         OR (colegio_id = (select mi_colegio_id())
             AND id IN (SELECT pc.curso_id FROM public.profesor_curso pc WHERE pc.profesor_id = (select auth.uid()))));
CREATE POLICY cl_insert ON public.clases FOR INSERT
  WITH CHECK ((select mi_rol()) = 'superadmin'
              OR ((select mi_rol()) = 'admin' AND colegio_id = (select mi_colegio_id())
                  AND (profesor_titular_id IS NULL
                       OR profesor_pertenece_a_colegio(profesor_titular_id, (select mi_colegio_id())))));
CREATE POLICY cl_update ON public.clases FOR UPDATE
  USING ((select mi_rol()) = 'superadmin'
         OR ((select mi_rol()) = 'admin' AND colegio_id = (select mi_colegio_id())))
  WITH CHECK ((select mi_rol()) = 'superadmin'
              OR ((select mi_rol()) = 'admin' AND colegio_id = (select mi_colegio_id())
                  AND (profesor_titular_id IS NULL
                       OR profesor_pertenece_a_colegio(profesor_titular_id, (select mi_colegio_id())))));
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
             AND curso_id IN (SELECT pc.curso_id FROM public.profesor_curso pc WHERE pc.profesor_id = (select auth.uid()))));
CREATE POLICY al_insert ON public.alumnos FOR INSERT
  WITH CHECK ((select mi_rol()) = 'superadmin'
              OR ((select mi_rol()) = 'admin' AND colegio_id = (select mi_colegio_id())
                  AND curso_pertenece_a_colegio(curso_id, (select mi_colegio_id()))));
CREATE POLICY al_update ON public.alumnos FOR UPDATE
  USING ((select mi_rol()) = 'superadmin'
         OR ((select mi_rol()) = 'admin' AND colegio_id = (select mi_colegio_id())))
  WITH CHECK ((select mi_rol()) = 'superadmin'
              OR ((select mi_rol()) = 'admin' AND colegio_id = (select mi_colegio_id())
                  AND curso_pertenece_a_colegio(curso_id, (select mi_colegio_id()))));
CREATE POLICY al_delete ON public.alumnos FOR DELETE
  USING ((select mi_rol()) = 'superadmin'
         OR ((select mi_rol()) = 'admin' AND colegio_id = (select mi_colegio_id())));

DROP POLICY IF EXISTS pc_select ON public.profesor_curso;
DROP POLICY IF EXISTS pc_insert ON public.profesor_curso;
DROP POLICY IF EXISTS pc_update ON public.profesor_curso;
DROP POLICY IF EXISTS pc_delete ON public.profesor_curso;
CREATE POLICY pc_select ON public.profesor_curso FOR SELECT
  USING (profesor_id = (select auth.uid()) OR (select mi_rol()) = 'superadmin'
         OR ((select mi_rol()) = 'admin' AND curso_pertenece_a_colegio(curso_id, (select mi_colegio_id()))));
CREATE POLICY pc_insert ON public.profesor_curso FOR INSERT
  WITH CHECK ((select mi_rol()) = 'superadmin'
              OR ((select mi_rol()) = 'admin'
                  AND curso_pertenece_a_colegio(curso_id, (select mi_colegio_id()))
                  AND profesor_pertenece_a_colegio(profesor_id, (select mi_colegio_id()))));
CREATE POLICY pc_update ON public.profesor_curso FOR UPDATE
  USING ((select mi_rol()) = 'superadmin'
         OR ((select mi_rol()) = 'admin'
             AND curso_pertenece_a_colegio(curso_id, (select mi_colegio_id()))
           AND profesor_pertenece_a_colegio(profesor_id, (select mi_colegio_id()))))
  WITH CHECK ((select mi_rol()) = 'superadmin'
              OR ((select mi_rol()) = 'admin'
                  AND curso_pertenece_a_colegio(curso_id, (select mi_colegio_id()))
                  AND profesor_pertenece_a_colegio(profesor_id, (select mi_colegio_id()))));
CREATE POLICY pc_delete ON public.profesor_curso FOR DELETE
  USING ((select mi_rol()) = 'superadmin'
         OR ((select mi_rol()) = 'admin' AND curso_pertenece_a_colegio(curso_id, (select mi_colegio_id()))));

DROP POLICY IF EXISTS com_select ON public.comentarios;
DROP POLICY IF EXISTS com_insert ON public.comentarios;
DROP POLICY IF EXISTS com_update ON public.comentarios;
CREATE POLICY com_select ON public.comentarios FOR SELECT
  USING (profesor_id = (select auth.uid()) OR (select mi_rol()) = 'superadmin'
         OR ((select mi_rol()) = 'admin' AND alumno_pertenece_a_colegio(alumno_id, (select mi_colegio_id()))));
CREATE POLICY com_insert ON public.comentarios FOR INSERT
  WITH CHECK (profesor_id = (select auth.uid()) AND (select mi_rol()) = 'profesor'
              AND EXISTS (SELECT 1 FROM public.alumnos a JOIN public.profesor_curso pc ON pc.curso_id = a.curso_id
                          WHERE a.id = alumno_id AND pc.profesor_id = (select auth.uid())));
CREATE POLICY com_update ON public.comentarios FOR UPDATE
  USING (profesor_id = (select auth.uid())) WITH CHECK (profesor_id = (select auth.uid()));

DROP POLICY IF EXISTS seg_select ON public.seguimientos;
DROP POLICY IF EXISTS seg_insert ON public.seguimientos;
DROP POLICY IF EXISTS seg_update ON public.seguimientos;
CREATE POLICY seg_select ON public.seguimientos FOR SELECT
  USING ((select mi_rol()) = 'superadmin'
         OR ((select mi_rol()) = 'admin' AND alumno_pertenece_a_colegio(alumno_id, (select mi_colegio_id())))
         OR ((profesor_id = (select auth.uid()) OR visible_para = 'profesor')
             AND alumno_id IN (SELECT a.id FROM public.alumnos a JOIN public.profesor_curso pc ON pc.curso_id = a.curso_id
                               WHERE pc.profesor_id = (select auth.uid()))));
CREATE POLICY seg_insert ON public.seguimientos FOR INSERT
  WITH CHECK (profesor_id = (select auth.uid()) AND (select mi_rol()) = 'profesor'
              AND alumno_id IN (SELECT a.id FROM public.alumnos a JOIN public.profesor_curso pc ON pc.curso_id = a.curso_id
                                WHERE pc.profesor_id = (select auth.uid())));
CREATE POLICY seg_update ON public.seguimientos FOR UPDATE
  USING (profesor_id = (select auth.uid()))
  WITH CHECK (profesor_id = (select auth.uid()) AND alumno_id IN (
    SELECT a.id FROM public.alumnos a JOIN public.profesor_curso pc ON pc.curso_id = a.curso_id
    WHERE pc.profesor_id = (select auth.uid())));

CREATE OR REPLACE FUNCTION public.eliminar_alumno(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE v_colegio_id uuid;
BEGIN
  IF mi_rol() IS NULL OR mi_rol() NOT IN ('admin','superadmin') THEN
    RAISE EXCEPTION 'No tenés permiso para eliminar alumnos';
  END IF;
  SELECT colegio_id INTO v_colegio_id FROM public.alumnos WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Alumno no encontrado'; END IF;
  IF mi_rol() = 'admin' AND v_colegio_id IS DISTINCT FROM mi_colegio_id() THEN
    RAISE EXCEPTION 'No tenés permiso para eliminar alumnos de otro colegio';
  END IF;
  PERFORM 1 FROM public.seguimientos WHERE alumno_id = p_id FOR UPDATE;
  INSERT INTO public.comentarios_papelera SELECT c.*, now() FROM public.comentarios c WHERE c.alumno_id = p_id;
  PERFORM public.seguimientos_a_papelera(ARRAY(SELECT s.id FROM public.seguimientos s WHERE s.alumno_id = p_id));
  INSERT INTO public.alumnos_papelera
    (id,legajo,nombre,apellido,dni,fecha_nacimiento,curso_id,activo,creado_en,actualizado,deleted_at,colegio_id)
  SELECT a.id,a.legajo,a.nombre,a.apellido,a.dni,a.fecha_nacimiento,a.curso_id,a.activo,
         a.creado_en,a.actualizado,now(),a.colegio_id
  FROM public.alumnos a WHERE a.id = p_id;
  DELETE FROM public.alumnos WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.eliminar_clase(p_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE v_colegio_id uuid;
BEGIN
  IF mi_rol() IS NULL OR mi_rol() NOT IN ('admin','superadmin') THEN
    RAISE EXCEPTION 'No tenés permiso para eliminar clases';
  END IF;
  SELECT colegio_id INTO v_colegio_id FROM public.clases WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Clase no encontrada'; END IF;
  IF mi_rol() = 'admin' AND v_colegio_id IS DISTINCT FROM mi_colegio_id() THEN
    RAISE EXCEPTION 'No tenés permiso para eliminar clases de otro colegio';
  END IF;
  INSERT INTO public.profesor_curso_papelera (profesor_id,curso_id,deleted_at,colegio_id)
  SELECT pc.profesor_id,pc.curso_id,now(),v_colegio_id
  FROM public.profesor_curso pc WHERE pc.curso_id = p_id;
  INSERT INTO public.clases_papelera
    (id,anio,division,nivel,turno,aula,profesor_titular_id,activo,creado_en,deleted_at,colegio_id)
  SELECT c.id,c.anio,c.division,c.nivel,c.turno,c.aula,c.profesor_titular_id,c.activo,c.creado_en,now(),c.colegio_id
  FROM public.clases c WHERE c.id = p_id;
  DELETE FROM public.clases WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.eliminar_profesor(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE v_colegio_id uuid;
BEGIN
  IF mi_rol() IS NULL OR mi_rol() NOT IN ('admin','superadmin') THEN
    RAISE EXCEPTION 'No tenés permiso para eliminar profesores';
  END IF;
  SELECT colegio_id INTO v_colegio_id FROM public.profesores WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profesor no encontrado'; END IF;
  IF mi_rol() = 'admin' AND v_colegio_id IS DISTINCT FROM mi_colegio_id() THEN
    RAISE EXCEPTION 'No tenés permiso para eliminar profesores de otro colegio';
  END IF;
  PERFORM 1 FROM public.seguimientos WHERE profesor_id = p_id FOR UPDATE;
  INSERT INTO public.comentarios_papelera SELECT c.*,now() FROM public.comentarios c WHERE c.profesor_id = p_id;
  PERFORM public.seguimientos_a_papelera(ARRAY(SELECT s.id FROM public.seguimientos s WHERE s.profesor_id = p_id));
  INSERT INTO public.profesor_curso_papelera (profesor_id,curso_id,deleted_at,colegio_id)
  SELECT pc.profesor_id,pc.curso_id,now(),v_colegio_id
  FROM public.profesor_curso pc WHERE pc.profesor_id = p_id;
  INSERT INTO public.profesores_papelera
    (id,email,nombre,apellido,materia,activo,creado_en,actualizado,deleted_at,colegio_id)
  SELECT p.id,p.email,p.nombre,p.apellido,p.materia,p.activo,p.creado_en,p.actualizado,now(),p.colegio_id
  FROM public.profesores p WHERE p.id = p_id;
  DELETE FROM public.profesores WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.eliminar_admin(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
BEGIN
  IF mi_rol() IS DISTINCT FROM 'superadmin' THEN
    RAISE EXCEPTION 'Solo un superadmin puede eliminar administradores';
  END IF;
  INSERT INTO public.admins_papelera
    (id,email,nombre,apellido,cargo,activo,creado_en,actualizado,deleted_at,colegio_id)
  SELECT a.id,a.email,a.nombre,a.apellido,a.cargo,a.activo,a.creado_en,a.actualizado,now(),a.colegio_id
  FROM public.admins a WHERE a.id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Administrador no encontrado'; END IF;
  DELETE FROM public.admins WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.restaurar_seguimiento(p_papelera_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE v public.seguimientos_papelera%ROWTYPE; v_id uuid;
BEGIN
  IF mi_rol() IS NULL OR mi_rol() NOT IN ('admin','superadmin') THEN
    RAISE EXCEPTION 'No tenés permiso para restaurar seguimientos';
  END IF;
  SELECT * INTO v FROM public.seguimientos_papelera WHERE papelera_id = p_papelera_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El seguimiento no está en la papelera'; END IF;
  IF mi_rol() = 'admin' AND NOT alumno_pertenece_a_colegio(v.alumno_id, mi_colegio_id()) THEN
    RAISE EXCEPTION 'No tenés permiso para restaurar seguimientos de otro colegio';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.alumnos WHERE id = v.alumno_id) THEN
    RAISE EXCEPTION 'No se puede restaurar: el alumno ya no existe';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profesores WHERE id = v.profesor_id) THEN
    RAISE EXCEPTION 'No se puede restaurar: el profesor ya no existe';
  END IF;
  DELETE FROM public.seguimientos_papelera WHERE papelera_id = p_papelera_id;
  v_id := v.id;
  IF EXISTS (SELECT 1 FROM public.seguimientos WHERE id = v_id) THEN v_id := gen_random_uuid(); END IF;
  INSERT INTO public.seguimientos
    (id,alumno_id,profesor_id,categoria,texto,valor,creado_en,actualizado,visible_para)
  VALUES (v_id,v.alumno_id,v.profesor_id,v.categoria,v.texto,v.valor,v.creado_en,v.actualizado,v.visible_para);
END;
$$;

CREATE OR REPLACE FUNCTION public.purgar_seguimiento(p_papelera_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE v public.seguimientos_papelera%ROWTYPE;
BEGIN
  IF mi_rol() IS NULL OR mi_rol() NOT IN ('admin','superadmin') THEN
    RAISE EXCEPTION 'No tenés permiso para eliminar definitivamente';
  END IF;
  SELECT * INTO v FROM public.seguimientos_papelera WHERE papelera_id = p_papelera_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El seguimiento no está en la papelera'; END IF;
  IF mi_rol() = 'admin' AND NOT alumno_pertenece_a_colegio(v.alumno_id, mi_colegio_id()) THEN
    RAISE EXCEPTION 'No tenés permiso para eliminar seguimientos de otro colegio';
  END IF;
  DELETE FROM public.seguimientos_papelera WHERE papelera_id = p_papelera_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.crear_colegio_superadmin(p_nombre text, p_sigla text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE v_colegio public.colegios;
BEGIN
  IF mi_rol() IS DISTINCT FROM 'superadmin' THEN RAISE EXCEPTION 'Solo superadmin puede crear colegios'; END IF;
  IF nullif(btrim(p_nombre), '') IS NULL THEN RAISE EXCEPTION 'El nombre del colegio es obligatorio'; END IF;
  INSERT INTO public.colegios (nombre, sigla)
  VALUES (btrim(p_nombre), upper(left(coalesce(nullif(btrim(p_sigla), ''), 'COL'), 4)))
  RETURNING * INTO v_colegio;
  RETURN to_jsonb(v_colegio);
END;
$$;

CREATE OR REPLACE FUNCTION public.importar_colegio_excel(p_colegio_id uuid, p_datos jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  v_colegio public.colegios;
  v_clase jsonb;
  v_profesor jsonb;
  v_alumno jsonb;
  v_profesor_id uuid;
  v_clase_id text;
  v_nombre_clase text;
  v_importadas_clases integer := 0;
  v_importados_alumnos integer := 0;
  v_importados_profesores integer := 0;
  v_ids_profesores jsonb := '{}'::jsonb;
  v_ids_clases jsonb := '{}'::jsonb;
BEGIN
  IF mi_rol() IS DISTINCT FROM 'superadmin' THEN RAISE EXCEPTION 'Solo superadmin puede importar datos'; END IF;
  SELECT * INTO v_colegio FROM public.colegios WHERE id = p_colegio_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Colegio no encontrado'; END IF;
    IF jsonb_typeof(p_datos->'clases') IS DISTINCT FROM 'array' OR COALESCE(jsonb_array_length(p_datos->'clases'), 0) = 0
      OR jsonb_typeof(p_datos->'alumnos') IS DISTINCT FROM 'array' OR COALESCE(jsonb_array_length(p_datos->'alumnos'), 0) = 0
      OR jsonb_typeof(p_datos->'profesores') IS DISTINCT FROM 'array' OR COALESCE(jsonb_array_length(p_datos->'profesores'), 0) = 0 THEN
    RAISE EXCEPTION 'La planilla debe contener clases, alumnos y profesores';
  END IF;

  FOR v_profesor IN SELECT value FROM jsonb_array_elements(p_datos->'profesores') LOOP
    IF EXISTS (SELECT 1 FROM public.profesores WHERE lower(email) = lower(v_profesor->>'email'))
       OR EXISTS (SELECT 1 FROM public.admins WHERE lower(email) = lower(v_profesor->>'email'))
       OR EXISTS (SELECT 1 FROM public.superadmins WHERE lower(email) = lower(v_profesor->>'email')) THEN
      RAISE EXCEPTION 'El email docente % ya está registrado en otro perfil', v_profesor->>'email';
    END IF;
  END LOOP;
  FOR v_clase IN SELECT value FROM jsonb_array_elements(p_datos->'clases') LOOP
    IF EXISTS (SELECT 1 FROM public.clases WHERE colegio_id = p_colegio_id
               AND anio = (v_clase->>'anio')::smallint AND division = upper(v_clase->>'division')) THEN
      RAISE EXCEPTION 'La clase % ya existe en este colegio', v_clase->>'nombre';
    END IF;
  END LOOP;
  FOR v_alumno IN SELECT value FROM jsonb_array_elements(p_datos->'alumnos') LOOP
    IF EXISTS (SELECT 1 FROM public.alumnos WHERE colegio_id = p_colegio_id
               AND lower(legajo) = lower(v_alumno->>'legajo')) THEN
      RAISE EXCEPTION 'El legajo % ya está registrado en este colegio', v_alumno->>'legajo';
    END IF;
    IF EXISTS (SELECT 1 FROM public.alumnos WHERE dni = v_alumno->>'dni') THEN
      RAISE EXCEPTION 'El DNI % ya está registrado', v_alumno->>'dni';
    END IF;
  END LOOP;

  FOR v_profesor IN SELECT value FROM jsonb_array_elements(p_datos->'profesores') LOOP
    INSERT INTO public.profesores (email, nombre, apellido, materia, colegio_id)
    VALUES (lower(btrim(v_profesor->>'email')), btrim(v_profesor->>'nombre'),
            btrim(v_profesor->>'apellido'), btrim(v_profesor->>'materia'), p_colegio_id)
    RETURNING id INTO v_profesor_id;
    v_ids_profesores := v_ids_profesores || jsonb_build_object(lower(btrim(v_profesor->>'email')), v_profesor_id);
    v_importados_profesores := v_importados_profesores + 1;
  END LOOP;

  FOR v_clase IN SELECT value FROM jsonb_array_elements(p_datos->'clases') LOOP
    v_clase_id := p_colegio_id::text || '-' || (v_clase->>'anio') || upper(v_clase->>'division');
    v_profesor_id := nullif(v_ids_profesores->>lower(btrim(v_clase->>'preceptorEmail')), '')::uuid;
    INSERT INTO public.clases (id, anio, division, nivel, turno, aula, profesor_titular_id, colegio_id)
    VALUES (v_clase_id, (v_clase->>'anio')::smallint, upper(v_clase->>'division'),
            btrim(v_clase->>'nivel'), (v_clase->>'turno')::public.turno_clase,
            btrim(v_clase->>'aula'), v_profesor_id, p_colegio_id);
    v_ids_clases := v_ids_clases || jsonb_build_object(lower(btrim(v_clase->>'nombre')), v_clase_id);
    v_importadas_clases := v_importadas_clases + 1;
  END LOOP;

  FOR v_profesor IN SELECT value FROM jsonb_array_elements(p_datos->'profesores') LOOP
    v_profesor_id := (v_ids_profesores->>lower(btrim(v_profesor->>'email')))::uuid;
    FOR v_nombre_clase IN SELECT value FROM jsonb_array_elements_text(v_profesor->'clasesAsignadas') LOOP
      v_clase_id := v_ids_clases->>lower(v_nombre_clase);
      IF v_clase_id IS NULL THEN RAISE EXCEPTION 'La clase asignada % no existe', v_nombre_clase; END IF;
      INSERT INTO public.profesor_curso (profesor_id, curso_id) VALUES (v_profesor_id, v_clase_id);
    END LOOP;
  END LOOP;

  FOR v_alumno IN SELECT value FROM jsonb_array_elements(p_datos->'alumnos') LOOP
    v_clase_id := v_ids_clases->>lower(btrim(v_alumno->>'clase'));
    IF v_clase_id IS NULL THEN RAISE EXCEPTION 'La clase del alumno % no existe', v_alumno->>'nombre'; END IF;
    INSERT INTO public.alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id, colegio_id)
    VALUES (btrim(v_alumno->>'legajo'), btrim(v_alumno->>'nombre'), btrim(v_alumno->>'apellido'),
            btrim(v_alumno->>'dni'), (v_alumno->>'fechaNacimiento')::date, v_clase_id, p_colegio_id);
    v_importados_alumnos := v_importados_alumnos + 1;
  END LOOP;

  RETURN jsonb_build_object('colegioId', p_colegio_id, 'clases', v_importadas_clases,
    'alumnos', v_importados_alumnos, 'profesores', v_importados_profesores);
END;
$$;

CREATE OR REPLACE FUNCTION public.eliminar_colegio_superadmin(p_colegio_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
BEGIN
  IF mi_rol() IS DISTINCT FROM 'superadmin' THEN RAISE EXCEPTION 'Solo superadmin puede eliminar colegios'; END IF;
  PERFORM 1 FROM public.colegios WHERE id = p_colegio_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Colegio no encontrado'; END IF;
  -- La papelera conserva referencias al colegio; también se purga al borrarlo.
  DELETE FROM public.comentarios_papelera cp
  WHERE cp.alumno_id IN (
    SELECT id FROM public.alumnos WHERE colegio_id = p_colegio_id
    UNION
    SELECT id FROM public.alumnos_papelera WHERE colegio_id = p_colegio_id
  ) OR cp.profesor_id IN (
    SELECT id FROM public.profesores WHERE colegio_id = p_colegio_id
    UNION
    SELECT id FROM public.profesores_papelera WHERE colegio_id = p_colegio_id
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
  );
  DELETE FROM public.profesor_curso_papelera WHERE colegio_id = p_colegio_id;
  DELETE FROM public.alumnos_papelera WHERE colegio_id = p_colegio_id;
  DELETE FROM public.clases_papelera WHERE colegio_id = p_colegio_id;
  DELETE FROM public.profesores_papelera WHERE colegio_id = p_colegio_id;
  DELETE FROM public.admins_papelera WHERE colegio_id = p_colegio_id;
  DELETE FROM public.comentarios WHERE alumno_id IN (SELECT id FROM public.alumnos WHERE colegio_id = p_colegio_id);
  DELETE FROM public.seguimientos WHERE alumno_id IN (SELECT id FROM public.alumnos WHERE colegio_id = p_colegio_id);
  DELETE FROM public.profesor_curso WHERE curso_id IN (SELECT id FROM public.clases WHERE colegio_id = p_colegio_id);
  DELETE FROM public.alumnos WHERE colegio_id = p_colegio_id;
  DELETE FROM public.clases WHERE colegio_id = p_colegio_id;
  DELETE FROM public.profesores WHERE colegio_id = p_colegio_id;
  DELETE FROM public.admins WHERE colegio_id = p_colegio_id;
  DELETE FROM public.colegios WHERE id = p_colegio_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.crear_colegio_superadmin(text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.importar_colegio_excel(uuid, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.eliminar_colegio_superadmin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crear_colegio_superadmin(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.importar_colegio_excel(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.eliminar_colegio_superadmin(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
