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
}
export interface FiscalCredentials { token: string; environment: FiscalEnvironment }

export type FiscalResult =
  | {
    outcome: "authorized"; accessKey: string; number: string | null; series: string | null; protocol: string | null;
    qrCodeUrl: string | null; danfeUrl: string | null; xmlUrl: string | null; consultUrl: string | null; contingency: boolean;
  }
  // Decisão final da SEFAZ ou erro de cadastro: repetir igual não resolve, precisa de gente.
  | { outcome: "rejected"; errorCode: string; errorMessage: string }
  // Rede, 5xx, 429 ou nota ainda em processamento: tenta de novo.
  | { outcome: "transient"; errorCode: string; errorMessage: string }
  // A referência já existe no provedor: só a consulta diz com qual resultado.
  | { outcome: "already_processed" }
  | { outcome: "not_found" };

// Contrato mínimo usado pela Edge Function; outro emissor entra por aqui (ADR-030).
export interface FiscalProvider {
  emit(credentials: FiscalCredentials, input: EmitInput): Promise<FiscalResult>;
  consult(credentials: FiscalCredentials, ref: string): Promise<FiscalResult>;
}
