export type FiscalEnvironment = "homologation" | "production";

export interface FiscalItem {
  productCode: string; description: string; quantity: number;
  grossCents: number; discountCents: number; feeCents: number;
  ncm: string; cfop: string; unit: string;
  icmsOrigin: string; icmsCst: string; pisCst: string; cofinsCst: string;
}
export interface FiscalPayment { method: string; cents: number }

export interface EmitInput {
  ref: string; cnpj: string; items: FiscalItem[]; payments: FiscalPayment[]; issuedAt: Date;
  // "CPF na nota" que o cliente pediu. Sem ele, a nota sai como consumidor não identificado.
  consumerDocument?: string | null;
}
export interface FiscalCredentials { token: string; environment: FiscalEnvironment }

export type FiscalResult =
  | {
    outcome: "authorized"; accessKey: string; number: string | null; series: string | null; protocol: string | null;
    qrCodeUrl: string | null; danfeUrl: string | null; xmlUrl: string | null; consultUrl: string | null; contingency: boolean;
    providerRef?: string;
  }
  // O emissor aceitou e ainda processa: a varredura consulta de novo pelo ID dele.
  | { outcome: "pending"; providerRef: string }
  // Decisão final da SEFAZ ou erro de cadastro: repetir igual não resolve, precisa de gente.
  | { outcome: "rejected"; errorCode: string; errorMessage: string; providerRef?: string }
  // Rede, 5xx, 429 ou nota ainda em processamento: tenta de novo.
  | { outcome: "transient"; errorCode: string; errorMessage: string; providerRef?: string }
  // A referência já existe no provedor: só a consulta diz com qual resultado.
  | { outcome: "already_processed" }
  | { outcome: "not_found" };

export type FiscalCancelResult =
  | { outcome: "cancelled" }
  // Decisão final, como prazo vencido na SEFAZ: precisa de gente.
  | { outcome: "rejected"; errorMessage: string }
  | { outcome: "transient"; errorMessage: string };

// Contrato mínimo usado pela Edge Function; outro emissor entra por aqui (ADR-030, ADR-033).
export interface FiscalProvider {
  emit(credentials: FiscalCredentials, input: EmitInput): Promise<FiscalResult>;
  // providerRef é o ID da nota no emissor (fiscal_documents.provider_ref), não a nossa referência.
  consult(credentials: FiscalCredentials, providerRef: string): Promise<FiscalResult>;
  cancel(credentials: FiscalCredentials, providerRef: string, justification: string): Promise<FiscalCancelResult>;
}
