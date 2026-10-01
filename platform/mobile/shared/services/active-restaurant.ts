/**
 * Restaurante ativo do app do restaurante. Uma pessoa pode trabalhar em mais de
 * um restaurante: a conta é uma só, o restaurante em uso é uma escolha. Qualquer
 * chamada que não receba um restaurante explícito usa este (e nunca "o primeiro
 * vínculo que o banco devolver"). O servidor continua sendo a autoridade — RLS
 * decide o que cada vínculo enxerga.
 */
let activeRestaurantId: string | null = null;

export function setActiveRestaurantId(restaurantId: string | null): void {
  activeRestaurantId = restaurantId;
}

export function getActiveRestaurantId(): string | null {
  return activeRestaurantId;
}
