-- ============================================================
-- FichAula · 02 · SEGURIDAD + RLS  (ejecutar DESPUÉS de 01)
-- ============================================================
-- Implementa el control de acceso del lado del servidor:
--   • mi_rol()            -> el servidor sabe el rol del usuario.
--   • set_actualizado()   -> mantiene la columna 'actualizado'.
--   • vincular_perfil_auth-> enlaza auth.users con las tablas de
--                            perfil por email (trigger).
--   • datos_autor()       -> nombre y materia de quien escribió un
--                            seguimiento (para la vista).
--   • Row Level Security  -> 37 políticas que aplican la matriz
--                            RBAC (profesor / admin / superadmin).
--   • Vistas security_invoker -> respetan el RLS de quien consulta.
--
-- Todas las funciones fijan search_path (evita secuestro de path)
-- y las políticas envuelven auth.uid()/mi_rol() en (select ...)
-- para evaluarse una sola vez por consulta (no por fila).
-- ============================================================

-- ============================================================
-- 0. VERSIÓN DE LA BASE
-- ============================================================
-- Este script necesita el esquema de esta versión. En una base creada
-- con la versión anterior falta la columna seguimientos.visible_para:
-- ahí se corta acá, antes de cambiar nada.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'seguimientos'
                   AND column_name = 'visible_para') THEN
    RAISE EXCEPTION 'Esta base es de una versión anterior: corré primero sql/07_privacidad_seguimientos.sql';
  END IF;
END$$;

-- ============================================================
-- 1. FUNCIONES
-- ============================================================

-- mi_rol(): devuelve el rol del usuario autenticado mirando en qué
-- tabla de perfil está su auth.uid(). SECURITY DEFINER para leer las
-- tablas sin disparar recursión de RLS. La usan TODAS las políticas.
CREATE OR REPLACE FUNCTION public.mi_rol()
RETURNS rol_usuario
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM superadmins WHERE id = auth.uid()) THEN 'superadmin'::rol_usuario
    WHEN EXISTS (SELECT 1 FROM admins      WHERE id = auth.uid()) THEN 'admin'::rol_usuario
    WHEN EXISTS (SELECT 1 FROM profesores  WHERE id = auth.uid()) THEN 'profesor'::rol_usuario
    ELSE NULL
  END;
$$;

-- Permisos de mi_rol(): solo anon + authenticated (no PUBLIC).
-- anon la necesita para que sus consultas a tablas con RLS devuelvan
-- vacío en lugar de error; es segura porque para anon auth.uid() es
-- NULL y devuelve NULL (no expone ningún dato).
REVOKE EXECUTE ON FUNCTION public.mi_rol() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.mi_rol() TO anon, authenticated;

-- set_actualizado(): toca la columna 'actualizado' en cada UPDATE.
-- search_path vacío: solo usa NOW() (de pg_catalog, siempre disponible).
CREATE OR REPLACE FUNCTION public.set_actualizado()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.actualizado = NOW();
  RETURN NEW;
END;
$$;

-- vincular_perfil_auth(): al crearse un usuario en auth.users, copia
-- su UUID a la fila de perfil que tenga el mismo email. SECURITY
-- DEFINER (corre como dueño y saltea RLS; en ese momento no hay JWT).
CREATE OR REPLACE FUNCTION public.vincular_perfil_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  UPDATE superadmins SET id = NEW.id WHERE email = NEW.email;
  UPDATE admins      SET id = NEW.id WHERE email = NEW.email;
  UPDATE profesores  SET id = NEW.id WHERE email = NEW.email;
  RETURN NEW;
END;
$$;

-- Nadie debe invocar este trigger por RPC: se ejecuta solo.
REVOKE EXECUTE ON FUNCTION public.vincular_perfil_auth() FROM PUBLIC, anon, authenticated;

-- datos_autor(): nombre, apellido y materia de un profesor, para mostrar
-- quién escribió un seguimiento. Hace falta porque el RLS de `profesores`
-- solo deja a cada profesor ver su propia fila: sin esto, la vista de
-- seguimientos no podría mostrar el autor de uno compartido con "Todos".
-- SECURITY DEFINER, pero solo responde al personal del instituto (alguien
-- con rol) y nunca expone el email.
CREATE OR REPLACE FUNCTION public.datos_autor(p_profesor_id uuid)
RETURNS TABLE (nombre text, apellido text, materia text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT p.nombre, p.apellido, p.materia
  FROM profesores p
  WHERE p.id = p_profesor_id
    AND mi_rol() IS NOT NULL;
$$;

-- La usa la vista de seguimientos con los permisos de quien consulta:
-- solo 'authenticated' (no anon/PUBLIC).
REVOKE EXECUTE ON FUNCTION public.datos_autor(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.datos_autor(uuid) TO authenticated;

-- ============================================================
-- 2. TRIGGERS
-- ============================================================

-- 'actualizado' en las 6 tablas que tienen esa columna (clases no).
DROP TRIGGER IF EXISTS trg_superadmins_upd  ON superadmins;
CREATE TRIGGER trg_superadmins_upd  BEFORE UPDATE ON superadmins  FOR EACH ROW EXECUTE FUNCTION set_actualizado();
DROP TRIGGER IF EXISTS trg_admins_upd       ON admins;
CREATE TRIGGER trg_admins_upd       BEFORE UPDATE ON admins       FOR EACH ROW EXECUTE FUNCTION set_actualizado();
DROP TRIGGER IF EXISTS trg_profesores_upd   ON profesores;
CREATE TRIGGER trg_profesores_upd   BEFORE UPDATE ON profesores   FOR EACH ROW EXECUTE FUNCTION set_actualizado();
DROP TRIGGER IF EXISTS trg_alumnos_upd      ON alumnos;
CREATE TRIGGER trg_alumnos_upd      BEFORE UPDATE ON alumnos      FOR EACH ROW EXECUTE FUNCTION set_actualizado();
DROP TRIGGER IF EXISTS trg_seguimientos_upd ON seguimientos;
CREATE TRIGGER trg_seguimientos_upd BEFORE UPDATE ON seguimientos FOR EACH ROW EXECUTE FUNCTION set_actualizado();
DROP TRIGGER IF EXISTS trg_comentarios_upd  ON comentarios;
CREATE TRIGGER trg_comentarios_upd  BEFORE UPDATE ON comentarios  FOR EACH ROW EXECUTE FUNCTION set_actualizado();

-- Enlace de perfiles al crear usuarios en Supabase Auth.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION vincular_perfil_auth();

-- ============================================================
-- 3. ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE superadmins    ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins         ENABLE ROW LEVEL SECURITY;
ALTER TABLE profesores     ENABLE ROW LEVEL SECURITY;
ALTER TABLE clases         ENABLE ROW LEVEL SECURITY;
ALTER TABLE alumnos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE profesor_curso ENABLE ROW LEVEL SECURITY;
ALTER TABLE comentarios    ENABLE ROW LEVEL SECURITY;
ALTER TABLE seguimientos   ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- POLÍTICAS
-- Patrón: SELECT tiene UNA sola política; INSERT/UPDATE/DELETE van
-- separadas (no se usa FOR ALL, para no duplicar la de SELECT).
-- auth.uid()/mi_rol() siempre dentro de (select ...) -> initplan.
-- ------------------------------------------------------------

-- ---------- superadmins (solo un superadmin gestiona la tabla) ----------
DROP POLICY IF EXISTS sa_select ON superadmins;
DROP POLICY IF EXISTS sa_insert ON superadmins;
DROP POLICY IF EXISTS sa_update ON superadmins;
DROP POLICY IF EXISTS sa_delete ON superadmins;
CREATE POLICY sa_select ON superadmins FOR SELECT
  USING ((select auth.uid()) = id OR (select mi_rol()) = 'superadmin');
CREATE POLICY sa_insert ON superadmins FOR INSERT
  WITH CHECK ((select mi_rol()) = 'superadmin');
CREATE POLICY sa_update ON superadmins FOR UPDATE
  USING ((select mi_rol()) = 'superadmin') WITH CHECK ((select mi_rol()) = 'superadmin');
CREATE POLICY sa_delete ON superadmins FOR DELETE
  USING ((select mi_rol()) = 'superadmin');

-- ---------- admins (los gestiona el superadmin; cada admin se ve a sí mismo) ----------
DROP POLICY IF EXISTS ad_select ON admins;
DROP POLICY IF EXISTS ad_insert ON admins;
DROP POLICY IF EXISTS ad_update ON admins;
DROP POLICY IF EXISTS ad_delete ON admins;
CREATE POLICY ad_select ON admins FOR SELECT
  USING ((select auth.uid()) = id OR (select mi_rol()) = 'superadmin');
CREATE POLICY ad_insert ON admins FOR INSERT
  WITH CHECK ((select mi_rol()) = 'superadmin');
CREATE POLICY ad_update ON admins FOR UPDATE
  USING ((select mi_rol()) = 'superadmin') WITH CHECK ((select mi_rol()) = 'superadmin');
CREATE POLICY ad_delete ON admins FOR DELETE
  USING ((select mi_rol()) = 'superadmin');

-- ---------- profesores (gestiona admin/superadmin; cada profe se ve a sí mismo) ----------
DROP POLICY IF EXISTS pr_select ON profesores;
DROP POLICY IF EXISTS pr_insert ON profesores;
DROP POLICY IF EXISTS pr_update ON profesores;
DROP POLICY IF EXISTS pr_delete ON profesores;
CREATE POLICY pr_select ON profesores FOR SELECT
  USING ((select auth.uid()) = id OR (select mi_rol()) IN ('admin','superadmin'));
CREATE POLICY pr_insert ON profesores FOR INSERT
  WITH CHECK ((select mi_rol()) IN ('admin','superadmin'));
CREATE POLICY pr_update ON profesores FOR UPDATE
  USING ((select mi_rol()) IN ('admin','superadmin')) WITH CHECK ((select mi_rol()) IN ('admin','superadmin'));
CREATE POLICY pr_delete ON profesores FOR DELETE
  USING ((select mi_rol()) IN ('admin','superadmin'));

-- ---------- alumnos (admin/super: todo; profesor: solo los de SUS cursos) ----------
DROP POLICY IF EXISTS al_select ON alumnos;
DROP POLICY IF EXISTS al_insert ON alumnos;
DROP POLICY IF EXISTS al_update ON alumnos;
DROP POLICY IF EXISTS al_delete ON alumnos;
CREATE POLICY al_select ON alumnos FOR SELECT
  USING ((select mi_rol()) IN ('admin','superadmin')
         OR curso_id IN (SELECT pc.curso_id FROM profesor_curso pc WHERE pc.profesor_id = (select auth.uid())));
CREATE POLICY al_insert ON alumnos FOR INSERT
  WITH CHECK ((select mi_rol()) IN ('admin','superadmin'));
CREATE POLICY al_update ON alumnos FOR UPDATE
  USING ((select mi_rol()) IN ('admin','superadmin')) WITH CHECK ((select mi_rol()) IN ('admin','superadmin'));
CREATE POLICY al_delete ON alumnos FOR DELETE
  USING ((select mi_rol()) IN ('admin','superadmin'));

-- ---------- clases (admin/super: todo; profesor: solo las que dicta) ----------
DROP POLICY IF EXISTS cl_select ON clases;
DROP POLICY IF EXISTS cl_insert ON clases;
DROP POLICY IF EXISTS cl_update ON clases;
DROP POLICY IF EXISTS cl_delete ON clases;
CREATE POLICY cl_select ON clases FOR SELECT
  USING ((select mi_rol()) IN ('admin','superadmin')
         OR id IN (SELECT pc.curso_id FROM profesor_curso pc WHERE pc.profesor_id = (select auth.uid())));
CREATE POLICY cl_insert ON clases FOR INSERT
  WITH CHECK ((select mi_rol()) IN ('admin','superadmin'));
CREATE POLICY cl_update ON clases FOR UPDATE
  USING ((select mi_rol()) IN ('admin','superadmin')) WITH CHECK ((select mi_rol()) IN ('admin','superadmin'));
CREATE POLICY cl_delete ON clases FOR DELETE
  USING ((select mi_rol()) IN ('admin','superadmin'));

-- ---------- profesor_curso (admin/super gestionan; cada profe ve sus asignaciones) ----------
DROP POLICY IF EXISTS pc_select ON profesor_curso;
DROP POLICY IF EXISTS pc_insert ON profesor_curso;
DROP POLICY IF EXISTS pc_update ON profesor_curso;
DROP POLICY IF EXISTS pc_delete ON profesor_curso;
CREATE POLICY pc_select ON profesor_curso FOR SELECT
  USING (profesor_id = (select auth.uid()) OR (select mi_rol()) IN ('admin','superadmin'));
CREATE POLICY pc_insert ON profesor_curso FOR INSERT
  WITH CHECK ((select mi_rol()) IN ('admin','superadmin'));
CREATE POLICY pc_update ON profesor_curso FOR UPDATE
  USING ((select mi_rol()) IN ('admin','superadmin')) WITH CHECK ((select mi_rol()) IN ('admin','superadmin'));
-- DELETE directo permitido a admin/super: lo usa la reasignación de
-- cursos (asignarCursosAProfesorDB) que reemplaza el conjunto completo.
CREATE POLICY pc_delete ON profesor_curso FOR DELETE
  USING ((select mi_rol()) IN ('admin','superadmin'));

-- ---------- comentarios ----------
-- SELECT: el autor o un admin/super. INSERT: solo el profesor autor.
-- UPDATE: solo el autor. Sin política DELETE: el borrado va por la
-- función eliminar_comentario (papelera), nunca DELETE directo.
DROP POLICY IF EXISTS com_select ON comentarios;
DROP POLICY IF EXISTS com_insert ON comentarios;
DROP POLICY IF EXISTS com_update ON comentarios;
CREATE POLICY com_select ON comentarios FOR SELECT
  USING (profesor_id = (select auth.uid()) OR (select mi_rol()) IN ('admin','superadmin'));
CREATE POLICY com_insert ON comentarios FOR INSERT
  WITH CHECK (profesor_id = (select auth.uid()) AND (select mi_rol()) = 'profesor');
CREATE POLICY com_update ON comentarios FOR UPDATE
  USING (profesor_id = (select auth.uid())) WITH CHECK (profesor_id = (select auth.uid()));

-- ---------- seguimientos ----------
-- SELECT: dirección ve todo. Un profesor ve, de los alumnos de SUS
-- cursos, los seguimientos propios y los ajenos marcados como visibles
-- para todos (visible_para = 'profesor'). INSERT: solo un profesor, a su
-- nombre y sobre alumnos de sus cursos. UPDATE: solo el autor, y el
-- resultado tiene que seguir siendo suyo y de un alumno de sus cursos.
-- Sin DELETE directo (va por eliminar_seguimiento).
DROP POLICY IF EXISTS seg_select ON seguimientos;
DROP POLICY IF EXISTS seg_insert ON seguimientos;
DROP POLICY IF EXISTS seg_update ON seguimientos;
CREATE POLICY seg_select ON seguimientos FOR SELECT
  USING ((select mi_rol()) IN ('admin','superadmin')
         OR ((profesor_id = (select auth.uid()) OR visible_para = 'profesor')
             AND alumno_id IN (SELECT a.id FROM alumnos a
                               JOIN profesor_curso pc ON pc.curso_id = a.curso_id
                               WHERE pc.profesor_id = (select auth.uid()))));
CREATE POLICY seg_insert ON seguimientos FOR INSERT
  WITH CHECK (profesor_id = (select auth.uid())
              AND (select mi_rol()) = 'profesor'
              AND alumno_id IN (SELECT a.id FROM alumnos a
                                JOIN profesor_curso pc ON pc.curso_id = a.curso_id
                                WHERE pc.profesor_id = (select auth.uid())));
CREATE POLICY seg_update ON seguimientos FOR UPDATE
  USING (profesor_id = (select auth.uid()))
  WITH CHECK (profesor_id = (select auth.uid())
              AND alumno_id IN (SELECT a.id FROM alumnos a
                                JOIN profesor_curso pc ON pc.curso_id = a.curso_id
                                WHERE pc.profesor_id = (select auth.uid())));

-- ============================================================
-- 4. VISTAS  (security_invoker: aplican el RLS de quien consulta)
-- ============================================================
-- Sin security_invoker una vista filtra los datos con los permisos del
-- dueño y saltea el RLS del usuario que la consulta. Va en el mismo
-- CREATE porque al reemplazar una vista sus opciones se pisan.
CREATE OR REPLACE VIEW vista_alumnos_completa
  WITH (security_invoker = true) AS
  SELECT a.id, a.legajo, a.nombre, a.apellido, a.dni, a.fecha_nacimiento,
         date_part('year', age(a.fecha_nacimiento::timestamptz))::int AS edad,
         c.id AS curso_id, c.anio, c.division, c.nivel, c.turno, c.aula
  FROM alumnos a
  JOIN clases c ON c.id = a.curso_id
  WHERE a.activo = true;

-- Seguimientos activos, con los datos del alumno, la clase y el autor.
-- El autor sale de datos_autor() y no de un JOIN a `profesores`, porque
-- esa tabla le oculta a un profesor las filas de los demás.
CREATE OR REPLACE VIEW vista_seguimientos_completa
  WITH (security_invoker = true) AS
  SELECT s.id, s.categoria, s.texto, s.valor, s.creado_en,
         a.legajo AS alumno_legajo, a.nombre AS alumno_nombre, a.apellido AS alumno_apellido,
         c.id AS curso_id, (c.anio || '° ' || c.division) AS curso_nombre,
         s.profesor_id, au.nombre AS profesor_nombre, au.apellido AS profesor_apellido, au.materia,
         s.visible_para, s.alumno_id
  FROM seguimientos s
  JOIN alumnos a ON a.id = s.alumno_id
  JOIN clases c  ON c.id = a.curso_id
  LEFT JOIN LATERAL public.datos_autor(s.profesor_id) au ON true;
