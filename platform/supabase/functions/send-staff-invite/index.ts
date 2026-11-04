import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { enforceRateLimit } from "../_shared/rate-limit.ts";

// Convite de equipe (O3, ADR-025): quem decide é restaurant_create_staff_invite, chamada com o token de quem convida.
// Aqui só se manda o e-mail. Se o envio falhar, o convite continua valendo e o app oferece o link para compartilhar.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const APP_SCHEME = "okinawa-restaurant";
const INVITES_PER_HOUR = 30;

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

async function sendEmail(to: string, restaurantName: string, code: string, link: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured");
  const name = escapeHtml(restaurantName);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: Deno.env.get("RESEND_FROM_EMAIL") ?? "NOOWE <notification@noowebr.com>",
      to,
      subject: `Convite para a equipe de ${restaurantName}`,
      html: `<p>Você recebeu um convite para a equipe de <strong>${name}</strong> no NOOWE Restaurant.</p>
<p>Instale o app e entre ou crie sua conta com este e-mail: o acesso é liberado sozinho depois de confirmar o e-mail.</p>
<p>Se preferir, <a href="${link}">abra o convite no app</a> ou use este código na tela "Aguardando acesso":</p>
<p><code>${code}</code></p>`,
    }),
  });
  if (!response.ok) throw new Error(`Resend returned ${response.status}`);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const authorization = req.headers.get("Authorization");
    if (!authorization) return jsonResponse({ error: "Unauthorized" }, 401);
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: userError } = await admin.auth.getUser(authorization.replace(/^Bearer\s+/i, ""));
    if (userError || !user) return jsonResponse({ error: "Unauthorized" }, 401);

    const allowed = await enforceRateLimit(admin, req, "send-staff-invite", user.id, INVITES_PER_HOUR, 3600);
    if (!allowed) return jsonResponse({ error: "Muitos convites em pouco tempo. Tente mais tarde." }, 429);

    const payload = await req.json().catch(() => null);
    const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await asUser.rpc("restaurant_create_staff_invite", {
      p_restaurant_id: payload?.restaurantId,
      p_email: payload?.email ?? null,
      p_roles: payload?.roles,
      p_primary: payload?.primaryRole,
    });
    if (error) {
      const status = error.code === "42501" ? 403 : 400;
      return jsonResponse({ error: error.message, code: error.code }, status);
    }

    const code = data.code as string;
    const link = `${APP_SCHEME}://convite/${code}`;
    let emailed = false;
    if (data.email) {
      try {
        await sendEmail(data.email, data.restaurantName ?? "seu restaurante", code, link);
        emailed = true;
      } catch (mailError) {
        console.error("Failed to send staff invite:", mailError);
      }
    }
    return jsonResponse({ id: data.id, code, link, email: data.email, emailed, expiresAt: data.expiresAt });
  } catch (err) {
    console.error("Error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
