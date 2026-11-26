/**
 * "Conta" no mapa de mesas (resposta 86): consumo e quanto falta pagar, como o servidor mandou.
 * O Maître não recebe valores: vê "Pagamento parcial" quando parte da conta já foi paga.
 */
import { formatTableLabel } from './tableLabel';

export type TableBillView = { totalSpent: number; remainingCents?: number | null; spentHidden: boolean; partialPayment?: boolean; sessionId?: string | null };

const brl = (reais: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(reais);

export function tableBillLines(table: TableBillView): string[] {
  if (table.spentHidden) return table.partialPayment ? ['Pagamento parcial'] : [];
  const consumption = `Consumo ${brl(table.totalSpent)}`;
  if (table.remainingCents == null) return [consumption];
  return [consumption, `Falta ${brl(table.remainingCents / 100)}`];
}

export function tableBillLabel(table: TableBillView): string | null {
  const lines = tableBillLines(table);
  return lines.length ? lines.join(' · ') : null;
}

// Rótulos do leitor de tela: partes vazias saem da frase, para nunca anunciar ", ," nem omitir pessoas e consumo.
const people = (n: number) => `${n} ${n === 1 ? 'pessoa' : 'pessoas'}`;

export function tableCellA11yLabel(
  table: TableBillView & { label: string; guestName?: string | null; section?: string | null; guests: number; reservationGuests: number; effectiveSeats: number; mergedIntoLabel?: string | null },
  statusLabel: string,
): string {
  const count = table.sessionId ? table.guests : table.reservationGuests;
  return [
    formatTableLabel(table.label),
    statusLabel.toLowerCase(),
    table.guestName || table.section,
    count > 0 ? people(count) : null,
    `${table.effectiveSeats} lugares`,
    ...(table.sessionId ? tableBillLines(table) : []),
    table.mergedIntoLabel ? `unida à mesa ${table.mergedIntoLabel}` : null,
  ].filter(Boolean).join(', ');
}

export function waiterTableA11yLabel(
  table: TableBillView & { tableNumber: string; guestName?: string | null; guestCount: number; seats: number; pendingOrders: number },
  isOccupied: boolean,
  openCallCount: number,
  hasReadyPlate: boolean,
): string {
  return [
    formatTableLabel(table.tableNumber),
    table.guestName || (isOccupied ? 'ocupada' : 'livre'),
    table.guestCount > 0 ? people(table.guestCount) : `${table.seats} lugares`,
    `${table.pendingOrders} ${table.pendingOrders === 1 ? 'pedido' : 'pedidos'}`,
    ...tableBillLines(table),
    openCallCount > 0 ? `${openCallCount} ${openCallCount === 1 ? 'chamado aberto' : 'chamados abertos'}` : null,
    hasReadyPlate ? 'prato pronto' : null,
  ].filter(Boolean).join(', ');
}
