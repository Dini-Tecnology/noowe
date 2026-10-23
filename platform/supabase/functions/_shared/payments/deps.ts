import type { PaymentProvider } from "./types.ts";

export interface RpcResult { data: any; error: { code?: string; message: string } | null }

// Tudo que os handlers tocam fora do processo entra por aqui, para testar sem rede nem banco.
export interface PaymentDeps {
  rpc(fn: string, args: Record<string, unknown>): Promise<RpcResult>;
  getUser(token: string): Promise<{ id: string } | null>;
  provider: PaymentProvider;
  env(name: string): string | undefined;
  now?(): Date;
}

export function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export function bearer(req: Request): string {
  return (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
}

// Data civil de hoje em São Paulo (dueDate do Asaas).
export function saoPauloDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
}

export function mapRpcError(code?: string): { status: number; error: string } {
  switch (code) {
    case "28000": return { status: 401, error: "unauthorized" };
    case "22023": return { status: 400, error: "invalid_request" };
    case "P0002": return { status: 404, error: "not_found" };
    case "P0001": return { status: 409, error: "payment_not_allowed" };
    case "P0007": return { status: 409, error: "payments_unavailable" };
    case "23514": return { status: 422, error: "invalid_amount" };
    default: return { status: 500, error: "internal_error" };
  }
}
