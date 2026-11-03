import type { PaymentDeps, RpcResult } from "./deps.ts";
import type { AsaasAccountDocument } from "./types.ts";

// O link de envio de documentos do primeiro documento ainda pendente. Só https sai daqui,
// porque o app abre este endereço no navegador.
export function pendingOnboardingUrl(documents: AsaasAccountDocument[]): string | null {
  const doc = documents.find((d) => d.status !== "APPROVED" && typeof d.onboardingUrl === "string"
    && d.onboardingUrl.startsWith("https://"));
  return doc?.onboardingUrl ?? null;
}

// A situação da conta vem sempre de uma consulta ao Asaas com a chave da subconta. Quem chama
// (tela ou webhook) nunca informa o status: o corpo do webhook não ativa conta nenhuma.
export async function syncAccountStatus(
  deps: PaymentDeps, accountId: string, apiKey: string, actorId: string | null,
): Promise<RpcResult> {
  const status = await deps.provider.getAccountStatus(apiKey);
  // Sem a lista de documentos ainda dá para aplicar a situação; o link anterior é mantido.
  const documents = await deps.provider.listAccountDocuments(apiKey).catch(() => []);
  return deps.rpc("service_payment_account_apply_status", {
    p_account_id: accountId, p_general: status.general,
    p_onboarding_url: pendingOnboardingUrl(documents), p_actor_id: actorId,
  });
}
