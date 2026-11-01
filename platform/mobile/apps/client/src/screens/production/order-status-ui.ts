import type { CustomerOrderStatus } from '../../services/customer-backend';

export const STATUS_LABELS: Record<CustomerOrderStatus, string> = {
  pending: 'Recebido', confirmed: 'Confirmado', preparing: 'Preparando',
  ready: 'Pronto', delivered: 'Entregue', completed: 'Concluído', cancelled: 'Cancelado',
};

export const STATUS_COLORS: Record<CustomerOrderStatus, string> = {
  pending: '#EA580C', confirmed: '#EA580C', preparing: '#D97706',
  ready: '#16A34A', delivered: '#64748B', completed: '#64748B', cancelled: '#DC2626',
};
