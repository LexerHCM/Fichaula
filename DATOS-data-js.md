# Contenido de `data.js` (para carga manual / referencia)

Este es el detalle de los datos que vivían en `data.js`. Ya están
convertidos a SQL en `sql/02_datos_clases_alumnos.sql` (carga automática),
pero acá los tenés en formato legible por si querés cargarlos a mano.

## Usuarios

| Rol | Email | Nombre | Detalle |
|-----|-------|--------|---------|
| Admin | admin@sagradocorazon.edu.ar | Laura Méndez | Cargo: Directora |
| Profesor | profe@sagradocorazon.edu.ar | María González | Materia: Matemática |
| Profesor | lucas@sagradocorazon.edu.ar | Lucas Fernández | Materia: Lengua y Literatura |

> En `data.js` las contraseñas eran `123` (texto plano). En la versión
> nueva las definís vos en Supabase Auth (ver GUIA-SETUP.md).

## Clases (12)

| ID | Nombre | Nivel | Turno | Aula | Titular |
|----|--------|-------|-------|------|---------|
| 1A | 1° A | Primer Año | Mañana | 101 | María González |
| 1B | 1° B | Primer Año | Tarde | 102 | María González |
| 2A | 2° A | Segundo Año | Mañana | 201 | María González |
| 2B | 2° B | Segundo Año | Tarde | 202 | Lucas Fernández |
| 3A | 3° A | Tercer Año | Mañana | 301 | María González |
| 3B | 3° B | Tercer Año | Tarde | 302 | Lucas Fernández |
| 4A | 4° A | Cuarto Año | Mañana | 401 | María González |
| 4B | 4° B | Cuarto Año | Tarde | 402 | Lucas Fernández |
| 5A | 5° A | Quinto Año | Mañana | 501 | Lucas Fernández |
| 5B | 5° B | Quinto Año | Tarde | 502 | María González |
| 6A | 6° A | Sexto Año | Mañana | 601 | María González |
| 6B | 6° B | Sexto Año | Tarde | 602 | Lucas Fernández |

## Asignaciones profesor → clases

- **María González:** 1A, 1B, 2A, 3A, 4B
- **Lucas Fernández:** 2A, 2B, 4B, 5A, 6B

> (2A y 4B están compartidas a propósito entre ambos profesores.)

## Alumnos (86)

| Legajo | Apellido | Nombre | DNI | Nac. | Clase |
|--------|----------|--------|-----|------|-------|
| 001 | Romero | Agustina | 44.123.456 | 2011-03-14 | 1A |
| 002 | Fernández | Bruno | 44.234.567 | 2011-05-22 | 1A |
| 003 | López | Camila | 44.345.678 | 2011-01-08 | 1A |
| 004 | Martínez | Diego | 44.456.789 | 2011-07-30 | 1A |
| 005 | García | Elena | 44.567.890 | 2011-02-17 | 1A |
| 006 | Sánchez | Franco | 44.678.901 | 2011-09-05 | 1A |
| 007 | Torres | Giuliana | 44.789.012 | 2011-11-28 | 1A |
| 008 | Díaz | Hernán | 44.890.123 | 2011-04-11 | 1A |
| 009 | Moreno | Iara | 44.901.234 | 2011-06-19 | 1B |
| 010 | Herrera | Joaquín | 45.012.345 | 2011-08-03 | 1B |
| 011 | Ruiz | Karen | 45.123.456 | 2011-10-25 | 1B |
| 012 | Jiménez | Lucas | 45.234.567 | 2011-12-12 | 1B |
| 013 | Álvarez | Martina | 45.345.678 | 2011-02-07 | 1B |
| 014 | Torres | Nicolás | 45.456.789 | 2011-05-16 | 1B |
| 015 | Flores | Oriana | 45.567.890 | 2011-07-09 | 1B |
| 016 | Castro | Pablo | 43.678.901 | 2010-04-22 | 2A |
| 017 | Ríos | Quimey | 43.789.012 | 2010-06-15 | 2A |
| 018 | Vargas | Rocío | 43.890.123 | 2010-08-30 | 2A |
| 019 | Molina | Santiago | 43.901.234 | 2010-01-11 | 2A |
| 020 | Ortiz | Tamara | 44.012.345 | 2010-03-27 | 2A |
| 021 | Medina | Ulises | 44.123.456 | 2010-09-14 | 2A |
| 022 | Gómez | Valentina | 44.234.567 | 2010-11-02 | 2A |
| 023 | Suárez | Walter | 44.345.678 | 2010-05-18 | 2A |
| 024 | Reyes | Ximena | 44.456.789 | 2010-07-25 | 2A |
| 025 | Cruz | Yamila | 43.567.890 | 2010-10-08 | 2B |
| 026 | Núñez | Zaira | 43.678.901 | 2010-12-21 | 2B |
| 027 | Pereyra | Alexis | 43.789.012 | 2010-02-14 | 2B |
| 028 | Aguirre | Belén | 43.890.123 | 2010-04-06 | 2B |
| 029 | Miranda | César | 43.901.234 | 2010-06-29 | 2B |
| 030 | Villalba | Daiana | 44.012.345 | 2010-08-17 | 2B |
| 031 | Cabrera | Emanuel | 42.123.456 | 2009-03-11 | 3A |
| 032 | Benítez | Fiorella | 42.234.567 | 2009-05-28 | 3A |
| 033 | Ibáñez | Gastón | 42.345.678 | 2009-07-04 | 3A |
| 034 | Ponce | Hilda | 42.456.789 | 2009-09-19 | 3A |
| 035 | Rojas | Ignacio | 42.567.890 | 2009-11-23 | 3A |
| 036 | Acosta | Julia | 42.678.901 | 2009-01-16 | 3A |
| 037 | Ledesma | Kevin | 42.789.012 | 2009-04-02 | 3A |
| 038 | Sandoval | Laura | 42.890.123 | 2009-06-10 | 3B |
| 039 | Paredes | Marcos | 42.901.234 | 2009-08-25 | 3B |
| 040 | Esquivel | Natalia | 43.012.345 | 2009-10-13 | 3B |
| 041 | Figueroa | Omar | 43.123.456 | 2009-12-07 | 3B |
| 042 | Luna | Patricia | 43.234.567 | 2009-02-20 | 3B |
| 043 | Campos | Rodrigo | 43.345.678 | 2009-05-14 | 3B |
| 044 | Vega | Sofía | 43.456.789 | 2009-07-31 | 3B |
| 045 | Mendoza | Tomás | 43.567.890 | 2009-09-08 | 3B |
| 046 | Coronel | Úrsula | 41.678.901 | 2008-04-17 | 4A |
| 047 | Soria | Víctor | 41.789.012 | 2008-06-25 | 4A |
| 048 | Paz | Wanda | 41.890.123 | 2008-08-12 | 4A |
| 049 | Moya | Axel | 41.901.234 | 2008-10-29 | 4A |
| 050 | Ríos | Bianca | 42.012.345 | 2008-12-05 | 4A |
| 051 | Guerrero | Carlos | 41.123.456 | 2008-01-22 | 4B |
| 052 | Salazar | Débora | 41.234.567 | 2008-03-09 | 4B |
| 053 | Tapia | Ernesto | 41.345.678 | 2008-05-26 | 4B |
| 054 | Cáceres | Fernanda | 41.456.789 | 2008-07-14 | 4B |
| 055 | Navarro | Germán | 41.567.890 | 2008-09-01 | 4B |
| 056 | Palma | Ingrid | 41.678.901 | 2008-11-18 | 4B |
| 057 | Espinoza | Juliana | 40.789.012 | 2007-02-04 | 5A |
| 058 | Carrizo | Leandro | 40.890.123 | 2007-04-21 | 5A |
| 059 | Salas | Melisa | 40.901.234 | 2007-06-08 | 5A |
| 060 | Aranda | Norberto | 41.012.345 | 2007-08-25 | 5A |
| 061 | Cano | Olga | 41.123.456 | 2007-10-12 | 5A |
| 062 | Barrios | Pedro | 41.234.567 | 2007-12-30 | 5A |
| 063 | Contreras | Rebeca | 41.345.678 | 2007-01-17 | 5A |
| 064 | Delgado | Sergio | 41.456.789 | 2007-03-05 | 5A |
| 065 | Escobar | Teresa | 41.567.890 | 2007-05-22 | 5A |
| 066 | Flores | Uriel | 40.678.901 | 2007-07-09 | 5B |
| 067 | Gil | Verónica | 40.789.012 | 2007-09-26 | 5B |
| 068 | Heredia | Wilmer | 40.890.123 | 2007-11-13 | 5B |
| 069 | Ibarra | Ángela | 40.901.234 | 2007-01-30 | 5B |
| 070 | Jaramillo | Boris | 41.012.345 | 2007-04-07 | 5B |
| 071 | Lara | Claudia | 41.123.456 | 2007-06-24 | 5B |
| 072 | Macias | Daniel | 39.234.567 | 2006-08-11 | 6A |
| 073 | Nava | Erica | 39.345.678 | 2006-10-28 | 6A |
| 074 | Ojeda | Felipe | 39.456.789 | 2006-12-15 | 6A |
| 075 | Peña | Gloria | 39.567.890 | 2006-02-02 | 6A |
| 076 | Quiroga | Héctor | 39.678.901 | 2006-04-19 | 6A |
| 077 | Ramírez | Isabel | 39.789.012 | 2006-06-06 | 6A |
| 078 | Serrano | Javier | 39.890.123 | 2006-08-23 | 6A |
| 079 | Torres | Karla | 39.901.234 | 2006-10-10 | 6B |
| 080 | Ugarte | Luis | 40.012.345 | 2006-12-27 | 6B |
| 081 | Valencia | Marina | 40.123.456 | 2006-01-14 | 6B |
| 082 | Wald | Nelson | 40.234.567 | 2006-03-31 | 6B |
| 083 | Yáñez | Ofelia | 40.345.678 | 2006-05-18 | 6B |
| 084 | Zapata | Paulo | 40.456.789 | 2006-07-05 | 6B |
| 085 | Alonso | Renata | 40.567.890 | 2006-09-22 | 6B |
| 086 | Bravo | Samuel | 40.678.901 | 2006-11-08 | 6B |

