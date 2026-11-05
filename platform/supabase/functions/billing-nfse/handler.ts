import { AsaasError } from "../_shared/payments/asaas.ts";
import { bearer, isServiceRole, json, type PaymentDeps } from "../_shared/payments/deps.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const percent = (bps: number) => bps / 100;

// Agenda no Asaas a NFS-e da fatura já paga, vinculada à cobrança. Só o banco chama. Quem confirma a nota é o billing-webhook.
export async function handleBillingNfse(req: Request, deps: PaymentDeps): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!isServiceRole(bearer(req), deps.env("SUPABASE_SERVICE_ROLE_KEY") ?? "")) return json({ error: "unauthorized" }, 401);
  const body = await req.json().catch(() => null);
  if (!UUID.test(body?.invoiceId ?? "")) return json({ error: "invalid_request" }, 400);
  const rootKey = deps.env("ASAAS_ROOT_API_KEY");
  if (!rootKey) return json({ error: "billing_unavailable" }, 503);

  const claim = await deps.rpc("service_nfse_claim", { p_invoice_id: body.invoiceId });
  if (claim.error) return json({ error: "internal_error" }, 500);
  const job = claim.data;
  if (!job?.claimed) return json({ ok: true, skipped: true });

  const attach = (ref: string | null, error?: string) =>
    deps.rpc("service_nfse_attach", { p_invoice_id: job.invoiceId, p_provider_ref: ref, p_error: error ?? null });

  const reference = `nfse:${job.invoiceId}`;
  try {
    // Um timeout pode ter agendado a nota: da segunda tentativa em diante, confere antes de pedir de novo.
    const existing = job.attempt > 1 ? await deps.provider.findInvoiceByExternalRef(rootKey, reference) : null;
    const invoice = existing ?? await deps.provider.scheduleInvoice(rootKey, {
      payment: job.paymentRef, valueCents: job.totalCents, effectiveDate: job.effectiveDate,
      serviceDescription: job.serviceDescription, observations: `Fatura ${job.invoiceId}`,
      municipalServiceId: job.municipalServiceId, municipalServiceCode: job.municipalServiceCode, municipalServiceName: job.municipalServiceName,
      externalReference: reference,
      taxes: {
        retainIss: job.taxes.retainIss, iss: percent(job.taxes.issBps), pis: percent(job.taxes.pisBps), cofins: percent(job.taxes.cofinsBps),
        csll: percent(job.taxes.csllBps), inss: percent(job.taxes.inssBps), ir: percent(job.taxes.irBps),
      },
    });
    await attach(invoice.id);
    return json({ ok: true });
  } catch (err) {
    console.error("billing-nfse provider error:", err instanceof AsaasError ? { status: err.status, body: err.body } : err);
    await attach(null, err instanceof AsaasError ? `Asaas recusou a nota (HTTP ${err.status})` : "Provedor indisponível");
    return json({ error: "provider_unavailable" }, 502);
  }
}
