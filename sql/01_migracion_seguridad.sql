-- ============================================================
-- FICHAULA — MIGRACIÓN DE SEGURIDAD (ejecutar PRIMERO)
-- ============================================================
-- Objetivo:
--   1. Quitar las contraseñas en texto plano (las maneja Supabase Auth).
--   2. Enlazar las tablas de perfil a auth.users por UUID.
--   3. Función mi_rol() para que el SERVIDOR sepa el rol del usuario.
--   4. Soft delete (columna 'eliminado') en comentarios y seguimientos.
--   5. Row Level Security (RLS) que implementa la matriz RBAC.
--
-- IMPORTANTE: las tablas clases/alumnos/profesor_curso/seguimientos/
-- comentarios deben estar VACÍAS al correr esto (lo están según el
-- diagnóstico). Si tuvieran datos dependientes, hacé backup antes.
-- ============================================================

-- ------------------------------------------------------------
-- 1. LIMPIAR usuarios semilla viejos (se recrean vía Auth)
--    Como clases/alumnos están vacías, no hay FK que rompa.
-- ------------------------------------------------------------
DELETE FROM profesor_curso;
DELETE FROM profesores;
DELETE FROM admins;
DELETE FROM superadmins;

-- ------------------------------------------------------------
-- 2. QUITAR la columna password (Supabase Auth guarda el hash)
-- ------------------------------------------------------------
ALTER TABLE superadmins DROP COLUMN IF EXISTS password;
ALTER TABLE admins      DROP COLUMN IF EXISTS password;
ALTER TABLE profesores  DROP COLUMN IF EXISTS password;

-- ------------------------------------------------------------
-- 3. SOFT DELETE: columna 'eliminado'
-- ------------------------------------------------------------
ALTER TABLE comentarios  ADD COLUMN IF NOT EXISTS eliminado BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE seguimientos ADD COLUMN IF NOT EXISTS eliminado BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_com_no_eliminado ON comentarios(alumno_id) WHERE eliminado = FALSE;
CREATE INDEX IF NOT EXISTS idx_seg_no_eliminado ON seguimientos(alumno_id) WHERE eliminado = FALSE;

-- ------------------------------------------------------------
-- 4. FUNCIÓN mi_rol(): devuelve el rol del usuario autenticado.
--    SECURITY DEFINER para poder leer las tablas sin recursión RLS.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION mi_rol()
RETURNS rol_usuario
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM superadmins WHERE id = auth.uid()) THEN 'superadmin'::rol_usuario
    WHEN EXISTS (SELECT 1 FROM admins      WHERE id = auth.uid()) THEN 'admin'::rol_usuario
    WHEN EXISTS (SELECT 1 FROM profesores  WHERE id = auth.uid()) THEN 'profesor'::rol_usuario
    ELSE NULL
  END;
$$;

-- ------------------------------------------------------------
-- 4b. VISTAS: que respeten RLS (security_invoker) y oculten
--     los registros con soft delete.
-- ------------------------------------------------------------
-- Recrear la vista de seguimientos filtrando los eliminados.
CREATE OR REPLACE VIEW vista_seguimientos_completa AS
SELECT
    s.id, s.categoria, s.texto, s.valor, s.creado_en,
    a.legajo   AS alumno_legajo,
    a.nombre   AS alumno_nombre,
    a.apellido AS alumno_apellido,
    c.id       AS curso_id,
    c.anio || '° ' || c.division AS curso_nombre,
    p.id       AS profesor_id,
    p.nombre   AS profesor_nombre,
    p.apellido AS profesor_apellido,
    p.materia
FROM seguimientos s
JOIN alumnos    a ON a.id = s.alumno_id
JOIN clases     c ON c.id = a.curso_id
JOIN profesores p ON p.id = s.profesor_id
WHERE s.eliminado = FALSE;

-- security_invoker = true → la vista aplica el RLS del usuario que consulta,
-- no el del dueño de la vista. Sin esto, las vistas filtran datos saltándose RLS.
ALTER VIEW vista_seguimientos_completa SET (security_invoker = true);
ALTER VIEW vista_alumnos_completa      SET (security_invoker = true);

-- ============================================================
-- 5. ROW LEVEL SECURITY
-- ============================================================
-- Activar RLS en todas las tablas
ALTER TABLE superadmins   ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins        ENABLE ROW LEVEL SECURITY;
ALTER TABLE profesores    ENABLE ROW LEVEL SECURITY;
ALTER TABLE clases        ENABLE ROW LEVEL SECURITY;
ALTER TABLE alumnos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE profesor_curso ENABLE ROW LEVEL SECURITY;
ALTER TABLE seguimientos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE comentarios   ENABLE ROW LEVEL SECURITY;
ALTER TABLE papelera      ENABLE ROW LEVEL SECURITY;

-- Limpiar políticas previas (idempotente)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname, tablename FROM pg_policies WHERE schemaname='public'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename); END LOOP;
END $$;

-- ---------- SUPERADMINS ----------
-- Cada uno lee su propia fila; solo superadmin gestiona la tabla.
CREATE POLICY sa_select ON superadmins FOR SELECT
  USING (id = auth.uid() OR mi_rol() = 'superadmin');
CREATE POLICY sa_all ON superadmins FOR ALL
  USING (mi_rol() = 'superadmin') WITH CHECK (mi_rol() = 'superadmin');

-- ---------- ADMINS ----------
-- Nivel 3 (superadmin) gestiona admins. Cada admin lee su propia fila.
CREATE POLICY ad_select ON admins FOR SELECT
  USING (id = auth.uid() OR mi_rol() = 'superadmin');
CREATE POLICY ad_all ON admins FOR ALL
  USING (mi_rol() = 'superadmin') WITH CHECK (mi_rol() = 'superadmin');

-- ---------- PROFESORES ----------
-- Nivel 2 (admin/superadmin) gestiona profesores. Cada profe lee su fila.
CREATE POLICY pr_select ON profesores FOR SELECT
  USING (id = auth.uid() OR mi_rol() IN ('admin','superadmin'));
CREATE POLICY pr_all ON profesores FOR ALL
  USING (mi_rol() IN ('admin','superadmin'))
  WITH CHECK (mi_rol() IN ('admin','superadmin'));

-- ---------- CLASES ----------
-- Admin/superadmin: todo. Profesor: solo lee las clases que dicta.
CREATE POLICY cl_select ON clases FOR SELECT
  USING (
    mi_rol() IN ('admin','superadmin')
    OR id IN (SELECT curso_id FROM profesor_curso WHERE profesor_id = auth.uid())
  );
CREATE POLICY cl_all ON clases FOR ALL
  USING (mi_rol() IN ('admin','superadmin'))
  WITH CHECK (mi_rol() IN ('admin','superadmin'));

-- ---------- ALUMNOS ----------
-- Admin/superadmin: CRUD total. Profesor: solo lee alumnos de SUS cursos.
CREATE POLICY al_select ON alumnos FOR SELECT
  USING (
    mi_rol() IN ('admin','superadmin')
    OR curso_id IN (SELECT curso_id FROM profesor_curso WHERE profesor_id = auth.uid())
  );
CREATE POLICY al_all ON alumnos FOR ALL
  USING (mi_rol() IN ('admin','superadmin'))
  WITH CHECK (mi_rol() IN ('admin','superadmin'));

-- ---------- PROFESOR_CURSO (asignaciones) ----------
-- Admin/superadmin gestiona. Profesor lee sus propias asignaciones.
CREATE POLICY pc_select ON profesor_curso FOR SELECT
  USING (profesor_id = auth.uid() OR mi_rol() IN ('admin','superadmin'));
CREATE POLICY pc_all ON profesor_curso FOR ALL
  USING (mi_rol() IN ('admin','superadmin'))
  WITH CHECK (mi_rol() IN ('admin','superadmin'));

-- ---------- SEGUIMIENTOS ----------
-- Profesor: lee los de alumnos de sus cursos; crea/edita/borra los suyos.
-- Admin/superadmin: lectura total (vista de supervisión).
CREATE POLICY seg_select ON seguimientos FOR SELECT
  USING (
    mi_rol() IN ('admin','superadmin')
    OR alumno_id IN (
      SELECT a.id FROM alumnos a
      JOIN profesor_curso pc ON pc.curso_id = a.curso_id
      WHERE pc.profesor_id = auth.uid()
    )
  );
CREATE POLICY seg_insert ON seguimientos FOR INSERT
  WITH CHECK (profesor_id = auth.uid() AND mi_rol() = 'profesor');
CREATE POLICY seg_update ON seguimientos FOR UPDATE
  USING (profesor_id = auth.uid()) WITH CHECK (profesor_id = auth.uid());

-- ---------- COMENTARIOS ----------
-- Profesor: crea/edita/soft-delete los suyos; lee los suyos.
-- Admin/superadmin: lectura total.
CREATE POLICY com_select ON comentarios FOR SELECT
  USING (profesor_id = auth.uid() OR mi_rol() IN ('admin','superadmin'));
CREATE POLICY com_insert ON comentarios FOR INSERT
  WITH CHECK (profesor_id = auth.uid() AND mi_rol() = 'profesor');
CREATE POLICY com_update ON comentarios FOR UPDATE
  USING (profesor_id = auth.uid()) WITH CHECK (profesor_id = auth.uid());
-- (No hay política DELETE: el borrado es lógico vía UPDATE eliminado=true)

-- ---------- PAPELERA ----------
-- Solo admin/superadmin (auditoría de borrados).
CREATE POLICY pap_all ON papelera FOR ALL
  USING (mi_rol() IN ('admin','superadmin'))
  WITH CHECK (mi_rol() IN ('admin','superadmin'));

-- ============================================================
-- FIN. Próximo paso: crear los usuarios en Supabase Auth y luego
-- correr 02_datos_clases_alumnos.sql.
-- ============================================================
