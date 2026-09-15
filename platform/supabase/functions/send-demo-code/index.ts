import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { NOOWE_EMBEDDED_LOGO_DATA_URI } from "./embedded-logo.ts";

const DEFAULT_ALLOWED_ORIGINS = [
  "https://noowebr.com",
  "https://www.noowebr.com",
];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** NOOWE institutional palette (marketing site + shared brand) */
const NOOWE_BRAND = {
  primary: "#EA580C",
  primaryDark: "#C2410C",
  primaryLight: "#F59E0B",
  primarySoft: "#FFEDD5",
  secondary: "#FF6B35",
  text: "#111827",
  textSecondary: "#4B5563",
  textMuted: "#9CA3AF",
  surface: "#FFFFFF",
  background: "#F3F4F6",
  border: "#E5E7EB",
  productName: "NOOWE",
} as const;

function resolveDemoLogoUrl() {
  return Deno.env.get("EMAIL_LOGO_URL") ??
    Deno.env.get("EMAIL_LOGO_URL_CLIENT") ??
    NOOWE_EMBEDDED_LOGO_DATA_URI;
}

function buildDemoCodeEmailHtml(params: { fullName: string; accessCode: string; logoUrl: string }) {
  const safeName = escapeHtml(params.fullName || "tudo bem");
  const safeCode = escapeHtml(params.accessCode);
  const safeLogoUrl = escapeHtml(params.logoUrl);
  const year = new Date().getFullYear();
  const brand = NOOWE_BRAND;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Seu código de acesso à demo ${escapeHtml(brand.productName)}</title>
  <style>
    @media only screen and (max-width: 620px) {
      .container { width: 100% !important; }
      .content-pad { padding: 28px 20px !important; }
      .logo-img { width: 180px !important; }
      .code-txt { font-size: 30px !important; letter-spacing: 8px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${brand.background};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">
    Seu código de acesso à demo da NOOWE está pronto.
  </div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${brand.background};padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" class="container" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:${brand.surface};border-radius:20px;overflow:hidden;border:1px solid ${brand.border};box-shadow:0 16px 40px rgba(17,24,39,0.08);">
          <tr>
            <td style="height:6px;background:linear-gradient(90deg, ${brand.primaryDark} 0%, ${brand.primary} 50%, ${brand.primaryLight} 100%);font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td class="content-pad" style="padding:32px 32px 24px;text-align:center;background:${brand.surface};">
              <img
                class="logo-img"
                src="${safeLogoUrl}"
                alt="${escapeHtml(brand.productName)}"
                width="220"
                style="display:block;width:220px;max-width:100%;height:auto;margin:0 auto;border:0;outline:none;text-decoration:none;"
              />
            </td>
          </tr>
          <tr>
            <td class="content-pad" style="padding:8px 40px 36px;text-align:center;">
              <p style="margin:0 0 8px;color:${brand.text};font-size:24px;line-height:1.3;font-weight:700;letter-spacing:-0.02em;">
                Olá, <span style="color:${brand.primaryDark};">${safeName}</span>!
              </p>
              <p style="margin:0 0 28px;color:${brand.textSecondary};font-size:16px;line-height:1.65;max-width:420px;display:inline-block;">
                Seu código de acesso para explorar a demo da NOOWE está pronto:
              </p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:360px;margin:0 auto 28px;background:${brand.primarySoft};border-radius:14px;border:1px solid ${brand.border};">
                <tr>
                  <td style="padding:24px 20px;text-align:center;">
                    <span class="code-txt" style="font-size:36px;font-weight:800;letter-spacing:12px;color:${brand.primaryDark};">${safeCode}</span>
                  </td>
                </tr>
              </table>
              <p style="margin:0;color:${brand.textMuted};font-size:13px;line-height:1.6;">
                Acesse <a href="https://noowebr.com/access" style="color:${brand.primaryDark};text-decoration:underline;font-weight:600;">noowebr.com/access</a> e insira o código acima.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:22px 32px 28px;border-top:1px solid ${brand.border};text-align:center;background:${brand.background};">
              <p style="margin:0 0 8px;color:${brand.textMuted};font-size:12px;line-height:1.55;">
                Você recebeu este e-mail porque solicitou acesso à demo da NOOWE.
              </p>
              <p style="margin:0;color:${brand.textMuted};font-size:12px;line-height:1.55;">
                © ${year} NOOWE · <span style="color:${brand.secondary};font-weight:600;">Experiência gastronômica reinventada</span>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

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

function sanitizeText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

function generateCode(): string {
  return crypto.getRandomValues(new Uint32Array(1))[0]!.toString().slice(-6).padStart(6, "0");
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
    return jsonResponse(req, { error: "Origin is not allowed" }, 403);
  }

  if (req.method !== "POST") {
    return jsonResponse(req, { error: "Method not allowed" }, 405);
  }

  try {
    const payload = await req.json().catch(() => null);
    const name = sanitizeText(payload?.name, 120);
    const restaurant = sanitizeText(payload?.restaurant, 160);
    const email = normalizeEmail(payload?.email);
    const phone = sanitizeText(payload?.phone, 32);

    if (!name || !restaurant || !EMAIL_REGEX.test(email)) {
      return jsonResponse(req, { error: "name, restaurant and a valid email are required" }, 400);
    }

    const supabase = createSupabaseAdmin();
    const allowed = await enforceRateLimit(supabase, req, "send-demo-code", email, 3, 15 * 60);
    if (!allowed) {
      return jsonResponse(req, { error: "Too many requests" }, 429);
    }

    const accessCode = generateCode();

    const { error: dbError } = await supabase.from("demo_leads").insert({
      name,
      restaurant,
      email,
      phone: phone || null,
      access_code: accessCode,
    });

    if (dbError) {
      console.error("DB error:", dbError);
      return jsonResponse(req, { error: "Failed to save lead" }, 500);
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    const html = buildDemoCodeEmailHtml({
      fullName: name,
      accessCode,
      logoUrl: resolveDemoLogoUrl(),
    });
    const from = Deno.env.get("RESEND_FROM_EMAIL") ?? "NOOWE <notification@noowebr.com>";
    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: "Seu código de acesso à demo NOOWE",
        html,
      }),
    });

    if (!emailRes.ok) {
      const emailError = await emailRes.text();
      console.error("Resend error:", emailError);
      return jsonResponse(req, { error: "Failed to send email" }, 500);
    }

    return jsonResponse(req, { success: true });
  } catch (err) {
    console.error("Error:", err);
    return jsonResponse(req, { error: "Internal server error" }, 500);
  }
});
