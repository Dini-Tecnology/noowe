import {
  closedQueueMessage,
  isActiveWaitlistStatus,
  pastWaitlistEntries,
  waitlistErrorMessage,
  waitlistPreferenceOptions,
  waitlistStatusLabel,
} from '../screens/production/waitlist-ui';

describe('waitlist statuses are shown in Portuguese', () => {
  it.each([
    ['waiting', 'Na fila'],
    ['called', 'Chamado'],
    ['seated', 'Acomodado'],
    ['cancelled', 'Cancelada'],
    ['no_show', 'Não compareceu'],
  ])('%s → %s', (status, label) => {
    expect(waitlistStatusLabel(status)).toBe(label);
  });

  it('never leaks an unknown enum value to the screen', () => {
    expect(waitlistStatusLabel('some_future_status')).toBe('Encerrada');
  });
});

describe('only waiting and called entries hold a spot in the queue', () => {
  it.each([
    ['waiting', true],
    ['called', true],
    ['seated', false],
    ['cancelled', false],
    ['no_show', false],
  ])('%s → %s', (status, active) => {
    expect(isActiveWaitlistStatus(status)).toBe(active);
  });
});

describe('waitlist RPC errors are translated', () => {
  it.each([
    ['Already on waitlist', 'Você já está na fila deste restaurante.'],
    ['Waitlist is unavailable for this restaurant', 'A fila virtual não está disponível neste restaurante agora.'],
    ['Waitlist entry cannot be updated', 'Sua entrada na fila já foi encerrada. Puxe para atualizar.'],
    ['Restaurant is closed', 'O restaurante está fechado agora. A fila abre junto com o restaurante.'],
  ])('%s', (message, translated) => {
    expect(waitlistErrorMessage(new Error(message))).toBe(translated);
  });

  it('accepts PostgREST error objects that are not Error instances', () => {
    expect(waitlistErrorMessage({ message: 'Already on waitlist', code: '23505' }))
      .toBe('Você já está na fila deste restaurante.');
  });

  it('falls back to a generic Portuguese message', () => {
    expect(waitlistErrorMessage(new Error('Network request failed')))
      .toBe('Não foi possível concluir. Verifique sua conexão e tente novamente.');
  });
});

describe('closed restaurant: the queue opens with the restaurant', () => {
  const at = (hours: number, minutes = 0) => new Date(2026, 8, 25, hours, minutes);

  it('quotes today\'s opening time while it is still ahead', () => {
    expect(closedQueueMessage('19:00', at(15, 8))).toBe('A fila virtual abre junto com o restaurante, hoje às 19:00.');
  });

  it('does not quote an opening time that already passed today', () => {
    expect(closedQueueMessage('12:00', at(23, 30)))
      .toBe('A fila virtual abre junto com o restaurante. Volte no horário de funcionamento.');
  });

  it('falls back when the restaurant has no hours for today', () => {
    expect(closedQueueMessage(null, at(10)))
      .toBe('A fila virtual abre junto com o restaurante. Volte no horário de funcionamento.');
  });
});

describe('pastWaitlistEntries — histórico só do restaurante da tela', () => {
  const entry = (id: string, restaurantId: string, status: string) => ({ id, restaurantId, status });

  it('restaurante novo para o cliente não herda cancelamentos de outros restaurantes', () => {
    const entries = [entry('1', 'bistro', 'cancelled'), entry('2', 'atelier', 'no_show'), entry('3', 'atelier', 'seated')];
    expect(pastWaitlistEntries(entries, 'parrilaria')).toEqual([]);
  });

  it('mostra só as encerradas do próprio restaurante, sem a ativa', () => {
    const entries = [
      entry('1', 'parrilaria', 'waiting'),
      entry('2', 'parrilaria', 'cancelled'),
      entry('3', 'bistro', 'cancelled'),
      entry('4', 'parrilaria', 'seated'),
    ];
    expect(pastWaitlistEntries(entries, 'parrilaria').map((e) => e.id)).toEqual(['2', '4']);
  });

  it('limita a 5 e tolera dados/restaurante ausentes', () => {
    const many = Array.from({ length: 8 }, (_, i) => entry(String(i), 'r1', 'cancelled'));
    expect(pastWaitlistEntries(many, 'r1')).toHaveLength(5);
    expect(pastWaitlistEntries(undefined, 'r1')).toEqual([]);
    expect(pastWaitlistEntries(many, undefined)).toEqual([]);
  });
});

describe('waitlist preference = setores do mapa de mesas', () => {
  it('lista os setores do restaurante e termina com "Qualquer"', () => {
    expect(waitlistPreferenceOptions(['Rooftop', 'Salão Principal', 'Varanda'])).toEqual([
      { id: 'Rooftop', label: 'Rooftop' },
      { id: 'Salão Principal', label: 'Salão Principal' },
      { id: 'Varanda', label: 'Varanda' },
      { id: 'qualquer', label: 'Qualquer' },
    ]);
  });

  it('sem setores cadastrados só resta "Qualquer"', () => {
    expect(waitlistPreferenceOptions([])).toEqual([{ id: 'qualquer', label: 'Qualquer' }]);
    expect(waitlistPreferenceOptions(undefined)).toEqual([{ id: 'qualquer', label: 'Qualquer' }]);
  });

  it('ignora vazios, repetidos e um setor chamado "qualquer"', () => {
    expect(waitlistPreferenceOptions(['Varanda', ' varanda ', '', '  ', 'Qualquer']).map((o) => o.id)).toEqual([
      'Varanda',
      'qualquer',
    ]);
  });

  it('explica em português quando o setor deixou de existir', () => {
    expect(waitlistErrorMessage(new Error('Setor indisponível neste restaurante'))).toBe(
      'Esse setor não está mais disponível. Escolha outro ou "Qualquer".',
    );
  });
});
