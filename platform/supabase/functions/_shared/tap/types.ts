// Camada de integração do Tap. O fornecedor entra implementando este contrato e registrando-se em providers.ts;
// o fluxo não muda. Ativar é só o parâmetro private.noowe_tap_settings; as credenciais ficam em segredo, nunca em tabela.
export interface TapChargeInput { reference: string; amountCents: number; description: string }
export interface TapCharge { providerRef: string; sdkPayload: Record<string, unknown> }
export interface TapEvent { reference: string; eventId: string; approved: boolean; amountCents: number | null; tariffCents: number | null }
export interface TapProvider {
  startCharge(input: TapChargeInput): Promise<TapCharge>;
  // Devolve null se a assinatura não confere: nada é aplicado.
  parseWebhook(request: Request): Promise<TapEvent | null>;
}
