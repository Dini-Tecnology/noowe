export interface AsaasCustomerInput {
  name: string; cpfCnpj: string; email?: string | null; mobilePhone?: string | null; externalReference: string;
}
export interface AsaasChargeInput {
  customer: string; billingType: "PIX" | "CREDIT_CARD"; valueCents: number; dueDate: string;
  externalReference: string; description: string;
  split?: { walletId: string; feeCents: number } | null; successUrl?: string | null;
  // Cobrança em um toque com cartão salvo (F6): o token vem da nossa tabela privada, nunca do app.
  creditCardToken?: string | null; remoteIp?: string | null;
}
export interface AsaasPayment {
  id: string; status: string; value: number; invoiceUrl?: string; externalReference?: string | null;
  // Em pagamentos com cartão o Asaas devolve o token, a bandeira e o final (creditCardNumber = 4 dígitos).
  creditCard?: { creditCardToken?: string | null; creditCardBrand?: string | null; creditCardNumber?: string | null } | null;
}
export interface AsaasPix { payload: string; expirationDate?: string | null }

// Contrato mínimo usado pelas Edge Functions; permite trocar de provedor (ex.: Tap) depois.
export interface PaymentProvider {
  createCustomer(apiKey: string, input: AsaasCustomerInput): Promise<{ id: string }>;
  createCharge(apiKey: string, input: AsaasChargeInput): Promise<AsaasPayment>;
  findChargeByExternalRef(apiKey: string, externalReference: string): Promise<AsaasPayment | null>;
  getCharge(apiKey: string, id: string): Promise<AsaasPayment>;
  getPixQrCode(apiKey: string, id: string): Promise<AsaasPix>;
  cancelCharge(apiKey: string, id: string): Promise<void>;
  refund(apiKey: string, id: string, valueCents: number, description?: string): Promise<void>;
}
