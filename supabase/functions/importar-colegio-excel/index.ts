import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type JsonRecord = Record<string, unknown>;

function jsonResponse(status: number, body: JsonRecord) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function validDate(value: string) {
  const parsed = new Date(`${value}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Método no permitido." });
  }

  const authorization = request.headers.get("Authorization");
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!authorization || !token) {
    return jsonResponse(401, { error: "Iniciá sesión como superadmin." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("Faltan variables de entorno para importar el colegio.");
    return jsonResponse(500, { error: "La función no está configurada correctamente." });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const createdProfiles: { table: "profesores" | "preceptores"; id: string }[] = [];
  const createdAuthUsers: string[] = [];

  async function rollbackCreatedAccounts() {
    for (const profile of createdProfiles) {
      const { error } = await serviceClient.from(profile.table).delete().eq("id", profile.id);
      if (error) console.error("No se pudo revertir un perfil creado durante la importación.");
    }
    for (const id of createdAuthUsers) {
      const { error } = await serviceClient.auth.admin.deleteUser(id);
      if (error) console.error("No se pudo revertir una cuenta Auth creada durante la importación.");
    }
  }

  try {
    const { data: userData, error: userError } = await userClient.auth.getUser(token);
    if (userError || !userData.user) {
      return jsonResponse(401, { error: "La sesión no es válida o expiró." });
    }

    const { data: superadmin, error: roleError } = await serviceClient
      .from("superadmins").select("id").eq("id", userData.user.id).maybeSingle();
    if (roleError) throw roleError;
    if (!superadmin) {
      return jsonResponse(403, { error: "Solo un superadmin puede importar datos de colegios." });
    }

    let input: JsonRecord;
    try {
      const body = await request.json();
      if (!isRecord(body)) return jsonResponse(400, { error: "El cuerpo de la solicitud no es válido." });
      input = body;
    } catch {
      return jsonResponse(400, { error: "El cuerpo de la solicitud no es válido." });
    }

    const colegioId = text(input.colegio_id);
    const datos = input.datos;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(colegioId) ||
        !isRecord(datos) ||
        !Array.isArray(datos.clases) || !datos.clases.length ||
        !Array.isArray(datos.alumnos) || !datos.alumnos.length ||
        !Array.isArray(datos.profesores) || !datos.profesores.length ||
        !Array.isArray(datos.preceptores)) {
      return jsonResponse(400, { error: "La planilla no contiene todas las secciones requeridas." });
    }

    const { data: colegio, error: colegioError } = await serviceClient
      .from("colegios").select("id,activo").eq("id", colegioId).maybeSingle();
    if (colegioError) throw colegioError;
    if (!colegio) return jsonResponse(404, { error: "El colegio seleccionado no existe." });
    if (!colegio.activo) {
      return jsonResponse(409, { error: "Activá el colegio antes de importar sus cuentas." });
    }

    const profesores = datos.profesores.filter(isRecord);
    const preceptores = datos.preceptores.filter(isRecord);
    if (profesores.length !== datos.profesores.length || preceptores.length !== datos.preceptores.length) {
      return jsonResponse(400, { error: "La planilla contiene cuentas incompletas." });
    }

    const emails = new Set<string>();
    for (const profesor of profesores) {
      const email = text(profesor.email).toLowerCase();
      if (!email || emails.has(email)) return jsonResponse(400, { error: "Hay emails vacíos o duplicados en la planilla." });
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return jsonResponse(400, { error: "La planilla contiene un email de profesor inválido." });
      }
      emails.add(email);
      if (!text(profesor.nombre) || !text(profesor.apellido) || !text(profesor.materia) ||
          text(profesor.nombre).length > 100 || text(profesor.apellido).length > 100 ||
          text(profesor.materia).length > 100 ||
          !/^[\d.]{7,12}$/.test(text(profesor.dni)) ||
          !validDate(text(profesor.fechaNacimiento)) || !text(profesor.telefono) ||
          text(profesor.telefono).length > 30 || text(profesor.password).length < 8 ||
          !Array.isArray(profesor.clasesAsignadas)) {
        return jsonResponse(400, { error: "La planilla contiene datos incompletos de profesores." });
      }
    }
    for (const preceptor of preceptores) {
      const email = text(preceptor.email).toLowerCase();
      if (!email || emails.has(email)) return jsonResponse(400, { error: "Hay emails vacíos o duplicados en la planilla." });
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return jsonResponse(400, { error: "La planilla contiene un email de preceptor inválido." });
      }
      emails.add(email);
      if (!text(preceptor.nombre) || !text(preceptor.apellido) ||
          text(preceptor.nombre).length > 100 || text(preceptor.apellido).length > 100 ||
          !/^[\d.]{7,12}$/.test(text(preceptor.dni)) ||
          !validDate(text(preceptor.fechaNacimiento)) || !text(preceptor.telefono) ||
          text(preceptor.telefono).length > 30 || text(preceptor.password).length < 8) {
        return jsonResponse(400, { error: "La planilla contiene datos incompletos de preceptores." });
      }
    }

    const emailsList = [...emails];
    const existingProfiles = await Promise.all([
      serviceClient.from("superadmins").select("email").in("email", emailsList),
      serviceClient.from("admins").select("email").in("email", emailsList),
      serviceClient.from("profesores").select("email").in("email", emailsList),
      serviceClient.from("preceptores").select("email").in("email", emailsList),
    ]);
    const profileError = existingProfiles.find(result => result.error)?.error;
    if (profileError) throw profileError;
    if (existingProfiles.some(result => result.data?.length)) {
      return jsonResponse(409, { error: "Uno o más emails ya están asignados a un perfil." });
    }

    async function createAccount(
      account: JsonRecord,
      table: "profesores" | "preceptores",
      profile: JsonRecord
    ) {
      const email = text(account.email).toLowerCase();
      const { data: authData, error: authError } = await serviceClient.auth.admin.createUser({
        email,
        password: String(account.password),
        email_confirm: true,
      });
      if (authError || !authData.user) throw authError || new Error("No se pudo crear el usuario de acceso.");
      createdAuthUsers.push(authData.user.id);
      const { error: insertError } = await serviceClient.from(table).insert({
        ...profile,
        id: authData.user.id,
        email,
        colegio_id: colegioId,
      });
      if (insertError) throw insertError;
      createdProfiles.push({ table, id: authData.user.id });
    }

    for (const profesor of profesores) {
      await createAccount(profesor, "profesores", {
        nombre: text(profesor.nombre),
        apellido: text(profesor.apellido),
        materia: text(profesor.materia),
        dni: text(profesor.dni),
        fecha_nacimiento: text(profesor.fechaNacimiento),
        telefono: text(profesor.telefono),
      });
    }
    for (const preceptor of preceptores) {
      await createAccount(preceptor, "preceptores", {
        nombre: text(preceptor.nombre),
        apellido: text(preceptor.apellido),
        dni: text(preceptor.dni),
        fecha_nacimiento: text(preceptor.fechaNacimiento),
        telefono: text(preceptor.telefono),
      });
    }

    const { error: importError } = await userClient.rpc("importar_colegio_excel", {
      p_colegio_id: colegioId,
      p_datos: {
        ...datos,
        profesores: profesores.map(({ password: _password, ...profesor }) => profesor),
        preceptores: preceptores.map(({ password: _password, ...preceptor }) => preceptor),
      },
    });
    if (importError) throw importError;

    return jsonResponse(200, {
      ok: true,
      clases: datos.clases.length,
      alumnos: datos.alumnos.length,
      profesores: profesores.length,
      preceptores: preceptores.length,
    });
  } catch (error) {
    await rollbackCreatedAccounts();
    console.error("Error al importar el colegio:", error instanceof Error ? error.message : "desconocido");
    const message = error instanceof Error ? error.message : "No se pudo importar la planilla.";
    return jsonResponse(409, { error: message });
  }
});
