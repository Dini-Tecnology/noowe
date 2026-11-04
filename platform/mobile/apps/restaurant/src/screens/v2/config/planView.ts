import type { PlanOption } from '@okinawa/shared/services/supabase-api';

export const formatCents = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
export const formatDate = (value: string) => new Date(value.length === 10 ? `${value}T12:00:00` : value).toLocaleDateString('pt-BR');

export const FEATURE_LABELS: Record<string, string> = {
  menu: 'Cardápio', app_ordering: 'Pedido pelo app', app_payment: 'Pagamento pelo app', self_service: 'Autoatendimento', waiter_app: 'App do garçom',
  bill_split: 'Divisão de conta', reservations: 'Reservas', waitlist: 'Fila', loyalty: 'Fidelidade', assisted_onboarding: 'Implantação assistida',
  nfce: 'NFC-e', ai: 'IA', delivery_integrations: 'Integrações de delivery', priority_support: 'Suporte prioritário', tap_to_pay: 'Tap to Pay',
};

export const INVOICE_STATUS: Record<string, string> = { open: 'Em aberto', overdue: 'Em atraso', paid: 'Paga', void: 'Cancelada' };

/** Para o texto da troca. Quem decide de fato é o servidor. */
export function planChangeKind(plans: PlanOption[], from: string | undefined, to: string): 'upgrade' | 'downgrade' {
  const order = plans.map((plan) => plan.code);
  return order.indexOf(to) > order.indexOf(from ?? '') ? 'upgrade' : 'downgrade';
}

export function usagePercent(used: number, allowance: number | null): number {
  if (!allowance) return 0;
  return Math.min(100, Math.round((used * 100) / allowance));
}
