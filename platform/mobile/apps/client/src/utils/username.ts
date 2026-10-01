/**
 * Client-side mirror of private.normalize_username_input (ADR-011), used only to
 * give instant feedback while typing. The server normalizes and validates again;
 * it is the only authority on format, reserved words and availability.
 */
export function normalizeUsernameInput(value: string): string {
  // No trailing trim: while typing, "bruno " must become "bruno-" so the next
  // letter lands after the hyphen.
  return value
    .replace(/^\s+/, '')
    .replace(/^@+/, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[\s_.]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-');
}

/** Same shape as the profiles_username_format CHECK constraint. */
export function isUsernameFormatValid(value: string): boolean {
  return value.length >= 3 && value.length <= 30 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value);
}

export const USERNAME_UNAVAILABLE_MESSAGES = {
  invalid_format: 'Use de 3 a 30 caracteres: letras minúsculas, números e hífen.',
  reserved: 'Esse @ é reservado.',
  taken: 'Esse @ já está em uso.',
} as const;
