import { asaasValueToCents } from "./money.ts";
import type { AsaasPayment } from "./types.ts";

// Quanto o provedor já registra como devolvido ou a caminho nesta cobrança, em centavos.
export function refundedAtProvider(charge: AsaasPayment, onlyDone: boolean): number {
  return (charge.refunds ?? [])
    .filter((r) => (onlyDone ? r.status === "DONE" : r.status !== "CANCELLED"))
    .reduce((sum, r) => sum + asaasValueToCents(r.value), 0);
}

// Quanto do split desta carteira saiu dela: devolvido em estorno DONE com done = true (todos os estornos da cobrança),
// ou o split inteiro, quando o Asaas o cancelou porque ainda aguardava crédito (spike de cartão, ADR-031).
export function splitReturnedAtProvider(charge: AsaasPayment, walletId: string | undefined): number {
  const mine = (charge.split ?? []).filter((s) => !walletId || s.walletId === walletId);
  const cancelled = mine.filter((s) => s.status === "CANCELLED" || s.status === "REFUNDED")
    .reduce((sum, s) => sum + asaasValueToCents(s.totalValue ?? s.fixedValue ?? 0), 0);
  if (cancelled > 0) return cancelled;
  const splitIds = new Set(mine.map((s) => s.id).filter(Boolean));
  return (charge.refunds ?? [])
    .filter((r) => r.status === "DONE")
    .flatMap((r) => r.refundedSplits ?? r.splitRefunds ?? [])
    .filter((s) => s.done === true && (!walletId || s.walletId === walletId || splitIds.has(s.splitId ?? s.id)))
    .reduce((sum, s) => sum + asaasValueToCents(s.value), 0);
}

// Split da carteira da NOOWE nesta cobrança, para o splitRefunds. Nunca devolve mais do que o split que existe.
export function nooweSplitToReturn(charge: AsaasPayment, walletId: string | undefined, wantedCents: number): { id: string; value: number } | null {
  if (!walletId || wantedCents <= 0) return null;
  const split = (charge.split ?? []).find((s) => s.walletId === walletId && s.id);
  if (!split?.id) return null;
  const available = asaasValueToCents(split.totalValue ?? split.fixedValue ?? 0);
  return { id: split.id, value: available > 0 ? Math.min(available, wantedCents) : wantedCents };
}
