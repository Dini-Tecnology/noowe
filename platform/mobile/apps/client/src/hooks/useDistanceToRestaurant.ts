import { useEffect, useState } from 'react';
import * as Location from 'expo-location';
import { distanceKm } from '../screens/production/shared';

/**
 * Distância do cliente ao restaurante, só se a permissão de localização JÁ foi
 * concedida (o checkout não abre um pedido de permissão por conta própria).
 * Sem permissão, sem coordenadas do restaurante ou com erro: `null` — o aviso
 * de distância é um auxílio, nunca uma barreira.
 */
export function useDistanceToRestaurant(restaurant: { lat: number | null; lng: number | null } | null | undefined): number | null {
  const [distance, setDistance] = useState<number | null>(null);
  const lat = restaurant?.lat ?? null;
  const lng = restaurant?.lng ?? null;

  useEffect(() => {
    if (lat == null || lng == null) {
      setDistance(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const permission = await Location.getForegroundPermissionsAsync();
        if (permission.status !== 'granted') return;
        const position = (await Location.getLastKnownPositionAsync())
          ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
        if (!cancelled && position) setDistance(distanceKm(position.coords, { lat, lng }));
      } catch {
        if (!cancelled) setDistance(null);
      }
    })();
    return () => { cancelled = true; };
  }, [lat, lng]);

  return distance;
}
