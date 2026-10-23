import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { realDeps } from "../_shared/payments/wire.ts";
import { handleSync } from "./handler.ts";

serve(async (req) => {
  try {
    return await handleSync(req, realDeps());
  } catch (err) {
    console.error("payments-sync error:", err);
    return new Response(JSON.stringify({ error: "internal_error" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
