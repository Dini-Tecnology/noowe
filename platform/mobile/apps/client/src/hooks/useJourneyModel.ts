import { useVisitSession } from '../contexts/VisitSessionContext';
import type { ServiceModel } from '@okinawa/shared/config/capabilities';

/**
 * A experiência em andamento num restaurante (ADR-017): a da mesa aberta, senão a que o
 * cliente escolheu (chip da descoberta ou seletor da página), senão null — e quem chama
 * cai no tipo principal do restaurante.
 */
export function useJourneyModel(restaurantId: string | null | undefined, routeModel?: ServiceModel | null): ServiceModel | null {
  const { session } = useVisitSession();
  const here = !!restaurantId && session?.restaurantId === restaurantId;
  if (here && session?.tableSessionId && session.serviceModel) return session.serviceModel;
  return routeModel ?? (here ? session?.serviceModel ?? null : null);
}
