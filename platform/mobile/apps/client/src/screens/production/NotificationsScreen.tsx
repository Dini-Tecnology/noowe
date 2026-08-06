import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import customerBackend from '../../services/customer-backend';
import { StateView } from './shared';

export default function NotificationsScreen() {
  const colors = useColors();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['notifications'], queryFn: () => customerBackend.listNotifications() });
  const read = useMutation({
    mutationFn: (id: string) => customerBackend.markNotificationRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        title: { fontSize: 26, fontWeight: '700', color: colors.foreground, marginBottom: 16 },
        card: {
          flexDirection: 'row', gap: 12, padding: 14, borderRadius: 16,
          backgroundColor: colors.card, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, marginBottom: 10,
        },
        unread: { borderColor: colors.primary, backgroundColor: 'rgba(234, 88, 12, 0.06)' },
        dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, marginTop: 6 },
        cardTitle: { fontSize: 15, fontWeight: '700', color: colors.foreground, marginBottom: 2 },
        cardMessage: { fontSize: 13, color: colors.foregroundSecondary },
      }),
    [colors],
  );

  return (
    <ScreenContainer edges={['top']}>
      <ScrollView style={styles.container} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Notificações</Text>
        <StateView
          loading={query.isLoading}
          error={query.error}
          onRetry={() => query.refetch()}
          empty={query.data?.length === 0 ? 'Nenhuma notificação.' : undefined}
          emptyIcon="notifications-outline"
        />
        {(query.data ?? []).map((item) => (
          <TouchableOpacity
            key={item.id}
            style={[styles.card, !item.isRead && styles.unread]}
            onPress={() => !item.isRead && read.mutate(item.id)}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            {!item.isRead && <View style={styles.dot} />}
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardMessage}>{item.message}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </ScreenContainer>
  );
}
