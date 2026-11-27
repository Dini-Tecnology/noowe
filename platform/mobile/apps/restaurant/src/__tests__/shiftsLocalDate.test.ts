import { isoDate } from '../screens/v2/ShiftsScreen';

// QA 26/11: às 21h53 de quinta em São Paulo a escala marcava sexta como "hoje" (data em UTC).
test('isoDate usa o dia do calendário local, não o UTC', () => {
  const lateEvening = new Date(2026, 10, 26, 21, 53); // 26/11 21:53 local
  expect(isoDate(lateEvening)).toBe('2026-11-26');
  expect(isoDate(new Date(2026, 0, 5, 0, 0))).toBe('2026-01-05');
});
