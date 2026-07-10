import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PushPayload {
  user_ids: string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
  restaurant_id?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Only service_role or staff with an owner/manager role may call this.
    // Previously this only checked that *some* Authorization header was
    // present, so any authenticated user (including customers) could send
    // arbitrary push notifications to any user_id.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const bearerToken = authHeader.replace(/^Bearer\s+/i, "");
    const isServiceRoleCall = bearerToken === serviceRoleKey;

    if (!isServiceRoleCall) {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser(bearerToken);

      if (userError || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: userRoles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .in("role", ["owner", "manager"]);

      const { data: profileRoles } = await supabase
        .from("profile_roles")
        .select("role_key")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .in("role_key", ["owner", "manager"]);

      const hasStaffRole = (userRoles?.length ?? 0) > 0 || (profileRoles?.length ?? 0) > 0;

      if (!hasStaffRole) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const payload: PushPayload = await req.json();

    if (!payload.user_ids?.length || !payload.title || !payload.body) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: user_ids, title, body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Insert notifications into the notifications table
    const notifications = payload.user_ids.map((userId) => ({
      user_id: userId,
      title: payload.title,
      message: payload.body,
      notification_type: "system",
      related_id: payload.restaurant_id || null,
      related_type: payload.restaurant_id ? "restaurant" : null,
      metadata: payload.data || null,
      is_read: false,
      created_at: new Date().toISOString(),
    }));

    const { error: insertError } = await supabase
      .from("notifications")
      .insert(notifications);

    if (insertError) {
      console.error("Failed to insert notifications:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to create notifications", details: insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // FCM push (optional - only if FCM_SERVER_KEY is configured)
    const fcmKey = Deno.env.get("FCM_SERVER_KEY");
    let fcmResults = null;

    if (fcmKey) {
      // Get FCM tokens for the users. profiles.fcm_token is a direct column,
      // not a key inside a `metadata` jsonb blob (that column doesn't even
      // exist on `profiles`) — this used to silently return zero tokens.
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, fcm_token")
        .in("id", payload.user_ids);

      const tokens = profiles
        ?.map((p: any) => p.fcm_token)
        .filter(Boolean) as string[];

      if (tokens.length > 0) {
        const fcmPayload = {
          registration_ids: tokens,
          notification: { title: payload.title, body: payload.body },
          data: payload.data || {},
          priority: "high",
        };

        const fcmResponse = await fetch("https://fcm.googleapis.com/fcm/send", {
          method: "POST",
          headers: {
            "Authorization": `key=${fcmKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(fcmPayload),
        });

        fcmResults = await fcmResponse.json();
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        notifications_created: notifications.length,
        fcm: fcmResults,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("send-push-notification error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
