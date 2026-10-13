/**
 * QR físico do NOOWE: `noowe://t/<código>` (mesa) ou `noowe://counter/<código>`
 * (balcão do Quick Service). Qualquer outra coisa — URL de site, texto solto,
 * QR de outro app — nunca chega ao servidor: o scanner recusa na hora.
 */
export type NooweQrKind = 'table' | 'counter';

/**
 * QR do convite que o anfitrião mostra no próprio celular: o link `https://noowebr.com/t/invite/<token>`
 * (ADR-019). Não é QR de mesa: leva ao fluxo de convite, nunca a um check-in.
 */
const INVITE_QR_PATTERN = /^https:\/\/(?:www\.)?noowebr\.com\/t\/invite\/([A-Za-z0-9]{16,128})$/;

export function extractInviteToken(raw: string): string | null {
  return INVITE_QR_PATTERN.exec(raw.trim())?.[1] ?? null;
}

const NOOWE_QR_PATTERN = /^noowe:\/\/(t|counter)\/[A-Za-z0-9._~-]{8,128}$/;

export function classifyQrPayload(raw: string): NooweQrKind | null {
  const match = NOOWE_QR_PATTERN.exec(raw.trim());
  if (!match) return null;
  return match[1] === 't' ? 'table' : 'counter';
}
