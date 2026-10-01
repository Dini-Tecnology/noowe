import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { useVisitSession } from '../../contexts/VisitSessionContext';
import { useIncomingTableInvites } from '../../hooks/useTableUserInvites';
import { useRespondToTableInvite } from '../../hooks/useRespondToTableInvite';
import type { TableUserInvite, VisitSession } from '../../services/customer-backend';

/** Re-render cadence of the countdown (UX only). */
const COUNTDOWN_TICK_MS = 30_000;

function minutesUntil(iso: string | null, now: number): number | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return null;
  return Math.max(0, Math.ceil((at - now) / 60_000));
}

type Props = {
  /** Called once I'm at the invited table (right away, or after the host stand approves). */
  onJoined: (visit: VisitSession) => void;
};

/**
 * "@ana te chamou para a mesa 12" — invites addressed to me, with Aceitar /
 * Recusar. Lives on Home so an invite is never more than one screen away; the
 * same actions are also available from the notification.
 */
export default function IncomingTableInviteBanner({ onJoined }: Props) {
  const colors = useColors();
  const { session, refreshSession } = useVisitSession();
  const { accept, decline } = useRespondToTableInvite();
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const incoming = useIncomingTableInvites(true, (change) => {
    // The host stand approved my entry (ADR-007): the server already seated me.
    if (change?.status === 'accepted' && change.tableSessionId !== session?.tableSessionId) {
      void refreshSession().then((visit) => {
        if (visit?.tableSessionId === change.tableSessionId) onJoined(visit);
      }).catch(() => undefined);
    }
  });

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), COUNTDOWN_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const styles = useMemo(() => StyleSheet.create({
    wrap: { gap: 10, marginBottom: 14 },
    card: { padding: 14, borderRadius: 18, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.primary },
    top: { flexDirection: 'row', alignItems: 'center', gap: 11 },
    avatar: { width: 42, height: 42, borderRadius: 21, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.backgroundTertiary },
    avatarImage: { width: '100%', height: '100%' },
    avatarText: { color: colors.primary, fontSize: 16, fontWeight: '800' },
    info: { flex: 1, minWidth: 0 },
    title: { color: colors.foreground, fontSize: 14, fontWeight: '800' },
    sub: { marginTop: 3, color: colors.foregroundSecondary, fontSize: 12 },
    status: { marginTop: 10, color: colors.foregroundSecondary, fontSize: 12, lineHeight: 17 },
    actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
    button: { flex: 1, minHeight: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
    primary: { backgroundColor: colors.primary },
    primaryText: { color: colors.primaryForeground, fontSize: 13, fontWeight: '800' },
    secondary: { backgroundColor: colors.backgroundTertiary },
    secondaryText: { color: colors.foregroundSecondary, fontSize: 13, fontWeight: '800' },
  }), [colors]);

  const invites = incoming.data ?? [];
  if (invites.length === 0) return null;

  const run = async (invite: TableUserInvite, action: 'accept' | 'decline') => {
    setBusy(`${invite.id}:${action}`);
    try {
      const outcome = action === 'accept' ? await accept(invite) : await decline(invite);
      if (outcome.kind === 'joined') onJoined(outcome.visit);
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.wrap}>
      {invites.map((invite) => {
        const awaiting = invite.status === 'awaiting_capacity';
        const expiresIn = minutesUntil(invite.expiresAt, now);
        const capacityIn = minutesUntil(invite.capacityExpiresAt, now);
        const statusText = awaiting
          ? capacityIn === 0
            ? 'A recepção ainda não respondeu. Fale com a recepção do restaurante.'
            : 'Mesa cheia: aguardando a recepção liberar um lugar para você.'
          : expiresIn != null
            ? `Expira em ${expiresIn} min.`
            : null;
        return (
          <View key={invite.id} style={styles.card} testID={`incoming-invite-${invite.id}`}>
            <View style={styles.top}>
              <View style={styles.avatar}>
                {invite.inviter.avatarUrl
                  ? <Image source={{ uri: invite.inviter.avatarUrl }} style={styles.avatarImage} />
                  : <Text style={styles.avatarText}>{(invite.inviter.username[0] ?? '?').toUpperCase()}</Text>}
              </View>
              <View style={styles.info}>
                <Text numberOfLines={2} style={styles.title}>@{invite.inviter.username} te chamou para a mesa</Text>
                <Text numberOfLines={1} style={styles.sub}>{invite.restaurantName} · Mesa {invite.tableNumber}</Text>
              </View>
              <Ionicons name={awaiting ? 'hourglass-outline' : 'people-outline'} size={20} color={colors.primary} />
            </View>
            {statusText ? <Text style={styles.status}>{statusText}</Text> : null}
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.button, styles.secondary]}
                onPress={() => void run(invite, 'decline')}
                disabled={!!busy}
                accessibilityRole="button"
                accessibilityLabel={awaiting ? 'Desistir de entrar na mesa' : `Recusar convite de @${invite.inviter.username}`}
              >
                {busy === `${invite.id}:decline`
                  ? <ActivityIndicator size="small" color={colors.foregroundSecondary} />
                  : <Text style={styles.secondaryText}>{awaiting ? 'Desistir' : 'Recusar'}</Text>}
              </TouchableOpacity>
              {!awaiting ? (
                <TouchableOpacity
                  style={[styles.button, styles.primary]}
                  onPress={() => void run(invite, 'accept')}
                  disabled={!!busy}
                  accessibilityRole="button"
                  accessibilityLabel={`Aceitar convite de @${invite.inviter.username}`}
                >
                  {busy === `${invite.id}:accept`
                    ? <ActivityIndicator size="small" color={colors.primaryForeground} />
                    : <Text style={styles.primaryText}>Aceitar</Text>}
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}
