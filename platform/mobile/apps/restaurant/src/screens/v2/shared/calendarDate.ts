function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export const RESTAURANT_TIME_ZONE = 'America/Sao_Paulo';

/** Returns the YYYY-MM-DD calendar date for an instant in the restaurant timezone. */
export function saoPauloDateKey(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: RESTAURANT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

/** Adds civil calendar days without depending on the device timezone. */
export function addDaysToDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + days, 12));
  return `${result.getUTCFullYear()}-${pad(result.getUTCMonth() + 1)}-${pad(result.getUTCDate())}`;
}

export function saoPauloUpcomingDateKeys(count: number, now: Date = new Date()): string[] {
  const today = saoPauloDateKey(now);
  return Array.from({ length: count }, (_, index) => addDaysToDateKey(today, index));
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
