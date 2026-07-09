import { useEffect, useState } from 'react';
import { Tag, Percent } from 'lucide-react-native';
import { supabaseApiAdapter } from '@okinawa/shared/services/supabase-api';
import { V2ListScreen, type V2ListItem } from './shared/V2ListScreen';
import { useRestaurantRole } from '../../contexts/RestaurantRoleContext';

interface Promotion {
  id: string;
  title: string;
  type: string;
  discount_value: number | null;
  valid_from: string;
  valid_until: string;
}

function formatWindow(from: string, until: string) {
  const fromDate = new Date(from);
  const untilDate = new Date(until);
  const opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit' };
  return `${fromDate.toLocaleDateString('pt-BR', opts)} a ${untilDate.toLocaleDateString('pt-BR', opts)}`;
}

export default function PromotionsScreen() {
  const { restaurantId } = useRestaurantRole();
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!restaurantId) return;
    supabaseApiAdapter.getPromotions(restaurantId, 'active')
      .then((rows) => { if (!cancelled) setPromotions(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (!cancelled) setPromotions([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [restaurantId]);

  const items: V2ListItem[] = loading
    ? [{ icon: Tag, label: 'Carregando campanhas…' }]
    : promotions.length === 0
      ? [{ icon: Tag, label: 'Nenhuma campanha ativa' }]
      : promotions.map((promo) => ({
          icon: Percent,
          label: promo.title,
          subtitle: `${formatWindow(promo.valid_from, promo.valid_until)}${promo.discount_value ? ` · ${promo.discount_value}% off` : ''}`,
        }));

  return <V2ListScreen title="Promoções" subtitle="Campanhas ativas" showBack items={items} />;
}
