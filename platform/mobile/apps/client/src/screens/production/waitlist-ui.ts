/** Waitlist statuses as stored in `waitlist_entries_status_enum`. */
export const WAITLIST_STATUS_LABELS: Record<string, string> = {
  waiting: 'Na fila',
  called: 'Chamado',
  seated: 'Acomodado',
  cancelled: 'Cancelada',
  no_show: 'Não compareceu',
};

/** Statuses in which the customer still holds a spot — the screen shows the live card. */
export const ACTIVE_WAITLIST_STATUSES = ['waiting', 'called'];

export function waitlistStatusLabel(status: string): string {
  return WAITLIST_STATUS_LABELS[status] ?? 'Encerrada';
}

export function isActiveWaitlistStatus(status: string): boolean {
  return ACTIVE_WAITLIST_STATUSES.includes(status);
}

/** Valor que o servidor aceita para "sem preferência de setor". */
export const ANY_SECTION = 'qualquer';

export interface WaitlistPreferenceOption {
  id: string;
  label: string;
}

/**
 * "Preferência" da fila = os setores que o restaurante cadastrou no mapa de mesas
 * (ex.: Rooftop, Salão Principal, Varanda), mais "Qualquer". O id de um setor é o próprio
 * nome, que é o que o servidor valida e grava.
 */
export function waitlistPreferenceOptions(sections: readonly string[] | undefined): WaitlistPreferenceOption[] {
  const seen = new Set<string>();
  const options: WaitlistPreferenceOption[] = [];
  for (const raw of sections ?? []) {
    const name = raw.trim();
    const key = name.toLowerCase();
    if (!name || key === ANY_SECTION || seen.has(key)) continue;
    seen.add(key);
    options.push({ id: name, label: name });
  }
  options.push({ id: ANY_SECTION, label: 'Qualquer' });
  return options;
}

const MAX_PAST_ENTRIES = 5;

/**
 * "Histórico nesta fila": só as entradas já encerradas do restaurante desta
 * tela. Cancelamentos de outros restaurantes não têm contexto aqui, e uma
 * entrada ativa em outro lugar aparece na própria página dele. Restaurante novo
 * para o cliente = lista vazia.
 */
export function pastWaitlistEntries<T extends { restaurantId: string; status: string }>(
  entries: readonly T[] | undefined,
  restaurantId: string | undefined,
): T[] {
  if (!restaurantId) return [];
  return (entries ?? [])
    .filter((entry) => entry.restaurantId === restaurantId && !isActiveWaitlistStatus(entry.status))
    .slice(0, MAX_PAST_ENTRIES);
}

/**
 * Shown instead of the join form while the restaurant is closed. `opensAt` is
 * today's opening time ("HH:MM") even after today's shift has ended, so it is
 * only quoted while it is still ahead.
 */
export function closedQueueMessage(opensAt: string | null, now: Date = new Date()): string {
  const current = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return opensAt && opensAt > current
    ? `A fila virtual abre junto com o restaurante, hoje às ${opensAt}.`
    : 'A fila virtual abre junto com o restaurante. Volte no horário de funcionamento.';
}

// The waitlist RPCs raise English messages; the customer only ever sees these.
const WAITLIST_ERROR_MESSAGES: [RegExp, string][] = [
  [/restaurant is closed/i, 'O restaurante está fechado agora. A fila abre junto com o restaurante.'],
  [/already on waitlist/i, 'Você já está na fila deste restaurante.'],
  [/waitlist is unavailable/i, 'A fila virtual não está disponível neste restaurante agora.'],
  [/cannot be updated/i, 'Sua entrada na fila já foi encerrada. Puxe para atualizar.'],
  [/invalid party size/i, 'Quantidade de pessoas inválida.'],
  [/setor indispon/i, 'Esse setor não está mais disponível. Escolha outro ou "Qualquer".'],
  [/authentication required/i, 'Entre na sua conta para usar a fila virtual.'],
];

export function waitlistErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error
    ? String((error as { message: unknown }).message)
    : '';
  const match = WAITLIST_ERROR_MESSAGES.find(([pattern]) => pattern.test(message));
  return match ? match[1] : 'Não foi possível concluir. Verifique sua conexão e tente novamente.';
}
