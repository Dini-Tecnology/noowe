import { mapAsaasPaymentStatus } from "../_shared/payments/events.ts";
import { asaasValueToCents } from "../_shared/payments/money.ts";
import { bearer, json, type PaymentDeps } from "../_shared/payments/deps.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Reconciliação: o app (ou um agendador) pede para reconsultar uma cobrança parada em
// `pending`. O evento aplicado usa id `sync:<pagamento>:<status>`, então repetir é inofensivo
// e continua passando pela mesma fronteira do webhook.
export async function handleSync(req: Request, deps: PaymentDeps): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const user = await deps.getUser(bearer(req));
  if (!user) return json({ error: "unauthorized" }, 401);
  const body = await req.json().catch(() => null);
  if (!UUID.test(body?.paymentId ?? "")) return json({ error: "invalid_request" }, 400);

  const row = await deps.rpc("service_payment_get", { p_payment_id: body.paymentId });
  const local = row.data;
  if (!local || local.customerId !== user.id) return json({ error: "not_found" }, 404);
  if (local.provider !== "asaas" || !local.providerRef || !["creating", "pending"].includes(local.status)) {
    return json({ paymentId: local.paymentId, status: local.status });
  }

  const secrets = await deps.rpc("service_payment_account_secrets", { p_account_id: local.paymentAccountId });
  const apiKey: string | undefined = secrets.data?.apiKey;
  if (!apiKey) return json({ paymentId: local.paymentId, status: local.status });

  try {
    const actual = await deps.provider.getCharge(apiKey, local.providerRef);
    const mapped = mapAsaasPaymentStatus(actual.status);
    if (mapped && mapped.outcome !== "pending") {
      await deps.rpc("service_payment_apply_event", {
        p_payment_id: local.paymentId, p_provider: "asaas",
        p_provider_event_id: `sync:${local.paymentId}:${actual.status}`, p_event_type: `SYNC_${actual.status}`,
        p_outcome: mapped.outcome,
        p_amount_cents: mapped.outcome === "confirmed" ? asaasValueToCents(actual.value) : null,
        p_payload: { source: "sync", providerStatus: actual.status }, p_gateway_status: mapped.gatewayStatus ?? null,
      });
    }
  } catch (err) {
    console.error("payments-sync provider error:", err);
    return json({ error: "provider_unavailable", retryable: true }, 502);
  }
  const after = await deps.rpc("service_payment_get", { p_payment_id: local.paymentId });
  return json({ paymentId: local.paymentId, status: after.data?.status ?? local.status });
}
