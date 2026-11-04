import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { tapProviderFor } from "../_shared/tap/providers.ts";
import { handleTapCharge } from "./handler.ts";

serve(async (req) => {
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
    return await handleTapCharge(req, {
      rpc: async (fn, args) => {
        const { data, error } = await admin.rpc(fn, args);
        return { data, error: error ? { code: error.code, message: error.message } : null };
      },
      getUser: async (token) => {
        const { data, error } = await admin.auth.getUser(token);
        return error || !data.user ? null : { id: data.user.id };
      },
      provider: (name) => tapProviderFor(name, (key) => Deno.env.get(key)),
    });
  } catch (err) {
    console.error("tap-charge error:", err);
    return new Response(JSON.stringify({ error: "internal_error" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
