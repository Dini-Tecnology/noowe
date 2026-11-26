import { centsToAsaasValue } from "../payments/money.ts";
import type { EmitInput, FiscalCancelResult, FiscalCredentials, FiscalEnvironment, FiscalItem, FiscalPayment, FiscalProvider, FiscalResult } from "./types.ts";

// Um host só: homologação ou produção é escolha do projeto na Notaas (ADR-033). Conferimos pelo tpAmb da nota.
const BASE_URL = "https://platform.notaas.com.br/api/v1";
const ORIGIN = "https://platform.notaas.com.br";
const TP_AMB: Record<FiscalEnvironment, string> = { production: "1", homologation: "2" };
// A emissão é assíncrona: esperamos um pouco para o recibo já sair com número; o resto fica com a varredura.
const POLL_ATTEMPTS = 3;
const POLL_INTERVAL_MS = 2000;

// Tabela tPag da NFC-e. Meio desconhecido falha fechado: nunca declaramos à SEFAZ um pagamento que não houve.
const PAYMENT_CODE: Record<string, string> = {
  cash: "01", credit_card: "03", debit_card: "04", voucher: "11", pix: "17", wallet: "18",
  apple_pay: "03", google_pay: "03", tap_to_pay: "03", tap_card: "03",
  voucher_refeicao: "11", voucher_alimentacao: "10",
};

function notaasItem(item: FiscalItem): Record<string, unknown> {
  return {
    codigo: item.productCode,
    descricao: item.description.slice(0, 120),
    ncm: item.ncm,
    cfop: item.cfop,
    unidade: item.unit,
    quantidade: item.quantity,
    valorUnitario: Number((item.grossCents / item.quantity / 100).toFixed(10)),
    valorTotal: centsToAsaasValue(item.grossCents),
    ...(item.discountCents > 0 ? { desconto: centsToAsaasValue(item.discountCents) } : {}),
    ...(item.feeCents > 0 ? { outrasDespesas: centsToAsaasValue(item.feeCents) } : {}),
    origem: item.icmsOrigin,
    // Simples Nacional usa CSOSN (3 dígitos); regime normal usa CST (2 dígitos).
    ...(item.icmsCst.length === 3 ? { csosn: item.icmsCst } : { cst: item.icmsCst }),
    cstPis: item.pisCst,
    cstCofins: item.cofinsCst,
  };
}

function notaasPayment(payment: FiscalPayment): Record<string, unknown> {
  const code = PAYMENT_CODE[payment.method];
  if (!code) throw new RangeError(`Forma de pagamento sem código fiscal: ${payment.method}`);
  return { tipoPagamento: code, valor: centsToAsaasValue(payment.cents) };
}

// CPF (11 dígitos) ou CNPJ (14) do consumidor, só quando ele pediu. Qualquer outra coisa sai sem destinatário.
function notaasConsumer(document: string | null | undefined): Record<string, unknown> {
  const digits = (document ?? "").replace(/\D/g, "");
  if (digits.length === 11) return { dest: { cpf: digits } };
  if (digits.length === 14) return { dest: { cnpj: digits } };
  return {};
}

// Sem dataEmissao: a Notaas usa a hora do processamento, e o corpo fica igual entre tentativas,
// o que deixa a chave de idempotência deduplicar. O emitente é o CNPJ do projeto da chave.
export function buildNotaasNfce(input: EmitInput): Record<string, unknown> {
  return {
    modelo: 65,
    naturezaOperacao: "VENDA AO CONSUMIDOR",
    consumidorFinal: 1,
    ...notaasConsumer(input.consumerDocument),
    items: input.items.map(notaasItem),
    pagamentos: input.payments.map(notaasPayment),
  };
}

// Mesmo corpo, mesma chave: reenvio não gera segunda nota. Corpo corrigido (NCM, CFOP) gera chave nova.
export async function notaasIdempotencyKey(ref: string, payload: unknown): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(payload)));
  const hex = Array.from(new Uint8Array(digest).slice(0, 8), (b) => b.toString(16).padStart(2, "0")).join("");
  return `${ref}:${hex}`;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value ? value : typeof value === "number" ? String(value) : null;
}

function absolute(path: unknown): string | null {
  const value = text(path);
  if (!value) return null;
  return /^https?:\/\//.test(value) ? value : `${ORIGIN}${value.startsWith("/") ? "" : "/"}${value}`;
}

function xmlTag(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}>\\s*(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?\\s*</${tag}>`));
  return match ? match[1].trim() || null : null;
}

type Reply = { status: number; body: Record<string, unknown>; raw: string } | { networkError: string };

function errorResult(status: number, body: Record<string, unknown>): FiscalResult {
  const code = text(body.errorCode) ?? `http_${status}`;
  const message = text(body.error) ?? text(body.message) ?? `Notaas respondeu HTTP ${status}`;
  if (status === 409) return { outcome: "already_processed" };
  if (status === 429 || status >= 500) return { outcome: "transient", errorCode: code, errorMessage: message };
  return { outcome: "rejected", errorCode: code, errorMessage: message };
}

export class NotaasClient implements FiscalProvider {
  constructor(
    private readonly fetchFn: typeof fetch = fetch,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  private async request(credentials: FiscalCredentials, method: string, path: string, payload?: unknown, headers: Record<string, string> = {}): Promise<Reply> {
    let response: Response;
    try {
      response = await this.fetchFn(`${BASE_URL}${path}`, {
        method,
        headers: { "x-api-key": credentials.token, "Content-Type": "application/json", ...headers },
        ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
      });
    } catch (err) {
      return { networkError: String(err) };
    }
    const raw = await response.text();
    let body: Record<string, unknown> = {};
    try { body = JSON.parse(raw); } catch { /* XML ou texto puro */ }
    return { status: response.status, body, raw };
  }

  async emit(credentials: FiscalCredentials, input: EmitInput): Promise<FiscalResult> {
    const payload = buildNotaasNfce(input);
    const reply = await this.request(credentials, "POST", "/nfe/emitir", payload, {
      "Idempotency-Key": await notaasIdempotencyKey(input.ref, payload),
    });
    if ("networkError" in reply) return { outcome: "transient", errorCode: "network_error", errorMessage: reply.networkError };
    if (reply.status !== 200 && reply.status !== 202) return errorResult(reply.status, reply.body);
    const id = text(reply.body.invoiceId);
    if (!id) return { outcome: "transient", errorCode: "accepted_without_id", errorMessage: "Notaas aceitou sem devolver invoiceId" };
    return this.poll(credentials, id);
  }

  // Depois de aceita, a nota nunca perde o ID: qualquer resultado incerto volta como pending.
  private async poll(credentials: FiscalCredentials, id: string): Promise<FiscalResult> {
    for (let i = 0; i < POLL_ATTEMPTS; i++) {
      await this.sleep(POLL_INTERVAL_MS);
      const result = await this.consult(credentials, id);
      if (result.outcome === "authorized" || result.outcome === "rejected") return result;
    }
    return { outcome: "pending", providerRef: id };
  }

  async consult(credentials: FiscalCredentials, providerRef: string): Promise<FiscalResult> {
    const reply = await this.request(credentials, "GET", `/nfe/invoices/${encodeURIComponent(providerRef)}/status`);
    if ("networkError" in reply) return { outcome: "transient", errorCode: "network_error", errorMessage: reply.networkError };
    if (reply.status === 404) return { outcome: "not_found" };
    if (reply.status !== 200) return errorResult(reply.status, reply.body);
    const body = reply.body;
    const tpAmb = text(body.tpAmb);
    if (tpAmb && tpAmb !== TP_AMB[credentials.environment]) {
      return { outcome: "rejected", errorCode: "environment_mismatch", errorMessage: `Projeto Notaas em ambiente ${tpAmb}, configuração em ${credentials.environment}`, providerRef };
    }
    const status = text(body.status);
    if (status === "queued" || status === "processing") return { outcome: "pending", providerRef };
    if (status === "error") {
      return {
        outcome: "rejected", providerRef,
        errorCode: text(body.cStat) ?? text(body.codigoStatus) ?? text(body.errorCode) ?? "error",
        errorMessage: text(body.xMotivo) ?? text(body.motivo) ?? text(body.errorMessage) ?? text(body.message) ?? "Rejeição da SEFAZ sem mensagem",
      };
    }
    if (status !== "issued") {
      // `cancelled`, `inutilized` e qualquer status novo: nunca viram nota autorizada em silêncio.
      return { outcome: "rejected", errorCode: status ?? "status_desconhecido", errorMessage: `Status inesperado da Notaas: ${status}`, providerRef };
    }
    let qrCodeUrl = text(body.qrCode);
    let consultUrl = text(body.urlChave);
    let tpEmis = text(body.tpEmis);
    if (!qrCodeUrl) {
      // O status nem sempre traz o QR Code; o XML autorizado sempre traz (infNFeSupl).
      const xml = await this.request(credentials, "GET", `/nfe/invoices/${encodeURIComponent(providerRef)}/xml`);
      if (!("networkError" in xml) && xml.status === 200) {
        qrCodeUrl = xmlTag(xml.raw, "qrCode");
        consultUrl = consultUrl ?? xmlTag(xml.raw, "urlChave");
        tpEmis = tpEmis ?? xmlTag(xml.raw, "tpEmis");
      }
    }
    return {
      outcome: "authorized", providerRef,
      accessKey: (text(body.chaveAcesso) ?? "").replace(/\D/g, ""), number: text(body.numero), series: text(body.serie),
      protocol: text(body.protocolo), qrCodeUrl, danfeUrl: absolute(body.pdfUrl), xmlUrl: absolute(body.xmlUrl), consultUrl,
      contingency: tpEmis !== null && tpEmis !== "1",
    };
  }

  async cancel(credentials: FiscalCredentials, providerRef: string, justification: string): Promise<FiscalCancelResult> {
    const before = await this.status(credentials, providerRef);
    if (before.outcome !== "ok") return before;
    if (before.status === "cancelled") return { outcome: "cancelled" };
    if (before.status !== "issued") return { outcome: "rejected", errorMessage: `Nota não está emitida na Notaas (${before.status})` };

    const reply = await this.request(credentials, "POST", "/nfe/cancelar", { invoiceId: providerRef, motivo: justification });
    if ("networkError" in reply) return { outcome: "transient", errorMessage: reply.networkError };
    if (reply.status === 429 || reply.status >= 500) return { outcome: "transient", errorMessage: `Notaas respondeu HTTP ${reply.status}` };
    if (reply.status !== 200 && reply.status !== 202) {
      return { outcome: "rejected", errorMessage: text(reply.body.error) ?? text(reply.body.message) ?? `Notaas respondeu HTTP ${reply.status}` };
    }
    for (let i = 0; i < POLL_ATTEMPTS; i++) {
      await this.sleep(POLL_INTERVAL_MS);
      const after = await this.status(credentials, providerRef);
      if (after.outcome === "ok" && after.status === "cancelled") return { outcome: "cancelled" };
    }
    // Próxima rodada começa pela consulta: se já cancelou, fecha; não reenvia por cima.
    return { outcome: "transient", errorMessage: "Cancelamento em processamento na Notaas" };
  }

  private async status(credentials: FiscalCredentials, providerRef: string): Promise<{ outcome: "ok"; status: string | null } | FiscalCancelResult> {
    const reply = await this.request(credentials, "GET", `/nfe/invoices/${encodeURIComponent(providerRef)}/status`);
    if ("networkError" in reply) return { outcome: "transient", errorMessage: reply.networkError };
    if (reply.status === 429 || reply.status >= 500) return { outcome: "transient", errorMessage: `Notaas respondeu HTTP ${reply.status}` };
    if (reply.status !== 200) return { outcome: "rejected", errorMessage: text(reply.body.error) ?? `Notaas respondeu HTTP ${reply.status}` };
    return { outcome: "ok", status: text(reply.body.status) };
  }
}
