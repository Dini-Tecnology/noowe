import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const DEFAULT_ALLOWED_ORIGINS = [
  "https://noowebr.com",
  "https://www.noowebr.com",
];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_REGEX = /^\d{6}$/;

type SupabaseAdmin = ReturnType<typeof createClient>;

function getAllowedOrigins() {
  const configured = Deno.env.get("ALLOWED_ORIGINS");
  if (!configured) return DEFAULT_ALLOWED_ORIGINS;
  return configured
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function isAllowedOrigin(origin: string | null) {
  if (!origin) return true;
  return getAllowedOrigins().includes(origin);
}

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin");
  const fallbackOrigin = getAllowedOrigins()[0] ?? "https://noowebr.com";
  return {
    "Access-Control-Allow-Origin": origin && isAllowedOrigin(origin) ? origin : fallbackOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function jsonResponse(req: Request, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function getClientIp(req: Request) {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-real-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function enforceRateLimit(
  supabase: SupabaseAdmin,
  req: Request,
  action: string,
  identity: string,
  limit: number,
  windowSeconds: number,
) {
  const key = await sha256(`${action}:${getClientIp(req)}:${identity}`);
  const now = new Date();
  const { data, error } = await supabase
    .from("edge_rate_limits")
    .select("window_start, request_count")
    .eq("key", key)
    .maybeSingle();

  if (error) throw error;

  if (data) {
    const windowStart = new Date(data.window_start);
    const inWindow = now.getTime() - windowStart.getTime() < windowSeconds * 1000;
    if (inWindow && data.request_count >= limit) {
      return false;
    }

    const { error: updateError } = await supabase
      .from("edge_rate_limits")
      .update({
        window_start: inWindow ? data.window_start : now.toISOString(),
        request_count: inWindow ? data.request_count + 1 : 1,
        updated_at: now.toISOString(),
      })
      .eq("key", key);
    if (updateError) throw updateError;
    return true;
  }

  const { error: insertError } = await supabase.from("edge_rate_limits").insert({
    key,
    window_start: now.toISOString(),
    request_count: 1,
    updated_at: now.toISOString(),
  });
  if (insertError) throw insertError;
  return true;
}

function createSupabaseAdmin() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase admin environment is not configured");
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  if (!isAllowedOrigin(req.headers.get("origin"))) {
    return jsonResponse(req, { valid: false, error: "Origin is not allowed" }, 403);
  }

  if (req.method !== "POST") {
    return jsonResponse(req, { valid: false, error: "Method not allowed" }, 405);
  }

  try {
    const payload = await req.json().catch(() => null);
    const email = normalizeEmail(payload?.email);
    const code = typeof payload?.code === "string" ? payload.code.trim() : "";

    if (!EMAIL_REGEX.test(email) || !CODE_REGEX.test(code)) {
      return jsonResponse(req, { valid: false, error: "Invalid email or code" }, 400);
    }

    const supabase = createSupabaseAdmin();
    const allowed = await enforceRateLimit(supabase, req, "verify-demo-code", email, 10, 15 * 60);
    if (!allowed) {
      return jsonResponse(req, { valid: false, error: "Too many requests" }, 429);
    }

    const { data, error } = await supabase
      .from("demo_leads")
      .select("id")
      .eq("email", email)
      .eq("access_code", code)
      .eq("verified", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("DB error:", error);
      return jsonResponse(req, { valid: false }, 500);
    }

    if (!data) {
      return jsonResponse(req, { valid: false });
    }

    const { error: updateError } = await supabase
      .from("demo_leads")
      .update({ verified: true })
      .eq("id", data.id);

    if (updateError) {
      console.error("DB update error:", updateError);
      return jsonResponse(req, { valid: false }, 500);
    }

    return jsonResponse(req, { valid: true });
  } catch (err) {
    console.error("Error:", err);
    return jsonResponse(req, { valid: false, error: "Internal server error" }, 500);
  }
});
