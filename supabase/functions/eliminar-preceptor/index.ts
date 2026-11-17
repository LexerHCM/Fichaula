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
    return jsonResponse(401, { error: "Iniciá sesión para eliminar el preceptor." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("Faltan variables de entorno para eliminar preceptores.");
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

    let input: Record<string, unknown>;
    try {
      input = await request.json();
    } catch {
      return jsonResponse(400, { error: "El cuerpo de la solicitud no es válido." });
    }
    const preceptorId = typeof input.preceptor_id === "string" ? input.preceptor_id : "";
    const password = typeof input.password === "string" ? input.password : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(preceptorId)) {
      return jsonResponse(400, { error: "El preceptor seleccionado no es válido." });
    }
    if (!password) return jsonResponse(400, { error: "Ingresá tu contraseña actual para confirmar." });

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const [adminResult, superadminResult, preceptorResult] = await Promise.all([
      serviceClient.from("admins").select("colegio_id").eq("id", userData.user.id).maybeSingle(),
      serviceClient.from("superadmins").select("id").eq("id", userData.user.id).maybeSingle(),
      serviceClient.from("preceptores").select("id,colegio_id").eq("id", preceptorId).maybeSingle(),
    ]);
    if (adminResult.error) throw adminResult.error;
    if (superadminResult.error) throw superadminResult.error;
    if (preceptorResult.error) throw preceptorResult.error;
    if (!adminResult.data && !superadminResult.data) {
      return jsonResponse(403, { error: "Solo dirección puede eliminar cuentas de preceptores." });
    }
    if (!preceptorResult.data) {
      return jsonResponse(404, { error: "El preceptor no existe o ya fue eliminado." });
    }
    if (adminResult.data && !superadminResult.data &&
        adminResult.data.colegio_id !== preceptorResult.data.colegio_id) {
      return jsonResponse(403, { error: "No tenés permiso para eliminar preceptores de otro colegio." });
    }
    if (!userData.user.email) {
      return jsonResponse(401, { error: "No se pudo verificar el email de la sesión." });
    }

    const passwordClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: verifiedData, error: passwordError } = await passwordClient.auth.signInWithPassword({
      email: userData.user.email,
      password,
    });
    if (passwordError?.code === "invalid_credentials" ||
        (!passwordError && verifiedData.user?.id !== userData.user.id)) {
      return jsonResponse(401, { error: "La contraseña no es correcta." });
    }
    if (passwordError) throw passwordError;

    const { error: profileError } = await userClient.rpc("eliminar_preceptor", { p_id: preceptorId });
    if (profileError) {
      return jsonResponse(400, { error: profileError.message || "No se pudo eliminar el perfil del preceptor." });
    }

    const { error: authError } = await serviceClient.auth.admin.deleteUser(preceptorId);
    if (authError && authError.code !== "user_not_found" && authError.status !== 404) {
      console.error("El perfil del preceptor se archivó, pero no se pudo eliminar su usuario de Auth.");
      return jsonResponse(500, {
        error: "El perfil fue archivado, pero no se pudo borrar su usuario de acceso. Contactá al superadmin para completar la revocación.",
      });
    }
    return jsonResponse(200, { ok: true, preceptor_id: preceptorId });
  } catch (error) {
    console.error("Error interno al eliminar preceptor:", error instanceof Error ? error.message : "desconocido");
    return jsonResponse(500, { error: "No se pudo completar la eliminación. Revisá la configuración e intentá de nuevo." });
  }
});
