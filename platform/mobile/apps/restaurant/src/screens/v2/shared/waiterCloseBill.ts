type WaiterCloseBillTable = {
  status: string;
  totalSpent: number;
  spentHidden?: boolean;
};

/**
 * "Fechar conta" do Garçom leva à aba Cobrar, que lista só as mesas dele.
 * Mesa de outro garçom (valor escondido pelo servidor) não tem o botão: ele levaria a uma lista sem ela.
 */
export function waiterCanCloseBill(table: WaiterCloseBillTable): boolean {
  if (table.spentHidden) return false;
  return table.status === 'occupied' || table.status === 'payment' || table.totalSpent > 0;
}
