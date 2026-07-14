import { useCallback, useEffect, useState } from 'react';
import { Star, MessageSquare } from 'lucide-react-native';
import { supabaseApiAdapter } from '@okinawa/shared/services/supabase-api';
import { V2ListScreen, type V2ListItem } from './shared/V2ListScreen';
import { useRestaurantRole } from '../../contexts/RestaurantRoleContext';

interface ReviewsData {
  average_rating?: number;
  total_reviews?: number;
  reviews?: Array<{ id: string; rating: number; comment: string | null; customer_name: string | null }>;
}

export default function ReviewsScreen() {
  const { restaurantId } = useRestaurantRole();
  const [data, setData] = useState<ReviewsData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!restaurantId) return;
    setLoading(true);
    try {
      const result = await supabaseApiAdapter.getReviews(restaurantId, 20);
      setData(result ?? {});
    } catch {
      setData({});
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => { void load(); }, [load]);

  const items: V2ListItem[] = loading
    ? [{ icon: Star, label: 'Carregando avaliações…' }]
    : [
        {
          icon: Star,
          label: `${(data?.average_rating ?? 0).toFixed(1)} média geral`,
          subtitle: `${data?.total_reviews ?? 0} avaliações`,
        },
        ...(data?.reviews ?? []).map((review) => ({
          icon: MessageSquare,
          label: `${review.customer_name ?? 'Cliente'} · ${review.rating} estrela${review.rating === 1 ? '' : 's'}`,
          subtitle: review.comment ?? 'Sem comentário',
        })),
      ];

  return <V2ListScreen title="Avaliações" subtitle="Feedback dos clientes" showBack items={items} onRefresh={load} />;
}
