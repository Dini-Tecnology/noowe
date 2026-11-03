import { orderStatusLabel } from '@okinawa/shared/utils/status-label';
import type { CustomerOrderStatus } from '../../services/customer-backend';

export const STATUS_LABELS: Record<CustomerOrderStatus, string> = {
  pending: orderStatusLabel('pending'), confirmed: orderStatusLabel('confirmed'), preparing: orderStatusLabel('preparing'),
  ready: orderStatusLabel('ready'), delivered: orderStatusLabel('delivered'), completed: orderStatusLabel('completed'),
  cancelled: orderStatusLabel('cancelled'),
};

export const STATUS_COLORS: Record<CustomerOrderStatus, string> = {
  pending: '#EA580C', confirmed: '#EA580C', preparing: '#D97706',
  ready: '#16A34A', delivered: '#64748B', completed: '#64748B', cancelled: '#DC2626',
};
