import { userErrorMessage } from '@okinawa/shared/utils/user-error-message';
import type { V2Table } from './useRestaurantOperations';

/** Mesa livre e principal: pode receber um grupo (troca) ou uma reserva. */
export function isFreeRoot(table: V2Table): boolean {
  return table.status === 'available' && !table.sessionId && !table.mergedIntoId;
}

export type LayoutCandidate = { id: string; label: string; seats: number; section: string; fits: boolean };

/** Destinos de uma troca: mesas livres que comportam `needed` pessoas vêm primeiro. */
export function swapCandidates(tables: V2Table[], opts: { excludeId?: string | null; needed: number }): LayoutCandidate[] {
  return tables
    .filter((table) => isFreeRoot(table) && table.id !== opts.excludeId)
    .map((table) => ({
      id: table.id,
      label: table.label,
      seats: table.effectiveSeats,
      section: table.section,
      fits: table.effectiveSeats >= opts.needed,
    }))
    .sort((a, b) => Number(b.fits) - Number(a.fits) || a.seats - b.seats || a.label.localeCompare(b.label, 'pt-BR', { numeric: true }));
}

/** Mesas que podem ser unidas à principal: livres, sozinhas (junção de um nível só). */
export function joinCandidates(tables: V2Table[], mainId: string): LayoutCandidate[] {
  return tables
    .filter((table) => isFreeRoot(table) && table.id !== mainId && table.mergedChildren.length === 0)
    .map((table) => ({ id: table.id, label: table.label, seats: table.seats, section: table.section, fits: true }))
    .sort((a, b) => a.section.localeCompare(b.section, 'pt-BR') || a.label.localeCompare(b.label, 'pt-BR', { numeric: true }));
}

/** Capacidade do grupo depois de unir `picked` à principal. */
export function groupCapacity(main: Pick<V2Table, 'effectiveSeats'>, picked: Pick<LayoutCandidate, 'seats'>[]): number {
  return main.effectiveSeats + picked.reduce((sum, candidate) => sum + candidate.seats, 0);
}

/** Mensagem para os erros do servidor na reorganização do salão (ADR-018). */
export function describeLayoutError(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;
  const message = (error as { message?: string } | null)?.message ?? '';
  if (code === 'P0013') return 'Esta mesa está unida a outra. Use a mesa principal ou separe a junção.';
  if (code === 'P0014') return /junção/i.test(message) && message.length < 120 ? message : 'A mesa escolhida não está livre ou não pode ser usada nesta operação.';
  if (code === 'P0015') return message || 'A mesa escolhida não comporta o grupo.';
  if (code === '42501') return 'Seu papel não pode reorganizar as mesas deste restaurante.';
  if (code === '23514') return 'Outra pessoa da equipe já decidiu esta solicitação.';
  if (code === 'P0004') return 'O cliente tem conta em aberto em outra mesa. Peça para ele quitar antes de entrar.';
  return userErrorMessage(error, 'Não foi possível concluir a operação.');
}
