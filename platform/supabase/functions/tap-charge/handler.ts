import { bearer, json, mapRpcError, type RpcResult } from "../_shared/payments/deps.ts";
import type { TapProvider } from "../_shared/tap/types.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface TapDeps {
  rpc(fn: string, args: Record<string, unknown>): Promise<RpcResult>;
  getUser(token: string): Promise<{ id: string } | null>;
  provider(name: string | null): TapProvider | null;
}

// O garçom inicia a cobrança. A resposta não significa pago: quem confirma é o fornecedor, em tap-webhook.
export async function handleTapCharge(req: Request, deps: TapDeps): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const user = await deps.getUser(bearer(req));
  if (!user) return json({ error: "unauthorized" }, 401);
  const body = await req.json().catch(() => null);
  if (!UUID.test(body?.tableSessionId ?? "") || !UUID.test(body?.idempotencyKey ?? "")) return json({ error: "invalid_request" }, 400);

  const active = await deps.rpc("service_tap_provider", {});
  const provider = deps.provider(active.data ?? null);
  if (active.error || !provider) return json({ error: "tap_unavailable" }, 409);

  const begun = await deps.rpc("service_tap_begin", {
    p_user_id: user.id, p_table_session_id: body.tableSessionId, p_idempotency_key: body.idempotencyKey,
    p_base_cents: body.baseCents ?? null, p_waive_fee: body.waiveFee === true, p_tip_cents: body.tipCents ?? 0,
  });
  if (begun.error) {
    const mapped = mapRpcError(begun.error.code);
    return json({ error: mapped.error }, mapped.status);
  }
  const payment = begun.data;
  try {
    const charge = await provider.startCharge({ reference: payment.paymentId, amountCents: payment.amountCents, description: "Conta da mesa NOOWE" });
    return json({ paymentId: payment.paymentId, amountCents: payment.amountCents, sdkPayload: charge.sdkPayload });
  } catch (err) {
    console.error("tap-charge provider error:", err);
    // Sem cobrança iniciada, a reserva volta ao saldo.
    await deps.rpc("service_tap_result", { p_payment_id: payment.paymentId, p_event_id: `start-failed:${payment.paymentId}`, p_approved: false });
    return json({ error: "provider_unavailable" }, 502);
  }
}
