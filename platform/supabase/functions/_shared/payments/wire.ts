import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { AsaasClient } from "./asaas.ts";
import type { PaymentDeps } from "./deps.ts";

// Liga os handlers ao Supabase (service_role) e ao Asaas reais.
export function realDeps(): PaymentDeps {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const baseUrl = Deno.env.get("ASAAS_API_BASE_URL");
  if (!url || !key) throw new Error("Supabase admin environment is not configured");
  if (!baseUrl) throw new Error("ASAAS_API_BASE_URL is not configured");
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return {
    rpc: async (fn, args) => {
      const { data, error } = await admin.rpc(fn, args);
      return { data, error: error ? { code: error.code, message: error.message } : null };
    },
    getUser: async (token) => {
      if (!token) return null;
      const { data, error } = await admin.auth.getUser(token);
      return error || !data.user ? null : { id: data.user.id };
    },
    provider: new AsaasClient({ baseUrl }),
    env: (name) => Deno.env.get(name),
  };
}
