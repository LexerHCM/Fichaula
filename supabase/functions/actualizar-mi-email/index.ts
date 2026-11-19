import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Cambia el email de acceso del PROPIO usuario (Auth + tabla de perfil).
// Pide la contraseña actual para confirmar.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TABLAS_PERFIL = ["superadmins", "admins", "profesores", "preceptores"] as const;

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
    return jsonResponse(401, { error: "Iniciá sesión para cambiar tu email." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("Faltan variables de entorno para actualizar el email.");
    return jsonResponse(500, { error: "La función no está configurada correctamente." });
  }

  try {
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser(token);
    if (userError || !userData.user || !userData.user.email) {
      return jsonResponse(401, { error: "La sesión no es válida o expiró." });
    }
    const uid = userData.user.id;

    let input: Record<string, unknown>;
    try {
      input = await request.json();
    } catch {
      return jsonResponse(400, { error: "El cuerpo de la solicitud no es válido." });
    }

    const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
    const password = typeof input.password === "string" ? input.password : "";
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse(400, { error: "El email no es válido." });
    }
    if (!password) {
      return jsonResponse(400, { error: "Ingresá tu contraseña actual para confirmar." });
    }
    const emailAnterior = userData.user.email.toLowerCase();
    if (email === emailAnterior) {
      return jsonResponse(400, { error: "El email nuevo es igual al actual." });
    }

    // Verificar la contraseña actual
    const passwordClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: verifiedData, error: passwordError } = await passwordClient.auth.signInWithPassword({
      email: userData.user.email,
      password,
    });
    if (passwordError?.code === "invalid_credentials" ||
        (!passwordError && verifiedData.user?.id !== uid)) {
      return jsonResponse(401, { error: "La contraseña no es correcta." });
    }
    if (passwordError) throw passwordError;

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // ¿En qué tabla está el perfil? ¿El email nuevo ya lo usa otro perfil?
    const emailPattern = email.replace(/[\\%_]/g, "\\$&");
    const [propios, ocupados] = await Promise.all([
      Promise.all(TABLAS_PERFIL.map((tabla) =>
        serviceClient.from(tabla).select("id").eq("id", uid).maybeSingle())),
      Promise.all(TABLAS_PERFIL.map((tabla) =>
        serviceClient.from(tabla).select("id").ilike("email", emailPattern).neq("id", uid).limit(1))),
    ]);
    const conError = [...propios, ...ocupados].find(({ error }) => error);
    if (conError?.error) throw conError.error;
    const indiceTabla = propios.findIndex(({ data }) => !!data);
    if (indiceTabla === -1) {
      return jsonResponse(404, { error: "No se encontró tu perfil." });
    }
    if (ocupados.some(({ data }) => data?.length)) {
      return jsonResponse(409, { error: "Ese email ya está asignado a otro perfil." });
    }
    const tabla = TABLAS_PERFIL[indiceTabla];

    const { error: authError } = await serviceClient.auth.admin.updateUserById(uid, {
      email,
      email_confirm: true,
    });
    if (authError) {
      if (authError.code === "email_exists") {
        return jsonResponse(409, { error: "Ese email ya está en uso por otra cuenta." });
      }
      throw authError;
    }

    const { error: profileError } = await serviceClient.from(tabla).update({ email }).eq("id", uid);
    if (profileError) {
      const { error: rollbackError } = await serviceClient.auth.admin.updateUserById(uid, {
        email: emailAnterior,
        email_confirm: true,
      });
      if (rollbackError) {
        console.error("No se pudo revertir el email de Auth tras fallar la actualización del perfil.");
        return jsonResponse(500, {
          error: "No se pudo actualizar el perfil y el email de acceso puede haber cambiado. Contactá al superadmin.",
        });
      }
      if (profileError.code === "23505") {
        return jsonResponse(409, { error: "Ese email ya está registrado." });
      }
      throw profileError;
    }

    return jsonResponse(200, { email });
  } catch (error) {
    console.error("Error interno al actualizar email:", error instanceof Error ? error.message : "desconocido");
    return jsonResponse(500, { error: "No se pudo actualizar el email. Intentá de nuevo." });
  }
});
