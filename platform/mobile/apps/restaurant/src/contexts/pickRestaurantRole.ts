import type { RestaurantRole } from './RestaurantRoleContext';

export interface UserRoleRow {
  role: string;
  restaurant_id: string;
}

/** Do mais para o menos poderoso: quem é dono e gerente do mesmo restaurante age como dono. */
const ROLE_PRECEDENCE: RestaurantRole[] = ['owner', 'manager', 'maitre', 'chef', 'barman', 'cook', 'waiter'];

function precedence(role: string): number {
  const index = ROLE_PRECEDENCE.indexOf(role as RestaurantRole);
  return index === -1 ? ROLE_PRECEDENCE.length : index;
}

/**
 * Escolhe o vínculo a abrir. Com `targetRestaurantId`, o de maior poder nesse restaurante; sem ele, o
 * restaurante do vínculo mais antigo (as linhas chegam ordenadas por created_at) e, dentro dele, o de
 * maior poder. Antes valia só a linha mais antiga, e quem virou dono de um restaurante em que já
 * era gerente continuava entrando como gerente.
 */
export function pickRoleRow<T extends UserRoleRow>(rows: readonly T[], targetRestaurantId?: string): T | null {
  const restaurantId = targetRestaurantId ?? rows[0]?.restaurant_id;
  if (!restaurantId) return null;
  const candidates = rows.filter((row) => row.restaurant_id === restaurantId);
  if (candidates.length === 0) return null;
  return candidates.reduce((best, row) => (precedence(row.role) < precedence(best.role) ? row : best));
}

export interface MyRoles {
  /** Do mais para o menos poderoso. Só as funções que o app conhece. */
  roles: RestaurantRole[];
  /** Define a tela de abertura, nunca o que a pessoa pode fazer. */
  primary: RestaurantRole | null;
  /** O que pode ser reduzido por pessoa (Recepcionista). O servidor é quem barra; a tela só esconde. */
  permissions: string[];
}

function knownRoles(values: readonly unknown[]): RestaurantRole[] {
  const unique = new Set(values.filter((value): value is RestaurantRole =>
    typeof value === 'string' && ROLE_PRECEDENCE.includes(value as RestaurantRole)));
  return [...unique].sort((a, b) => precedence(a) - precedence(b));
}

/** Todas as funções da pessoa no restaurante, a partir das linhas de `user_roles`. */
export function pickRestaurantRoles(rows: readonly UserRoleRow[], restaurantId: string): MyRoles {
  const roles = knownRoles(rows.filter((row) => row.restaurant_id === restaurantId).map((row) => row.role));
  // Sem a resposta do servidor não dá para saber das reduções: esconde, e o servidor segue decidindo.
  return { roles, primary: roles[0] ?? null, permissions: [] };
}

/** Resposta de `restaurant_get_my_roles`. Sem funções conhecidas, devolve `null` para o chamador usar as linhas. */
export function parseMyRoles(data: unknown): MyRoles | null {
  const raw = data as { roles?: unknown; primary?: unknown; permissions?: unknown } | null;
  if (!raw || !Array.isArray(raw.roles)) return null;
  const roles = knownRoles(raw.roles);
  if (roles.length === 0) return null;
  return {
    roles,
    primary: roles.includes(raw.primary as RestaurantRole) ? (raw.primary as RestaurantRole) : roles[0],
    permissions: Array.isArray(raw.permissions)
      ? raw.permissions.filter((item): item is string => typeof item === 'string')
      : [],
  };
}
