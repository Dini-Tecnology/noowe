import { buildMonthWeeks, saoPauloDateToIso } from '../screens/v2/shared/calendarDate';

describe('DateInput calendar grid', () => {
  it('keeps exactly seven columns in every week, including Saturday', () => {
    const weeks = buildMonthWeeks(2026, 7); // August 2026 starts on Saturday.

    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(weeks[0][6]).toBe(1);
    expect(weeks.flat().filter((day) => day !== null)).toEqual(
      Array.from({ length: 31 }, (_, index) => index + 1),
    );
  });

  it('anchors the selected calendar date to noon in Sao Paulo', () => {
    expect(saoPauloDateToIso(2026, 7, 1)).toBe('2026-08-01T12:00:00-03:00');
  });
});
