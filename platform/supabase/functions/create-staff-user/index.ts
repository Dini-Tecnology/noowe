import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ASSIGNABLE_ROLES = ["manager", "maitre", "chef", "barman", "cook", "waiter"];

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function sanitizeText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Supabase admin environment is not configured");
    }
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Only an authenticated owner/manager of the *target* restaurant may
    // create a staff account through this function.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 401);
    const bearerToken = authHeader.replace(/^Bearer\s+/i, "");
    const { data: { user: caller }, error: callerError } = await supabase.auth.getUser(bearerToken);
    if (callerError || !caller) return jsonResponse({ error: "Unauthorized" }, 401);

    const payload = await req.json().catch(() => null);
    const restaurantId = typeof payload?.restaurantId === "string" ? payload.restaurantId : "";
    const email = normalizeEmail(payload?.email);
    const password = typeof payload?.password === "string" ? payload.password : "";
    const fullName = sanitizeText(payload?.fullName, 120);
    const role = typeof payload?.role === "string" ? payload.role : "";

    if (!restaurantId || !EMAIL_REGEX.test(email) || password.length < 6 || !fullName || !ASSIGNABLE_ROLES.includes(role)) {
      return jsonResponse({ error: "Invalid payload" }, 400);
    }

    const { data: callerRole } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("restaurant_id", restaurantId)
      .eq("is_active", true)
      .in("role", ["owner", "manager"])
      .maybeSingle();

    if (!callerRole) return jsonResponse({ error: "Forbidden" }, 403);

    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .maybeSingle();

    if (existingProfile) {
      return jsonResponse({
        error: "Já existe um usuário cadastrado com este e-mail. Use a opção de vincular usuário existente.",
      }, 409);
    }

    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (createError || !created?.user) {
      console.error("createUser error:", createError);
      return jsonResponse({ error: createError?.message ?? "Failed to create user" }, 400);
    }

    const { error: roleError } = await supabase
      .from("user_roles")
      .insert({
        user_id: created.user.id,
        restaurant_id: restaurantId,
        role,
        is_active: true,
      });

    if (roleError) {
      console.error("Failed to assign role, rolling back user:", roleError);
      await supabase.auth.admin.deleteUser(created.user.id);
      return jsonResponse({ error: "Failed to assign staff role" }, 500);
    }

    return jsonResponse({
      success: true,
      user: { id: created.user.id, email: created.user.email, full_name: fullName, role },
    });
  } catch (err) {
    console.error("Error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
