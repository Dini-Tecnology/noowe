import { timingSafeEqual } from "./crypto.ts";
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
    case "42501": return { status: 403, error: "forbidden" };
    case "22023": return { status: 400, error: "invalid_request" };
    case "P0002": return { status: 404, error: "not_found" };
    case "P0001": return { status: 409, error: "payment_not_allowed" };
    case "P0007": return { status: 409, error: "payments_unavailable" };
    // A conta mudou desde a divisão, ou já foi quitada (ADR-032).
    case "P0011":
    case "P0012": return { status: 409, error: "bill_changed" };
    case "23514": return { status: 422, error: "invalid_amount" };
    default: return { status: 500, error: "internal_error" };
  }
}

// O gateway valida a assinatura do JWT (verify_jwt = true); aqui só conferimos o papel.
export function isServiceRole(token: string, serviceKey: string): boolean {
  if (!token) return false;
  if (serviceKey && timingSafeEqual(token, serviceKey)) return true;
  try {
    const encoded = token.split(".")[1];
    if (!encoded) return false;
    const padded = encoded.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(encoded.length / 4) * 4, "=");
    return JSON.parse(atob(padded)).role === "service_role";
  } catch {
    return false;
  }
}
