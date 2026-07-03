# Ficha**ula**

> Sistema de gestión escolar para docentes y directivos.

---

## ¿Qué es Fichaula?

Fichaula es una aplicación web que centraliza el seguimiento académico y disciplinario de los alumnos de un establecimiento educativo. Permite a profesores registrar observaciones sobre sus estudiantes y a los administradores gestionar toda la información institucional desde un único panel.

---

## Roles

| Rol | Acceso |
|-----|--------|
| **Administrador** | Panel de control completo: clases, alumnos, profesores y seguimientos |
| **Profesor** | Vista de sus cursos asignados y carga de seguimientos por alumno |

---

## Funcionalidades

- **Seguimientos por alumno** — los docentes registran conducta, actitud, notas u observaciones libres
- **Gestión de clases** — el admin puede crear, editar y eliminar cursos, asignar profesores titulares
- **Gestión de alumnos** — alta, baja, modificación de datos personales (DNI, fecha de nacimiento, legajo)
- **Gestión de profesores** — asignación de cursos a cada docente
- **Control de acceso por rol** — los profesores solo ven sus cursos; el legajo solo lo ve el admin
- **Sesión por pestaña** — la autenticación usa `sessionStorage` (se cierra al cerrar el navegador)

---

## Estructura del proyecto

```
fichaula/
├── index.html
├── pages/
│   ├── login.html
│   ├── admin.html
│   ├── clases.html
│   ├── alumnos.html
│   └── curso.html
├── css/
│   ├── style.css       ← estilos globales
│   ├── admin.css       ← panel de administración
│   └── login.css       ← pantalla de inicio de sesión
├── js/
│   ├── data.js         ← datos mock (alumnos, cursos, profesores)
│   ├── auth.js         ← login, logout, guards de rol
│   ├── components.js   ← nav y footer reutilizables
│   ├── admin-logic.js  ← CRUD del panel admin
│   ├── admin.js        ← render del panel admin
│   ├── clases.js       ← grilla de cursos
│   ├── alumnos.js      ← tabla global de alumnos
│   ├── curso.js        ← detalle de curso + seguimientos
│   ├── index.js        ← hero según rol
│   └── login.js        ← lógica del formulario de login
└── multimedia/
    └── videoindex.mp4
```

---

## Cuentas de prueba

| Rol | Email | Contraseña |
|-----|-------|------------|
| Administrador | `admin@sagradocorazon.edu.ar` | `123` |
| Profesor | `profe@sagradocorazon.edu.ar` | `123` |
| Profesor | `lucas@sagradocorazon.edu.ar` | `123` |

---

## Tecnologías

- HTML5 + CSS3 (variables CSS, Grid, Flexbox)
- JavaScript vanilla (sin frameworks)
- Fuentes: [Syne](https://fonts.google.com/specimen/Syne) y [DM Sans](https://fonts.google.com/specimen/DM+Sans) via Google Fonts
- Datos en memoria (no hay backend ni base de datos)

---
