import { useEffect, useState } from 'react';
import { Calendar, ClipboardList, Map, Users } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { supabaseApiAdapter } from '@okinawa/shared/services/supabase-api';
import { MaitreRoleView, useRestaurantRole } from '../../contexts/RestaurantRoleContext';
import { V2ListScreen } from './shared/V2ListScreen';
import { useRestaurantTables, useWaitlist } from './shared/useRestaurantOperations';

export default function MaitreScreen() {
  const navigation = useNavigation<any>();
  const { setRole, setMaitreView, restaurantId } = useRestaurantRole();
  const { data: tables } = useRestaurantTables();
  const { data: waitlist } = useWaitlist();
  const [reservationsToday, setReservationsToday] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!restaurantId) return;
    const today = new Date().toISOString().slice(0, 10);
    supabaseApiAdapter.getRestaurantReservations(restaurantId, today)
      .then((rows) => { if (!cancelled) setReservationsToday(Array.isArray(rows) ? rows.length : 0); })
      .catch(() => { if (!cancelled) setReservationsToday(null); });
    return () => { cancelled = true; };
  }, [restaurantId]);

  const availableTables = tables.filter((table) => table.status === 'available').length;
  const avgWaitMinutes = waitlist.length > 0
    ? Math.round(waitlist.reduce((sum, entry) => sum + (entry.estimatedWaitMinutes ?? 0), 0) / waitlist.length)
    : 0;

  const openMaitreView = (view: MaitreRoleView) => {
    setRole('maitre');
    setMaitreView(view);
    navigation.navigate('Tabs');
  };

  return (
    <V2ListScreen title="Maître" subtitle="Sala, fluxo e reservas" showBack items={[
      {
        icon: Calendar,
        label: 'Reservas',
        subtitle: reservationsToday != null ? `${reservationsToday} reserva${reservationsToday === 1 ? '' : 's'} hoje` : 'Carregando…',
        onPress: () => openMaitreView('maitre-reservations'),
      },
      {
        icon: Users,
        label: 'Fluxo do Salão',
        subtitle: waitlist.length > 0 ? `${avgWaitMinutes}min de fila estimada` : 'Sem fila de espera',
        onPress: () => openMaitreView('maitre-flow'),
      },
      { icon: Map, label: 'Mapa de Mesas', subtitle: `${availableTables} mesa${availableTables === 1 ? '' : 's'} livre${availableTables === 1 ? '' : 's'}`, onPress: () => openMaitreView('maitre-tables') },
      { icon: ClipboardList, label: 'Gestão de Reservas', subtitle: 'Confirmação, grupos e no-show', onPress: () => openMaitreView('maitre-management') },
    ]} />
  );
}
