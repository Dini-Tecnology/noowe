export interface AsaasCustomerInput {
  name: string; cpfCnpj: string; email?: string | null; mobilePhone?: string | null; externalReference: string;
}
export interface AsaasChargeInput {
  customer: string; billingType: "PIX" | "CREDIT_CARD" | "UNDEFINED"; valueCents: number; dueDate: string;
  externalReference: string; description: string;
  successUrl?: string | null;
}
export interface AsaasPayment {
  id: string; status: string; value: number; netValue?: number; invoiceUrl?: string; externalReference?: string | null;
  // Em pagamentos com cartão o Asaas devolve o token, a bandeira e o final (creditCardNumber = 4 dígitos).
  creditCard?: { creditCardToken?: string | null; creditCardBrand?: string | null; creditCardNumber?: string | null } | null;
  // Estornos pedidos nesta cobrança. Status: PENDING, DONE, CANCELLED e os de autorização.
  refunds?: { status: string; value: number }[] | null;
}
export interface AsaasPix { payload: string; expirationDate?: string | null }
export type AsaasCompanyType = "MEI" | "LIMITED" | "INDIVIDUAL" | "ASSOCIATION";
export interface AsaasAccountInput {
  name: string; email: string; cpfCnpj: string; companyType: AsaasCompanyType; mobilePhone: string; incomeCents: number;
  address: string; addressNumber: string; province: string; postalCode: string;
  webhook: { url: string; email: string; authToken: string; events: string[] };
}
// NFS-e agendada no módulo de notas do Asaas, vinculada à cobrança. Tributos em percentual, como a API pede.
export interface AsaasInvoiceInput {
  payment: string; valueCents: number; effectiveDate: string; serviceDescription: string; observations: string;
  municipalServiceId?: string | null; municipalServiceCode?: string | null; municipalServiceName: string;
  externalReference: string;
  taxes: { retainIss: boolean; iss: number; pis: number; cofins: number; csll: number; inss: number; ir: number };
}
export interface AsaasAccount { id: string; walletId: string; apiKey: string }
export interface AsaasAccountStatus { id?: string; general: string }
export interface AsaasAccountDocument { id: string; status: string; onboardingUrl?: string | null }

// Contrato mínimo usado pelas Edge Functions; permite trocar de provedor (ex.: Tap) depois.
export interface PaymentProvider {
  createCustomer(apiKey: string, input: AsaasCustomerInput): Promise<{ id: string }>;
  createCharge(apiKey: string, input: AsaasChargeInput): Promise<AsaasPayment>;
  findChargeByExternalRef(apiKey: string, externalReference: string): Promise<AsaasPayment | null>;
  getCharge(apiKey: string, id: string): Promise<AsaasPayment>;
  getPixQrCode(apiKey: string, id: string): Promise<AsaasPix>;
  setSplit(apiKey: string, id: string, walletId: string, cents: number): Promise<void>;
  // Cartão salvo (F6): o token vem da nossa tabela privada, nunca do app. Paga só depois do split definido.
  payWithToken(apiKey: string, id: string, creditCardToken: string, remoteIp: string | null): Promise<AsaasPayment>;
  cancelCharge(apiKey: string, id: string): Promise<void>;
  refund(apiKey: string, id: string, valueCents: number, description?: string): Promise<void>;
  createAccount(rootApiKey: string, input: AsaasAccountInput): Promise<AsaasAccount>;
  findAccountByDocument(rootApiKey: string, cpfCnpj: string): Promise<{ id: string } | null>;
  getAccountStatus(apiKey: string): Promise<AsaasAccountStatus>;
  listAccountDocuments(apiKey: string): Promise<AsaasAccountDocument[]>;
  findInvoiceByExternalRef(apiKey: string, externalReference: string): Promise<{ id: string } | null>;
  scheduleInvoice(apiKey: string, input: AsaasInvoiceInput): Promise<{ id: string }>;
}
