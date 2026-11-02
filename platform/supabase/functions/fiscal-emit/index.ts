import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { FocusNfeClient } from "../_shared/fiscal/focus.ts";
import { handleFiscalEmit } from "./handler.ts";

serve(async (req) => {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) throw new Error("Supabase admin environment is not configured");
    const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    return await handleFiscalEmit(req, {
      rpc: async (fn, args) => {
        const { data, error } = await admin.rpc(fn, args);
        return { data, error: error ? { code: error.code, message: error.message } : null };
      },
      provider: new FocusNfeClient(),
      env: (name) => Deno.env.get(name),
    });
  } catch (err) {
    console.error("fiscal-emit error:", err);
    return new Response(JSON.stringify({ error: "internal_error" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
