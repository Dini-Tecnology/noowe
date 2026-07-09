import { CreditCard, Clock, CheckCircle } from 'lucide-react-native';
import { formatCurrency } from '@okinawa/shared/utils/formatters';
import { V2ListScreen, type V2ListItem } from './shared/V2ListScreen';
import { useTableBills } from './shared/useRestaurantOperations';

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: 'Dinheiro',
  credit_card: 'Cartão de crédito',
  debit_card: 'Cartão de débito',
  pix: 'Pix',
  wallet: 'Carteira digital',
  voucher: 'Voucher',
  other: 'Outro',
};

export default function OrderPaymentScreen() {
  const { data: bills, loading, error } = useTableBills();

  const items: V2ListItem[] = loading
    ? [{ icon: Clock, label: 'Carregando pagamentos…' }]
    : error
      ? [{ icon: Clock, label: 'Não foi possível carregar os pagamentos', subtitle: error }]
      : bills.length === 0
        ? [{ icon: CheckCircle, label: 'Nenhuma conta em aberto nas últimas 24h' }]
        : bills.map((bill) => ({
            icon: bill.isPaid ? CheckCircle : CreditCard,
            label: `Mesa ${bill.tableNumber} · ${formatCurrency(bill.totalAmount)}`,
            subtitle: bill.isPaid
              ? `Pago · ${bill.paymentMethod ? PAYMENT_METHOD_LABEL[bill.paymentMethod] ?? bill.paymentMethod : ''}`
              : bill.paymentMethod
                ? `${PAYMENT_METHOD_LABEL[bill.paymentMethod] ?? bill.paymentMethod} pendente`
                : 'Aguardando fechamento',
          }));

  return <V2ListScreen title="Pagamentos" subtitle="Rastreio de cobranças" showBack items={items} />;
}
