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
    return jsonResponse(401, { error: "Iniciá sesión para editar el preceptor." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("Faltan variables de entorno para editar preceptores.");
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
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(preceptorId)) {
      return jsonResponse(400, { error: "El preceptor seleccionado no es válido." });
    }

    const nombre = typeof input.nombre === "string" ? input.nombre.trim() : "";
    const apellido = typeof input.apellido === "string" ? input.apellido.trim() : "";
    const dni = typeof input.dni === "string" ? input.dni.trim() : "";
    const fechaNacimiento = typeof input.fecha_nacimiento === "string" ? input.fecha_nacimiento : "";
    const telefono = typeof input.telefono === "string" ? input.telefono.trim() : "";
    const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";

    if (!nombre || !apellido || nombre.length > 100 || apellido.length > 100) {
      return jsonResponse(400, { error: "Ingresá un nombre y apellido válidos." });
    }
    if (!/^[\d.]{7,12}$/.test(dni)) {
      return jsonResponse(400, { error: "El DNI debe tener entre 7 y 12 números o puntos." });
    }
    const nacimiento = new Date(`${fechaNacimiento}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaNacimiento) ||
        Number.isNaN(nacimiento.getTime()) ||
        nacimiento.toISOString().slice(0, 10) !== fechaNacimiento) {
      return jsonResponse(400, { error: "La fecha de nacimiento no es válida." });
    }
    if (!telefono || telefono.length > 30) {
      return jsonResponse(400, { error: "Ingresá un teléfono de contacto válido." });
    }
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse(400, { error: "El email no es válido." });
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const [adminResult, superadminResult, preceptorResult] = await Promise.all([
      serviceClient.from("admins").select("colegio_id").eq("id", userData.user.id).maybeSingle(),
      serviceClient.from("superadmins").select("id").eq("id", userData.user.id).maybeSingle(),
      serviceClient.from("preceptores").select("id,colegio_id,email").eq("id", preceptorId).maybeSingle(),
    ]);
    if (adminResult.error) throw adminResult.error;
    if (superadminResult.error) throw superadminResult.error;
    if (preceptorResult.error) throw preceptorResult.error;
    if (!adminResult.data && !superadminResult.data) {
      return jsonResponse(403, { error: "Solo dirección puede editar perfiles de preceptores." });
    }
    if (!preceptorResult.data) {
      return jsonResponse(404, { error: "El preceptor no existe." });
    }
    if (adminResult.data && !superadminResult.data &&
        adminResult.data.colegio_id !== preceptorResult.data.colegio_id) {
      return jsonResponse(403, { error: "No tenés permiso para editar preceptores de otro colegio." });
    }

    const emailPattern = email.replace(/[\\%_]/g, "\\$&");
    const perfiles = await Promise.all([
      serviceClient.from("superadmins").select("id").ilike("email", emailPattern).limit(1),
      serviceClient.from("admins").select("id").ilike("email", emailPattern).limit(1),
      serviceClient.from("profesores").select("id").ilike("email", emailPattern).limit(1),
      serviceClient.from("preceptores").select("id").ilike("email", emailPattern).neq("id", preceptorId).limit(1),
    ]);
    const perfilConError = perfiles.find(({ error }) => error);
    if (perfilConError?.error) throw perfilConError.error;
    if (perfiles.some(({ data }) => data?.length)) {
      return jsonResponse(409, { error: "Ese email ya está asignado a otro perfil." });
    }

    const emailAnterior = preceptorResult.data.email || "";
    const cambiaEmail = email.toLowerCase() !== emailAnterior.toLowerCase();
    if (cambiaEmail) {
      const { error: authError } = await serviceClient.auth.admin.updateUserById(preceptorId, {
        email,
        email_confirm: true,
      });
      if (authError) {
        if (authError.code === "email_exists") {
          return jsonResponse(409, { error: "Ese email ya está en uso por otra cuenta." });
        }
        throw authError;
      }
    }

    const { data: actualizado, error: profileError } = await serviceClient
      .from("preceptores")
      .update({ nombre, apellido, dni, fecha_nacimiento: fechaNacimiento, telefono, email })
      .eq("id", preceptorId)
      .select("id,nombre,apellido,dni,fecha_nacimiento,telefono,email,colegio_id")
      .single();
    if (profileError) {
      if (cambiaEmail) {
        const { error: rollbackError } = await serviceClient.auth.admin.updateUserById(preceptorId, {
          email: emailAnterior,
          email_confirm: true,
        });
        if (rollbackError) {
          console.error("No se pudo revertir el email de Auth tras fallar la actualización del perfil.");
          return jsonResponse(500, {
            error: "No se pudo actualizar el perfil y el email de acceso puede haber cambiado. Contactá al superadmin.",
          });
        }
      }
      if (profileError.code === "23505") {
        return jsonResponse(409, { error: "Ese DNI o email ya está registrado en el colegio." });
      }
      throw profileError;
    }

    return jsonResponse(200, { preceptor: actualizado });
  } catch (error) {
    console.error("Error interno al editar preceptor:", error instanceof Error ? error.message : "desconocido");
    return jsonResponse(500, { error: "No se pudo actualizar el preceptor. Revisá la configuración e intentá de nuevo." });
  }
});
