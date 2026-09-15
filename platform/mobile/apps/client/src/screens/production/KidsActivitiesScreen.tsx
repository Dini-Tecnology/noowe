/* Hallmark · pre-emit critique: P5 H5 E4 S5 R4 V5 */
/* Hallmark · macrostructure: List · tone: warm utilitarian · anchor hue: orange */
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import customerBackend from '../../services/customer-backend';
import { rootNavigate, StateView } from './shared';

export default function KidsActivitiesScreen({ route, navigation }: any) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const restaurantId: string | undefined = route?.params?.restaurantId;

  const activities = useQuery({
    queryKey: ['kid-activities'],
    queryFn: () => customerBackend.listKidActivities(),
  });

  const styles = useMemo(
    () =>
      StyleSheet.create({
        scroll: { flex: 1, backgroundColor: colors.background },
        content: { paddingHorizontal: 16, paddingBottom: 40 },
        header: { flexDirection: 'row', alignItems: 'center', paddingBottom: 12, gap: 12 },
        headerBtn: {
          width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
          backgroundColor: colors.backgroundTertiary,
        },
        headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: colors.foreground, marginRight: 36 },
        hint: {
          flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, borderRadius: 16,
          backgroundColor: colors.backgroundSecondary, marginBottom: 16,
        },
        hintText: { flex: 1, fontSize: 13, lineHeight: 18, color: colors.primary },
        card: {
          flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 18,
          backgroundColor: colors.backgroundSecondary, borderWidth: 1, borderColor: colors.primaryLight, marginBottom: 12,
        },
        cardUnavailable: { backgroundColor: colors.card, borderColor: colors.border, opacity: 0.7 },
        icon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
        title: { fontSize: 15, fontWeight: '700', color: colors.foreground },
        subtitle: { fontSize: 13, color: colors.foregroundSecondary, marginTop: 2 },
        badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: colors.successBackground },
        badgeText: { fontSize: 11, fontWeight: '700', color: colors.success },
        badgeUnavailable: { backgroundColor: colors.backgroundTertiary },
        badgeTextUnavailable: { color: colors.foregroundMuted },
        cta: { marginTop: 8, paddingVertical: 17, borderRadius: 18, alignItems: 'center', backgroundColor: colors.primary },
        ctaText: { fontSize: 16, fontWeight: '700', color: colors.primaryForeground },
      }),
    [colors],
  );

  return (
    <ScreenContainer edges={['bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 8 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Voltar">
            <Ionicons name="arrow-back" size={20} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Atividades Kids</Text>
        </View>

        <View style={styles.hint}>
          <Ionicons name="flash-outline" size={16} color={colors.primary} />
          <Text style={styles.hintText}>Atividades para entreter as crianças enquanto a comida chega</Text>
        </View>

        <StateView loading={activities.isLoading} error={activities.error} onRetry={() => activities.refetch()} />

        {(activities.data ?? []).map((activity) => {
          const available = activity.status === 'available';
          return (
            <View key={activity.key} style={[styles.card, !available && styles.cardUnavailable]}>
              <View style={styles.icon}>
                <Ionicons name={activity.icon as any} size={22} color={available ? colors.primary : colors.foregroundMuted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{activity.title}</Text>
                <Text style={styles.subtitle}>{activity.subtitle}</Text>
              </View>
              <View style={[styles.badge, !available && styles.badgeUnavailable]}>
                <Text style={[styles.badgeText, !available && styles.badgeTextUnavailable]}>
                  {available ? 'Disponível' : 'Em breve'}
                </Text>
              </View>
            </View>
          );
        })}

        <TouchableOpacity
          style={styles.cta}
          onPress={() => rootNavigate(navigation, 'Menu', { restaurantId })}
          activeOpacity={0.9}
          accessibilityRole="button"
        >
          <Text style={styles.ctaText}>Ir para o Cardápio</Text>
        </TouchableOpacity>
      </ScrollView>
    </ScreenContainer>
  );
}
