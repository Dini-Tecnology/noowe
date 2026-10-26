import { closedCaption, openLabel, opensWhenLabel, restaurantEntryState } from '../screens/production/casual-dining-ui';
import { shouldShowActiveTableBar } from '../components/table/ActiveTableBar';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const status = (over: Record<string, unknown> = {}) => ({
  restaurantId: 'r1', isOpen: true, opensAt: null, closesAt: '23:59', groupsWaiting: 0, estimatedWaitMinutes: 0,
  occupancyLevel: 'baixa', occupancyRatio: 0.2, occupancyPercent: 20, tablesTotal: 10, tablesOccupied: 2, tablesAvailable: 8,
  ...over,
}) as any;

describe('restaurantEntryState (ADR-021)', () => {
  it('aberto com mesa livre: porta do QR em destaque', () => {
    expect(restaurantEntryState({ activeHere: false, activeElsewhere: false, status: status() })).toBe('open');
  });

  it('lotado: a saída é a fila', () => {
    expect(restaurantEntryState({
      activeHere: false, activeElsewhere: false, status: status({ tablesAvailable: 0, tablesOccupied: 10 }),
    })).toBe('full');
  });

  it('fechado vence a lotação: só Reservar fica ativo', () => {
    expect(restaurantEntryState({
      activeHere: false, activeElsewhere: false, status: status({ isOpen: false, opensAt: '19:00', tablesAvailable: 0 }),
    })).toBe('closed');
  });

  it('comanda neste restaurante vence tudo, inclusive fechado', () => {
    expect(restaurantEntryState({
      activeHere: true, activeElsewhere: false, status: status({ isOpen: false }),
    })).toBe('in_comanda_here');
  });

  it('comanda em outro restaurante bloqueia as portas aqui', () => {
    expect(restaurantEntryState({ activeHere: false, activeElsewhere: true, status: status() })).toBe('in_comanda_elsewhere');
  });

  it('sem status ainda, não bloqueia', () => {
    expect(restaurantEntryState({ activeHere: false, activeElsewhere: false, status: undefined })).toBe('open');
  });
});

describe('próxima abertura de um restaurante fechado', () => {
  const closed = (over: Record<string, unknown>) => status({ isOpen: false, ...over });

  it('hoje, amanhã e dias depois (com o dia da semana)', () => {
    expect(opensWhenLabel(closed({ opensAt: '19:00', opensInDays: 0, opensWeekday: 1 }))).toBe('às 19:00');
    expect(opensWhenLabel(closed({ opensAt: '10:00', opensInDays: 1, opensWeekday: 2 }))).toBe('amanhã às 10:00');
    expect(opensWhenLabel(closed({ opensAt: '19:00', opensInDays: 4, opensWeekday: 5 }))).toBe('sex às 19:00');
    expect(opensWhenLabel(closed({ opensAt: '12:30', opensInDays: 6, opensWeekday: 0 }))).toBe('dom às 12:30');
  });

  it('sem dias no payload antigo, assume hoje; aberto ou sem horário não tem texto', () => {
    expect(opensWhenLabel(closed({ opensAt: '19:00' }))).toBe('às 19:00');
    expect(opensWhenLabel(status({ isOpen: true }))).toBeNull();
    expect(opensWhenLabel(closed({ opensAt: null }))).toBeNull();
  });

  it('a legenda das portas e o card de status usam o mesmo texto', () => {
    const tomorrow = closed({ opensAt: '10:00', opensInDays: 1, opensWeekday: 2 });
    expect(closedCaption(tomorrow)).toBe('Abre amanhã às 10:00');
    expect(openLabel(tomorrow)).toBe('Fechado · abre amanhã às 10:00');
    expect(openLabel(closed({ opensAt: null }))).toBe('Fechado agora');
  });
});

describe('closedCaption', () => {
  it('mostra "Abre às HH:MM" ou apenas "Fechado" quando não há próximo horário hoje', () => {
    expect(closedCaption(status({ isOpen: false, opensAt: '19:00' }))).toBe('Abre às 19:00');
    expect(closedCaption(status({ isOpen: false, opensAt: null }))).toBe('Fechado');
  });
});

describe('shouldShowActiveTableBar', () => {
  it('sem comanda ativa nunca aparece', () => {
    expect(shouldShowActiveTableBar({ name: 'Restaurant' }, false)).toBe(false);
  });

  it('aparece fora da experiência, como a página do restaurante', () => {
    expect(shouldShowActiveTableBar({ name: 'Restaurant' }, true)).toBe(true);
    expect(shouldShowActiveTableBar({ name: 'Notifications' }, true)).toBe(true);
  });

  it('não aparece dentro da comanda e das telas filhas', () => {
    for (const name of ['Cart', 'Menu', 'OrderDetail', 'FecharConta', 'TableWelcome']) {
      expect(shouldShowActiveTableBar({ name }, true)).toBe(false);
    }
  });

  it('nas abas, esconde na Home (que já tem o card da mesa) e mostra nas demais', () => {
    expect(shouldShowActiveTableBar({ name: 'Main' }, true)).toBe(false);
    expect(shouldShowActiveTableBar({ name: 'Main', state: { index: 1, routes: [{ name: 'Home' }, { name: 'Wallet' }] } }, true)).toBe(true);
  });
});
