import { AsaasError } from "../_shared/payments/asaas.ts";
import { bearer, isServiceRole, json, type PaymentDeps } from "../_shared/payments/deps.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const percent = (bps: number) => bps / 100;

// Campos fiscais comuns às notas da NOOWE: vêm dos parâmetros (tipo da nota e empresa), nunca do código.
function fiscalFields(job: any) {
  return {
    serviceDescription: job.serviceDescription, observations: job.observations,
    municipalServiceId: job.municipalServiceId, municipalServiceCode: job.municipalServiceCode, municipalServiceName: job.municipalServiceName,
    taxes: {
      retainIss: job.taxes.retainIss, iss: percent(job.taxes.issBps), pis: percent(job.taxes.pisBps), cofins: percent(job.taxes.cofinsBps),
      csll: percent(job.taxes.csllBps), inss: percent(job.taxes.inssBps), ir: percent(job.taxes.irBps),
    },
  };
}

const providerError = (err: unknown) => err instanceof AsaasError ? `Asaas recusou a nota (HTTP ${err.status})` : "Provedor indisponível";

// Agenda no Asaas as NFS-e da NOOWE. Só o banco chama. Quem confirma a nota é o billing-webhook.
//   { invoiceId }: nota da fatura da assinatura, vinculada à cobrança;
//   { noteId }:    nota avulsa (taxa NOOWE Pay da semana ou conveniência do pedido), para o cliente do Asaas do tomador.
export async function handleBillingNfse(req: Request, deps: PaymentDeps): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!isServiceRole(bearer(req), deps.env("SUPABASE_SERVICE_ROLE_KEY") ?? "")) return json({ error: "unauthorized" }, 401);
  const body = await req.json().catch(() => null);
  const rootKey = deps.env("ASAAS_ROOT_API_KEY");
  if (UUID.test(body?.noteId ?? "")) {
    if (!rootKey) return json({ error: "billing_unavailable" }, 503);
    return feeNote(body.noteId, rootKey, deps);
  }
  if (!UUID.test(body?.invoiceId ?? "")) return json({ error: "invalid_request" }, 400);
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
      payment: job.paymentRef, valueCents: job.totalCents, effectiveDate: job.effectiveDate, externalReference: reference, ...fiscalFields(job),
    });
    await attach(invoice.id);
    return json({ ok: true });
  } catch (err) {
    console.error("billing-nfse provider error:", err instanceof AsaasError ? { status: err.status, body: err.body } : err);
    await attach(null, providerError(err));
    return json({ error: "provider_unavailable" }, 502);
  }
}

async function feeNote(noteId: string, rootKey: string, deps: PaymentDeps): Promise<Response> {
  const claim = await deps.rpc("service_fee_note_claim", { p_note_id: noteId });
  if (claim.error) return json({ error: "internal_error" }, 500);
  const job = claim.data;
  if (!job?.claimed) return json({ ok: true, skipped: true });

  let customerId: string | null = job.customerId ?? null;
  const attach = (ref: string | null, error?: string) =>
    deps.rpc("service_fee_note_attach", { p_note_id: job.noteId, p_provider_ref: ref, p_customer_ref: customerId, p_error: error ?? null });

  const reference = `note:${job.noteId}`;
  try {
    const existing = job.attempt > 1 ? await deps.provider.findInvoiceByExternalRef(rootKey, reference) : null;
    if (existing) {
      await attach(existing.id);
      return json({ ok: true });
    }
    // O mesmo tomador não vira dois clientes no Asaas: procura pelo documento antes de criar.
    if (!customerId) {
      customerId = (await deps.provider.findCustomerByDocument(rootKey, job.takerDocument))?.id
        ?? (await deps.provider.createCustomer(rootKey, {
          name: job.takerName, cpfCnpj: job.takerDocument, email: job.takerEmail ?? null, externalReference: job.kind === "noowe_pay" ? job.restaurantId : `note:${job.noteId}`,
        })).id;
    }
    const invoice = await deps.provider.scheduleInvoice(rootKey, {
      customer: customerId, valueCents: job.totalCents, effectiveDate: job.effectiveDate, externalReference: reference, ...fiscalFields(job),
    });
    await attach(invoice.id);
    return json({ ok: true });
  } catch (err) {
    console.error("billing-nfse fee note provider error:", err instanceof AsaasError ? { status: err.status, body: err.body } : err);
    await attach(null, providerError(err));
    return json({ error: "provider_unavailable" }, 502);
  }
}
