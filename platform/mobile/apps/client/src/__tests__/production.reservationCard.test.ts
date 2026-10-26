import { formatCountdown, reservationCardState } from '../screens/production/reservation-ui';

const reservation = (over: Record<string, unknown> = {}) => ({
  id: 'res1', restaurantId: 'r1', restaurantName: 'Parrilaria', restaurantPhoto: null, confirmationCode: 'BN-1',
  reservationTime: '2026-10-25T20:00:00.000Z', partySize: 2, specialRequests: null, status: 'confirmed', createdAt: '2026-10-20T00:00:00Z',
  checkInOpensAt: '2026-10-25T19:55:00.000Z', checkInClosesAt: '2026-10-25T20:15:00.000Z', checkedInAt: null,
  ...over,
}) as any;
const at = (iso: string) => new Date(`2026-10-25T${iso}:00.000Z`);

describe('reservationCardState (ADR-021)', () => {
  it('antes da janela: contagem até as 19:55', () => {
    const state = reservationCardState(reservation(), at('18:55'));
    expect(state).toMatchObject({ kind: 'upcoming', msUntilOpen: 60 * 60 * 1000 });
  });

  it('5 minutos antes até o fim da tolerância: Fazer check-in', () => {
    expect(reservationCardState(reservation(), at('19:55')).kind).toBe('check_in');
    expect(reservationCardState(reservation(), at('20:10')).kind).toBe('check_in');
  });

  it('depois da tolerância: reserva expirada', () => {
    expect(reservationCardState(reservation(), at('20:16')).kind).toBe('expired');
    expect(reservationCardState(reservation({ status: 'no_show' }), at('18:00')).kind).toBe('expired');
  });

  it('check-in feito sem mesa: aguardando; sentada e histórico', () => {
    expect(reservationCardState(reservation({ checkedInAt: '2026-10-25T19:56:00Z' }), at('19:57')).kind).toBe('waiting_table');
    expect(reservationCardState(reservation({ status: 'seated' }), at('20:00')).kind).toBe('seated');
    expect(reservationCardState(reservation({ status: 'cancelled' }), at('20:00')).kind).toBe('inactive');
  });

  it('sem a janela do servidor, usa 5 min antes e 15 min depois', () => {
    const old = reservation({ checkInOpensAt: null, checkInClosesAt: null });
    expect(reservationCardState(old, at('19:54')).kind).toBe('upcoming');
    expect(reservationCardState(old, at('19:55')).kind).toBe('check_in');
    expect(reservationCardState(old, at('20:16')).kind).toBe('expired');
  });
});

describe('formatCountdown', () => {
  it.each([
    [30_000, '1 min'], [45 * 60_000, '45 min'], [60 * 60_000, '1 h'], [130 * 60_000, '2 h 10 min'], [3 * 86_400_000, '3 dias'], [0, 'agora'],
  ])('%d ms → %s', (ms, label) => expect(formatCountdown(ms)).toBe(label));
});
