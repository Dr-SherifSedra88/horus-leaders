import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://horus-leaders.vercel.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PRIMARY_SUPER_ADMIN_ID = "e8377ba1-4a42-45b0-bfa6-b4b0492ec690";

function response(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return response(405, { error: "Method not allowed" });
  }

  const authorization = req.headers.get("Authorization") ?? "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";

  if (!token) return response(401, { error: "Missing user session" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ??
    (Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")
      ? JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")!).default
      : undefined);
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    (Deno.env.get("SUPABASE_SECRET_KEYS")
      ? JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")!).default
      : undefined);

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return response(500, { error: "Server configuration is incomplete" });
  }

  // Verify the caller's actual Supabase session before checking their app role.
  const callerClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await callerClient.auth.getUser(token);

  if (authError || !authData.user) {
    console.error("manage-user-status: session verification failed", {
      error: authError?.message ?? "No user returned",
      code: authError?.code ?? null,
      status: authError?.status ?? null,
    });
    return response(401, { error: "Invalid or expired user session" });
  }

  console.log("manage-user-status: session verified", {
    callerUserId: authData.user.id,
  });

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: callerProfile, error: callerProfileError } = await adminClient
    .from("profiles")
    .select("role,is_active")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (callerProfileError) {
    console.error("manage-user-status: caller profile lookup failed", {
      callerUserId: authData.user.id,
      code: callerProfileError.code ?? null,
      message: callerProfileError.message,
      details: callerProfileError.details ?? null,
      hint: callerProfileError.hint ?? null,
    });
    return response(500, { error: "Could not verify the caller profile" });
  }

  if (!callerProfile) {
    console.error("manage-user-status: caller profile not found", {
      callerUserId: authData.user.id,
    });
    return response(403, { error: "Only an active Super Admin can manage account status" });
  }

  if (callerProfile.role !== "super_admin" || callerProfile.is_active !== true) {
    console.warn("manage-user-status: caller lacks required account status", {
      callerUserId: authData.user.id,
      role: callerProfile.role,
      isActive: callerProfile.is_active,
    });
    return response(403, { error: "Only an active Super Admin can manage account status" });
  }

  console.log("manage-user-status: caller authorized", {
    callerUserId: authData.user.id,
    role: callerProfile.role,
    isActive: callerProfile.is_active,
  });

  let payload: { targetUserId?: string; action?: string };
  try {
    payload = await req.json();
  } catch {
    return response(400, { error: "Invalid JSON body" });
  }

  const targetUserId = payload.targetUserId;
  const action = payload.action;

  if (
    typeof targetUserId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetUserId) ||
    (action !== "disable" && action !== "reactivate")
  ) {
    return response(400, { error: "A valid targetUserId and action are required" });
  }

  if (targetUserId === PRIMARY_SUPER_ADMIN_ID) {
    return response(403, { error: "The primary Super Admin account is protected" });
  }

  const { data: targetProfile, error: targetError } = await adminClient
    .from("profiles")
    .select("id,role,is_active")
    .eq("id", targetUserId)
    .maybeSingle();

  if (targetError || !targetProfile) {
    return response(404, { error: "Target account was not found" });
  }

  if (targetProfile.role === "super_admin") {
    return response(403, { error: "Super Admin accounts cannot be managed here" });
  }

  const shouldActivate = action === "reactivate";
  const nextActive = shouldActivate;
  const authUpdate = await adminClient.auth.admin.updateUserById(targetUserId, {
    ban_duration: shouldActivate ? "none" : "876000h",
  });

  if (authUpdate.error) {
    return response(500, { error: "Could not update the authentication status: " + authUpdate.error.message });
  }

  const { error: profileUpdateError } = await adminClient
    .from("profiles")
    .update({ is_active: nextActive })
    .eq("id", targetUserId);

  if (profileUpdateError) {
    // Best-effort rollback so Auth and the profile flag do not remain out of sync.
    await adminClient.auth.admin.updateUserById(targetUserId, {
      ban_duration: shouldActivate ? "876000h" : "none",
    });
    return response(500, { error: "Could not update the profile status: " + profileUpdateError.message });
  }

  const { error: auditError } = await adminClient.from("role_audit_log").insert({
    actor_id: authData.user.id,
    target_id: targetUserId,
    action: shouldActivate ? "account_reactivated" : "account_disabled",
    old_role: targetProfile.role,
    new_role: targetProfile.role,
  });

  if (auditError) {
    // Roll back both changes if the audit entry cannot be recorded.
    await adminClient.from("profiles").update({ is_active: targetProfile.is_active }).eq("id", targetUserId);
    await adminClient.auth.admin.updateUserById(targetUserId, {
      ban_duration: targetProfile.is_active ? "none" : "876000h",
    });
    return response(500, { error: "The audit log could not be saved; the account change was rolled back" });
  }

  return response(200, {
    success: true,
    targetUserId,
    is_active: nextActive,
    message: shouldActivate ? "Account reactivated" : "Account disabled",
  });
});
