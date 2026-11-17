import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const attachmentPathPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[A-Za-z0-9._-]+$/i;
const pageSize = 1000;

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
    return jsonResponse(401, { error: "Iniciá sesión como superadmin para eliminar el colegio." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("Faltan variables de entorno para eliminar colegios.");
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
      const body = await request.json();
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return jsonResponse(400, { error: "El cuerpo de la solicitud no es válido." });
      }
      input = body as Record<string, unknown>;
    } catch {
      return jsonResponse(400, { error: "El cuerpo de la solicitud no es válido." });
    }

    const colegioId = typeof input.colegio_id === "string" ? input.colegio_id : "";
    const password = typeof input.password === "string" ? input.password : "";
    if (!uuidPattern.test(colegioId)) {
      return jsonResponse(400, { error: "El colegio seleccionado no es válido." });
    }
    if (!password) {
      return jsonResponse(400, { error: "Ingresá tu contraseña actual para confirmar." });
    }
    if (!userData.user.email) {
      return jsonResponse(401, { error: "No se pudo verificar el email de la sesión." });
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const superadminResult = await serviceClient
      .from("superadmins")
      .select("id")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (superadminResult.error) throw superadminResult.error;
    if (!superadminResult.data) {
      return jsonResponse(403, { error: "Solo un superadmin puede eliminar colegios." });
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

    const { data: school, error: schoolError } = await serviceClient
      .from("colegios")
      .select("id")
      .eq("id", colegioId)
      .maybeSingle();
    if (schoolError) throw schoolError;
    if (!school) return jsonResponse(200, { ok: true, colegio_id: colegioId, already_deleted: true });

    const { error: preflightError } = await serviceClient.rpc("verificar_eliminacion_colegio", {
      p_colegio_id: colegioId,
    });
    if (preflightError) {
      console.error("La base no tiene habilitada la eliminación integral de colegios.");
      return jsonResponse(503, {
        error: "La base de datos no está preparada para eliminar colegios. Ejecutá la migración 11 antes de reintentar; no se realizaron cambios.",
      });
    }

    const profileTables = [
      "admins", "admins_papelera",
      "profesores", "profesores_papelera",
      "preceptores", "preceptores_papelera",
    ];
    const accountIds = new Set<string>();
    for (const table of profileTables) {
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await serviceClient
          .from(table)
          .select("id")
          .eq("colegio_id", colegioId)
          .range(from, from + pageSize - 1);
        if (error) throw error;
        const rows = data || [];
        rows.forEach(row => {
          if (typeof row.id === "string") accountIds.add(row.id);
        });
        if (rows.length < pageSize) break;
      }
    }
    if (accountIds.has(userData.user.id)) {
      return jsonResponse(409, { error: "No se puede eliminar la cuenta superadmin que inició esta operación." });
    }

    const attachmentPaths = new Set<string>();
    for (const table of ["asistencias", "asistencias_papelera"]) {
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await serviceClient
          .from(table)
          .select("adjuntos")
          .eq("colegio_id", colegioId)
          .range(from, from + pageSize - 1);
        if (error) throw error;
        const rows = data || [];
        for (const row of rows) {
          for (const path of row.adjuntos || []) {
            if (typeof path !== "string" || !attachmentPathPattern.test(path)) {
              return jsonResponse(500, {
                error: "Hay un adjunto con una ruta inválida. El colegio no se eliminó; contactá al soporte.",
              });
            }
            attachmentPaths.add(path);
          }
        }
        if (rows.length < pageSize) break;
      }
    }

    const paths = Array.from(attachmentPaths);
    for (let offset = 0; offset < paths.length; offset += 100) {
      const { error } = await serviceClient.storage
        .from("asistencia-justificaciones")
        .remove(paths.slice(offset, offset + 100));
      if (error) {
        console.error("No se pudieron eliminar todos los adjuntos del colegio.");
        return jsonResponse(500, {
          error: "No se pudieron eliminar todos los archivos de asistencia. El colegio sigue en la base de datos; volvé a intentar.",
        });
      }
    }

    const idsToDelete = Array.from(accountIds);
    for (let offset = 0; offset < idsToDelete.length; offset += 10) {
      const results = await Promise.all(idsToDelete.slice(offset, offset + 10).map(accountId =>
        serviceClient.auth.admin.deleteUser(accountId)
      ));
      if (results.some(({ error }) =>
        error && error.code !== "user_not_found" && error.status !== 404
      )) {
        console.error("No se pudieron revocar todas las cuentas asociadas al colegio.");
        return jsonResponse(500, {
          error: "No se pudieron revocar todas las cuentas. El colegio sigue en la base de datos; algunas cuentas pueden haber quedado revocadas. Volvé a intentar.",
        });
      }
    }

    const { error: deleteError } = await serviceClient.rpc("eliminar_colegio_superadmin", {
      p_colegio_id: colegioId,
    });
    if (deleteError) {
      if (deleteError.message.includes("Colegio no encontrado")) {
        return jsonResponse(200, { ok: true, colegio_id: colegioId, already_deleted: true });
      }
      console.error("Las cuentas se revocaron, pero no se pudieron eliminar los datos del colegio.");
      return jsonResponse(500, {
        error: "Las cuentas de acceso y los archivos fueron revocados, pero no se pudieron eliminar los datos del colegio. Volvé a intentar para completar.",
      });
    }

    return jsonResponse(200, { ok: true, colegio_id: colegioId });
  } catch (error) {
    console.error("Error interno al eliminar colegio:", error instanceof Error ? error.message : "desconocido");
    return jsonResponse(500, { error: "No se pudo completar la eliminación. Revisá la configuración e intentá de nuevo." });
  }
});
