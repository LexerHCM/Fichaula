-- ============================================================
-- FichAula · 14 · NOMBRE LIBRE PARA LAS CLASES  (DESPUÉS de 13)
-- ============================================================
-- Antes una clase solo podía llamarse "<año 1–7>° <letra A–Z>".
-- Ahora tiene una columna `nombre` libre (ej: "1° TEC", "Taller de
-- Robótica"). `anio` y `division` pasan a ser opcionales: se siguen
-- cargando cuando el nombre tiene el formato clásico (sirven para
-- ordenar y para el importador de Excel), y quedan en NULL si no.
-- Todas las vistas muestran `nombre`.
-- ============================================================

-- ── Columna nombre ──────────────────────────────────────────
ALTER TABLE public.clases          ADD COLUMN IF NOT EXISTS nombre text;
ALTER TABLE public.clases_papelera ADD COLUMN IF NOT EXISTS nombre text;

UPDATE public.clases
   SET nombre = anio || '° ' || division
 WHERE nombre IS NULL;
UPDATE public.clases_papelera
   SET nombre = anio || '° ' || division
 WHERE nombre IS NULL AND anio IS NOT NULL AND division IS NOT NULL;

-- anio/division ya no son obligatorios (sus CHECK siguen valiendo si se cargan)
ALTER TABLE public.clases ALTER COLUMN anio DROP NOT NULL;
ALTER TABLE public.clases ALTER COLUMN division DROP NOT NULL;
ALTER TABLE public.clases_papelera ALTER COLUMN anio DROP NOT NULL;
ALTER TABLE public.clases_papelera ALTER COLUMN division DROP NOT NULL;

-- ── Completar / validar el nombre en cada alta o cambio ─────
-- Los importadores (SQL 08 y 10) insertan solo anio + division:
-- el trigger arma el nombre para que sigan funcionando igual.
CREATE OR REPLACE FUNCTION public.clases_completar_nombre()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  NEW.nombre := nullif(regexp_replace(btrim(coalesce(NEW.nombre, '')), '\s+', ' ', 'g'), '');
  IF NEW.nombre IS NULL THEN
    IF NEW.anio IS NULL OR NEW.division IS NULL THEN
      RAISE EXCEPTION 'La clase necesita un nombre.' USING ERRCODE = '23502';
    END IF;
    NEW.nombre := NEW.anio || '° ' || NEW.division;
  END IF;
  IF char_length(NEW.nombre) > 40 THEN
    RAISE EXCEPTION 'El nombre de la clase puede tener hasta 40 caracteres.' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clases_nombre ON public.clases;
CREATE TRIGGER trg_clases_nombre BEFORE INSERT OR UPDATE ON public.clases
  FOR EACH ROW EXECUTE FUNCTION public.clases_completar_nombre();

ALTER TABLE public.clases ALTER COLUMN nombre SET NOT NULL;

-- Sin nombres repetidos dentro de un colegio (sin importar mayúsculas)
CREATE UNIQUE INDEX IF NOT EXISTS clases_colegio_nombre_key
  ON public.clases (colegio_id, lower(nombre));

-- eliminar_clase() (SQL 09b) copia columnas a mano y no incluye `nombre`:
-- este trigger lo toma de la clase, que en ese momento todavía existe.
CREATE OR REPLACE FUNCTION public.clases_papelera_copiar_nombre()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.nombre IS NULL THEN
    SELECT c.nombre INTO NEW.nombre FROM public.clases c WHERE c.id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clases_papelera_nombre ON public.clases_papelera;
CREATE TRIGGER trg_clases_papelera_nombre BEFORE INSERT ON public.clases_papelera
  FOR EACH ROW EXECUTE FUNCTION public.clases_papelera_copiar_nombre();

-- ── Vistas: el nombre de la clase sale de `nombre` ───────────
-- (mismas definiciones que en 02 / 09b; solo cambia curso_nombre y se
--  agrega curso_nombre al final de las vistas de alumnos)
CREATE OR REPLACE VIEW public.vista_alumnos_completa
  WITH (security_invoker = true) AS
  SELECT a.id, a.legajo, a.nombre, a.apellido, a.dni, a.fecha_nacimiento,
         date_part('year', age(a.fecha_nacimiento::timestamptz))::int AS edad,
         c.id AS curso_id, c.anio, c.division, c.nivel, c.turno, c.aula,
         c.nombre AS curso_nombre
  FROM public.alumnos a
  JOIN public.clases c ON c.id = a.curso_id
  WHERE a.activo = true;

CREATE OR REPLACE VIEW public.vista_ficha_alumno
  WITH (security_invoker = true) AS
  SELECT a.id, a.legajo, a.nombre, a.apellido, a.dni, a.fecha_nacimiento,
         date_part('year', age(a.fecha_nacimiento::timestamptz))::int AS edad,
         c.id AS curso_id, c.anio, c.division, c.nivel, c.turno, c.aula, a.colegio_id,
         c.nombre AS curso_nombre
  FROM public.alumnos a
  JOIN public.clases c ON c.id = a.curso_id
  WHERE a.activo = true;

CREATE OR REPLACE VIEW public.vista_seguimientos_completa
  WITH (security_invoker = true) AS
  SELECT s.id, s.categoria, s.texto, s.valor, s.creado_en,
         a.legajo AS alumno_legajo, a.nombre AS alumno_nombre, a.apellido AS alumno_apellido,
         c.id AS curso_id, c.nombre AS curso_nombre,
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
         c.nombre AS curso_nombre,
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
         cl.id AS clase_id, cl.nombre AS clase_nombre
  FROM public.comentarios c
  LEFT JOIN public.profesores p ON p.id = c.profesor_id
  LEFT JOIN LATERAL public.datos_preceptor(c.preceptor_id) autor_pre ON c.preceptor_id IS NOT NULL
  LEFT JOIN public.alumnos a ON a.id = c.alumno_id
  LEFT JOIN public.clases cl ON cl.id = COALESCE(c.curso_id, a.curso_id);
