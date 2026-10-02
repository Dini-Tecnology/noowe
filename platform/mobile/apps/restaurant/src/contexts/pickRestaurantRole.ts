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
