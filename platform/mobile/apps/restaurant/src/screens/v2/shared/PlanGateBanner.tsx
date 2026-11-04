import React, { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Pressable, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { supabaseApiAdapter, type PlanSummary } from '@okinawa/shared/services/supabase-api';
import { useRestaurantRole } from '../../../contexts/RestaurantRoleContext';

/**
 * Etapa "Escolha seu plano" e avisos de cobrança. Só o Dono vê; o resto da equipe não trabalha com plano.
 * `always` mantém a entrada para Módulos e plano mesmo sem aviso: é por onde o Dono chega lá no dia a dia.
 */
export function PlanGateBanner({ always = false }: { always?: boolean }) {
  const colors = useColors();
  const navigation = useNavigation<any>();
  const { restaurantId, serverRoles } = useRestaurantRole();
  const [summary, setSummary] = useState<PlanSummary | null>(null);
  const isOwner = serverRoles.includes('owner');

  useFocusEffect(useCallback(() => {
    if (!restaurantId || !isOwner) return;
    supabaseApiAdapter.getPlanSummary(restaurantId).then((result) => {
      setSummary(result);
      // Quem ainda não escolheu: os dias do teste contam deste acesso.
      if (result.needsChoice) void supabaseApiAdapter.notePlanPrompt(restaurantId).catch(() => undefined);
    }).catch(() => setSummary(null));
  }, [isOwner, restaurantId]));

  if (!isOwner || !summary) return null;
  const message = summary.needsChoice
    ? 'Escolha seu plano'
    : summary.ordersSuspended
      ? 'Pedidos suspensos: há fatura em atraso. Comandas abertas continuam.'
      : summary.billingHidden
        ? 'Fatura em atraso: o restaurante saiu da busca do app.'
        : summary.status === 'past_due'
          ? 'Há uma fatura em atraso.'
          : null;
  if (!message && !always) return null;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => navigation.navigate('Plan')}
      style={[styles.banner, { backgroundColor: `${colors.primary}18`, borderColor: colors.primary }]}
    >
      <Text style={{ color: colors.primary, fontWeight: '800' }}>{message ?? `Módulos e plano · ${summary.planName ?? ''}`}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 16 },
});
