import { ClipboardList, Clock, Users } from 'lucide-react-native';
import { V2ListScreen, type V2ListItem } from './shared/V2ListScreen';
import { useWaitlist } from './shared/useRestaurantOperations';

export default function WaitlistScreen() {
  const { data: waitlist, loading, error } = useWaitlist();

  const items: V2ListItem[] = loading
    ? [{ icon: Clock, label: 'Carregando fila de espera…' }]
    : error
      ? [{ icon: Clock, label: 'Não foi possível carregar a fila', subtitle: error }]
      : waitlist.length === 0
        ? [{ icon: Users, label: 'Nenhum grupo na fila de espera' }]
        : waitlist.map((entry) => ({
            icon: ClipboardList,
            label: `${entry.customerName} · ${entry.partySize} ${entry.partySize === 1 ? 'pessoa' : 'pessoas'}`,
            subtitle: entry.estimatedWaitMinutes != null ? `Est. ${entry.estimatedWaitMinutes} min` : entry.status,
          }));

  return <V2ListScreen title="Fila de Espera" subtitle="Gestão de waitlist" showBack items={items} />;
}
