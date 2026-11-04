const CODE_PATTERN = /^[0-9a-f]{32}$/;

/** O código digitado ou colado, com ou sem espaços. Serve também para quem cola o link inteiro. */
export function normalizeStaffInviteCode(value: string | null | undefined): string | null {
  const text = (value ?? '').trim().toLowerCase();
  const code = text.split('/').pop()?.split('?')[0] ?? '';
  return CODE_PATTERN.test(code) ? code : null;
}

/** Só o link de convite do app: outros links seguem para quem os trata. */
export function staffInviteCodeFromUrl(url: string | null | undefined): string | null {
  const match = /^okinawa-restaurant:\/\/convite\/([^/?#]+)/i.exec((url ?? '').trim());
  return match ? normalizeStaffInviteCode(match[1]) : null;
}

/** A mensagem para compartilhar quando o convite é por link ou o e-mail não saiu. */
export function staffInviteShareMessage(link: string, code: string): string {
  return `Você recebeu um convite para a equipe no NOOWE Restaurant. Abra pelo link ${link} ou use o código ${code} na tela "Aguardando acesso".`;
}
