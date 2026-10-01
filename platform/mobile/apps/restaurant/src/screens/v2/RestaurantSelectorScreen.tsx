import { Store, Check } from 'lucide-react-native';
import { V2ListScreen, type V2ListItem } from './shared/V2ListScreen';
import { useRestaurantRole } from '../../contexts/RestaurantRoleContext';

export default function RestaurantSelectorScreen() {
  const { restaurants, restaurantsLoading, restaurantId, switchRestaurant, reloadRestaurants } = useRestaurantRole();

  const items: V2ListItem[] = restaurantsLoading
    ? [{ icon: Store, label: 'Carregando unidades…' }]
    : restaurants.length === 0
      ? [{ icon: Store, label: 'Nenhuma unidade vinculada à sua conta' }]
      : restaurants.map((restaurant) => ({
          icon: restaurant.id === restaurantId ? Check : Store,
          label: restaurant.name,
          subtitle: restaurant.id === restaurantId
            ? `Unidade ativa · ${restaurant.city}`
            : `${restaurant.city} · ${restaurant.state}`,
          onPress: restaurant.id === restaurantId ? undefined : () => { void switchRestaurant(restaurant.id); },
        }));

  return <V2ListScreen title="Selecionar restaurante" subtitle="Restaurantes em que você trabalha" showBack items={items} onRefresh={reloadRestaurants} />;
}
