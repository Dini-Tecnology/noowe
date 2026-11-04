import { centsToAsaasValue } from "../payments/money.ts";
import type { EmitInput, FiscalCancelResult, FiscalCredentials, FiscalEnvironment, FiscalItem, FiscalPayment, FiscalProvider, FiscalResult } from "./types.ts";

const BASE_URL: Record<FiscalEnvironment, string> = {
  homologation: "https://homologacao.focusnfe.com.br",
  production: "https://api.focusnfe.com.br",
};

// Tabela tPag da NFC-e. Meio desconhecido falha fechado: nunca declaramos à SEFAZ um pagamento que não houve.
const PAYMENT_CODE: Record<string, string> = {
  cash: "01", credit_card: "03", debit_card: "04", voucher: "11", pix: "17", wallet: "18",
  apple_pay: "03", google_pay: "03", tap_to_pay: "03",
};
const NEEDS_INTEGRATION_TYPE = new Set(["03", "04", "17"]);

// Numeração, contingência e certificado ficam com a Focus; o token identifica a empresa.
export function focusBaseUrl(environment: string): string {
  const url = BASE_URL[environment as FiscalEnvironment];
  if (!url) throw new Error(`Ambiente fiscal desconhecido: ${environment}`);
  return url;
}

// Horário de emissão com fuso: a API recusa diferença acima de 5 minutos, então nasce no envio.
export function focusIssuedAt(at: Date): string {
  const local = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).format(at).replace(" ", "T");
  return `${local}-03:00`;
}

function focusItem(item: FiscalItem, index: number): Record<string, unknown> {
  const unit = Number((item.grossCents / item.quantity / 100).toFixed(10));
  return {
    numero_item: String(index + 1),
    codigo_produto: item.productCode,
    descricao: item.description.slice(0, 120),
    codigo_ncm: item.ncm,
    cfop: item.cfop,
    unidade_comercial: item.unit,
    unidade_tributavel: item.unit,
    quantidade_comercial: item.quantity,
    quantidade_tributavel: item.quantity,
    valor_unitario_comercial: unit,
    valor_unitario_tributavel: unit,
    valor_bruto: centsToAsaasValue(item.grossCents),
    ...(item.discountCents > 0 ? { valor_desconto: centsToAsaasValue(item.discountCents) } : {}),
    ...(item.feeCents > 0 ? { valor_outras_despesas: centsToAsaasValue(item.feeCents) } : {}),
    icms_origem: item.icmsOrigin,
    icms_situacao_tributaria: item.icmsCst,
    pis_situacao_tributaria: item.pisCst,
    cofins_situacao_tributaria: item.cofinsCst,
  };
}

function focusPayment(payment: FiscalPayment): Record<string, unknown> {
  const code = PAYMENT_CODE[payment.method];
  if (!code) throw new RangeError(`Forma de pagamento sem código fiscal: ${payment.method}`);
  return {
    forma_pagamento: code,
    valor_pagamento: centsToAsaasValue(payment.cents),
    // ADR-030, ponto a validar: venda online seria "integrada" (1), mas exige dados da credenciadora.
    ...(NEEDS_INTEGRATION_TYPE.has(code) ? { tipo_integracao: "2" } : {}),
  };
}

export function buildFocusNfce(input: EmitInput): Record<string, unknown> {
  return {
    cnpj_emitente: input.cnpj,
    data_emissao: focusIssuedAt(input.issuedAt),
    natureza_operacao: "VENDA AO CONSUMIDOR",
    presenca_comprador: "1",
    modalidade_frete: "9",
    local_destino: "1",
    indicador_inscricao_estadual_destinatario: "9",
    items: input.items.map(focusItem),
    formas_pagamento: input.payments.map(focusPayment),
  };
}

function absolute(base: string, path: unknown): string | null {
  if (typeof path !== "string" || !path) return null;
  return /^https?:\/\//.test(path) ? path : `${base}${path.startsWith("/") ? "" : "/"}${path}`;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value ? value : typeof value === "number" ? String(value) : null;
}

function parseNote(base: string, body: Record<string, unknown>): FiscalResult {
  const status = body.status;
  if (status === "autorizado") {
    const accessKey = (text(body.chave_nfe) ?? "").replace(/\D/g, "");
    return {
      outcome: "authorized", accessKey, number: text(body.numero), series: text(body.serie),
      protocol: text(body.protocolo), qrCodeUrl: text(body.qrcode_url), danfeUrl: absolute(base, body.caminho_danfe),
      xmlUrl: absolute(base, body.caminho_xml_nota_fiscal), consultUrl: text(body.url_consulta_nf),
      contingency: body.contingencia_offline === true,
    };
  }
  if (status === "erro_autorizacao") {
    return {
      outcome: "rejected", errorCode: text(body.status_sefaz) ?? "erro_autorizacao",
      errorMessage: text(body.mensagem_sefaz) ?? "Rejeição da SEFAZ sem mensagem",
    };
  }
  if (status === "processando_autorizacao") {
    return { outcome: "transient", errorCode: "processando_autorizacao", errorMessage: "Nota ainda em processamento" };
  }
  // `cancelado` e qualquer status novo: nunca viram nota autorizada em silêncio.
  return { outcome: "rejected", errorCode: text(status) ?? "status_desconhecido", errorMessage: `Status inesperado da Focus: ${text(status)}` };
}

function parseError(status: number, body: Record<string, unknown>): FiscalResult {
  const code = text(body.codigo) ?? `http_${status}`;
  const message = text(body.mensagem) ?? `Focus respondeu HTTP ${status}`;
  if (code === "already_processed") return { outcome: "already_processed" };
  if (code === "pending_operation" || status === 429 || status >= 500) {
    return { outcome: "transient", errorCode: code, errorMessage: message };
  }
  return { outcome: "rejected", errorCode: code, errorMessage: message };
}

export class FocusNfeClient implements FiscalProvider {
  constructor(private readonly fetchFn: typeof fetch = fetch) {}

  private async call(credentials: FiscalCredentials, method: string, path: string, payload?: unknown): Promise<FiscalResult> {
    const base = focusBaseUrl(credentials.environment);
    let response: Response;
    try {
      response = await this.fetchFn(`${base}/v2${path}`, {
        method,
        headers: { Authorization: `Basic ${btoa(`${credentials.token}:`)}`, "Content-Type": "application/json" },
        ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
      });
    } catch (err) {
      return { outcome: "transient", errorCode: "network_error", errorMessage: String(err) };
    }
    const raw = await response.text();
    let body: Record<string, unknown> = {};
    try { body = JSON.parse(raw); } catch { /* 401 da Focus vem em texto puro */ }
    if (response.status === 404) return { outcome: "not_found" };
    if (response.status === 200 || response.status === 201) return parseNote(base, body);
    return parseError(response.status, body);
  }

  emit(credentials: FiscalCredentials, input: EmitInput): Promise<FiscalResult> {
    return this.call(credentials, "POST", `/nfce?ref=${encodeURIComponent(input.ref)}`, buildFocusNfce(input));
  }

  consult(credentials: FiscalCredentials, ref: string): Promise<FiscalResult> {
    return this.call(credentials, "GET", `/nfce/${encodeURIComponent(ref)}`);
  }

  async cancel(credentials: FiscalCredentials, ref: string, justification: string): Promise<FiscalCancelResult> {
    const base = focusBaseUrl(credentials.environment);
    let response: Response;
    try {
      response = await this.fetchFn(`${base}/v2/nfce/${encodeURIComponent(ref)}`, {
        method: "DELETE",
        headers: { Authorization: `Basic ${btoa(`${credentials.token}:`)}`, "Content-Type": "application/json" },
        body: JSON.stringify({ justificativa: justification }),
      });
    } catch (err) {
      return { outcome: "transient", errorMessage: String(err) };
    }
    const raw = await response.text();
    let body: Record<string, unknown> = {};
    try { body = JSON.parse(raw); } catch { /* 401 da Focus vem em texto puro */ }
    if (response.status === 200 && body.status === "cancelado") return { outcome: "cancelled" };
    if (response.status === 429 || response.status >= 500) return { outcome: "transient", errorMessage: `Focus respondeu HTTP ${response.status}` };
    return { outcome: "rejected", errorMessage: text(body.mensagem_sefaz) ?? text(body.mensagem) ?? `Focus respondeu HTTP ${response.status}` };
  }
}
