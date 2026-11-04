/**
 * Regras de tela da equipe (o banco é quem decide de verdade: só dono concede ou altera dono e gerente,
 * e o restaurante nunca fica sem dono — ver 20261001152000_multi_owner e 20261104100000_o3_concessao_de_funcoes).
 */
export const ASSIGNABLE_ROLES = ['manager', 'maitre', 'chef', 'barman', 'cook', 'waiter'] as const;

/** Funções que só um dono concede ou altera (ADR-025). */
const OWNER_ONLY_ROLES = ['owner', 'manager'];

/**
 * Funções oferecidas no seletor. "Gerente" só aparece para um dono. "Dono" também, e só ao vincular/editar
 * uma conta que já existe: criar uma conta nova com senha provisória como dono não é oferecido.
 */
export function assignableRoles(opts: { viewerRole: string | null; creatingAccount: boolean }): string[] {
  if (opts.viewerRole !== 'owner') return ASSIGNABLE_ROLES.filter((role) => !OWNER_ONLY_ROLES.includes(role));
  return opts.creatingAccount ? [...ASSIGNABLE_ROLES] : ['owner', ...ASSIGNABLE_ROLES];
}

/**
 * Editar/inativar um membro. Dono e gerente gerem a equipe; o vínculo de um dono ou gerente só um dono
 * mexe, e ninguém mexe no próprio vínculo de dono (o servidor também recusa).
 */
export function canManageMember(opts: {
  viewerRole: string | null;
  viewerUserId: string | null;
  member: { role: string; user_id: string };
}): boolean {
  const { viewerRole, viewerUserId, member } = opts;
  if (viewerRole !== 'owner' && viewerRole !== 'manager') return false;
  if (!OWNER_ONLY_ROLES.includes(member.role)) return true;
  if (viewerRole !== 'owner') return false;
  return member.role !== 'owner' || member.user_id !== viewerUserId;
}

/** Marca ou desmarca uma função. A última não sai: toda pessoa da equipe tem ao menos uma. */
export function toggleRole(roles: readonly string[], role: string): string[] {
  if (!roles.includes(role)) return [...roles, role];
  return roles.length === 1 ? [...roles] : roles.filter((item) => item !== role);
}

/** A principal precisa estar entre as marcadas; se saiu, vale a primeira. */
export function keepPrimary(roles: readonly string[], primary: string): string {
  return roles.includes(primary) ? primary : roles[0];
}

/** Ninguém aprova o próprio pedido, menos o Dono (o servidor também recusa). Desistir continua na tela. */
export function canApproveRequest(opts: { viewerRole: string | null; viewerUserId: string | null; requesterId: string }): boolean {
  return opts.viewerRole === 'owner' || opts.viewerUserId !== opts.requesterId;
}
