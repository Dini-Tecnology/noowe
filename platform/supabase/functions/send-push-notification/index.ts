import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.0";
import { JWT } from "npm:google-auth-library@9.15.1";

const jsonHeaders = { "Content-Type": "application/json" };
const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

type Payload = {
  user_ids: string[];
  title: string;
  body: string;
  type?: string;
  related_id?: string;
  related_type?: string;
  data?: Record<string, unknown>;
  record?: Record<string, unknown>;
};
type Device = { id: string; token: string; platform: "ios" | "android"; device_info: Record<string, unknown> | null };

function stringData(data: Record<string, unknown> = {}) {
  return Object.fromEntries(Object.entries(data).flatMap(([key, value]) =>
    value == null ? [] : [[key, typeof value === "string" ? value : JSON.stringify(value)]],
  ));
}

function hasServiceRole(token: string, configuredServiceKey: string) {
  if (token === configuredServiceKey) return true;
  try {
    const encoded = token.split('.')[1];
    if (!encoded) return false;
    const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const claims = JSON.parse(atob(padded)) as { role?: string };
    return claims.role === 'service_role';
  } catch {
    return false;
  }
}

async function getFcmAccessToken() {
  const raw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not configured");
  const credentials = JSON.parse(raw) as { client_email: string; private_key: string; project_id: string };
  const client = new JWT({ email: credentials.client_email, key: credentials.private_key, scopes: [FCM_SCOPE] });
  const result = await client.authorize();
  if (!result.access_token) throw new Error("Could not authorize Firebase service account");
  return { accessToken: result.access_token, projectId: Deno.env.get("FIREBASE_PROJECT_ID") ?? credentials.project_id };
}

async function sendFcm(device: Device, payload: Payload, auth: { accessToken: string; projectId: string }) {
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${auth.projectId}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${auth.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message: {
      token: device.token,
      notification: { title: payload.title, body: payload.body },
      data: stringData({ ...payload.data, type: payload.type ?? "system", relatedId: payload.related_id, relatedType: payload.related_type }),
      android: { priority: "high", notification: { channel_id: "noowe-default", sound: "default", color: "#FF4B22" } },
      apns: { payload: { aps: { sound: "default", badge: 1 } } },
    } }),
  });
  const result = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, result };
}

async function sendExpo(devices: Device[], payload: Payload) {
  if (!devices.length) return [];
  const messages = devices.map((device) => ({
    to: device.token, sound: "default", title: payload.title, body: payload.body,
    data: { ...payload.data, type: payload.type ?? "system", relatedId: payload.related_id, relatedType: payload.related_type },
  }));
  const tickets: unknown[] = [];
  for (let offset = 0; offset < messages.length; offset += 100) {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(messages.slice(offset, offset + 100)),
    });
    if (!response.ok) throw new Error(`Expo Push returned ${response.status}`);
    const result = await response.json();
    tickets.push(...(result.data ?? []));
  }
  return tickets;
}

serve(async (request) => {
  try {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const authorization = request.headers.get("Authorization") ?? "";
    const bearerToken = authorization.replace(/^Bearer\s+/i, "");
    if (!hasServiceRole(bearerToken, serviceKey)) {
      return new Response(JSON.stringify({ error: "Service role required" }), { status: 403, headers: jsonHeaders });
    }
    let payload = await request.json() as Payload;
    const webhookRecord = payload.record;
    const notificationId = webhookRecord?.id ? String(webhookRecord.id) : null;
    const fromWebhook = Boolean(webhookRecord?.user_id);
    if (fromWebhook) payload = {
      user_ids: [String(payload.record!.user_id)], title: String(payload.record!.title),
      body: String(payload.record!.message), type: String(payload.record!.notification_type ?? "system"),
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
      const { error } = await supabase.from("notifications").insert(notificationRows);
      if (error) throw error;
      // The database trigger calls this function once per persisted row. Stop
      // here so a direct API call cannot send the same push twice.
      return new Response(JSON.stringify({ notifications: notificationRows.length, queued: true }), { headers: jsonHeaders });
    }
    const { data, error: deviceError } = await supabase.from("device_push_tokens")
      .select("id, token, platform, device_info").in("user_id", payload.user_ids).eq("is_active", true);
    if (deviceError) throw deviceError;
    const devices = (data ?? []) as Device[];
    const fcmDevices = devices.filter((device) => device.device_info?.provider === "fcm");
    const expoDevices = devices.filter((device) => device.device_info?.provider !== "fcm");
    const fcmResults: Array<{ deviceId: string; ok: boolean; status: number; result: unknown }> = [];
    if (fcmDevices.length) {
      try {
        const auth = await getFcmAccessToken();
        for (const device of fcmDevices) {
          const result = await sendFcm(device, payload, auth);
          fcmResults.push({ deviceId: device.id, ...result });
          if (!result.ok && (result.status === 404 || JSON.stringify(result.result).includes("UNREGISTERED"))) {
            await supabase.from("device_push_tokens").update({ is_active: false }).eq("id", device.id);
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        fcmResults.push(...fcmDevices.map((device) => ({
          deviceId: device.id, ok: false, status: 0, result: { error: message },
        })));
      }
    }
    const expoTickets = await sendExpo(expoDevices, payload);
    if (notificationId) {
      const { error: dispatchUpdateError } = await supabase.from("notifications").update({
        push_dispatched_at: new Date().toISOString(),
        push_delivery: {
          devices: devices.length,
          fcm: fcmResults,
          expo: expoTickets,
        },
      }).eq("id", notificationId);
      if (dispatchUpdateError) throw dispatchUpdateError;
    }
    return new Response(JSON.stringify({ notifications: notificationRows.length, fcm: fcmResults, expo: expoTickets }), { headers: jsonHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: jsonHeaders });
  }
});
