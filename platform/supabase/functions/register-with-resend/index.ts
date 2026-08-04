import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  CLIENT_EMBEDDED_LOGO_DATA_URI,
  RESTAURANT_EMBEDDED_LOGO_DATA_URI,
} from "./embedded-logos.ts";

const DEFAULT_ALLOWED_ORIGINS = [
  "https://noowebr.com",
  "https://www.noowebr.com",
];

const DEFAULT_REDIRECT_ALLOW_LIST = [
  "okinawa-restaurant://auth/callback",
  "noowe://auth/callback",
  "okinawa-restaurant://auth/reset-password",
  "noowe://auth/reset-password",
  "https://noowebr.com/auth/callback",
  "https://noowebr.com/auth/callback?app=restaurant",
  "https://noowebr.com/auth/callback?app=client",
  "https://www.noowebr.com/auth/callback",
  "https://www.noowebr.com/auth/callback?app=restaurant",
  "https://www.noowebr.com/auth/callback?app=client",
  "https://noowebr.com/auth/reset-password",
  "https://www.noowebr.com/auth/reset-password",
];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Shared NOOWE brand palette — mirrors the real app theme rendered by both apps
 * (platform/mobile/shared/theme/colors.ts, "Warm Sophisticated Orange").
 * Both apps consume the same Okinawa theme; only labels/logo differ per app.
 */
const BRAND_PALETTE = {
  primary: "#EA580C", // primary[600] — main brand color
  primaryDark: "#C2410C", // primary[700]
  primaryLight: "#FB923C", // primary[400]
  primarySoft: "#FFEDD5", // primary[100]
  primarySofter: "#FFF7ED", // primary[50]
  secondary: "#0D9488", // teal[600] — app secondary/accent
  accent: "#F59E0B", // gold[500]
  text: "#111827", // neutral[900]
  textSecondary: "#4B5563", // neutral[600]
  textMuted: "#9CA3AF", // neutral[400]
  surface: "#FFFFFF",
  background: "#F9FAFB", // neutral[50]
  border: "#E5E7EB", // neutral[200]
  shadowRgba: "rgba(234,88,12,0.28)",
} as const;

/** NOOWE Restaurant app */
const RESTAURANT_BRAND = {
  ...BRAND_PALETTE,
  appLabel: "app NOOWE Restaurant",
  productName: "NOOWE Restaurant",
  defaultLogoUrl: "https://noowebr.com/email/logo-restaurant.png",
  embeddedLogo: RESTAURANT_EMBEDDED_LOGO_DATA_URI,
} as const;

/** NOOWE Client app */
const CLIENT_BRAND = {
  ...BRAND_PALETTE,
  appLabel: "app NOOWE",
  productName: "NOOWE",
  defaultLogoUrl: "https://noowebr.com/email/logo-client.png",
  embeddedLogo: CLIENT_EMBEDDED_LOGO_DATA_URI,
} as const;

type EmailBrand = typeof RESTAURANT_BRAND;

function resolveEmailBrand(emailRedirectTo: string): EmailBrand {
  if (emailRedirectTo.startsWith("noowe://")) {
    return CLIENT_BRAND;
  }
  return RESTAURANT_BRAND;
}

function resolveLogoUrl(emailRedirectTo: string, brand: EmailBrand) {
  const configured = Deno.env.get("EMAIL_LOGO_URL");
  if (configured) return configured;

  const restaurantLogo = Deno.env.get("EMAIL_LOGO_URL_RESTAURANT");
  const clientLogo = Deno.env.get("EMAIL_LOGO_URL_CLIENT");
  const envLogo = emailRedirectTo.startsWith("noowe://") ? clientLogo : restaurantLogo;
  if (envLogo) return envLogo;

  // Embedded logo — garante exibição mesmo sem assets hospedados em noowebr.com
  return brand.embeddedLogo;
}

/**
 * Shared transactional-email shell — keeps signup + reset visually identical and
 * on-brand with the app (soft peach hero, badge, orange CTA, teal footer accent).
 */
function buildAuthEmailHtml(params: {
  brand: EmailBrand;
  logoUrl: string;
  actionLink: string;
  fullName: string;
  previewText: string;
  title: string;
  intro: string;
  ctaLabel: string;
  badgeGlyph: string;
  footerNote: string;
}) {
  const { brand } = params;
  const safeName = escapeHtml(params.fullName || "tudo bem");
  const safeActionLink = escapeHtml(params.actionLink);
  const safeLogoUrl = escapeHtml(params.logoUrl);
  const year = new Date().getFullYear();
  const buttonShadow = `0 12px 28px ${brand.shadowRgba}`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${escapeHtml(params.title)} · ${escapeHtml(brand.productName)}</title>
  <style>
    @media only screen and (max-width: 620px) {
      .container { width: 100% !important; }
      .hero-pad { padding: 28px 20px 22px !important; }
      .content-pad { padding: 24px 22px 30px !important; }
      .logo-img { width: 170px !important; }
      .cta-btn { display: block !important; width: 100% !important; box-sizing: border-box !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${brand.background};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">
    ${escapeHtml(params.previewText)}
  </div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${brand.background};padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" class="container" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:${brand.surface};border-radius:24px;overflow:hidden;border:1px solid ${brand.border};box-shadow:0 18px 44px rgba(17,24,39,0.10);">
          <tr>
            <td style="height:8px;background:linear-gradient(90deg, ${brand.primaryDark} 0%, ${brand.primary} 50%, ${brand.primaryLight} 100%);font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td class="hero-pad" style="padding:36px 32px 28px;text-align:center;background:linear-gradient(180deg, ${brand.primarySofter} 0%, ${brand.surface} 100%);">
              <img
                class="logo-img"
                src="${safeLogoUrl}"
                alt="${escapeHtml(brand.productName)}"
                width="200"
                style="display:block;width:200px;max-width:100%;height:auto;margin:0 auto 22px;border:0;outline:none;text-decoration:none;"
              />
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 auto;">
                <tr>
                  <td align="center" valign="middle" width="72" height="72" style="width:72px;height:72px;border-radius:20px;background:linear-gradient(135deg, ${brand.primary} 0%, ${brand.primaryDark} 100%);box-shadow:${buttonShadow};font-size:34px;line-height:72px;color:#ffffff;text-align:center;">
                    ${params.badgeGlyph}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="content-pad" style="padding:6px 40px 38px;text-align:center;">
              <p style="margin:0 0 6px;color:${brand.primary};font-size:12px;line-height:1;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;">
                NOOWE
              </p>
              <h1 style="margin:0 0 14px;color:${brand.text};font-size:26px;line-height:1.25;font-weight:800;letter-spacing:-0.02em;">
                ${escapeHtml(params.title)}
              </h1>
              <p style="margin:0 0 28px;color:${brand.textSecondary};font-size:16px;line-height:1.65;max-width:430px;display:inline-block;">
                Olá, <span style="color:${brand.primaryDark};font-weight:600;">${safeName}</span>! ${escapeHtml(params.intro)}
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 auto 30px;">
                <tr>
                  <td style="border-radius:14px;background:${brand.primary};box-shadow:${buttonShadow};">
                    <a
                      class="cta-btn"
                      href="${safeActionLink}"
                      style="display:inline-block;background:${brand.primary};color:#ffffff;text-decoration:none;border-radius:14px;padding:16px 34px;font-size:16px;font-weight:700;letter-spacing:0.01em;border:1px solid ${brand.primaryDark};"
                    >
                      ${escapeHtml(params.ctaLabel)}
                    </a>
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:460px;margin:0 auto;background:${brand.primarySofter};border-radius:14px;border:1px solid ${brand.primarySoft};">
                <tr>
                  <td style="padding:18px 20px;text-align:left;">
                    <p style="margin:0 0 6px;color:${brand.textSecondary};font-size:13px;line-height:1.5;font-weight:600;">
                      O botão não abriu?
                    </p>
                    <p style="margin:0 0 10px;color:${brand.textMuted};font-size:12px;line-height:1.55;">
                      Copie e cole este link no navegador:
                    </p>
                    <p style="margin:0;font-size:12px;line-height:1.6;word-break:break-all;">
                      <a href="${safeActionLink}" style="color:${brand.primaryDark};text-decoration:underline;">${safeActionLink}</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:22px 32px 28px;border-top:1px solid ${brand.border};text-align:center;background:${brand.background};">
              <p style="margin:0 0 8px;color:${brand.textMuted};font-size:12px;line-height:1.55;">
                ${escapeHtml(params.footerNote)}
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

function buildSignupConfirmationEmailHtml(params: {
  fullName: string;
  actionLink: string;
  brand: EmailBrand;
  logoUrl: string;
}) {
  return buildAuthEmailHtml({
    brand: params.brand,
    logoUrl: params.logoUrl,
    actionLink: params.actionLink,
    fullName: params.fullName,
    previewText: `Confirme seu e-mail para ativar sua conta no ${params.brand.appLabel}.`,
    title: "Confirme seu e-mail",
    intro: `falta só um passo para ativar sua conta no ${params.brand.appLabel}.`,
    ctaLabel: "Confirmar minha conta",
    badgeGlyph: "&#9993;", // envelope
    footerNote: "Você recebeu este e-mail porque criou uma conta na NOOWE.",
  });
}

function buildPasswordResetEmailHtml(params: {
  fullName: string;
  actionLink: string;
  brand: EmailBrand;
  logoUrl: string;
}) {
  return buildAuthEmailHtml({
    brand: params.brand,
    logoUrl: params.logoUrl,
    actionLink: params.actionLink,
    fullName: params.fullName,
    previewText: `Redefina a senha da sua conta no ${params.brand.appLabel}.`,
    title: "Redefinir sua senha",
    intro: `recebemos um pedido para redefinir a senha da sua conta no ${params.brand.appLabel}. Toque no botão abaixo para criar uma nova senha.`,
    ctaLabel: "Redefinir minha senha",
    badgeGlyph: "&#128273;", // key
    footerNote: "Se você não pediu para redefinir a senha, ignore este e-mail — sua senha atual continua válida.",
  });
}

function buildAppConfirmationLink(emailRedirectTo: string, tokenHash: string) {
  const separator = emailRedirectTo.includes("?") ? "&" : "?";
  return `${emailRedirectTo}${separator}token_hash=${encodeURIComponent(tokenHash)}&type=email`;
}

function buildAppRecoveryLink(emailRedirectTo: string, tokenHash: string) {
  const separator = emailRedirectTo.includes("?") ? "&" : "?";
  return `${emailRedirectTo}${separator}token_hash=${encodeURIComponent(tokenHash)}&type=recovery`;
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

function getRedirectAllowList() {
  const configured = Deno.env.get("AUTH_REDIRECT_ALLOW_LIST");
  if (!configured) return DEFAULT_REDIRECT_ALLOW_LIST;
  return configured
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function isAllowedOrigin(origin: string | null) {
  if (!origin) return true;
  return getAllowedOrigins().includes(origin);
}

function isAllowedRedirect(url: string) {
  return getRedirectAllowList().some((allowed) => {
    if (url === allowed) return true;
    if (url.startsWith(`${allowed}?`) || url.startsWith(`${allowed}#`)) return true;
    try {
      const parsed = new URL(url);
      const allowedParsed = new URL(allowed);
      return (
        parsed.protocol === allowedParsed.protocol &&
        parsed.host === allowedParsed.host &&
        parsed.pathname === allowedParsed.pathname
      );
    } catch {
      return url.startsWith(`${allowed}?`) || url.startsWith(`${allowed}#`);
    }
  });
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

function sanitizeText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
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

async function findAuthUserByEmail(supabase: SupabaseAdmin, email: string) {
  const perPage = 1000;

  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const user = data.users.find((candidate) => normalizeEmail(candidate.email) === email);
    if (user) return user;
    if (data.users.length < perPage) return null;
  }

  throw new Error("Unable to complete auth user lookup");
}

async function dispatchResendEmail(params: { to: string; subject: string; html: string }) {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const from = Deno.env.get("RESEND_FROM_EMAIL") ?? "NOOWE <notification@noowebr.com>";

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [params.to],
      subject: params.subject,
      html: params.html,
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    console.error("Resend error:", details);
    throw new Error("Failed to send email");
  }
}

async function sendConfirmationEmail(params: {
  email: string;
  fullName: string;
  actionLink: string;
  emailRedirectTo: string;
}) {
  const brand = resolveEmailBrand(params.emailRedirectTo);
  const logoUrl = resolveLogoUrl(params.emailRedirectTo, brand);
  const html = buildSignupConfirmationEmailHtml({
    fullName: params.fullName,
    actionLink: params.actionLink,
    brand,
    logoUrl,
  });

  await dispatchResendEmail({
    to: params.email,
    subject: `Confirme sua conta ${brand.productName}`,
    html,
  });
}

async function sendPasswordResetEmail(params: {
  email: string;
  fullName: string;
  actionLink: string;
  emailRedirectTo: string;
}) {
  const brand = resolveEmailBrand(params.emailRedirectTo);
  const logoUrl = resolveLogoUrl(params.emailRedirectTo, brand);
  const html = buildPasswordResetEmailHtml({
    fullName: params.fullName,
    actionLink: params.actionLink,
    brand,
    logoUrl,
  });

  await dispatchResendEmail({
    to: params.email,
    subject: `Redefinir senha ${brand.productName}`,
    html,
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
    const action =
      payload?.action === "resend"
        ? "resend"
        : payload?.action === "password-reset"
          ? "password-reset"
          : "register";
    const email = normalizeEmail(payload?.email);
    const password = typeof payload?.password === "string" ? payload.password : "";
    const fullName = sanitizeText(payload?.fullName ?? payload?.full_name, 120);
    const emailRedirectTo = typeof payload?.emailRedirectTo === "string" ? payload.emailRedirectTo : "";

    if (
      !EMAIL_REGEX.test(email) ||
      !isAllowedRedirect(emailRedirectTo) ||
      (action === "register" && (password.length < 6 || !fullName))
    ) {
      return jsonResponse(req, { error: "Invalid registration payload" }, 400);
    }

    const supabase = createSupabaseAdmin();
    const allowed = await enforceRateLimit(supabase, req, `register-with-resend:${action}`, email, 3, 15 * 60);
    if (!allowed) {
      return jsonResponse(req, { error: "Too many requests" }, 429);
    }

    if (!Deno.env.get("RESEND_API_KEY")) {
      return jsonResponse(req, { error: "RESEND_API_KEY is not configured" }, 500);
    }

    if (action === "resend") {
      const existingUser = await findAuthUserByEmail(supabase, email);

      // Generic response avoids exposing whether an email has an account.
      if (!existingUser || existingUser.email_confirmed_at) {
        return jsonResponse(req, { success: true, confirmationSent: false });
      }

      const existingName = sanitizeText(
        existingUser.user_metadata?.full_name ?? existingUser.user_metadata?.name ?? "tudo bem",
        120,
      );
      const { data: resendData, error: resendError } = await supabase.auth.admin.generateLink({
        type: "signup",
        email,
        password: `${crypto.randomUUID()}Aa1!`,
        options: {
          redirectTo: emailRedirectTo,
          data: existingUser.user_metadata,
        },
      });

      if (resendError || !resendData.properties?.hashed_token) {
        console.error("Supabase resend generateLink error:", resendError);
        return jsonResponse(req, { error: resendError?.message || "Failed to create confirmation link" }, 400);
      }

      await sendConfirmationEmail({
        email,
        fullName: existingName,
        actionLink: buildAppConfirmationLink(emailRedirectTo, resendData.properties.hashed_token),
        emailRedirectTo,
      });

      return jsonResponse(req, { success: true, confirmationSent: true });
    }

    if (action === "password-reset") {
      const existingUser = await findAuthUserByEmail(supabase, email);

      // Generic response avoids exposing whether an email has an account.
      // Recovery links can only be generated for existing users.
      if (!existingUser) {
        return jsonResponse(req, { success: true, passwordResetSent: false });
      }

      const existingName = sanitizeText(
        existingUser.user_metadata?.full_name ?? existingUser.user_metadata?.name ?? "tudo bem",
        120,
      );
      const { data: recoveryData, error: recoveryError } = await supabase.auth.admin.generateLink({
        type: "recovery",
        email,
        options: {
          redirectTo: emailRedirectTo,
        },
      });

      if (recoveryError || !recoveryData.properties?.hashed_token) {
        console.error("Supabase recovery generateLink error:", recoveryError);
        return jsonResponse(req, { error: recoveryError?.message || "Failed to create recovery link" }, 400);
      }

      await sendPasswordResetEmail({
        email,
        fullName: existingName,
        actionLink: buildAppRecoveryLink(emailRedirectTo, recoveryData.properties.hashed_token),
        emailRedirectTo,
      });

      return jsonResponse(req, { success: true, passwordResetSent: true });
    }

    const { data, error } = await supabase.auth.admin.generateLink({
      type: "signup",
      email,
      password,
      options: {
        redirectTo: emailRedirectTo,
        data: {
          full_name: fullName,
        },
      },
    });

    if (error) {
      console.error("Supabase generateLink error:", error);
      return jsonResponse(req, { error: error.message || "Failed to create confirmation link" }, 400);
    }

    if (!data.properties?.hashed_token) {
      console.error("Supabase generateLink did not return hashed_token");
      return jsonResponse(req, { error: "Failed to create confirmation link" }, 500);
    }

    try {
      await sendConfirmationEmail({
        email,
        fullName,
        actionLink: buildAppConfirmationLink(emailRedirectTo, data.properties.hashed_token),
        emailRedirectTo,
      });
    } catch (emailError) {
      if (data.user?.id) {
        const { error: deleteError } = await supabase.auth.admin.deleteUser(data.user.id);
        if (deleteError) {
          console.error("Failed to roll back user after email error:", deleteError);
        }
      }
      throw emailError;
    }

    return jsonResponse(req, {
      success: true,
      user: data.user ? { id: data.user.id, email: data.user.email } : null,
      needsEmailConfirmation: true,
    });
  } catch (err) {
    console.error("Error:", err);
    return jsonResponse(req, { error: "Internal server error" }, 500);
  }
});
