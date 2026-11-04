import { timingSafeEqual } from "../_shared/payments/crypto.ts";
import { json, type PaymentDeps } from "../_shared/payments/deps.ts";

const PAID = new Set(["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Webhook da conta Asaas da NOOWE: só as faturas da assinatura. Reprocessar não muda fatura já paga.
export async function handleBillingWebhook(req: Request, deps: Pick<PaymentDeps, "rpc" | "env">): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const token = deps.env("BILLING_WEBHOOK_TOKEN") ?? "";
  if (!token) return json({ error: "billing_unavailable" }, 503);
  if (!timingSafeEqual(req.headers.get("asaas-access-token") ?? "", token)) return json({ error: "unauthorized" }, 401);
  const event = await req.json().catch(() => null);
  const reference: string = event?.payment?.externalReference ?? "";
  if (!reference.startsWith("inv:") || !UUID.test(reference.slice(4))) return json({ ok: true, ignored: "not_an_invoice" });
  if (!PAID.has(event?.event)) return json({ ok: true, ignored: "event_not_handled" });
  const paid = await deps.rpc("service_invoice_paid", { p_invoice_id: reference.slice(4) });
  if (paid.error) {
    console.error("billing-webhook error:", paid.error.message);
    return json({ error: "internal_error" }, 500);
  }
  return json({ ok: true });
}
