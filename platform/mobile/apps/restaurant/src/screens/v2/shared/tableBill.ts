/**
 * "Conta" no mapa de mesas (resposta 86): consumo e quanto falta pagar, como o servidor mandou.
 * O Maître não recebe valores: vê "Pagamento parcial" quando parte da conta já foi paga.
 */
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
