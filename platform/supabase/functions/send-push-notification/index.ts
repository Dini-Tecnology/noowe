import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.0";

const jsonHeaders = { "Content-Type": "application/json" };
type Payload = { user_ids: string[]; title: string; body: string; type?: string; related_id?: string; related_type?: string; data?: Record<string, unknown>; record?: Record<string, unknown> };

serve(async (request) => {
  try {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const authorization = request.headers.get("Authorization") ?? "";
    if (authorization.replace(/^Bearer\s+/i, "") !== serviceKey) {
      return new Response(JSON.stringify({ error: "Service role required" }), { status: 403, headers: jsonHeaders });
    }
    let payload = await request.json() as Payload;
    const fromWebhook = Boolean(payload.record?.user_id);
    if (fromWebhook) payload = {
      user_ids: [String(payload.record!.user_id)], title: String(payload.record!.title),
      body: String(payload.record!.message), type: String(payload.record!.notification_type ?? 'system'),
      related_id: payload.record!.related_id ? String(payload.record!.related_id) : undefined,
      related_type: payload.record!.related_type ? String(payload.record!.related_type) : undefined,
      data: (payload.record!.metadata as Record<string, unknown>) ?? {},
    };
    if (!payload.user_ids?.length || !payload.title?.trim() || !payload.body?.trim()) {
      return new Response(JSON.stringify({ error: "user_ids, title and body are required" }), { status: 400, headers: jsonHeaders });
    }
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
    const notificationRows = payload.user_ids.map((userId) => ({
      user_id: userId, title: payload.title, message: payload.body,
      notification_type: payload.type ?? "system", related_id: payload.related_id ?? null,
      related_type: payload.related_type ?? null, metadata: payload.data ?? {}, is_read: false,
    }));
    if (!fromWebhook) {
      const { error: notificationError } = await supabase.from("notifications").insert(notificationRows);
      if (notificationError) throw notificationError;
    }
    const { data: devices, error: deviceError } = await supabase.from("device_push_tokens")
      .select("token").in("user_id", payload.user_ids).eq("is_active", true);
    if (deviceError) throw deviceError;
    const messages = (devices ?? []).map(({ token }) => ({
      to: token, sound: "default", title: payload.title, body: payload.body,
      data: { ...payload.data, relatedId: payload.related_id, relatedType: payload.related_type },
    }));
    let tickets: unknown[] = [];
    for (let offset = 0; offset < messages.length; offset += 100) {
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(messages.slice(offset, offset + 100)),
      });
      if (!response.ok) throw new Error(`Expo Push returned ${response.status}`);
      const result = await response.json();
      tickets = tickets.concat(result.data ?? []);
    }
    return new Response(JSON.stringify({ notifications: notificationRows.length, pushes: tickets.length, tickets }), { headers: jsonHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: jsonHeaders });
  }
});
