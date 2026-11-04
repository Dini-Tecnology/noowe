// Mapeamento dos eventos e status do Asaas para a fronteira private.apply_payment_event.
// `outcome` é o enum noowe_payment_status; `gatewayStatus` refina o status do livro-razão.

export type Outcome = "pending" | "confirmed" | "failed" | "refunded" | "refund_pending";
export interface MappedEvent { outcome: Outcome; gatewayStatus?: string }

export function mapAsaasEvent(event: string): MappedEvent | null {
  switch (event) {
    case "PAYMENT_CONFIRMED":
    case "PAYMENT_RECEIVED":
      return { outcome: "confirmed", gatewayStatus: "completed" };
    case "PAYMENT_OVERDUE":
      return { outcome: "failed", gatewayStatus: "expired" };
    case "PAYMENT_DELETED":
      return { outcome: "failed", gatewayStatus: "cancelled" };
    case "PAYMENT_REPROVED_BY_RISK_ANALYSIS":
    case "PAYMENT_CREDIT_CARD_CAPTURE_REFUSED":
      return { outcome: "failed", gatewayStatus: "failed" };
    case "PAYMENT_REFUND_IN_PROGRESS":
      return { outcome: "refund_pending", gatewayStatus: "refund_pending" };
    case "PAYMENT_REFUNDED":
      return { outcome: "refunded", gatewayStatus: "refunded" };
    case "PAYMENT_PARTIALLY_REFUNDED":
      return { outcome: "refunded", gatewayStatus: "partially_refunded" };
    default:
      return null;
  }
}

// Status do objeto payment (usado na reconsulta e no payments-sync).
export function mapAsaasPaymentStatus(status: string): MappedEvent | null {
  switch (status) {
    case "CONFIRMED":
    case "RECEIVED":
    case "RECEIVED_IN_CASH":
      return { outcome: "confirmed", gatewayStatus: "completed" };
    case "OVERDUE":
      return { outcome: "failed", gatewayStatus: "expired" };
    case "REFUNDED":
      return { outcome: "refunded", gatewayStatus: "refunded" };
    case "REFUND_IN_PROGRESS":
      return { outcome: "refund_pending", gatewayStatus: "refund_pending" };
    case "PENDING":
    case "AWAITING_RISK_ANALYSIS":
      return { outcome: "pending", gatewayStatus: "pending" };
    default:
      return null;
  }
}

export function isChargebackEvent(event: string): boolean {
  return event.startsWith("PAYMENT_CHARGEBACK_");
}

export function isAccountStatusEvent(event: string): boolean {
  return event.startsWith("ACCOUNT_STATUS_");
}

// Eventos assinados no webhook de cada subconta: o que payments-webhook-asaas sabe tratar.
export const ACCOUNT_WEBHOOK_EVENTS = [
  "PAYMENT_CONFIRMED", "PAYMENT_RECEIVED", "PAYMENT_OVERDUE", "PAYMENT_DELETED",
  "PAYMENT_REPROVED_BY_RISK_ANALYSIS", "PAYMENT_CREDIT_CARD_CAPTURE_REFUSED",
  "PAYMENT_REFUND_IN_PROGRESS", "PAYMENT_REFUNDED", "PAYMENT_PARTIALLY_REFUNDED", "PAYMENT_REFUND_DENIED",
  "PAYMENT_CHARGEBACK_REQUESTED", "PAYMENT_CHARGEBACK_DISPUTE", "PAYMENT_AWAITING_CHARGEBACK_REVERSAL",
  "ACCOUNT_STATUS_GENERAL_APPROVAL_APPROVED", "ACCOUNT_STATUS_GENERAL_APPROVAL_REJECTED",
  "ACCOUNT_STATUS_GENERAL_APPROVAL_PENDING", "ACCOUNT_STATUS_GENERAL_APPROVAL_AWAITING_APPROVAL",
];
