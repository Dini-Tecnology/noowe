import { bearer, json, type RpcResult } from "../_shared/payments/deps.ts";
import { timingSafeEqual } from "../_shared/payments/crypto.ts";
import type { FiscalCredentials, FiscalProvider, FiscalResult } from "../_shared/fiscal/types.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface FiscalDeps {
  rpc(fn: string, args: Record<string, unknown>): Promise<RpcResult>;
  provider: FiscalProvider;
  env(name: string): string | undefined;
  now?(): Date;
}

// Emite uma NFC-e da fila. Só o banco chama (pg_net, no encerramento e na varredura), com a
// service role. A resposta é síncrona; quando o resultado anterior é incerto, a referência
// estável permite consultar antes de reenviar, e nunca sai segunda nota para o mesmo fechamento.
export async function handleFiscalEmit(req: Request, deps: FiscalDeps): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!isServiceRole(bearer(req), deps.env("SUPABASE_SERVICE_ROLE_KEY") ?? "")) return json({ error: "unauthorized" }, 401);
  const body = await req.json().catch(() => null);
  if (!UUID.test(body?.documentId ?? "")) return json({ error: "invalid_request" }, 400);

  const claim = await deps.rpc("service_fiscal_claim", { p_document_id: body.documentId });
  if (claim.error) {
    console.error("fiscal-emit claim error:", claim.error.message);
    return json({ error: "internal_error" }, 500);
  }
  const job = claim.data;
  if (!job?.claimed) return json({ ok: true, skipped: job?.blocked ?? "not_due" });

  const credentials: FiscalCredentials = { token: job.token, environment: job.environment };
  const result = await emitOnce(deps, credentials, job);
  const recorded = await deps.rpc("service_fiscal_record_result", {
    p_document_id: job.documentId, p_outcome: result.outcome, p_result: resultFields(result),
  });
  if (recorded.error) {
    // A nota pode já existir na Focus. A varredura retoma pela mesma referência e consulta primeiro.
    console.error("fiscal-emit record error:", recorded.error.message);
    return json({ error: "internal_error" }, 500);
  }
  return json({ ok: true, status: recorded.data?.status });
}

// O gateway valida a assinatura do JWT (verify_jwt = true); aqui só conferimos o papel, como em send-push-notification.
function isServiceRole(token: string, serviceKey: string): boolean {
  if (!token) return false;
  if (serviceKey && timingSafeEqual(token, serviceKey)) return true;
  try {
    const encoded = token.split(".")[1];
    if (!encoded) return false;
    const padded = encoded.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(encoded.length / 4) * 4, "=");
    return JSON.parse(atob(padded)).role === "service_role";
  } catch {
    return false;
  }
}

type Final = Exclude<FiscalResult, { outcome: "already_processed" } | { outcome: "not_found" }>;

async function emitOnce(deps: FiscalDeps, credentials: FiscalCredentials, job: any): Promise<Final> {
  try {
    // Só a primeira tentativa é certamente inédita: um timeout pode ter autorizado a nota.
    if (job.attempt > 1) {
      const previous = await deps.provider.consult(credentials, job.ref);
      if (previous.outcome === "authorized") return previous;
    }
    const sent = await deps.provider.emit(credentials, {
      ref: job.ref, cnpj: job.cnpj, items: job.items, payments: job.payments, issuedAt: deps.now?.() ?? new Date(),
    });
    if (sent.outcome === "already_processed") {
      const found = await deps.provider.consult(credentials, job.ref);
      if (found.outcome === "authorized" || found.outcome === "rejected" || found.outcome === "transient") return found;
      return { outcome: "transient", errorCode: "consult_inconclusive", errorMessage: "Referência já usada e consulta sem nota" };
    }
    if (sent.outcome === "not_found") return { outcome: "rejected", errorCode: "not_found", errorMessage: "Rota de emissão não encontrada" };
    return sent;
  } catch (err) {
    // RangeError é dado nosso que não vira nota (forma de pagamento sem código): repetir não resolve.
    if (err instanceof RangeError) return { outcome: "rejected", errorCode: "invalid_document", errorMessage: err.message };
    console.error("fiscal-emit provider error:", err);
    return { outcome: "transient", errorCode: "provider_error", errorMessage: String(err) };
  }
}

function resultFields(result: Final): Record<string, unknown> {
  const { outcome: _outcome, ...fields } = result;
  return fields;
}
