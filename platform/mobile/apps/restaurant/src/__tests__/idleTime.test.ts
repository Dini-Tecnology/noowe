import { formatIdle } from '../screens/v2/shared/idleTime';

// QA 26/11: mesa parada há mais de um dia aparecia como "750 h 0 min".
test('tempo parado: minutos, horas e dias', () => {
  expect(formatIdle(45)).toBe('45 min');
  expect(formatIdle(125)).toBe('2 h 5 min');
  expect(formatIdle(750 * 60)).toBe('31 d 6 h');
  expect(formatIdle(48 * 60)).toBe('2 d');
});
