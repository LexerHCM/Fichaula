# Guía de puesta en marcha — FichAula

La seguridad real la aplica Supabase (Auth + Row Level Security), así que estos
pasos no son opcionales para que el sistema funcione de forma segura.

---

## Estado de esta instalación

El proyecto Supabase de FichAula **ya está configurado y verificado**: esquema,
funciones, RLS (37 políticas), papelera con tablas espejo, hardening de seguridad,
optimización de rendimiento y la purga diaria por `pg_cron` están aplicados y
probados en vivo.

**Lo único que falta para poder iniciar sesión** es crear los 4 usuarios en
Supabase Auth (ver Paso B). Una vez creados, la app queda 100% operativa.

Si en cambio querés **levantar la base desde cero** en otro proyecto Supabase,
seguí la sección "Reproducir la base desde cero".

---

## Paso A · Configurar la conexión del frontend

Abrí `js/supabase.js` y, al principio, confirmá/editá:

```js
const SUPABASE_URL      = 'https://<TU-PROYECTO>.supabase.co';
const SUPABASE_ANON_KEY = '<TU-ANON-KEY>';
```

La **anon key es pública** por diseño (va en el cliente). La seguridad la da el
RLS de la base, no el ocultamiento de la key.

---

## Paso B · Crear los usuarios en Supabase Auth  ← paso pendiente

En Supabase → **Authentication → Users → Add user**. Creá uno por uno, con
**"Auto Confirm User" activado**, usando **exactamente** estos emails:

| Rol        | Email                              | Contraseña     |
|------------|------------------------------------|----------------|
| Superadmin | `superadmin@fichaula.app`          | la elegís vos  |
| Admin      | `admin@sagradocorazon.edu.ar`      | la elegís vos  |
| Profesor   | `profe@sagradocorazon.edu.ar`      | la elegís vos  |
| Profesor   | `lucas@sagradocorazon.edu.ar`      | la elegís vos  |

> **No hace falta copiar UUIDs a mano.** Al crear cada usuario, el trigger
> `on_auth_user_created` enlaza automáticamente su UUID con la fila de perfil que
> tenga el mismo email. Por eso los emails deben coincidir carácter por carácter.

Listo: con eso ya podés iniciar sesión con cualquiera de las cuentas.

---

## Reproducir la base desde cero (otro proyecto Supabase)

En **SQL Editor**, corré los scripts de `sql/` **en este orden**:

1. **`01_esquema_base.sql`** — tipos ENUM, las 8 tablas base, claves e índices.
2. **`02_seguridad_rls.sql`** — funciones (`mi_rol`, `set_actualizado`,
   `vincular_perfil_auth`), triggers, RLS + las 37 políticas, y las vistas
   `security_invoker`.
3. **`03_papelera.sql`** — las 7 tablas espejo `*_papelera`, las funciones de
   borrado atómico (`eliminar_*`) y la purga (`purgar_papeleras`), con permisos.
4. **`04_cron_purga.sql`** — habilita `pg_cron` y programa la purga diaria (03:00).
5. **`05_perfiles.sql`** — inserta las filas de perfil (las cuentas del instituto).
6. **Creá los usuarios de Auth** (Paso B). El trigger enlaza cada perfil por email.
7. **`06_datos_demo.sql`** *(opcional)* — 12 clases, 86 alumnos y asignaciones de
   ejemplo. Corrélo **después** del Paso B (las clases referencian al profesor
   titular por su UUID definitivo de Auth).

> **pg_cron:** si `04` falla en `CREATE EXTENSION pg_cron`, activá la extensión en
> **Dashboard → Database → Extensions** y volvé a correr el script. Sin cron, la
> purga se puede correr a mano: `SELECT purgar_papeleras();`.

> **Importante sobre el orden 5 → Auth → 6:** los perfiles deben existir **antes**
> de crear los usuarios de Auth (para que el trigger los enlace por email), y los
> datos demo deben cargarse **después** (cuando el UUID del profesor ya es estable),
> porque la FK `clases.profesor_titular_id` no se actualiza en cascada.

---

## Verificación rápida

Después del Paso B, iniciá sesión con cada rol y comprobá:

- **Profesor** (`profe@…`): ve solo sus cursos y alumnos asignados; puede cargar
  seguimientos y comentarios.
- **Admin** (`admin@…`): ve todo (clases, alumnos, profesores, seguimientos) pero
  **no** puede ver ni crear superadmins.
- **Superadmin** (`superadmin@…`): control total.

Si un profesor no ve ningún curso, revisá que tenga asignaciones en
`profesor_curso` (las carga `06_datos_demo.sql` o el panel del admin).
