import { buildTimeSlots } from '../screens/production/reservation-slots';

const FAR_FUTURE_DAY = new Date(2030, 0, 15);
const NOW = new Date(2026, 8, 28, 10, 0);

describe('buildTimeSlots — turnos do restaurante', () => {
  it('gera horários só dentro de cada turno, sem slots no intervalo', () => {
    const slots = buildTimeSlots(
      { closed: false, shifts: [{ open: '11:00', close: '14:00' }, { open: '19:00', close: '23:00' }] },
      FAR_FUTURE_DAY,
      NOW,
    );
    expect(slots).toEqual(['11:00', '11:30', '12:00', '12:30', '13:00', '19:00', '19:30', '20:00', '20:30', '21:00', '21:30', '22:00']);
    expect(slots).not.toContain('15:00');
  });

  it('ordena turnos fora de ordem e mantém o turno que passa da meia-noite por último', () => {
    const slots = buildTimeSlots(
      { closed: false, shifts: [{ open: '19:00', close: '01:00' }, { open: '11:00', close: '13:00' }] },
      FAR_FUTURE_DAY,
      NOW,
    );
    expect(slots[0]).toBe('11:00');
    expect(slots).toContain('23:30');
    expect(slots[slots.length - 1]).toBe('00:00');
  });

  it('hoje descarta horários com menos de 30 minutos de antecedência', () => {
    const today = new Date(2026, 8, 28);
    const slots = buildTimeSlots({ closed: false, shifts: [{ open: '09:00', close: '14:00' }] }, today, NOW);
    expect(slots[0]).toBe('10:30');
  });
});
