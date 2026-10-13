import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { enforceRateLimit, getClientIp, sha256 } from "../_shared/rate-limit.ts";

// Entrada na mesa pelo código de convite de 6 dígitos (ADR-019).
// O usuário é validado pelo JWT aqui dentro; a RPC service_join_table_by_code só aceita service_role,
// então não há caminho direto do app ao código. Camadas contra força bruta:
//  1. por IP, aqui (GUEST_CODE_IP_LIMIT por GUEST_CODE_IP_WINDOW_MIN; cobre vários usuários no mesmo IP);
//  2. por usuário, na RPC (private.app_settings: guest_code_max_attempts em guest_code_attempt_window_min).

const DEFAULT_ALLOWED_ORIGINS = ["https://noowebr.com", "https://www.noowebr.com"];
const CODE_REGEX = /^\d{6}$/;

function allowedOrigins() {
  const configured = Deno.env.get("ALLOWED_ORIGINS");
  return configured ? configured.split(",").map((o) => o.trim()).filter(Boolean) : DEFAULT_ALLOWED_ORIGINS;
}

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin");
  return {
    "Access-Control-Allow-Origin": origin && allowedOrigins().includes(origin) ? origin : allowedOrigins()[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(req: Request, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req), "Content-Type": "application/json" } });
}

function intEnv(name: string, fallback: number) {
  const value = Number(Deno.env.get(name));
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) throw new Error("Supabase admin environment is not configured");
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return json(req, { error: "unauthorized" }, 401);
    const { data: auth, error: authError } = await admin.auth.getUser(token);
    if (authError || !auth.user) return json(req, { error: "unauthorized" }, 401);

    const payload = await req.json().catch(() => null);
    const code = typeof payload?.code === "string" ? payload.code.trim() : "";
    if (!CODE_REGEX.test(code)) return json(req, { error: "invalid_code_format" }, 400);

    const allowed = await enforceRateLimit(
      admin, req, "join-table-by-code", "ip",
      intEnv("GUEST_CODE_IP_LIMIT", 20), intEnv("GUEST_CODE_IP_WINDOW_MIN", 15) * 60,
    );
    if (!allowed) return json(req, { error: "too_many_attempts" }, 429);

    const { data, error } = await admin.rpc("service_join_table_by_code", {
      p_user_id: auth.user.id,
      p_code: code,
      p_ip_hash: await sha256(getClientIp(req)),
    });
    if (error) {
      if (error.code === "P0016") return json(req, { error: "too_many_attempts" }, 429);
      if (error.code === "P0001") return json(req, { error: "invalid_or_expired" }, 404);
      if (error.code === "22023") return json(req, { error: "invalid_code_format" }, 400);
      console.error("join-table-by-code rpc error:", error);
      return json(req, { error: "internal_error" }, 500);
    }
    return json(req, { visit: data });
  } catch (err) {
    console.error("join-table-by-code error:", err);
    return json(req, { error: "internal_error" }, 500);
  }
});
