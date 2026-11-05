const formatCents = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);

/** Texto do aviso de encerrar comanda. O saldo vem do servidor; sem ele, não se afirma valor nenhum. */
export function closeAccountMessage(tableLabel: string, balanceCents: number | null): string {
  const situation = balanceCents === null
    ? `A mesa ${tableLabel} está com a comanda aberta.`
    : balanceCents > 0
      ? `A mesa ${tableLabel} ainda tem ${formatCents(balanceCents)} em aberto.`
      : `A conta da mesa ${tableLabel} está sem saldo em aberto.`;
  return `${situation} O cliente é avisado e a mesa fica aguardando liberação. Informe o motivo.`;
}
