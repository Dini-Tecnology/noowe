import { json, type RpcResult } from "../_shared/payments/deps.ts";
import type { TapProvider } from "../_shared/tap/types.ts";

export interface TapWebhookDeps {
  rpc(fn: string, args: Record<string, unknown>): Promise<RpcResult>;
  provider(name: string | null): TapProvider | null;
}

// A única porta que confirma um pagamento por aproximação. Assinatura inválida não muda nada.
export async function handleTapWebhook(req: Request, deps: TapWebhookDeps): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const active = await deps.rpc("service_tap_provider", {});
  const provider = deps.provider(active.data ?? null);
  if (active.error || !provider) return json({ error: "tap_unavailable" }, 409);
  const event = await provider.parseWebhook(req);
  if (!event) return json({ error: "unauthorized" }, 401);
  const applied = await deps.rpc("service_tap_result", {
    p_payment_id: event.reference, p_event_id: event.eventId, p_approved: event.approved,
    p_amount_cents: event.amountCents, p_tariff_cents: event.tariffCents,
  });
  if (applied.error) {
    console.error("tap-webhook apply error:", applied.error.message);
    return json({ error: "internal_error" }, 500);
  }
  return json({ ok: true });
}
