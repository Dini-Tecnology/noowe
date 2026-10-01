/**
 * QR físico do NOOWE: `noowe://t/<código>` (mesa) ou `noowe://counter/<código>`
 * (balcão do Quick Service). Qualquer outra coisa — URL de site, texto solto,
 * QR de outro app — nunca chega ao servidor: o scanner recusa na hora.
 */
export type NooweQrKind = 'table' | 'counter';

const NOOWE_QR_PATTERN = /^noowe:\/\/(t|counter)\/[A-Za-z0-9._~-]{8,128}$/;

export function classifyQrPayload(raw: string): NooweQrKind | null {
  const match = NOOWE_QR_PATTERN.exec(raw.trim());
  if (!match) return null;
  return match[1] === 't' ? 'table' : 'counter';
}
