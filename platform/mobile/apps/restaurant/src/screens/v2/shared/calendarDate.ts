function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Builds an ISO instant for a calendar date, anchored to America/Sao_Paulo (UTC-3, no DST since 2019). */
export function saoPauloDateToIso(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}T12:00:00-03:00`;
}

/** Returns complete Sunday-to-Saturday rows, with nulls outside the requested month. */
export function buildMonthWeeks(year: number, month: number): (number | null)[][] {
  const startOffset = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array(startOffset).fill(null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);

  return Array.from({ length: cells.length / 7 }, (_, week) => cells.slice(week * 7, week * 7 + 7));
}
