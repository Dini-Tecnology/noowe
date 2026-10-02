/**
 * Regras de tela da equipe para o papel de dono (o banco é quem decide de verdade:
 * só dono concede/revoga dono e o restaurante nunca fica sem dono — ver 20261001152000_multi_owner).
 */
export const ASSIGNABLE_ROLES = ['manager', 'maitre', 'chef', 'barman', 'cook', 'waiter'] as const;

/**
 * Funções oferecidas no seletor. "Dono" só aparece para um dono e só ao vincular/editar uma conta
 * que já existe: criar uma conta nova com senha provisória como dono não é oferecido.
 */
export function assignableRoles(opts: { viewerRole: string | null; creatingAccount: boolean }): string[] {
  const canGrantOwner = opts.viewerRole === 'owner' && !opts.creatingAccount;
  return canGrantOwner ? ['owner', ...ASSIGNABLE_ROLES] : [...ASSIGNABLE_ROLES];
}

/**
 * Editar/inativar um membro. Dono e gerente gerem a equipe; o vínculo de um dono só outro dono
 * mexe, e ninguém mexe no próprio vínculo de dono (o servidor também recusa).
 */
export function canManageMember(opts: {
  viewerRole: string | null;
  viewerUserId: string | null;
  member: { role: string; user_id: string };
}): boolean {
  const { viewerRole, viewerUserId, member } = opts;
  if (viewerRole !== 'owner' && viewerRole !== 'manager') return false;
  if (member.role !== 'owner') return true;
  return viewerRole === 'owner' && member.user_id !== viewerUserId;
}
