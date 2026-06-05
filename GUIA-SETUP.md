# Guía de puesta en marcha — FichAula (versión segura)

Seguí estos pasos **en orden**. La seguridad real la aplica Supabase
(Auth + RLS), así que estos pasos no son opcionales.

> Requisito previo: el proyecto de Supabase ya debe tener creado el esquema
> base (tablas `superadmins`, `admins`, `profesores`, `clases`, `alumnos`,
> `profesor_curso`, `seguimientos`, `comentarios`, `papelera`, los ENUM y las
> dos vistas). Si todavía no lo creaste, hacelo primero.

---

## Paso 1 · Correr la migración de seguridad

En Supabase → **SQL Editor** → pegá y ejecutá **`sql/01_migracion_seguridad.sql`**.

Esto hace:
- borra los usuarios viejos (se recrean con Auth) y **elimina las columnas `password`**,
- agrega la columna `eliminado` (soft delete) a `comentarios` y `seguimientos`,
- crea la función `mi_rol()`,
- activa **RLS** y crea todas las políticas de la matriz de roles,
- recrea las vistas con `security_invoker` (para que respeten RLS).

---

## Paso 2 · Crear los usuarios en Supabase Auth

En Supabase → **Authentication → Users → Add user**. Creá uno por uno,
con **"Auto Confirm User" activado**. Anotá el **UUID** que genera cada uno.

| Rol         | Email sugerido                      | Contraseña (elegila vos) |
|-------------|-------------------------------------|--------------------------|
| Superadmin  | `super@sagradocorazon.edu.ar`       | (una segura)             |
| Admin       | `admin@sagradocorazon.edu.ar`       | (una segura)             |
| Profesor 1  | `profe@sagradocorazon.edu.ar`       | (una segura)             |
| Profesor 2  | `lucas@sagradocorazon.edu.ar`       | (una segura)             |

> Las contraseñas las hashea Supabase con bcrypt. Nunca más viajan en texto plano.

---

## Paso 3 · Crear las filas de perfil (con el UUID de cada usuario)

En **SQL Editor**, reemplazá cada `<UUID_...>` por el UUID copiado en el paso 2
y ejecutá. **Importante:** los emails de los profesores deben ser exactamente
`profe@...` y `lucas@...` porque el paso 4 los usa para asignar al titular.

```sql
-- Superadmin
INSERT INTO superadmins (id, email, nombre, apellido, activo)
VALUES ('<UUID_SUPER>', 'super@sagradocorazon.edu.ar', 'Equipo', 'FichAula', true);

-- Admin (Directora)
INSERT INTO admins (id, email, nombre, apellido, cargo, activo)
VALUES ('<UUID_ADMIN>', 'admin@sagradocorazon.edu.ar', 'Laura', 'Méndez', 'Directora', true);

-- Profesor 1
INSERT INTO profesores (id, email, nombre, apellido, materia, activo)
VALUES ('<UUID_PROFE1>', 'profe@sagradocorazon.edu.ar', 'María', 'González', 'Matemática', true);

-- Profesor 2
INSERT INTO profesores (id, email, nombre, apellido, materia, activo)
VALUES ('<UUID_PROFE2>', 'lucas@sagradocorazon.edu.ar', 'Lucas', 'Fernández', 'Lengua y Literatura', true);
```

> Si tus tablas tienen columnas distintas, ajustá los nombres. Lo esencial es
> que `id` sea el **UUID de Auth** y que el email coincida.

---

## Paso 4 · Cargar clases y alumnos

En **SQL Editor** → pegá y ejecutá **`sql/02_datos_clases_alumnos.sql`**.

Al final corre una verificación que debe mostrar: **clases = 12**,
**alumnos = 86**, **profesor_curso = 10**.

---

## Paso 5 · Frontend

El archivo `js/supabase.js` ya tiene la URL y la anon key de tu proyecto
(arriba de todo, en la sección CONFIGURACIÓN). La anon key es **pública por
diseño**: la seguridad no depende de ocultarla, sino de las políticas RLS del
paso 1. Subí la carpeta a GitHub Pages como ya lo venías haciendo.

---

## Paso 6 · Probar

Entrá con cada usuario y verificá:
- **Profesor** → ve solo sus clases y alumnos; carga seguimientos; al eliminarlos
  quedan marcados como borrados (soft delete), no desaparecen de la base.
- **Admin** → ve todo; CRUD de clases, alumnos y profesores; asigna clases.
- **Superadmin** → igual que admin en el panel.

---

## Nota sobre la gestión de administradores (Nivel 3)

El panel cubre el alcance del **Admin** (clases, alumnos, profesores, seguimientos).
El **CRUD de administradores por parte del superadmin** ya está habilitado a nivel
de datos (RLS permite a `superadmin` escribir en la tabla `admins`), pero **no tiene
una pantalla dedicada** en esta entrega. Por ahora se hace por SQL; agregar esa
pantalla es un paso aditivo que puedo entregarte aparte.
