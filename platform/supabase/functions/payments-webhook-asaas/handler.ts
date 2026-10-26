import { isChargebackEvent, mapAsaasEvent, mapAsaasPaymentStatus } from "../_shared/payments/events.ts";
import { asaasValueToCents } from "../_shared/payments/money.ts";
import { sha256Hex, timingSafeEqual } from "../_shared/payments/crypto.ts";
import { json, type PaymentDeps } from "../_shared/payments/deps.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Webhook do Asaas (um por subconta, ?acct=<payment_account_id>). É a fonte da verdade do
// pagamento: autentica pelo token da subconta, reconsulta o Asaas e só então aplica o evento.
// Depois de gravado, sempre responde 200 — um erro faria o Asaas pausar a fila de eventos.
export async function handleWebhook(req: Request, deps: PaymentDeps): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const accountId = new URL(req.url).searchParams.get("acct") ?? "";
  if (!UUID.test(accountId)) return json({ error: "unauthorized" }, 401);

  const secrets = await deps.rpc("service_payment_account_secrets", { p_account_id: accountId });
  const account = secrets.data;
  const token = req.headers.get("asaas-access-token") ?? "";
  if (!account?.webhookTokenHash || !token
    || !timingSafeEqual(await sha256Hex(token), account.webhookTokenHash)) {
    return json({ error: "unauthorized" }, 401);
  }

  const event = await req.json().catch(() => null);
  const type: string = typeof event?.event === "string" ? event.event : "";
  const payment = event?.payment;
  if (!type) return json({ ok: true, ignored: "no_event" });
  const eventId: string = typeof event?.id === "string" && event.id
    ? event.id : `${type}:${payment?.id ?? "none"}:${payment?.status ?? ""}`;

  const orphan = (reason: string) =>
    deps.rpc("service_payment_record_orphan_event", {
      p_provider: "asaas", p_provider_event_id: eventId, p_event_type: type,
      p_payment_account_id: accountId, p_payload: event,
    }).then(() => json({ ok: true, ignored: reason }));

  if (!type.startsWith("PAYMENT_")) return orphan("not_a_payment_event");
  const paymentId: string = typeof payment?.externalReference === "string" ? payment.externalReference : "";
  if (!UUID.test(paymentId)) return orphan("unmatched_payment");

  const row = await deps.rpc("service_payment_get", { p_payment_id: paymentId });
  const local = row.data;
  if (!local || local.provider !== "asaas" || local.paymentAccountId !== accountId) return orphan("unmatched_payment");
  // Confere que o Asaas fala da MESMA cobrança que criamos.
  if (local.providerRef && payment?.id && local.providerRef !== payment.id) return orphan("provider_ref_mismatch");

  if (isChargebackEvent(type)) {
    await deps.rpc("service_payment_record_orphan_event", {
      p_provider: "asaas", p_provider_event_id: eventId, p_event_type: type,
      p_payment_account_id: accountId, p_payload: event,
    });
    console.error("payments-webhook-asaas CHARGEBACK", { paymentId, type });
    return json({ ok: true, ignored: "chargeback_alerted" });
  }

  const mapped = mapAsaasEvent(type);
  if (!mapped) return orphan("event_not_handled");

  // Defesa em profundidade: o corpo do webhook não basta. O status real vem do Asaas.
  let amountCents: number | null = null;
  let confirmedCard: { token: string; brand: string | null; last4: string } | null = null;
  if (mapped.outcome === "confirmed") {
    const apiKey: string | undefined = account.apiKey;
    if (!apiKey) return orphan("no_api_key");
    try {
      const actual = await deps.provider.getCharge(apiKey, payment.id);
      const actualMapped = mapAsaasPaymentStatus(actual.status);
      if (actualMapped?.outcome !== "confirmed") return orphan("status_recheck_disagrees");
      amountCents = asaasValueToCents(actual.value);
      // O cartão vem da resposta do Asaas (reconsulta), nunca do corpo do webhook.
      const card = actual.creditCard;
      const last4 = typeof card?.creditCardNumber === "string" ? card.creditCardNumber.replace(/\D/g, "").slice(-4) : "";
      if (typeof card?.creditCardToken === "string" && card.creditCardToken && last4.length === 4) {
        confirmedCard = { token: card.creditCardToken, brand: card.creditCardBrand ?? null, last4 };
      }
    } catch (err) {
      // Não conseguimos reconferir: não confirmamos e deixamos o payments-sync tentar depois.
      console.error("payments-webhook-asaas recheck failed:", err);
      return orphan("recheck_failed");
    }
  }

  const applied = await deps.rpc("service_payment_apply_event", {
    p_payment_id: paymentId, p_provider: "asaas", p_provider_event_id: eventId, p_event_type: type,
    p_outcome: mapped.outcome, p_amount_cents: amountCents, p_payload: event, p_gateway_status: mapped.gatewayStatus ?? null,
  });
  if (applied.error) console.error("payments-webhook-asaas apply error:", applied.error);
  // F6: guarda o token só se o cliente consentiu (a função confere). Falhar aqui nunca derruba o webhook.
  if (!applied.error && confirmedCard) {
    const saved = await deps.rpc("service_payment_save_card", {
      p_payment_id: paymentId, p_token: confirmedCard.token, p_brand: confirmedCard.brand, p_last4: confirmedCard.last4,
    }).catch((err: unknown) => ({ data: null, error: { message: String(err) } }));
    if (saved.error) console.error("payments-webhook-asaas save card error:", saved.error.message);
  }
  return json({ ok: true, ...(applied.data?.ignored ? { ignored: applied.data.ignored } : {}) });
}
