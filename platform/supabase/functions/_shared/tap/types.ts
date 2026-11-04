// Camada de integração do Tap. O fornecedor entra implementando este contrato e registrando-se em providers.ts;
// o fluxo não muda. Ativar é só o parâmetro private.noowe_tap_settings; as credenciais ficam em segredo, nunca em tabela.
export interface TapChargeInput { reference: string; amountCents: number; description: string }
export interface TapCharge { providerRef: string; sdkPayload: Record<string, unknown> }
// `refund`: aviso de estorno, parcial ou total. Sem isso, é o resultado da cobrança.
export interface TapEvent { reference: string; eventId: string; refund?: "partial" | "total"; approved: boolean; amountCents: number | null; tariffCents: number | null }
export interface TapProvider {
  // Idempotente pela referência: repetir com a mesma referência não pode gerar segunda cobrança.
  startCharge(input: TapChargeInput): Promise<TapCharge>;
  // Idempotente por `reference`, o id do estorno. Quem confirma a devolução é o webhook.
  refund(input: { reference: string; providerRef: string; amountCents: number; reason: string }): Promise<void>;
  // Devolve null se a assinatura não confere: nada é aplicado.
  parseWebhook(request: Request): Promise<TapEvent | null>;
}
