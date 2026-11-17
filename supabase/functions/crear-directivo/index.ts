import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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
    console.error("Faltan variables de entorno para crear directivos.");
    return jsonResponse(500, { error: "La función no está configurada correctamente." });
  }

  try {
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser(token);
    if (userError || !userData.user) {
      return jsonResponse(401, { error: "La sesión no es válida o expiró." });
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: superadmin, error: roleError } = await serviceClient
      .from("superadmins")
      .select("id")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (roleError) throw roleError;
    if (!superadmin) {
      return jsonResponse(403, { error: "Solo un superadmin puede crear directivos." });
    }

    let input: Record<string, unknown>;
    try {
      input = await request.json();
    } catch {
      return jsonResponse(400, { error: "El cuerpo de la solicitud no es válido." });
    }

    const colegioId = typeof input.colegio_id === "string" ? input.colegio_id : "";
    const nombre = typeof input.nombre === "string" ? input.nombre.trim() : "";
    const apellido = typeof input.apellido === "string" ? input.apellido.trim() : "";
    const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
    const password = typeof input.password === "string" ? input.password : "";

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(colegioId)) {
      return jsonResponse(400, { error: "El colegio seleccionado no es válido." });
    }
    if (!nombre || !apellido || nombre.length > 100 || apellido.length > 100) {
      return jsonResponse(400, { error: "Ingresá un nombre y apellido válidos." });
    }
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse(400, { error: "El email no es válido." });
    }
    if (password.length < 8) {
      return jsonResponse(400, { error: "La contraseña debe tener al menos 8 caracteres." });
    }

    const { data: colegio, error: colegioError } = await serviceClient
      .from("colegios")
      .select("id")
      .eq("id", colegioId)
      .maybeSingle();
    if (colegioError) throw colegioError;
    if (!colegio) {
      return jsonResponse(404, { error: "El colegio seleccionado no existe." });
    }

    const emailPattern = email.replace(/[\\%_]/g, "\\$&");
    const perfiles = await Promise.all([
      serviceClient.from("superadmins").select("id").ilike("email", emailPattern).limit(1),
      serviceClient.from("admins").select("id").ilike("email", emailPattern).limit(1),
      serviceClient.from("profesores").select("id").ilike("email", emailPattern).limit(1),
      serviceClient.from("preceptores").select("id").ilike("email", emailPattern).limit(1),
    ]);
    const perfilConError = perfiles.find(({ error }) => error);
    if (perfilConError?.error) throw perfilConError.error;
    if (perfiles.some(({ data }) => data?.length)) {
      return jsonResponse(409, { error: "Ese email ya está asignado a un perfil." });
    }

    const { data: perfilInicial, error: perfilError } = await serviceClient
      .from("admins")
      .insert({
        email,
        nombre,
        apellido,
        cargo: "Directivo",
        colegio_id: colegioId,
      })
      .select("id")
      .single();
    if (perfilError) {
      return jsonResponse(409, { error: "No se pudo guardar el perfil del directivo." });
    }

    const { data: authData, error: authError } = await serviceClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (authError || !authData.user) {
      const { error: cleanupError } = await serviceClient
        .from("admins")
        .delete()
        .eq("id", perfilInicial.id);
      if (cleanupError) console.error("No se pudo revertir el perfil de directivo.");
      return jsonResponse(409, { error: authError?.message || "No se pudo crear el usuario de acceso." });
    }

    const { data: perfilVinculado, error: vinculoError } = await serviceClient
      .from("admins")
      .select("id")
      .eq("id", authData.user.id)
      .eq("colegio_id", colegioId)
      .maybeSingle();
    if (vinculoError || !perfilVinculado) {
      const { error: authCleanupError } = await serviceClient.auth.admin.deleteUser(authData.user.id);
      const { error: perfilCleanupError } = await serviceClient
        .from("admins")
        .delete()
        .eq("id", perfilInicial.id);
      if (authCleanupError || perfilCleanupError) {
        console.error("No se pudo revertir completamente el alta incompleta del directivo.");
      }
      return jsonResponse(500, { error: "El usuario se creó, pero no se pudo vincular su perfil. Revisá el trigger de Auth." });
    }

    return jsonResponse(201, {
      id: authData.user.id,
      email,
      nombre,
      apellido,
      colegio_id: colegioId,
    });
  } catch (error) {
    console.error("Error interno al crear directivo:", error instanceof Error ? error.message : "desconocido");
    return jsonResponse(500, { error: "No se pudo crear el directivo. Revisá la configuración e intentá de nuevo." });
  }
});
