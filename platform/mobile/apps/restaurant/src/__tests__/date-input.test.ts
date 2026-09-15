import {
  buildMonthWeeks,
  saoPauloDateKey,
  saoPauloDateToIso,
  saoPauloUpcomingDateKeys,
} from '../screens/v2/shared/calendarDate';

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

  it('uses the Sao Paulo calendar day when UTC is already on the next day', () => {
    const instant = new Date('2026-08-16T01:30:00.000Z');
    expect(saoPauloDateKey(instant)).toBe('2026-08-15');
  });

  it('builds the same four-day window offered by the customer app', () => {
    const instant = new Date('2026-08-16T01:30:00.000Z');
    expect(saoPauloUpcomingDateKeys(4, instant)).toEqual([
      '2026-08-15',
      '2026-08-16',
      '2026-08-17',
      '2026-08-18',
    ]);
  });
});
