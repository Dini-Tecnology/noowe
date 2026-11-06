import type { ReceiptFiscal } from '../../services/receipt-fiscal';

/** O app só traduz a situação que o servidor devolveu; não decide nada sobre a nota. */
export function fiscalNotice(fiscal: ReceiptFiscal): { title: string; detail: string } {
  switch (fiscal.status) {
    case 'authorized':
      return {
        title: `NFC-e nº ${fiscal.number ?? '—'} · Série ${fiscal.series ?? '—'}`,
        detail: fiscal.homologation
          ? 'Ambiente de teste · Sem valor fiscal'
          : fiscal.contingency ? 'Emitida em contingência · Será transmitida à SEFAZ' : 'Autorizada pela SEFAZ',
      };
    case 'issuing':
      return { title: 'Nota fiscal em emissão', detail: 'Ela aparece aqui assim que for autorizada.' };
    case 'awaiting_close':
      return { title: 'Nota fiscal no fechamento da conta', detail: 'Ela é emitida quando toda a conta for paga.' };
    case 'external':
      return { title: 'Nota fiscal com o restaurante', detail: 'Solicite a nota ao restaurante. Ele emite pelo sistema fiscal próprio.' };
    case 'delayed':
      return { title: 'Nota fiscal pendente', detail: 'A emissão atrasou. Este comprovante ainda não tem valor fiscal.' };
    default:
      return { title: 'Comprovante da conta', detail: 'Sem valor fiscal' };
  }
}

/** Situações que ainda podem mudar sem ação do cliente. */
export function fiscalIsSettling(fiscal: ReceiptFiscal): boolean {
  return fiscal.status === 'issuing' || fiscal.status === 'awaiting_close';
}
