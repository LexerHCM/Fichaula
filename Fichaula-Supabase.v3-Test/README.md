# Fich**aula**

> Sistema de gestión escolar para docentes y directivos.
> Frontend estático (HTML/CSS/JS) + backend Supabase (PostgreSQL).

---

## ¿Qué es FichAula?

FichAula centraliza el seguimiento académico y disciplinario de los alumnos de un
establecimiento educativo. Los profesores registran observaciones sobre sus
estudiantes y la dirección gestiona toda la información institucional desde un
único panel. Toda la seguridad de los datos vive en la base (Row Level Security),
de modo que el frontend puede servirse como sitio estático (GitHub Pages).

---

## Roles

| Rol | Acceso |
|-----|--------|
| **Superadmin** | Control total del sistema, incluida la gestión de administradores |
| **Administrador** | Clases, alumnos, profesores, asignaciones, todos los seguimientos y la papelera |
| **Profesor** | Solo sus cursos asignados; carga seguimientos y ve los propios más los que otro docente compartió con "Todos" |

La jerarquía es **superadmin > admin > profesor**. Un profesor nunca ve cursos ni
alumnos que no le fueron asignados; un admin no puede ver ni escalar a superadmin.

---

## Funcionalidades

- **Seguimientos por alumno** — conducta, actitud, notas (0–10) u observaciones libres.
- **Privacidad y visibilidad** — al cargar un seguimiento el docente elige quién lo ve:
  "Dirección" (él y la dirección, por defecto) o "Todos" (además, los docentes del
  curso). Un profesor nunca ve los seguimientos privados de otro.
- **Filtros de seguimientos** — por nota, alumno, docente, fecha, categoría y, para
  dirección, estado (activo/eliminado).
- **Búsqueda de alumnos** — por nombre y apellido en cualquier orden, con o sin
  acentos, y por curso; dirección también por legajo o DNI.
- **Comentarios por alumno** — observaciones de texto del docente.
- **Gestión de clases** — alta, edición y baja de cursos; asignación de profesor titular.
- **Gestión de alumnos** — alta, baja y modificación (legajo, DNI, fecha de nacimiento, curso).
- **Gestión de profesores y asignaciones** — qué cursos dicta cada docente.
- **Control de acceso por rol** — aplicado en la base con Row Level Security.
- **Papelera con retención de 30 días** — los borrados se mueven a tablas espejo y
  se purgan automáticamente a diario. Dirección ve los seguimientos eliminados y,
  dentro de ese plazo, los restaura o los elimina definitivamente.
- **Sesión por pestaña** — la autenticación usa `sessionStorage` (se cierra al cerrar el navegador).

---

## Arquitectura

```
Navegador (HTML/CSS/JS)  ──fetch REST──►  Supabase
  • sin framework                          • PostgreSQL + Row Level Security
  • sin SDK (fetch nativo)                 • Supabase Auth (JWT, bcrypt)
  • capa de red resiliente                 • funciones RPC SECURITY DEFINER
    (timeout + refresh de token)           • pg_cron (purga de papelera)
```

La **anon key** de Supabase es pública por diseño: la seguridad real la garantiza
el RLS de la base, no el ocultamiento de la key.

---

## Estructura del proyecto

```
fichaula/
├── index.html              ← landing según rol
├── pages/
│   ├── login.html          ← inicio de sesión
│   ├── admin.html          ← panel de administración
│   ├── clases.html         ← grilla de cursos
│   ├── alumnos.html        ← tabla global de alumnos (admin)
│   └── curso.html          ← detalle de curso + seguimientos
├── css/
│   ├── style.css           ← estilos globales
│   ├── admin.css           ← panel de administración
│   └── login.css           ← pantalla de login
├── js/
│   ├── supabase.js         ← capa de datos: REST a Supabase + Auth + RPC
│   ├── auth.js             ← guards de rol (requireAuth/requireAdmin/requireSuperadmin)
│   ├── components.js       ← nav y footer reutilizables
│   ├── filtros.js          ← búsqueda de alumnos y filtros de seguimientos (compartido)
│   ├── admin.js            ← panel admin (clases, alumnos, profesores, seguimientos y papelera)
│   ├── clases.js           ← grilla de cursos
│   ├── alumnos.js          ← tabla global de alumnos
│   ├── curso.js            ← detalle de curso + seguimientos
│   ├── index.js            ← hero según rol
│   └── login.js            ← lógica del formulario de login
├── multimedia/
│   └── videoindex.mp4
├── sql/                    ← esquema y configuración de la base (ver GUIA-SETUP.md)
│   ├── 01_esquema_base.sql
│   ├── 02_seguridad_rls.sql
│   ├── 03_papelera.sql
│   ├── 04_cron_purga.sql
│   ├── 05_perfiles.sql
│   ├── 06_datos_demo.sql
│   └── 07_privacidad_seguimientos.sql   ← actualización de una base ya existente
├── GUIA-SETUP.md           ← puesta en marcha paso a paso
└── README.md
```

---

## Puesta en marcha

1. **Base de datos**: corré los scripts de `sql/` en orden (01 → 06) en tu proyecto
   Supabase y creá los usuarios de Auth. Si la base ya existía de una versión
   anterior, alcanza con correr el 07. El detalle está en **[GUIA-SETUP.md](GUIA-SETUP.md)**.
2. **Frontend**: editá `SUPABASE_URL` y `SUPABASE_ANON_KEY` al inicio de
   `js/supabase.js` con los datos de tu proyecto y publicá la carpeta como sitio
   estático (GitHub Pages, Netlify, o cualquier hosting de archivos).

---

## Seguridad

- **Autenticación**: Supabase Auth (contraseñas con bcrypt, tokens JWT). La app no
  guarda contraseñas en ninguna tabla.
- **Autorización**: Row Level Security en las 15 tablas. La función `mi_rol()`
  resuelve el rol del usuario y las políticas aplican la matriz de permisos.
- **Privacidad de seguimientos**: la política de lectura devuelve a un profesor solo
  sus seguimientos y los ajenos marcados como visibles para todos, y siempre dentro de
  sus cursos; los filtros y búsquedas del frontend trabajan sobre lo que el servidor
  ya entregó. La papelera solo la lee la dirección.
- **Borrado seguro**: las funciones `eliminar_*` (SECURITY DEFINER) mueven los
  registros a tablas espejo `*_papelera` dentro de una transacción atómica, validando
  el rol antes de actuar (un usuario sin perfil no pasa). Cada seguimiento eliminado
  es una entrada propia de la papelera; `restaurar_seguimiento` y `purgar_seguimiento`
  actúan sobre una sola entrada y son solo para dirección. La purga a 30 días la
  corre `pg_cron`.
- **Vistas**: `security_invoker = true`, para que respeten el RLS de quien consulta.

---

## Tecnologías

HTML5 · CSS3 · JavaScript (ES2017+, sin framework) · Supabase (PostgreSQL 17,
PostgREST, Auth, pg_cron).
