/**
 * Mensagem de erro segura para mostrar ao usuário, sempre em português.
 *
 * Os RPCs do banco levantam exceções em inglês ("Authentication required",
 * "Restaurant not found"…) e o Supabase as entrega como `message`. Mostrar isso
 * cru deixa texto em inglês na tela: aqui o que conhecemos vira português, o que
 * já vem em português passa como está, e inglês desconhecido cai na mensagem
 * padrão de quem chamou. O texto original continua indo para o log de quem captura.
 *
 * @module shared/utils/user-error-message
 */

const KNOWN_MESSAGES: Array<[RegExp, string]> = [
  [/^(Authentication required|Not authenticated)/i, 'Faça login novamente para continuar.'],
  [/(JWT expired|session expired|Auth session missing)/i, 'Sua sessão expirou. Entre novamente.'],
  [/(Network request failed|Failed to fetch|Network Error|timeout)/i, 'Sem conexão. Verifique sua internet e tente novamente.'],
  [/(access denied|permission denied|not authorized|forbidden|row-level security)/i, 'Você não tem permissão para esta ação.'],
  [/^Staff role not found/i, 'Vínculo da equipe não encontrado.'],
  [/^User not found/i, 'Usuário não encontrado.'],
  [/^Invalid role/i, 'Função inválida.'],
  [/^Invalid profile fields/i, 'Alguns campos do perfil não são aceitos por esta versão do app. Atualize o aplicativo e tente novamente.'],
  [/^Restaurant name is required/i, 'Informe o nome do restaurante.'],
  [/^Restaurant phone is required/i, 'Informe o telefone do restaurante.'],
  [/^Restaurant email is required/i, 'Informe o e-mail do restaurante.'],
  [/^No restaurant available/i, 'Nenhum restaurante vinculado à sua conta.'],
  [/^Restaurant not found/i, 'Restaurante não encontrado.'],
  [/^Restaurant is closed/i, 'Este restaurante está fechado no momento.'],
  [/^Restaurant is (not active|unavailable)/i, 'Este restaurante está indisponível no momento.'],
  [/^Menu item not found/i, 'Item do cardápio não encontrado.'],
  [/^Category not found/i, 'Categoria não encontrada.'],
  [/^Station not found/i, 'Estação não encontrada.'],
  [/^Shift not found/i, 'Turno não encontrado.'],
  [/^Service call not found/i, 'Chamado não encontrado.'],
  [/^Order not found/i, 'Pedido não encontrado.'],
  [/^Table not found/i, 'Mesa não encontrada.'],
  [/^Table session not found/i, 'Comanda não encontrada.'],
  [/^Review not found/i, 'Avaliação não encontrada.'],
  [/^Idempotency key required/i, 'Não foi possível concluir. Tente novamente.'],
  [/^Waitlist entry cannot be updated/i, 'Esta entrada da fila não pode mais ser alterada.'],
  [/^Already on waitlist/i, 'Você já está na fila de espera.'],
  [/^Insufficient wallet balance/i, 'Saldo insuficiente na carteira.'],
  [/^Invalid party size/i, 'Número de pessoas inválido.'],
  [/^No availability for this time/i, 'Não há disponibilidade neste horário.'],
  [/^Invalid or expired QR code/i, 'QR code inválido ou expirado.'],
  [/^Invalid or expired invitation/i, 'Convite inválido ou expirado.'],
];

const PORTUGUESE_HINT = /[À-ÿ]|\b(não|você|erro|tente|informe|pedido|mesa|restaurante|cardápio|inválid|obrigatóri)\b/i;
const ENGLISH_HINT =
  /\b(the|is|are|not|cannot|can't|required|invalid|failed|must|already|found|error|unable|denied|missing|unavailable|expired|exceeded|please|violates|constraint|duplicate|column|relation|syntax|null|does not exist|already exists|value|key|to|for|with|of|in|on|an)\b/i;

function rawMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return '';
}

/** Mensagem em português para o usuário; `fallback` cobre erro vazio ou em inglês desconhecido. */
export function userErrorMessage(error: unknown, fallback: string): string {
  const message = rawMessage(error).trim();
  if (!message) return fallback;
  for (const [pattern, translation] of KNOWN_MESSAGES) {
    if (pattern.test(message)) return translation;
  }
  if (PORTUGUESE_HINT.test(message)) return message;
  return ENGLISH_HINT.test(message) ? fallback : message;
}
