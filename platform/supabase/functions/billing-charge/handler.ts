import { AsaasError } from "../_shared/payments/asaas.ts";
import { bearer, isServiceRole, json, saoPauloDate, type PaymentDeps } from "../_shared/payments/deps.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Leva a fatura da assinatura para a conta Asaas da NOOWE. Cobrança avulsa: o valor muda todo mês, com créditos, excedente e compensação.
// Só o banco chama. A página do Asaas oferece Pix, boleto e cartão. Quem confirma é o billing-webhook.
export async function handleBillingCharge(req: Request, deps: PaymentDeps): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!isServiceRole(bearer(req), deps.env("SUPABASE_SERVICE_ROLE_KEY") ?? "")) return json({ error: "unauthorized" }, 401);
  const body = await req.json().catch(() => null);
  if (!UUID.test(body?.invoiceId ?? "")) return json({ error: "invalid_request" }, 400);
  const rootKey = deps.env("ASAAS_ROOT_API_KEY");
  if (!rootKey) return json({ error: "billing_unavailable" }, 503);

  // Fatura anulada (assinatura cancelada depois de a fatura do próximo período sair): a cobrança no Asaas deixa de valer.
  if (body.action === "cancel") {
    const ref = await deps.rpc("service_invoice_cancel_ref", { p_invoice_id: body.invoiceId });
    if (ref.error) return json({ error: "internal_error" }, 500);
    if (!ref.data) return json({ ok: true, skipped: true });
    try {
      await deps.provider.cancelCharge(rootKey, ref.data);
      return json({ ok: true, canceled: true });
    } catch (err) {
      console.error("billing-charge cancel error:", err instanceof AsaasError ? { status: err.status, body: err.body } : err);
      return json({ error: "provider_unavailable" }, 502);
    }
  }

  const claim = await deps.rpc("service_invoice_claim", { p_invoice_id: body.invoiceId });
  if (claim.error) return json({ error: "internal_error" }, 500);
  const job = claim.data;
  if (!job?.claimed) return json({ ok: true, skipped: true });

  const attach = (customerId: string | null, ref: string | null, url: string | null, error?: string) =>
    deps.rpc("service_invoice_attach", { p_invoice_id: job.invoiceId, p_customer_id: customerId, p_provider_ref: ref, p_checkout_url: url, p_error: error ?? null });

  try {
    let customerId: string | null = job.customerId ?? null;
    if (!customerId) {
      if (!job.cnpj) {
        await attach(null, null, null, "Restaurante sem CNPJ para gerar a fatura");
        return json({ error: "document_required" }, 422);
      }
      const created = await deps.provider.createCustomer(rootKey, {
        name: job.name, cpfCnpj: job.cnpj, email: job.email, externalReference: job.restaurantId,
      });
      customerId = created.id;
    }
    const reference = `inv:${job.invoiceId}`;
    const charge = await deps.provider.findChargeByExternalRef(rootKey, reference) ?? await deps.provider.createCharge(rootKey, {
      customer: customerId!, billingType: "UNDEFINED", valueCents: job.totalCents,
      dueDate: job.dueDate ?? saoPauloDate(deps.now?.() ?? new Date()),
      externalReference: reference, description: "Assinatura NOOWE",
    });
    await attach(customerId, charge.id, charge.invoiceUrl ?? null);
    return json({ ok: true });
  } catch (err) {
    console.error("billing-charge provider error:", err instanceof AsaasError ? { status: err.status, body: err.body } : err);
    await attach(null, null, null, "Provedor indisponível");
    return json({ error: "provider_unavailable" }, 502);
  }
}
