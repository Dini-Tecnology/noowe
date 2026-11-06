import { timingSafeEqual } from "../_shared/payments/crypto.ts";
import { json, type PaymentDeps } from "../_shared/payments/deps.ts";

const PAID = new Set(["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"]);
// Só a autorização faz a nota valer: agendada ou sincronizada ainda pode ser recusada pela prefeitura.
const NFSE_RESULT: Record<string, "issued" | "failed"> = {
  INVOICE_AUTHORIZED: "issued", INVOICE_ERROR: "failed", INVOICE_CANCELED: "failed", INVOICE_CANCELLATION_DENIED: "failed",
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Webhook da conta Asaas da NOOWE: só as faturas da assinatura. Reprocessar não muda fatura já paga.
export async function handleBillingWebhook(req: Request, deps: Pick<PaymentDeps, "rpc" | "env">): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const token = deps.env("BILLING_WEBHOOK_TOKEN") ?? "";
  if (!token) return json({ error: "billing_unavailable" }, 503);
  if (!timingSafeEqual(req.headers.get("asaas-access-token") ?? "", token)) return json({ error: "unauthorized" }, 401);
  const event = await req.json().catch(() => null);
  if (typeof event?.event === "string" && event.event.startsWith("INVOICE_")) return handleInvoiceEvent(event, deps);
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

async function handleInvoiceEvent(event: any, deps: Pick<PaymentDeps, "rpc">): Promise<Response> {
  const reference: string = event?.invoice?.externalReference ?? "";
  // nfse:<fatura> é a nota da assinatura; note:<id> é a nota avulsa (taxa NOOWE Pay da semana ou conveniência).
  const [prefix, id] = [reference.slice(0, 5), reference.slice(5)];
  if ((prefix !== "nfse:" && prefix !== "note:") || !UUID.test(id)) return json({ ok: true, ignored: "not_an_invoice" });
  const status = NFSE_RESULT[event.event];
  if (!status) return json({ ok: true, ignored: "event_not_handled" });
  const common = {
    p_status: status, p_url: event.invoice?.pdfUrl ?? null,
    p_error: status === "failed" ? `Asaas: ${event.event}` : null, p_provider_ref: event.invoice?.id ?? null,
  };
  const saved = prefix === "nfse:"
    ? await deps.rpc("service_nfse_result", { p_invoice_id: id, ...common })
    : await deps.rpc("service_fee_note_result", { p_note_id: id, ...common });
  if (saved.error) {
    console.error("billing-webhook nfse error:", saved.error.message);
    return json({ error: "internal_error" }, 500);
  }
  return json({ ok: true });
}
