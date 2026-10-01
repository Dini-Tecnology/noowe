import { useCallback, useState } from 'react';
import { Alert, type AlertButton } from 'react-native';
import { Bell, ClipboardList, Clock, Users } from 'lucide-react-native';
import { supabaseApiAdapter } from '@okinawa/shared/services/supabase-api';
import { V2ListScreen, type V2ListItem } from './shared/V2ListScreen';
import { useWaitlist, type WaitlistEntry } from './shared/useRestaurantOperations';

type WaitlistAction = 'call' | 'seat' | 'no_show';

const STATUS_LABELS: Record<string, string> = {
  waiting: 'Na fila',
  called: 'Chamado',
};

function calledSince(calledAt: string | null): string {
  if (!calledAt) return '';
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(calledAt).getTime()) / 60_000));
  return minutes === 0 ? ' agora' : ` há ${minutes} min`;
}

function entrySubtitle(entry: WaitlistEntry): string {
  if (entry.status === 'called') return `${STATUS_LABELS.called}${calledSince(entry.calledAt)} · toque para acomodar`;
  const parts = [STATUS_LABELS[entry.status] ?? entry.status];
  if (entry.estimatedWaitMinutes != null) parts.push(`Est. ${entry.estimatedWaitMinutes} min`);
  parts.push('toque para chamar');
  return parts.join(' · ');
}

export default function WaitlistScreen() {
  const { data: waitlist, loading, error, refresh } = useWaitlist();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const runAction = useCallback(async (entry: WaitlistEntry, action: WaitlistAction) => {
    setPendingId(entry.id);
    try {
      await supabaseApiAdapter.updateWaitlistEntry(entry.id, action);
      await refresh();
    } catch {
      Alert.alert('Não foi possível atualizar', 'O grupo pode já ter saído da fila. Atualize a lista e tente de novo.');
      await refresh();
    } finally {
      setPendingId(null);
    }
  }, [refresh]);

  // Chamar dispara o push "Sua mesa está pronta!" no app do cliente (trigger
  // de notificação em waitlist_entries); acomodar e não-compareceu encerram a entrada.
  const openActions = useCallback((entry: WaitlistEntry) => {
    const title = `${entry.customerName} · ${entry.partySize} ${entry.partySize === 1 ? 'pessoa' : 'pessoas'}`;
    const buttons: AlertButton[] = entry.status === 'called'
      ? [
          { text: 'Acomodar', onPress: () => void runAction(entry, 'seat') },
          { text: 'Não compareceu', style: 'destructive', onPress: () => void runAction(entry, 'no_show') },
        ]
      : [
          { text: 'Chamar grupo', onPress: () => void runAction(entry, 'call') },
          { text: 'Acomodar direto', onPress: () => void runAction(entry, 'seat') },
        ];
    buttons.push({ text: 'Cancelar', style: 'cancel' });
    Alert.alert(title, entry.status === 'called' ? 'Grupo já foi chamado.' : 'Avisar o grupo que a mesa está pronta?', buttons);
  }, [runAction]);

  const items: V2ListItem[] = loading
    ? [{ icon: Clock, label: 'Carregando fila de espera…' }]
    : error
      ? [{ icon: Clock, label: 'Não foi possível carregar a fila', subtitle: error }]
      : waitlist.length === 0
        ? [{ icon: Users, label: 'Nenhum grupo na fila de espera' }]
        : waitlist.map((entry) => ({
            icon: entry.status === 'called' ? Bell : ClipboardList,
            label: `${entry.customerName} · ${entry.partySize} ${entry.partySize === 1 ? 'pessoa' : 'pessoas'}`,
            subtitle: pendingId === entry.id ? 'Atualizando…' : entrySubtitle(entry),
            onPress: pendingId ? undefined : () => openActions(entry),
          }));

  return <V2ListScreen title="Fila de Espera" subtitle="Chame, acomode ou registre ausência" showBack items={items} onRefresh={refresh} />;
}
