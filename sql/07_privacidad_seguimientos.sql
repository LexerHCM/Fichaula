-- ============================================================
-- FichAula · 07 · ACTUALIZACIÓN DE UNA BASE EXISTENTE:
--                 PRIVACIDAD, VISIBILIDAD Y PAPELERA DE SEGUIMIENTOS
-- ============================================================
-- Para una base creada con la versión anterior de los scripts (como la
-- del proyecto del instituto). Se corre UNA vez, completo, y la deja
-- igual que una instalación nueva hecha con los scripts 01 a 03 de esta
-- versión. En una instalación desde cero NO hace falta (tampoco hace
-- daño: es idempotente).
--
-- Las definiciones vigentes viven en 01, 02 y 03; este script repite
-- las que cambiaron para poder aplicarlas todas juntas, en una sola
-- transacción (BEGIN ... COMMIT). Los cambios futuros se hacen en
-- 01-03, no acá.
--
-- Qué cambia:
--   1. Privacidad entre profesores: un profesor ve SUS seguimientos
--      y, de los ajenos, solo los marcados como visibles para todos.
--      Antes la tabla devolvía por API todos los seguimientos de los
--      alumnos de sus cursos, sin importar quién los había escrito.
--   2. Visibilidad por seguimiento (columna visible_para):
--        'admin'    -> "Dirección": lo ven su autor y la dirección.
--        'profesor' -> "Todos": además lo ven los profesores que
--                      dictan el curso del alumno.
--      Por defecto es 'admin' (privado). Los seguimientos que ya
--      existían quedan privados.
--   3. Papelera: dirección puede restaurar o eliminar definitivamente
--      un seguimiento; cada entrada tiene su propio id y registra
--      quién la eliminó. El borrado mueve la fila en una sola
--      sentencia (no puede quedar duplicada).
--   4. Permisos: las funciones eliminar_* rechazan a un usuario
--      autenticado SIN perfil (antes mi_rol() = NULL pasaba el chequeo),
--      y un profesor solo puede cargar seguimientos sobre alumnos de
--      los cursos que dicta.
--
-- Es compatible con el frontend anterior: no cambia la firma de
-- ninguna función que ese frontend use ni quita columnas de la vista.
-- ============================================================

-- Todo o nada: si algo falla, no se aplica ningún cambio.
BEGIN;

-- ============================================================
-- 1. COLUMNAS
-- ============================================================
ALTER TABLE seguimientos
  ADD COLUMN IF NOT EXISTS visible_para rol_usuario NOT NULL DEFAULT 'admin'
    CONSTRAINT seguimientos_visible_para_check CHECK (visible_para IN ('profesor', 'admin'));

-- La espejo guarda la visibilidad original, para restaurar tal cual
-- estaba. El DEFAULT solo hace falta para completar las filas que ya
-- estaban en la papelera; después se quita (la espejo no lleva defaults).
ALTER TABLE seguimientos_papelera
  ADD COLUMN IF NOT EXISTS visible_para rol_usuario NOT NULL DEFAULT 'admin';
ALTER TABLE seguimientos_papelera
  ALTER COLUMN visible_para DROP DEFAULT;

-- seguimientos_papelera es la excepción a "sin PK": dirección restaura y
-- elimina sus entradas una por una, así que cada entrada tiene identidad
-- propia (papelera_id) y guarda quién hizo el borrado (eliminado_por).
-- Por eso las funciones que escriben en ella nombran las columnas.
ALTER TABLE seguimientos_papelera
  ADD COLUMN IF NOT EXISTS eliminado_por uuid;
ALTER TABLE seguimientos_papelera
  ADD COLUMN IF NOT EXISTS papelera_id uuid DEFAULT gen_random_uuid() PRIMARY KEY;

-- ============================================================
-- 2. AUTOR DE UN SEGUIMIENTO
-- ============================================================
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
-- 3. POLÍTICAS DE SEGUIMIENTOS
-- ============================================================
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

-- Seguimientos eliminados, con los datos del alumno y del profesor.
-- Si el alumno o el profesor también fueron eliminados, toma sus datos
-- de la papelera correspondiente y lo indica en *_existe (sin ellos no
-- se puede restaurar el seguimiento).
-- security_invoker: aplica el RLS de quien consulta (solo devuelve
-- filas a dirección; al resto, vacío).
CREATE OR REPLACE VIEW vista_seguimientos_papelera
  WITH (security_invoker = true) AS
  SELECT sp.papelera_id, sp.id, sp.categoria, sp.texto, sp.valor, sp.creado_en, sp.visible_para,
         sp.deleted_at, sp.eliminado_por,
         (sp.eliminado_por = sp.profesor_id) AS eliminado_por_autor,
         sp.alumno_id,
         COALESCE(a.legajo,   ap.legajo)   AS alumno_legajo,
         COALESCE(a.nombre,   ap.nombre)   AS alumno_nombre,
         COALESCE(a.apellido, ap.apellido) AS alumno_apellido,
         COALESCE(a.dni,      ap.dni)      AS alumno_dni,
         COALESCE(a.curso_id, ap.curso_id) AS curso_id,
         (c.anio || '° ' || c.division)    AS curso_nombre,
         (a.id IS NOT NULL)                AS alumno_existe,
         sp.profesor_id,
         COALESCE(p.nombre,   pp.nombre)   AS profesor_nombre,
         COALESCE(p.apellido, pp.apellido) AS profesor_apellido,
         COALESCE(p.materia,  pp.materia)  AS materia,
         (p.id IS NOT NULL)                AS profesor_existe
  FROM seguimientos_papelera sp
  LEFT JOIN alumnos a ON a.id = sp.alumno_id
  LEFT JOIN LATERAL (SELECT x.legajo, x.nombre, x.apellido, x.dni, x.curso_id
                     FROM alumnos_papelera x
                     WHERE x.id = sp.alumno_id
                     ORDER BY x.deleted_at DESC LIMIT 1) ap ON a.id IS NULL
  LEFT JOIN clases c ON c.id = COALESCE(a.curso_id, ap.curso_id)
  LEFT JOIN profesores p ON p.id = sp.profesor_id
  LEFT JOIN LATERAL (SELECT y.nombre, y.apellido, y.materia
                     FROM profesores_papelera y
                     WHERE y.id = sp.profesor_id
                     ORDER BY y.deleted_at DESC LIMIT 1) pp ON p.id IS NULL;

-- ============================================================
-- 5. FUNCIONES DE LA PAPELERA
-- ============================================================
-- Cada función valida el rol antes de actuar. mi_rol() devuelve NULL
-- para un usuario autenticado sin perfil, y una comparación con NULL no
-- da verdadero ni falso: por eso el chequeo contempla el NULL de forma
-- explícita (si no, ese usuario pasaría).

-- COMENTARIO: lo borra su autor (profesor) o un admin/superadmin.
CREATE OR REPLACE FUNCTION public.eliminar_comentario(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE v_owner uuid;
BEGIN
  -- FOR UPDATE: si llegan dos pedidos a la vez, el segundo espera y ya no lo encuentra.
  SELECT profesor_id INTO v_owner FROM comentarios WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Comentario no encontrado'; END IF;
  IF NOT COALESCE(v_owner = auth.uid() OR mi_rol() IN ('admin','superadmin'), false) THEN
    RAISE EXCEPTION 'No tenés permiso para eliminar este comentario';
  END IF;
  INSERT INTO comentarios_papelera SELECT c.*, now() FROM comentarios c WHERE c.id = p_id;
  DELETE FROM comentarios WHERE id = p_id;
END; $$;

-- Mueve seguimientos a la papelera en UNA sentencia: lo que se copia a la
-- espejo es exactamente lo que se borra de la tabla viva, así que dos
-- pedidos simultáneos no pueden dejar el mismo seguimiento dos veces.
-- Registra quién lo eliminó. Uso interno: la llaman eliminar_seguimiento,
-- eliminar_alumno y eliminar_profesor; no se expone por API.
CREATE OR REPLACE FUNCTION public.seguimientos_a_papelera(p_ids uuid[])
RETURNS void
LANGUAGE sql
SET search_path = 'public'
AS $$
  WITH movidos AS (
    DELETE FROM seguimientos s
    WHERE s.id = ANY (p_ids)
    RETURNING s.id, s.alumno_id, s.profesor_id, s.categoria, s.texto, s.valor,
              s.creado_en, s.actualizado, s.visible_para
  )
  INSERT INTO seguimientos_papelera
         (id, alumno_id, profesor_id, categoria, texto, valor,
          creado_en, actualizado, visible_para, deleted_at, eliminado_por)
  SELECT m.id, m.alumno_id, m.profesor_id, m.categoria, m.texto, m.valor,
         m.creado_en, m.actualizado, m.visible_para, now(), auth.uid()
  FROM movidos m;
$$;

-- SEGUIMIENTO: lo borra su autor (profesor) o un admin/superadmin.
CREATE OR REPLACE FUNCTION public.eliminar_seguimiento(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE v_owner uuid;
BEGIN
  -- FOR UPDATE: si llegan dos pedidos a la vez, el segundo espera y ya no lo encuentra.
  SELECT profesor_id INTO v_owner FROM seguimientos WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Seguimiento no encontrado'; END IF;
  IF NOT COALESCE(v_owner = auth.uid() OR mi_rol() IN ('admin','superadmin'), false) THEN
    RAISE EXCEPTION 'No tenés permiso para eliminar este seguimiento';
  END IF;
  PERFORM seguimientos_a_papelera(ARRAY[p_id]);
END; $$;

-- ALUMNO: solo admin/superadmin. Arrastra sus comentarios y seguimientos
-- a las papeleras antes de borrarlo.
CREATE OR REPLACE FUNCTION public.eliminar_alumno(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
BEGIN
  IF mi_rol() IS NULL OR mi_rol() NOT IN ('admin','superadmin') THEN
    RAISE EXCEPTION 'No tenés permiso para eliminar alumnos';
  END IF;
  -- FOR UPDATE: mientras se mueve lo suyo nadie le carga un seguimiento
  -- nuevo, y un segundo pedido simultáneo ya no lo encuentra.
  PERFORM 1 FROM alumnos WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Alumno no encontrado'; END IF;
  -- Y se bloquean sus seguimientos: su autor no puede cambiarlos justo
  -- ahora y dejarlos afuera del pase a la papelera.
  PERFORM 1 FROM seguimientos WHERE alumno_id = p_id FOR UPDATE;
  INSERT INTO comentarios_papelera SELECT c.*, now() FROM comentarios c WHERE c.alumno_id = p_id;
  PERFORM seguimientos_a_papelera(ARRAY(SELECT s.id FROM seguimientos s WHERE s.alumno_id = p_id));
  INSERT INTO alumnos_papelera     SELECT a.*, now() FROM alumnos     a WHERE a.id = p_id;
  DELETE FROM alumnos WHERE id = p_id;  -- el CASCADE borra los comentarios ya copiados
END; $$;

-- CLASE: solo admin/superadmin. La FK alumnos->clases es RESTRICT, así
-- que no se puede borrar una clase con alumnos (la app avisa). Arrastra
-- las asignaciones profesor_curso a su papelera.
CREATE OR REPLACE FUNCTION public.eliminar_clase(p_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
BEGIN
  IF mi_rol() IS NULL OR mi_rol() NOT IN ('admin','superadmin') THEN
    RAISE EXCEPTION 'No tenés permiso para eliminar clases';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM clases WHERE id = p_id) THEN
    RAISE EXCEPTION 'Clase no encontrada';
  END IF;
  INSERT INTO profesor_curso_papelera SELECT pc.*, now() FROM profesor_curso pc WHERE pc.curso_id = p_id;
  INSERT INTO clases_papelera SELECT c.*, now() FROM clases c WHERE c.id = p_id;
  DELETE FROM clases WHERE id = p_id;
END; $$;

-- PROFESOR: solo admin/superadmin. Arrastra sus comentarios, seguimientos
-- y asignaciones a las papeleras antes de borrarlo.
CREATE OR REPLACE FUNCTION public.eliminar_profesor(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
BEGIN
  IF mi_rol() IS NULL OR mi_rol() NOT IN ('admin','superadmin') THEN
    RAISE EXCEPTION 'No tenés permiso para eliminar profesores';
  END IF;
  -- FOR UPDATE: mientras se mueve lo suyo no puede cargar un seguimiento
  -- nuevo, y un segundo pedido simultáneo ya no lo encuentra.
  PERFORM 1 FROM profesores WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profesor no encontrado'; END IF;
  -- Y se bloquean sus seguimientos: no puede cambiarlos justo ahora y
  -- dejarlos afuera del pase a la papelera.
  PERFORM 1 FROM seguimientos WHERE profesor_id = p_id FOR UPDATE;
  INSERT INTO comentarios_papelera    SELECT c.*,  now() FROM comentarios    c  WHERE c.profesor_id = p_id;
  PERFORM seguimientos_a_papelera(ARRAY(SELECT s.id FROM seguimientos s WHERE s.profesor_id = p_id));
  INSERT INTO profesor_curso_papelera SELECT pc.*, now() FROM profesor_curso pc WHERE pc.profesor_id = p_id;
  INSERT INTO profesores_papelera     SELECT p.*,  now() FROM profesores     p  WHERE p.id = p_id;
  DELETE FROM profesores WHERE id = p_id;  -- el CASCADE borra los comentarios y asignaciones ya copiados
END; $$;

-- ADMIN: solo un superadmin puede borrar administradores.
CREATE OR REPLACE FUNCTION public.eliminar_admin(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
BEGIN
  IF mi_rol() IS NULL OR mi_rol() <> 'superadmin' THEN
    RAISE EXCEPTION 'Solo un superadmin puede eliminar administradores';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM admins WHERE id = p_id) THEN
    RAISE EXCEPTION 'Administrador no encontrado';
  END IF;
  INSERT INTO admins_papelera SELECT a.*, now() FROM admins a WHERE a.id = p_id;
  DELETE FROM admins WHERE id = p_id;
END; $$;

-- RESTAURAR: solo dirección. La entrada sale de la papelera y el
-- seguimiento vuelve a la tabla viva con su fecha, autor y visibilidad
-- originales.
CREATE OR REPLACE FUNCTION public.restaurar_seguimiento(p_papelera_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  v    seguimientos_papelera%ROWTYPE;
  v_id uuid;
BEGIN
  IF mi_rol() IS NULL OR mi_rol() NOT IN ('admin','superadmin') THEN
    RAISE EXCEPTION 'No tenés permiso para restaurar seguimientos';
  END IF;
  -- Sale de la papelera en la misma sentencia que se lee: dos pedidos
  -- simultáneos no pueden restaurar dos veces la misma entrada.
  DELETE FROM seguimientos_papelera WHERE papelera_id = p_papelera_id RETURNING * INTO v;
  IF NOT FOUND THEN RAISE EXCEPTION 'El seguimiento no está en la papelera'; END IF;
  IF NOT EXISTS (SELECT 1 FROM alumnos WHERE id = v.alumno_id) THEN
    RAISE EXCEPTION 'No se puede restaurar: el alumno ya no existe';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM profesores WHERE id = v.profesor_id) THEN
    RAISE EXCEPTION 'No se puede restaurar: el profesor ya no existe';
  END IF;
  -- Vuelve con su id original. Si ese id está ocupado por un seguimiento
  -- activo recibe uno nuevo: el id no significa nada para la app, y así
  -- nadie puede trabar una restauración cargando otro con el mismo id.
  v_id := v.id;
  IF EXISTS (SELECT 1 FROM seguimientos WHERE id = v_id) THEN
    v_id := gen_random_uuid();
  END IF;
  INSERT INTO seguimientos
         (id, alumno_id, profesor_id, categoria, texto, valor,
          creado_en, actualizado, visible_para)
  VALUES (v_id, v.alumno_id, v.profesor_id, v.categoria, v.texto, v.valor,
          v.creado_en, v.actualizado, v.visible_para);
END; $$;

-- ELIMINAR DEFINITIVAMENTE: solo dirección. No se puede deshacer.
CREATE OR REPLACE FUNCTION public.purgar_seguimiento(p_papelera_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
BEGIN
  IF mi_rol() IS NULL OR mi_rol() NOT IN ('admin','superadmin') THEN
    RAISE EXCEPTION 'No tenés permiso para eliminar definitivamente';
  END IF;
  DELETE FROM seguimientos_papelera WHERE papelera_id = p_papelera_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'El seguimiento no está en la papelera'; END IF;
END; $$;

-- ============================================================
-- 6. PERMISOS DE EJECUCIÓN
-- ============================================================
-- Las funciones de borrado, restauración y eliminación definitiva las
-- llama la app estando logueada; validan el rol internamente. Solo
-- 'authenticated' (no anon/PUBLIC).
REVOKE EXECUTE ON FUNCTION
  public.eliminar_comentario(uuid), public.eliminar_seguimiento(uuid),
  public.eliminar_alumno(uuid), public.eliminar_clase(text),
  public.eliminar_profesor(uuid), public.eliminar_admin(uuid),
  public.restaurar_seguimiento(uuid), public.purgar_seguimiento(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.eliminar_comentario(uuid), public.eliminar_seguimiento(uuid),
  public.eliminar_alumno(uuid), public.eliminar_clase(text),
  public.eliminar_profesor(uuid), public.eliminar_admin(uuid),
  public.restaurar_seguimiento(uuid), public.purgar_seguimiento(uuid)
  TO authenticated;

-- De uso interno (la llaman las funciones de borrado). La API no.
REVOKE EXECUTE ON FUNCTION public.seguimientos_a_papelera(uuid[]) FROM PUBLIC, anon, authenticated;

-- Avisar a PostgREST que cambió el esquema (columnas, vistas, funciones).
NOTIFY pgrst, 'reload schema';

COMMIT;
