import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-sync-secret",
};

function getServiceRoleKey(): string {
  const legacyKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacyKey) return legacyKey;

  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretKeys) {
    const parsed = JSON.parse(secretKeys);
    if (parsed.default) return parsed.default;
  }

  throw new Error("Supabase service role key is not configured");
}

function isAuthorized(req: Request, serviceRoleKey: string): boolean {
  const syncSecret = Deno.env.get("SYNC_USER_APP_METADATA_SECRET");
  if (syncSecret) {
    return req.headers.get("x-sync-secret") === syncSecret;
  }

  return req.headers.get("authorization") === `Bearer ${serviceRoleKey}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const serviceRoleKey = getServiceRoleKey();

    if (!isAuthorized(req, serviceRoleKey)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { user_id } = await req.json();
    if (!user_id) {
      return new Response(JSON.stringify({ error: "user_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceRoleKey);

    const [{ data: roleRows, error: roleError }, { data: ownedRestaurants, error: ownerError }] =
      await Promise.all([
        supabase
          .from("user_roles")
          .select("role, restaurant_id")
          .eq("user_id", user_id)
          .eq("is_active", true),
        supabase.from("restaurants").select("id").eq("owner_id", user_id).eq("is_active", true),
      ]);

    if (roleError) throw roleError;
    if (ownerError) throw ownerError;

    const roles = new Set<string>();
    const restaurantIds = new Set<string>();

    for (const row of roleRows ?? []) {
      if (row.role) roles.add(String(row.role).toLowerCase());
      if (row.restaurant_id) restaurantIds.add(row.restaurant_id);
    }

    for (const restaurant of ownedRestaurants ?? []) {
      roles.add("owner");
      restaurantIds.add(restaurant.id);
    }

    const { data: currentUser, error: getUserError } =
      await supabase.auth.admin.getUserById(user_id);
    if (getUserError) throw getUserError;

    const appMetadata = {
      ...(currentUser.user?.app_metadata ?? {}),
      roles: Array.from(roles),
      restaurant_ids: Array.from(restaurantIds),
      app_type: roles.size > 0 ? "restaurant" : "customer",
    };

    const { error: updateError } = await supabase.auth.admin.updateUserById(user_id, {
      app_metadata: appMetadata,
    });
    if (updateError) throw updateError;

    return new Response(
      JSON.stringify({
        success: true,
        user_id,
        app_metadata: appMetadata,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("sync-user-app-metadata error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unexpected error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
