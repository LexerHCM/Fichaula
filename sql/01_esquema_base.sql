-- ============================================================
-- FichAula · 01 · ESQUEMA BASE  (ejecutar PRIMERO)
-- ============================================================
-- Crea los tipos ENUM y las 8 tablas base del sistema, con sus
-- claves, restricciones e índices. Es idempotente: se puede
-- volver a correr sin romper nada.
--
-- Orden de creación respeta las dependencias de claves foráneas:
--   superadmins, admins, profesores -> clases -> alumnos ->
--   profesor_curso -> comentarios -> seguimientos
--
-- NOTA: la app NO guarda contraseñas. La autenticación la maneja
-- Supabase Auth (bcrypt + JWT). Las tablas de perfil se enlazan a
-- auth.users por UUID mediante el trigger del script 02.
-- ============================================================

-- ------------------------------------------------------------
-- TIPOS ENUM
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='rol_usuario') THEN
    CREATE TYPE rol_usuario AS ENUM ('superadmin', 'admin', 'profesor');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='turno_clase') THEN
    CREATE TYPE turno_clase AS ENUM ('Mañana', 'Tarde', 'Noche');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='categoria_seg') THEN
    CREATE TYPE categoria_seg AS ENUM ('conducta', 'actitud', 'nota', 'observacion');
  END IF;
END$$;

-- ------------------------------------------------------------
-- SUPERADMINS  (nivel 3 — dueños del sistema)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS superadmins (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text        NOT NULL UNIQUE,
  nombre      text        NOT NULL,
  apellido    text        NOT NULL,
  activo      boolean     NOT NULL DEFAULT true,
  creado_en   timestamptz NOT NULL DEFAULT now(),
  actualizado timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- ADMINS  (nivel 2 — dirección / administración)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admins (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text        NOT NULL UNIQUE,
  nombre      text        NOT NULL,
  apellido    text        NOT NULL,
  cargo       text,
  activo      boolean     NOT NULL DEFAULT true,
  creado_en   timestamptz NOT NULL DEFAULT now(),
  actualizado timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- PROFESORES  (nivel 1 — docentes)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profesores (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text        NOT NULL UNIQUE,
  nombre      text        NOT NULL,
  apellido    text        NOT NULL,
  materia     text        NOT NULL,
  activo      boolean     NOT NULL DEFAULT true,
  creado_en   timestamptz NOT NULL DEFAULT now(),
  actualizado timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- CLASES  (cursos: año + división)
--   id es un texto corto y legible (p.ej. '1A', '6B').
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clases (
  id                  text        PRIMARY KEY,
  anio                smallint    NOT NULL CHECK (anio >= 1 AND anio <= 7),
  division            char(1)     NOT NULL CHECK (division ~ '^[A-Z]$'),
  nivel               text        NOT NULL,
  turno               turno_clase NOT NULL,
  aula                text        NOT NULL,
  profesor_titular_id uuid        REFERENCES profesores(id) ON DELETE SET NULL,
  activo              boolean     NOT NULL DEFAULT true,
  creado_en           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (anio, division)
);

-- ------------------------------------------------------------
-- ALUMNOS
--   curso_id -> clases con ON DELETE RESTRICT: no se puede borrar
--   una clase que todavía tenga alumnos (se valida también en la
--   función eliminar_clase del script 03).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS alumnos (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  legajo           text        NOT NULL UNIQUE,
  nombre           text        NOT NULL,
  apellido         text        NOT NULL,
  dni              text        NOT NULL UNIQUE,
  fecha_nacimiento date        NOT NULL,
  curso_id         text        NOT NULL REFERENCES clases(id) ON DELETE RESTRICT,
  activo           boolean     NOT NULL DEFAULT true,
  creado_en        timestamptz NOT NULL DEFAULT now(),
  actualizado      timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- PROFESOR_CURSO  (asignaciones N:N profesor <-> clase)
--   PK compuesta; el orden (profesor_id, curso_id) deja la
--   columna profesor_id indexada por la propia PK.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profesor_curso (
  profesor_id uuid NOT NULL REFERENCES profesores(id) ON DELETE CASCADE,
  curso_id    text NOT NULL REFERENCES clases(id)     ON DELETE CASCADE,
  PRIMARY KEY (profesor_id, curso_id)
);

-- ------------------------------------------------------------
-- COMENTARIOS  (observaciones de un profesor sobre un alumno)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comentarios (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id    uuid        NOT NULL REFERENCES alumnos(id)    ON DELETE CASCADE,
  profesor_id  uuid        NOT NULL REFERENCES profesores(id) ON DELETE CASCADE,
  texto        text        NOT NULL CHECK (char_length(texto) > 0),
  visible_para rol_usuario NOT NULL DEFAULT 'profesor',
  creado_en    timestamptz NOT NULL DEFAULT now(),
  actualizado  timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- SEGUIMIENTOS  (registro por categoría; 'nota' exige valor 0–10)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS seguimientos (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id   uuid          NOT NULL REFERENCES alumnos(id)    ON DELETE CASCADE,
  profesor_id uuid          NOT NULL REFERENCES profesores(id) ON DELETE CASCADE,
  categoria   categoria_seg NOT NULL,
  texto       text          NOT NULL CHECK (char_length(texto) > 0),
  valor       numeric(4,2),
  creado_en   timestamptz   NOT NULL DEFAULT now(),
  actualizado timestamptz   NOT NULL DEFAULT now(),
  CHECK (categoria <> 'nota' OR (valor >= 0 AND valor <= 10))
);

-- ------------------------------------------------------------
-- ÍNDICES  (aceleran JOINs, búsquedas y verificación de FKs)
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_alumnos_curso           ON alumnos        (curso_id);
CREATE INDEX IF NOT EXISTS idx_alumnos_legajo          ON alumnos        (legajo);
CREATE INDEX IF NOT EXISTS idx_alumnos_dni             ON alumnos        (dni);
CREATE INDEX IF NOT EXISTS idx_clases_profesor_titular ON clases         (profesor_titular_id);
CREATE INDEX IF NOT EXISTS idx_profesor_curso_curso    ON profesor_curso (curso_id);
CREATE INDEX IF NOT EXISTS idx_com_alumno              ON comentarios    (alumno_id);
CREATE INDEX IF NOT EXISTS idx_comentarios_profesor    ON comentarios    (profesor_id);
CREATE INDEX IF NOT EXISTS idx_seg_alumno              ON seguimientos   (alumno_id);
CREATE INDEX IF NOT EXISTS idx_seg_profesor            ON seguimientos   (profesor_id);
CREATE INDEX IF NOT EXISTS idx_seg_cat                 ON seguimientos   (categoria);
