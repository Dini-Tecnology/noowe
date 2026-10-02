import type { CustomerOrder, DigitalReceipt } from '../../services/customer-backend';

/**
 * Comprovante de um pedido Quick Service (ADR-013). O Quick não cobra taxa de serviço;
 * o desconto (combo) é a diferença entre subtotal e total que o servidor calculou.
 * Só exibe o que o servidor devolveu — não recalcula valores.
 */
export function quickReceiptFromOrder(order: CustomerOrder): DigitalReceipt {
  const discount = Math.max(0, Math.round((order.subtotal - order.total) * 100) / 100);
  return {
    simulated: false,
    id: order.id,
    restaurantName: order.restaurantName,
    restaurantCnpj: null,
    items: order.items.filter((item) => item.status !== 'cancelled').map((item) => ({
      name: item.name, quantity: item.quantity, unitPrice: item.unitPrice, totalPrice: item.totalPrice,
    })),
    subtotal: order.subtotal,
    serviceFeePercent: 0,
    serviceFee: 0,
    discount,
    discountReason: discount > 0 ? 'Desconto do combo' : null,
    total: order.total,
    tip: 0,
    paymentMethod: null,
    cashback: 0,
    pointsAwarded: 0,
    familyTier: null,
    familyVisitCount: null,
    accessKey: order.pickupCode ? `Pedido ${order.pickupCode}` : order.orderNumber,
    createdAt: order.pickedUpAt ?? order.createdAt,
  };
}
