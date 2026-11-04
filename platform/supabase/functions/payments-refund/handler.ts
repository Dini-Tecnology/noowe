import { AsaasError } from "../_shared/payments/asaas.ts";
import { mapAsaasPaymentStatus } from "../_shared/payments/events.ts";
import { asaasValueToCents } from "../_shared/payments/money.ts";
import type { AsaasPayment } from "../_shared/payments/types.ts";
import { bearer, isServiceRole, json, type PaymentDeps } from "../_shared/payments/deps.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALREADY_REFUNDING = new Set(["REFUNDED", "REFUND_IN_PROGRESS", "REFUND_REQUESTED"]);

// Quanto o provedor já registra como devolvido ou a caminho nesta cobrança, em centavos.
function refundedAtProvider(charge: AsaasPayment, onlyDone: boolean): number {
  return (charge.refunds ?? [])
    .filter((r) => (onlyDone ? r.status === "DONE" : r.status !== "CANCELLED"))
    .reduce((sum, r) => sum + asaasValueToCents(r.value), 0);
}

// Envia à Asaas um estorno aprovado. Só o banco chama (pg_net), com a service role. A resposta da Asaas diz que o pedido foi
// aceito; quem confirma a devolução é o webhook. Se o webhook não vier, a mesma fila confere a cobrança depois.
export async function handleRefund(req: Request, deps: PaymentDeps): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!isServiceRole(bearer(req), deps.env("SUPABASE_SERVICE_ROLE_KEY") ?? "")) return json({ error: "unauthorized" }, 401);
  const body = await req.json().catch(() => null);
  if (!UUID.test(body?.refundId ?? "")) return json({ error: "invalid_request" }, 400);

  const claim = await deps.rpc("service_refund_claim", { p_refund_id: body.refundId });
  if (claim.error) {
    console.error("payments-refund claim error:", claim.error.message);
    return json({ error: "internal_error" }, 500);
  }
  const job = claim.data;
  if (!job?.claimed) return json({ ok: true, skipped: true });

  const record = async (outcome: "sent" | "transient" | "failed" | "deferred", error?: string) => {
    const saved = await deps.rpc("service_refund_record", { p_refund_id: job.refundId, p_outcome: outcome, p_error: error ?? null });
    if (saved.error) console.error("payments-refund record error:", saved.error.message);
    return json({ ok: !saved.error, outcome }, saved.error ? 500 : 200);
  };

  if (!job.providerRef) return job.action === "verify" ? json({ ok: true }) : record("failed", "Cobrança sem referência no provedor");
  if (job.provider === "tap") {
    // O fornecedor confirma pelo webhook dele. A repetição é idempotente pelo id do estorno.
    if (job.action === "verify") return json({ ok: true });
    const active = await deps.rpc("service_tap_provider", {});
    const tap = deps.tapProvider?.(active.data ?? null);
    if (!tap) return record("transient", "Fornecedor de aproximação indisponível");
    try {
      await tap.refund({ reference: job.refundId, providerRef: job.providerRef, amountCents: job.amountCents, reason: String(job.reason ?? "").slice(0, 200) });
      return record("sent");
    } catch (err) {
      console.error("payments-refund tap error:", err);
      return record("transient", "Fornecedor de aproximação indisponível");
    }
  }
  const secrets = await deps.rpc("service_payment_account_secrets", { p_account_id: job.paymentAccountId });
  const apiKey: string | undefined = secrets.data?.apiKey;
  if (secrets.error || !apiKey) return job.action === "verify" ? json({ ok: true }) : record("transient", "Credenciais do provedor indisponíveis");

  if (job.action === "verify") {
    try {
      const actual = await deps.provider.getCharge(apiKey, job.providerRef);
      const mapped = mapAsaasPaymentStatus(actual.status);
      if (mapped?.outcome === "refunded") {
        await deps.rpc("service_payment_apply_event", {
          p_payment_id: job.paymentId, p_provider: "asaas", p_provider_event_id: `sync:${job.paymentId}:${actual.status}`,
          p_event_type: `SYNC_${actual.status}`, p_outcome: "refunded", p_amount_cents: null,
          p_payload: { source: "refund-verify", providerStatus: actual.status }, p_gateway_status: mapped.gatewayStatus ?? null,
        });
      } else if (refundedAtProvider(actual, true) >= (job.settledCents ?? 0) + job.amountCents) {
        // Parcial concluído sem o aviso chegar.
        await deps.rpc("service_payment_apply_event", {
          p_payment_id: job.paymentId, p_provider: "asaas", p_provider_event_id: `sync-refund:${job.refundId}`,
          p_event_type: "SYNC_PARTIALLY_REFUNDED", p_outcome: "refunded", p_amount_cents: null,
          p_payload: { source: "refund-verify", providerStatus: actual.status }, p_gateway_status: "partially_refunded",
        });
      }
    } catch (err) {
      console.error("payments-refund verify error:", err);
    }
    return json({ ok: true, verified: true });
  }

  try {
    // Só a primeira tentativa é certamente inédita: um timeout ou uma função interrompida pode ter devolvido o dinheiro.
    if (job.attempt > 1) {
      const actual = await deps.provider.getCharge(apiKey, job.providerRef);
      if (job.total && ALREADY_REFUNDING.has(actual.status)) return record("sent");
      if (refundedAtProvider(actual, false) >= (job.settledCents ?? 0) + job.amountCents) return record("sent");
    }
    await deps.provider.refund(apiKey, job.providerRef, job.amountCents, String(job.reason ?? "").slice(0, 200));
    return record("sent");
  } catch (err) {
    // Estorno parcial de cartão no mesmo dia: o Asaas pede para esperar (spike de 04/11).
    if (err instanceof AsaasError && err.status === 400 && /pr[oó]ximo dia/i.test(JSON.stringify(err.body))) {
      return record("deferred", "O Asaas só aceita este estorno parcial no dia seguinte");
    }
    if (err instanceof AsaasError && err.status >= 400 && err.status < 500 && err.status !== 429) {
      return record("failed", `Asaas recusou o estorno (HTTP ${err.status})`);
    }
    console.error("payments-refund provider error:", err instanceof AsaasError ? { status: err.status, body: err.body } : err);
    // A próxima tentativa confere na cobrança antes de enviar de novo.
    return record("transient", "Provedor indisponível");
  }
}
