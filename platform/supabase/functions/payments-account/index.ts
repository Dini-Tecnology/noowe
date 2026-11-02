import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { realDeps } from "../_shared/payments/wire.ts";
import { handleAccount } from "./handler.ts";

serve(async (req) => {
  try {
    return await handleAccount(req, realDeps());
  } catch (err) {
    console.error("payments-account error:", (err as Error).message);
    return new Response(JSON.stringify({ error: "internal_error" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
