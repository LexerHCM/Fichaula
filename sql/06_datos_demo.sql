-- ============================================================
-- FichAula · 06 · DATOS DEMO (OPCIONAL)
-- ============================================================
-- 12 clases (1°–6°, divisiones A y B), 86 alumnos y las
-- asignaciones profesor_curso de ejemplo.
--
-- Correr SOLO DESPUÉS de haber creado los usuarios de Auth
-- (paso 2 del script 05): las clases referencian al profesor
-- titular por su UUID, que se resuelve por email y debe ser ya
-- el UUID definitivo de auth.users.
--
-- Idempotente: ON CONFLICT DO NOTHING permite re-correrlo.
-- ============================================================

-- ---------- CLASES ----------
-- profesor_titular_id se resuelve por email con un subselect.
INSERT INTO clases (id, anio, division, nivel, turno, aula, profesor_titular_id) VALUES ('1A', 1, 'A', 'Primer Año', 'Mañana', '101', (SELECT id FROM profesores WHERE email='profe@sagradocorazon.edu.ar')) ON CONFLICT (id) DO NOTHING;
INSERT INTO clases (id, anio, division, nivel, turno, aula, profesor_titular_id) VALUES ('1B', 1, 'B', 'Primer Año', 'Tarde', '102', (SELECT id FROM profesores WHERE email='profe@sagradocorazon.edu.ar')) ON CONFLICT (id) DO NOTHING;
INSERT INTO clases (id, anio, division, nivel, turno, aula, profesor_titular_id) VALUES ('2A', 2, 'A', 'Segundo Año', 'Mañana', '201', (SELECT id FROM profesores WHERE email='profe@sagradocorazon.edu.ar')) ON CONFLICT (id) DO NOTHING;
INSERT INTO clases (id, anio, division, nivel, turno, aula, profesor_titular_id) VALUES ('2B', 2, 'B', 'Segundo Año', 'Tarde', '202', (SELECT id FROM profesores WHERE email='lucas@sagradocorazon.edu.ar')) ON CONFLICT (id) DO NOTHING;
INSERT INTO clases (id, anio, division, nivel, turno, aula, profesor_titular_id) VALUES ('3A', 3, 'A', 'Tercer Año', 'Mañana', '301', (SELECT id FROM profesores WHERE email='profe@sagradocorazon.edu.ar')) ON CONFLICT (id) DO NOTHING;
INSERT INTO clases (id, anio, division, nivel, turno, aula, profesor_titular_id) VALUES ('3B', 3, 'B', 'Tercer Año', 'Tarde', '302', (SELECT id FROM profesores WHERE email='lucas@sagradocorazon.edu.ar')) ON CONFLICT (id) DO NOTHING;
INSERT INTO clases (id, anio, division, nivel, turno, aula, profesor_titular_id) VALUES ('4A', 4, 'A', 'Cuarto Año', 'Mañana', '401', (SELECT id FROM profesores WHERE email='profe@sagradocorazon.edu.ar')) ON CONFLICT (id) DO NOTHING;
INSERT INTO clases (id, anio, division, nivel, turno, aula, profesor_titular_id) VALUES ('4B', 4, 'B', 'Cuarto Año', 'Tarde', '402', (SELECT id FROM profesores WHERE email='lucas@sagradocorazon.edu.ar')) ON CONFLICT (id) DO NOTHING;
INSERT INTO clases (id, anio, division, nivel, turno, aula, profesor_titular_id) VALUES ('5A', 5, 'A', 'Quinto Año', 'Mañana', '501', (SELECT id FROM profesores WHERE email='lucas@sagradocorazon.edu.ar')) ON CONFLICT (id) DO NOTHING;
INSERT INTO clases (id, anio, division, nivel, turno, aula, profesor_titular_id) VALUES ('5B', 5, 'B', 'Quinto Año', 'Tarde', '502', (SELECT id FROM profesores WHERE email='profe@sagradocorazon.edu.ar')) ON CONFLICT (id) DO NOTHING;
INSERT INTO clases (id, anio, division, nivel, turno, aula, profesor_titular_id) VALUES ('6A', 6, 'A', 'Sexto Año', 'Mañana', '601', (SELECT id FROM profesores WHERE email='profe@sagradocorazon.edu.ar')) ON CONFLICT (id) DO NOTHING;
INSERT INTO clases (id, anio, division, nivel, turno, aula, profesor_titular_id) VALUES ('6B', 6, 'B', 'Sexto Año', 'Tarde', '602', (SELECT id FROM profesores WHERE email='lucas@sagradocorazon.edu.ar')) ON CONFLICT (id) DO NOTHING;

-- ---------- ALUMNOS ----------
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('001', 'Agustina', 'Romero', '44.123.456', '2011-03-14', '1A') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('002', 'Bruno', 'Fernández', '44.234.567', '2011-05-22', '1A') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('003', 'Camila', 'López', '44.345.678', '2011-01-08', '1A') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('004', 'Diego', 'Martínez', '44.456.789', '2011-07-30', '1A') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('005', 'Elena', 'García', '44.567.890', '2011-02-17', '1A') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('006', 'Franco', 'Sánchez', '44.678.901', '2011-09-05', '1A') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('007', 'Giuliana', 'Torres', '44.789.012', '2011-11-28', '1A') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('008', 'Hernán', 'Díaz', '44.890.123', '2011-04-11', '1A') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('009', 'Iara', 'Moreno', '44.901.234', '2011-06-19', '1B') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('010', 'Joaquín', 'Herrera', '45.012.345', '2011-08-03', '1B') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('011', 'Karen', 'Ruiz', '45.123.456', '2011-10-25', '1B') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('012', 'Lucas', 'Jiménez', '45.234.567', '2011-12-12', '1B') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('013', 'Martina', 'Álvarez', '45.345.678', '2011-02-07', '1B') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('014', 'Nicolás', 'Torres', '45.456.789', '2011-05-16', '1B') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('015', 'Oriana', 'Flores', '45.567.890', '2011-07-09', '1B') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('016', 'Pablo', 'Castro', '43.678.901', '2010-04-22', '2A') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('017', 'Quimey', 'Ríos', '43.789.012', '2010-06-15', '2A') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('018', 'Rocío', 'Vargas', '43.890.123', '2010-08-30', '2A') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('019', 'Santiago', 'Molina', '43.901.234', '2010-01-11', '2A') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('020', 'Tamara', 'Ortiz', '44.012.345', '2010-03-27', '2A') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('021', 'Ulises', 'Medina', '48.000.001', '2010-09-14', '2A') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('022', 'Valentina', 'Gómez', '48.000.002', '2010-11-02', '2A') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('023', 'Walter', 'Suárez', '48.000.003', '2010-05-18', '2A') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('024', 'Ximena', 'Reyes', '48.000.004', '2010-07-25', '2A') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('025', 'Yamila', 'Cruz', '43.567.890', '2010-10-08', '2B') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('026', 'Zaira', 'Núñez', '48.000.005', '2010-12-21', '2B') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('027', 'Alexis', 'Pereyra', '48.000.006', '2010-02-14', '2B') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('028', 'Belén', 'Aguirre', '48.000.007', '2010-04-06', '2B') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('029', 'César', 'Miranda', '48.000.008', '2010-06-29', '2B') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('030', 'Daiana', 'Villalba', '48.000.009', '2010-08-17', '2B') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('031', 'Emanuel', 'Cabrera', '42.123.456', '2009-03-11', '3A') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('032', 'Fiorella', 'Benítez', '42.234.567', '2009-05-28', '3A') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('033', 'Gastón', 'Ibáñez', '42.345.678', '2009-07-04', '3A') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('034', 'Hilda', 'Ponce', '42.456.789', '2009-09-19', '3A') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('035', 'Ignacio', 'Rojas', '42.567.890', '2009-11-23', '3A') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('036', 'Julia', 'Acosta', '42.678.901', '2009-01-16', '3A') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('037', 'Kevin', 'Ledesma', '42.789.012', '2009-04-02', '3A') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('038', 'Laura', 'Sandoval', '42.890.123', '2009-06-10', '3B') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('039', 'Marcos', 'Paredes', '42.901.234', '2009-08-25', '3B') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('040', 'Natalia', 'Esquivel', '43.012.345', '2009-10-13', '3B') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('041', 'Omar', 'Figueroa', '43.123.456', '2009-12-07', '3B') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('042', 'Patricia', 'Luna', '43.234.567', '2009-02-20', '3B') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('043', 'Rodrigo', 'Campos', '43.345.678', '2009-05-14', '3B') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('044', 'Sofía', 'Vega', '43.456.789', '2009-07-31', '3B') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('045', 'Tomás', 'Mendoza', '48.000.010', '2009-09-08', '3B') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('046', 'Úrsula', 'Coronel', '41.678.901', '2008-04-17', '4A') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('047', 'Víctor', 'Soria', '41.789.012', '2008-06-25', '4A') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('048', 'Wanda', 'Paz', '41.890.123', '2008-08-12', '4A') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('049', 'Axel', 'Moya', '41.901.234', '2008-10-29', '4A') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('050', 'Bianca', 'Ríos', '42.012.345', '2008-12-05', '4A') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('051', 'Carlos', 'Guerrero', '41.123.456', '2008-01-22', '4B') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('052', 'Débora', 'Salazar', '41.234.567', '2008-03-09', '4B') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('053', 'Ernesto', 'Tapia', '41.345.678', '2008-05-26', '4B') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('054', 'Fernanda', 'Cáceres', '41.456.789', '2008-07-14', '4B') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('055', 'Germán', 'Navarro', '41.567.890', '2008-09-01', '4B') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('056', 'Ingrid', 'Palma', '48.000.011', '2008-11-18', '4B') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('057', 'Juliana', 'Espinoza', '40.789.012', '2007-02-04', '5A') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('058', 'Leandro', 'Carrizo', '40.890.123', '2007-04-21', '5A') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('059', 'Melisa', 'Salas', '40.901.234', '2007-06-08', '5A') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('060', 'Norberto', 'Aranda', '41.012.345', '2007-08-25', '5A') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('061', 'Olga', 'Cano', '48.000.012', '2007-10-12', '5A') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('062', 'Pedro', 'Barrios', '48.000.013', '2007-12-30', '5A') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('063', 'Rebeca', 'Contreras', '48.000.014', '2007-01-17', '5A') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('064', 'Sergio', 'Delgado', '48.000.015', '2007-03-05', '5A') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('065', 'Teresa', 'Escobar', '48.000.016', '2007-05-22', '5A') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('066', 'Uriel', 'Flores', '40.678.901', '2007-07-09', '5B') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('067', 'Verónica', 'Gil', '48.000.017', '2007-09-26', '5B') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('068', 'Wilmer', 'Heredia', '48.000.018', '2007-11-13', '5B') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('069', 'Ángela', 'Ibarra', '48.000.019', '2007-01-30', '5B') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('070', 'Boris', 'Jaramillo', '48.000.020', '2007-04-07', '5B') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('071', 'Claudia', 'Lara', '48.000.021', '2007-06-24', '5B') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('072', 'Daniel', 'Macias', '39.234.567', '2006-08-11', '6A') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('073', 'Erica', 'Nava', '39.345.678', '2006-10-28', '6A') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('074', 'Felipe', 'Ojeda', '39.456.789', '2006-12-15', '6A') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('075', 'Gloria', 'Peña', '39.567.890', '2006-02-02', '6A') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('076', 'Héctor', 'Quiroga', '39.678.901', '2006-04-19', '6A') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('077', 'Isabel', 'Ramírez', '39.789.012', '2006-06-06', '6A') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('078', 'Javier', 'Serrano', '39.890.123', '2006-08-23', '6A') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('079', 'Karla', 'Torres', '39.901.234', '2006-10-10', '6B') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('080', 'Luis', 'Ugarte', '40.012.345', '2006-12-27', '6B') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('081', 'Marina', 'Valencia', '40.123.456', '2006-01-14', '6B') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('082', 'Nelson', 'Wald', '40.234.567', '2006-03-31', '6B') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('083', 'Ofelia', 'Yáñez', '40.345.678', '2006-05-18', '6B') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('084', 'Paulo', 'Zapata', '40.456.789', '2006-07-05', '6B') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('085', 'Renata', 'Alonso', '40.567.890', '2006-09-22', '6B') ON CONFLICT (legajo) DO NOTHING;
INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES ('086', 'Samuel', 'Bravo', '48.000.022', '2006-11-08', '6B') ON CONFLICT (legajo) DO NOTHING;

-- ---------- ASIGNACIONES profesor_curso ----------
INSERT INTO profesor_curso (profesor_id, curso_id)
SELECT (SELECT id FROM profesores WHERE email='profe@sagradocorazon.edu.ar'), c.id
FROM clases c WHERE c.id IN ('1A','1B','2A','3A','4B') ON CONFLICT DO NOTHING;
INSERT INTO profesor_curso (profesor_id, curso_id)
SELECT (SELECT id FROM profesores WHERE email='lucas@sagradocorazon.edu.ar'), c.id
FROM clases c WHERE c.id IN ('2A','2B','4B','5A','6B') ON CONFLICT DO NOTHING;

