import { centsToAsaasValue } from "./money.ts";
import type {
  AsaasChargeInput, AsaasCustomerInput, AsaasPayment, AsaasPix, PaymentProvider,
} from "./types.ts";

export class AsaasError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export interface AsaasClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
}

// Cliente REST do Asaas v3. Só GET/DELETE são repetidos em 5xx/429: repetir um POST de
// criação poderia duplicar a cobrança, então quem cria recupera por externalReference.
export class AsaasClient implements PaymentProvider {
  private fetchImpl: typeof fetch;
  private timeoutMs: number;
  private maxRetries: number;
  private sleep: (ms: number) => Promise<void>;
  private opts: AsaasClientOptions;
  constructor(opts: AsaasClientOptions) {
    this.opts = opts;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 10_000;
    this.maxRetries = opts.maxRetries ?? 2;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  private async request<T>(apiKey: string, method: string, path: string, body?: unknown): Promise<T> {
    const retriable = method === "GET" || method === "DELETE";
    for (let attempt = 0; ; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await this.fetchImpl(`${this.opts.baseUrl}${path}`, {
          method,
          headers: { access_token: apiKey, "Content-Type": "application/json", "User-Agent": "noowe-payments/1.0" },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
        });
        const text = await res.text();
        const parsed = text ? JSON.parse(text) : null;
        if (res.ok) return parsed as T;
        if (retriable && (res.status >= 500 || res.status === 429) && attempt < this.maxRetries) {
          await this.sleep(200 * 2 ** attempt);
          continue;
        }
        throw new AsaasError(res.status, parsed, `Asaas ${method} ${path} -> ${res.status}`);
      } catch (err) {
        if (err instanceof AsaasError) throw err;
        if (retriable && attempt < this.maxRetries) { await this.sleep(200 * 2 ** attempt); continue; }
        throw new AsaasError(0, null, `Asaas ${method} ${path} falhou: ${(err as Error).message}`);
      } finally {
        clearTimeout(timer);
      }
    }
  }

  createCustomer(apiKey: string, input: AsaasCustomerInput) {
    return this.request<{ id: string }>(apiKey, "POST", "/customers", {
      name: input.name, cpfCnpj: input.cpfCnpj, email: input.email ?? undefined,
      mobilePhone: input.mobilePhone ?? undefined, externalReference: input.externalReference,
      notificationDisabled: true,
    });
  }

  createCharge(apiKey: string, input: AsaasChargeInput) {
    return this.request<AsaasPayment>(apiKey, "POST", "/payments", {
      customer: input.customer,
      billingType: input.billingType,
      value: centsToAsaasValue(input.valueCents),
      dueDate: input.dueDate,
      externalReference: input.externalReference,
      description: input.description,
      split: input.split && input.split.feeCents > 0
        ? [{ walletId: input.split.walletId, fixedValue: centsToAsaasValue(input.split.feeCents) }]
        : undefined,
      callback: input.successUrl && !input.creditCardToken ? { successUrl: input.successUrl, autoRedirect: true } : undefined,
      creditCardToken: input.creditCardToken ?? undefined,
      remoteIp: input.creditCardToken ? input.remoteIp ?? undefined : undefined,
    });
  }

  async findChargeByExternalRef(apiKey: string, externalReference: string) {
    const res = await this.request<{ data: AsaasPayment[] }>(
      apiKey, "GET", `/payments?externalReference=${encodeURIComponent(externalReference)}&limit=1`);
    return res.data?.[0] ?? null;
  }

  getCharge(apiKey: string, id: string) {
    return this.request<AsaasPayment>(apiKey, "GET", `/payments/${encodeURIComponent(id)}`);
  }

  getPixQrCode(apiKey: string, id: string) {
    return this.request<AsaasPix>(apiKey, "GET", `/payments/${encodeURIComponent(id)}/pixQrCode`);
  }

  async cancelCharge(apiKey: string, id: string) {
    await this.request<unknown>(apiKey, "DELETE", `/payments/${encodeURIComponent(id)}`);
  }

  async refund(apiKey: string, id: string, valueCents: number, description?: string) {
    await this.request<unknown>(apiKey, "POST", `/payments/${encodeURIComponent(id)}/refund`, {
      value: centsToAsaasValue(valueCents), description,
    });
  }
}
