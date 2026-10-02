import { describe, it, expect } from 'vitest';
import {
  formatDaySchedule,
  isValidTime,
  maskTimeInput,
  parseBusinessHours,
  parseOpeningHours,
  serializeWeeklyHours,
  todayWeekdayKey,
  validateDaySchedule,
  validateWeeklyHours,
  weeklyHoursForEditor,
} from '../opening-hours';

describe('maskTimeInput', () => {
  it('formata HH:MM enquanto digita', () => {
    expect(maskTimeInput('1')).toBe('1');
    expect(maskTimeInput('18')).toBe('18');
    expect(maskTimeInput('183')).toBe('18:3');
    expect(maskTimeInput('1830')).toBe('18:30');
  });

  it('nunca deixa "6700" existir no campo', () => {
    // "67" não é hora: o 6 vira "06" e o 7 (minuto > 59) é descartado.
    expect(maskTimeInput('6700')).toBe('06:00');
    expect(maskTimeInput('67')).toBe('06');
    expect(isValidTime('6700')).toBe(false);
  });

  it('ignora hora > 23 e minuto > 59', () => {
    expect(maskTimeInput('2500')).toBe('20:0');
    expect(maskTimeInput('1899')).toBe('18');
    expect(maskTimeInput('1860')).toBe('18:0');
  });

  it('descarta letras e limita a 4 dígitos', () => {
    expect(maskTimeInput('ab12cd34')).toBe('12:34');
    expect(maskTimeInput('123456')).toBe('12:34');
  });

  it('completa o zero à esquerda do primeiro dígito 3–9', () => {
    expect(maskTimeInput('9')).toBe('09');
  });
});

describe('leitura de formatos', () => {
  it('lê o formato canônico com turnos', () => {
    const week = parseOpeningHours({
      monday: { closed: false, shifts: [{ open: '11:00', close: '14:00' }, { open: '19:00', close: '23:00' }] },
    });
    expect(week?.monday.shifts).toHaveLength(2);
    expect(week?.tuesday.closed).toBe(true);
  });

  it('lê o formato antigo {open, close} e {closed}', () => {
    const week = parseOpeningHours({ sunday: { open: '12:00', close: '22:00' }, monday: { closed: true } });
    expect(week?.sunday.shifts).toEqual([{ open: '12:00', close: '22:00' }]);
    expect(week?.monday.closed).toBe(true);
  });

  it('sem dados devolve null', () => {
    expect(parseOpeningHours(null)).toBeNull();
    expect(parseOpeningHours({})).toBeNull();
  });

  it('converte business_hours do app antigo', () => {
    const week = parseBusinessHours([
      { day: 'Terça', open: true, start: '11:00', end: '23:00' },
      { day: 'Domingo', open: false, start: '15:00', end: '22:00' },
    ]);
    expect(week?.tuesday.shifts).toEqual([{ open: '11:00', close: '23:00' }]);
    expect(week?.sunday.closed).toBe(true);
  });

  it('o editor prefere opening_hours e cai para business_hours', () => {
    const fallback = parseBusinessHours([{ day: 'Segunda', open: true, start: '10:00', end: '18:00' }])!;
    const fromOpening = weeklyHoursForEditor({ monday: { open: '09:00', close: '12:00' } }, [], fallback);
    expect(fromOpening.monday.shifts[0].open).toBe('09:00');
    const fromBusiness = weeklyHoursForEditor(null, [{ day: 'Segunda', open: true, start: '08:00', end: '12:00' }], fallback);
    expect(fromBusiness.monday.shifts[0].open).toBe('08:00');
    expect(weeklyHoursForEditor(null, null, fallback)).toBe(fallback);
  });
});

describe('validação', () => {
  const day = (...shifts: [string, string][]) => ({
    closed: false,
    shifts: shifts.map(([open, close]) => ({ open, close })),
  });

  it('aceita dois turnos separados', () => {
    expect(validateDaySchedule(day(['11:00', '14:00'], ['19:00', '23:00']))).toBeNull();
  });

  it('recusa horário fora de 24 horas', () => {
    expect(validateDaySchedule(day(['6700', '23:00']))).toMatch(/24 horas/);
    expect(validateDaySchedule(day(['25:00', '23:00']))).toMatch(/24 horas/);
  });

  it('recusa turnos sobrepostos, abre = fecha e dia aberto sem turno', () => {
    expect(validateDaySchedule(day(['11:00', '15:00'], ['14:00', '23:00']))).toMatch(/sobrep/);
    expect(validateDaySchedule(day(['11:00', '11:00']))).toMatch(/mesmo horário/);
    expect(validateDaySchedule({ closed: false, shifts: [] })).toMatch(/ao menos um turno/);
  });

  it('só o último turno pode passar da meia-noite', () => {
    expect(validateDaySchedule(day(['11:00', '14:00'], ['19:00', '02:00']))).toBeNull();
    expect(validateDaySchedule(day(['19:00', '02:00'], ['23:00', '23:30']))).toMatch(/sobrep/);
  });

  it('dia fechado é sempre válido e o erro aponta o dia', () => {
    expect(validateDaySchedule({ closed: true, shifts: [] })).toBeNull();
    const week = parseOpeningHours({ friday: { closed: false, shifts: [{ open: '99:00', close: '10:00' }] } })!;
    expect(Object.keys(validateWeeklyHours(week))).toEqual(['friday']);
  });
});

describe('serialização e exibição', () => {
  it('serializa para o formato canônico de 7 dias', () => {
    const week = parseOpeningHours({ monday: { open: '11:00', close: '23:00' } })!;
    const payload = serializeWeeklyHours(week);
    expect(Object.keys(payload)).toHaveLength(7);
    expect(payload.monday).toEqual({ closed: false, shifts: [{ open: '11:00', close: '23:00' }] });
    expect(payload.sunday).toEqual({ closed: true, shifts: [] });
  });

  it('formata turnos', () => {
    expect(formatDaySchedule({ closed: false, shifts: [{ open: '11:00', close: '14:00' }, { open: '19:00', close: '23:00' }] }))
      .toBe('11:00–14:00 · 19:00–23:00');
    expect(formatDaySchedule({ closed: true, shifts: [] })).toBe('Fechado');
  });
});

describe('todayWeekdayKey', () => {
  it('usa o dia no fuso do restaurante, não o do aparelho', () => {
    // 02:00 UTC de segunda ainda é domingo à noite em São Paulo (UTC-3).
    expect(todayWeekdayKey(new Date('2026-09-28T02:00:00Z'))).toBe('sunday');
    expect(todayWeekdayKey(new Date('2026-09-28T15:00:00Z'))).toBe('monday');
  });
});
