import { asaasValueToCents } from "./money.ts";
import type { AsaasPayment } from "./types.ts";

// Quanto o provedor já registra como devolvido ou a caminho nesta cobrança, em centavos.
export function refundedAtProvider(charge: AsaasPayment, onlyDone: boolean): number {
  return (charge.refunds ?? [])
    .filter((r) => (onlyDone ? r.status === "DONE" : r.status !== "CANCELLED"))
    .reduce((sum, r) => sum + asaasValueToCents(r.value), 0);
}
