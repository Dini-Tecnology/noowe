/**
 * Horário de funcionamento com turnos.
 *
 * Formato canônico, gravado em `restaurants.opening_hours` (o mesmo que o
 * servidor valida e lê para o status "Aberto"/"Fechado" e para a fila virtual):
 *   { monday: { closed: false, shifts: [{ open: '11:00', close: '14:00' }, ...] }, ... }
 *
 * A leitura também aceita o formato antigo ({ open, close } / { closed: true })
 * e a lista `business_hours` do app do restaurante ({ day: 'Segunda', ... }).
 *
 * @module shared/utils/opening-hours
 */

export const WEEKDAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

export const WEEKDAY_LABEL_PT: Record<WeekdayKey, string> = {
  monday: 'Segunda',
  tuesday: 'Terça',
  wednesday: 'Quarta',
  thursday: 'Quinta',
  friday: 'Sexta',
  saturday: 'Sábado',
  sunday: 'Domingo',
};

/** Espelha private.opening_hours_max_shifts_per_day() no servidor. */
export const MAX_SHIFTS_PER_DAY = 4;

export interface Shift {
  open: string;
  close: string;
}

export interface DaySchedule {
  closed: boolean;
  shifts: Shift[];
}

export type WeeklyHours = Record<WeekdayKey, DaySchedule>;

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidTime(value: string): boolean {
  return TIME_PATTERN.test(value);
}

/**
 * Máscara de digitação HH:MM de 24 horas. Um dígito que tornaria o horário
 * impossível (hora > 23, minuto > 59) é simplesmente ignorado — "6700" nunca
 * chega a existir no campo.
 */
export function maskTimeInput(raw: string): string {
  const typed = raw.replace(/\D/g, '');
  let digits = '';
  for (const char of typed) {
    const position = digits.length;
    if (position >= 4) break;
    if (position === 0 && char > '2') {
      // "6" vira "06": o primeiro dígito só pode ser 0–2.
      digits = `0${char}`;
      continue;
    }
    if (position === 1 && digits[0] === '2' && char > '3') continue;
    if (position === 2 && char > '5') continue;
    digits += char;
  }
  return digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
}

function emptyWeek(): WeeklyHours {
  const week = {} as WeeklyHours;
  for (const key of WEEKDAY_KEYS) week[key] = { closed: true, shifts: [] };
  return week;
}

const DAY_ALIASES: Record<string, WeekdayKey> = {
  segunda: 'monday', monday: 'monday',
  terca: 'tuesday', tuesday: 'tuesday',
  quarta: 'wednesday', wednesday: 'wednesday',
  quinta: 'thursday', thursday: 'thursday',
  sexta: 'friday', friday: 'friday',
  sabado: 'saturday', saturday: 'saturday',
  domingo: 'sunday', sunday: 'sunday',
};

function dayKeyOf(name: unknown): WeekdayKey | null {
  if (typeof name !== 'string') return null;
  const normalized = name.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return DAY_ALIASES[normalized] ?? null;
}

/** Um dia em qualquer formato (novo, {open, close} antigo ou {closed: true}). */
export function parseDaySchedule(entry: unknown): DaySchedule {
  if (!entry || typeof entry !== 'object') return { closed: true, shifts: [] };
  const raw = entry as Record<string, unknown>;
  if (raw.closed === true) return { closed: true, shifts: [] };
  let shifts: Shift[] = [];
  if (Array.isArray(raw.shifts)) {
    shifts = raw.shifts
      .filter((shift): shift is Record<string, unknown> => !!shift && typeof shift === 'object')
      .map((shift) => ({ open: String(shift.open ?? ''), close: String(shift.close ?? '') }));
  } else if (typeof raw.open === 'string' && typeof raw.close === 'string' && raw.open && raw.close) {
    shifts = [{ open: raw.open, close: raw.close }];
  }
  return { closed: shifts.length === 0, shifts };
}

/** Lê `opening_hours` (novo ou antigo); sem dados devolve null. */
export function parseOpeningHours(openingHours: unknown): WeeklyHours | null {
  if (!openingHours || typeof openingHours !== 'object' || Array.isArray(openingHours)) return null;
  const source = openingHours as Record<string, unknown>;
  const week = emptyWeek();
  let found = false;
  for (const [name, value] of Object.entries(source)) {
    const key = dayKeyOf(name);
    if (!key) continue;
    week[key] = parseDaySchedule(value);
    found = true;
  }
  return found ? week : null;
}

/** Lê a lista `business_hours` do app do restaurante (dias em português). */
export function parseBusinessHours(businessHours: unknown): WeeklyHours | null {
  if (!Array.isArray(businessHours) || businessHours.length === 0) return null;
  const week = emptyWeek();
  let found = false;
  for (const item of businessHours) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Record<string, unknown>;
    const key = dayKeyOf(raw.day);
    if (!key) continue;
    found = true;
    week[key] = raw.open === true
      ? { closed: false, shifts: [{ open: String(raw.start ?? ''), close: String(raw.end ?? '') }] }
      : { closed: true, shifts: [] };
  }
  return found ? week : null;
}

/** Semana para o editor: opening_hours, depois business_hours, depois o padrão. */
export function weeklyHoursForEditor(
  openingHours: unknown,
  businessHours: unknown,
  fallback: WeeklyHours,
): WeeklyHours {
  const parsed = parseOpeningHours(openingHours);
  if (parsed) return parsed;
  return parseBusinessHours(businessHours) ?? fallback;
}

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/** Mensagem em português do primeiro problema do dia, ou null se estiver válido. */
export function validateDaySchedule(day: DaySchedule): string | null {
  if (day.closed) return null;
  if (day.shifts.length === 0) return 'Adicione ao menos um turno ou marque o dia como fechado';
  if (day.shifts.length > MAX_SHIFTS_PER_DAY) return `No máximo ${MAX_SHIFTS_PER_DAY} turnos por dia`;
  for (const shift of day.shifts) {
    if (!isValidTime(shift.open) || !isValidTime(shift.close)) {
      return 'Use o formato de 24 horas HH:MM (00:00 a 23:59)';
    }
    if (shift.open === shift.close) return 'O turno não pode abrir e fechar no mesmo horário';
  }
  const ordered = [...day.shifts].sort((a, b) => toMinutes(a.open) - toMinutes(b.open));
  let previousEnd: number | null = null;
  for (const shift of ordered) {
    const start = toMinutes(shift.open);
    let end = toMinutes(shift.close);
    if (end <= start) end += 24 * 60;
    if (previousEnd !== null && start < previousEnd) return 'Os turnos do dia se sobrepõem';
    previousEnd = end;
  }
  return null;
}

export function validateWeeklyHours(week: WeeklyHours): Partial<Record<WeekdayKey, string>> {
  const errors: Partial<Record<WeekdayKey, string>> = {};
  for (const key of WEEKDAY_KEYS) {
    const message = validateDaySchedule(week[key]);
    if (message) errors[key] = message;
  }
  return errors;
}

/** Payload canônico para `restaurants.opening_hours`. */
export function serializeWeeklyHours(week: WeeklyHours): Record<WeekdayKey, DaySchedule> {
  const payload = {} as Record<WeekdayKey, DaySchedule>;
  for (const key of WEEKDAY_KEYS) {
    const day = week[key];
    payload[key] = day.closed
      ? { closed: true, shifts: [] }
      : { closed: false, shifts: day.shifts.map((shift) => ({ open: shift.open, close: shift.close })) };
  }
  return payload;
}

/** "11:00–14:00 · 19:00–23:00" ou "Fechado". */
export function formatDaySchedule(day: DaySchedule): string {
  if (day.closed || day.shifts.length === 0) return 'Fechado';
  return day.shifts.map((shift) => `${shift.open}–${shift.close}`).join(' · ');
}
