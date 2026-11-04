import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { realDeps } from "../_shared/payments/wire.ts";
import { handleBillingWebhook } from "./handler.ts";

serve(async (req) => {
  try {
    return await handleBillingWebhook(req, realDeps());
  } catch (err) {
    console.error("billing-webhook error:", err);
    return new Response(JSON.stringify({ error: "internal_error" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
