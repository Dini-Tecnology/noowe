import { bearer, isServiceRole, json, type RpcResult } from "../_shared/payments/deps.ts";
import type { FiscalCredentials, FiscalProvider, FiscalResult } from "../_shared/fiscal/types.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface FiscalDeps {
  rpc(fn: string, args: Record<string, unknown>): Promise<RpcResult>;
  provider: FiscalProvider;
  env(name: string): string | undefined;
  now?(): Date;
}

// Emite uma NFC-e da fila. Só o banco chama (pg_net, no encerramento e na varredura), com a
// service role. A emissão é assíncrona na Notaas: o ID dela fica gravado e as rodadas seguintes
// consultam por ele; a chave de idempotência impede segunda nota para o mesmo fechamento.
export async function handleFiscalEmit(req: Request, deps: FiscalDeps): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!isServiceRole(bearer(req), deps.env("SUPABASE_SERVICE_ROLE_KEY") ?? "")) return json({ error: "unauthorized" }, 401);
  const body = await req.json().catch(() => null);
  if (!UUID.test(body?.documentId ?? "")) return json({ error: "invalid_request" }, 400);

  if (body.action === "cancel") return cancelNote(deps, body.documentId);

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
    // A nota pode já existir na Notaas. A varredura reenvia o mesmo corpo, e a chave de idempotência devolve a mesma nota.
    console.error("fiscal-emit record error:", recorded.error.message);
    return json({ error: "internal_error" }, 500);
  }
  return json({ ok: true, status: recorded.data?.status });
}

// Cancela a nota de uma venda estornada por inteiro. Só a SEFAZ diz se ainda dá: fora do prazo, a recusa vai para uma pessoa.
async function cancelNote(deps: FiscalDeps, documentId: string): Promise<Response> {
  const claim = await deps.rpc("service_fiscal_cancel_claim", { p_document_id: documentId });
  if (claim.error) {
    console.error("fiscal-emit cancel claim error:", claim.error.message);
    return json({ error: "internal_error" }, 500);
  }
  const job = claim.data;
  if (!job?.claimed) return json({ ok: true, skipped: job?.blocked ?? "not_due" });
  // Nota sem ID do emissor nunca foi aceita por ele: não há o que cancelar lá, e uma pessoa precisa olhar.
  const result = job.providerRef
    ? await deps.provider.cancel({ token: job.token, environment: job.environment }, job.providerRef, job.justification)
    : { outcome: "rejected" as const, errorMessage: "Nota sem identificador do emissor" };
  const saved = await deps.rpc("service_fiscal_cancel_record", {
    p_document_id: job.documentId,
    p_outcome: result.outcome === "cancelled" ? "cancelled" : result.outcome === "transient" ? "transient" : "failed",
    p_error: result.outcome === "cancelled" ? null : result.errorMessage,
  });
  if (saved.error) {
    console.error("fiscal-emit cancel record error:", saved.error.message);
    return json({ error: "internal_error" }, 500);
  }
  return json({ ok: true, cancelStatus: saved.data?.cancelStatus });
}

type Final = Exclude<FiscalResult, { outcome: "already_processed" } | { outcome: "not_found" } | { outcome: "pending" }>;

// Nota aceita e ainda em processamento volta para a fila com o ID do emissor, para a próxima rodada consultar.
function settle(result: Exclude<FiscalResult, { outcome: "already_processed" } | { outcome: "not_found" }>): Final {
  if (result.outcome !== "pending") return result;
  return { outcome: "transient", errorCode: "provider_processing", errorMessage: "Nota em processamento no emissor", providerRef: result.providerRef };
}

async function emitOnce(deps: FiscalDeps, credentials: FiscalCredentials, job: any): Promise<Final> {
  try {
    // Com ID do emissor, a nota já foi aceita: só a consulta diz o resultado, e reenviar nunca é a saída.
    if (job.providerRef) {
      const previous = await deps.provider.consult(credentials, job.providerRef);
      if (previous.outcome !== "not_found" && previous.outcome !== "already_processed") return settle(previous);
    }
    const sent = await deps.provider.emit(credentials, {
      ref: job.ref, cnpj: job.cnpj, items: job.items, payments: job.payments, issuedAt: deps.now?.() ?? new Date(),
      consumerDocument: job.consumerDocument ?? null,
    });
    // shortcut: a Notaas não busca por referência nossa; 409 sem ID acaba em `failed` para a gerência (ADR-033).
    if (sent.outcome === "already_processed") {
      return { outcome: "transient", errorCode: "consult_inconclusive", errorMessage: "Chave de idempotência já usada com outro conteúdo" };
    }
    if (sent.outcome === "not_found") return { outcome: "rejected", errorCode: "not_found", errorMessage: "Rota de emissão não encontrada" };
    return settle(sent);
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
