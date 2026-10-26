import { closedCaption, restaurantEntryState } from '../screens/production/casual-dining-ui';
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
