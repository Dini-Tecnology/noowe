/**
 * ADR-021 no app da equipe: origem da comanda e selo de parada no mapa, política do salão,
 * status dos itens na comanda por pessoa.
 */
import { idleMinutesSince, mapTable, originChipLabel } from '../screens/v2/shared/useRestaurantOperations';
import { roomPolicyPatch, ROOM_POLICY_FIELDS } from '../screens/v2/config/RoomPolicyCard';
import { itemStatusLabel } from '../screens/v2/shared/TableComandaDialog';

jest.mock('lucide-react-native', () => new Proxy({}, { get: () => 'Icon' }));
jest.mock('@okinawa/shared/contexts/ThemeContext', () => ({ useColors: () => new Proxy({}, { get: () => '#333333' }) }));
jest.mock('@okinawa/shared/services/supabase-api', () => ({ supabaseApiAdapter: {} }));

const raw = (session: Record<string, unknown> | null) => ({ id: 't1', table_number: '1', seats: 4, status: 'occupied', active_session: session }) as any;

describe('origem da comanda no mapa', () => {
  it('QR, fila e equipe têm rótulo curto; a reserva leva o nome do cliente', () => {
    expect(originChipLabel('qr', null)).toBe('QR');
    expect(originChipLabel('queue', 'Ana')).toBe('Fila');
    expect(originChipLabel('staff', null)).toBe('Equipe');
    expect(originChipLabel('reservation', 'Ana Souza')).toBe('Reserva · Ana Souza');
    expect(originChipLabel('reservation', null)).toBe('Reserva');
    expect(originChipLabel(null, null)).toBeNull();
  });

  it('mapTable lê origem e parada do servidor', () => {
    const t = mapTable(raw({ id: 's1', origin: 'reservation', origin_name: 'Ana Souza', idle_since: new Date(Date.now() - 130 * 60000).toISOString() }));
    expect(t.origin).toBe('reservation');
    expect(t.originLabel).toBe('Reserva · Ana Souza');
    expect(t.idleMinutes).toBeGreaterThanOrEqual(129);
  });

  it('mesa sem sessão não tem origem nem parada; origem desconhecida é ignorada', () => {
    expect(mapTable(raw(null))).toMatchObject({ origin: null, originLabel: null, idleMinutes: null });
    expect(mapTable(raw({ id: 's1', origin: 'xyz' })).origin).toBeNull();
  });

  it('idleMinutesSince', () => {
    const now = new Date('2026-10-25T12:00:00Z');
    expect(idleMinutesSince('2026-10-25T10:30:00Z', now)).toBe(90);
    expect(idleMinutesSince(null, now)).toBeNull();
  });
});

describe('política do salão', () => {
  const saved = { reservationNoShowMin: 15, queueCallToleranceMin: 8, sessionIdleAlertMin: 120, reservationCheckInLeadMin: 5 };

  it('só o que mudou vai ao servidor', () => {
    expect(roomPolicyPatch(saved, saved)).toEqual({});
    expect(roomPolicyPatch(saved, { ...saved, queueCallToleranceMin: 10 })).toEqual({ queueCallToleranceMin: 10 });
  });

  it('as faixas da tela são as do servidor', () => {
    const range = Object.fromEntries(ROOM_POLICY_FIELDS.map((f) => [f.key, [f.min, f.max]]));
    expect(range).toEqual({ reservationNoShowMin: [5, 120], queueCallToleranceMin: [1, 60], sessionIdleAlertMin: [15, 1440] });
  });
});

describe('status dos itens', () => {
  it('traduz e mantém o desconhecido', () => {
    expect(itemStatusLabel('preparing')).toBe('Preparando');
    expect(itemStatusLabel('ready')).toBe('Pronto');
    expect(itemStatusLabel('algo_novo')).toBe('algo_novo');
  });
});
