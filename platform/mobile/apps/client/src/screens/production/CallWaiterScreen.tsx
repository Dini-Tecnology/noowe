import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useMutation, useQuery } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import { useVisitSession } from '../../contexts/VisitSessionContext';
import { useServiceTypeFor } from '../../hooks/useServiceTypeFeatures';
import { FeatureUnavailableMessage } from '../../components/ServiceTypeAdapter';
import customerBackend from '../../services/customer-backend';
import { CALL_TEAM_REASONS } from './home-restaurant-ui';
import { rootNavigate } from './shared';

type CallType = (typeof CALL_TEAM_REASONS)[number]['callType'];

const SUCCESS_COPY: Record<CallType, string> = {
  waiter: 'O garçom está a caminho da sua mesa.',
  sommelier: 'O sommelier está a caminho da sua mesa.',
  help: 'A equipe está a caminho da sua mesa.',
};

export default function CallWaiterScreen({ navigation }: any) {
  const colors = useColors();
  const { session } = useVisitSession();
  const [message, setMessage] = useState('');
  const [sentType, setSentType] = useState<CallType | null>(null);
  const { status: serviceTypeStatus, features } = useServiceTypeFor(session?.restaurantId);
  const restaurant = useQuery({
    queryKey: ['restaurant', session?.restaurantId],
    queryFn: () => customerBackend.getRestaurant(session!.restaurantId),
    enabled: !!session?.restaurantId,
  });

  const call = useMutation({
    mutationFn: (input: { type: CallType; message: string }) =>
      customerBackend.callWaiter({
        restaurantId: session!.restaurantId,
        tableId: session!.tableId,
        type: input.type,
        message: input.message,
      }),
    onSuccess: (_data, input) => setSentType(input.type),
    onError: (error: Error) => Alert.alert('Não foi possível chamar a equipe', error.message),
  });

  const styles = useMemo(
    () =>
      StyleSheet.create({
        scroll: { flex: 1, backgroundColor: colors.background },
        content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32, gap: 12 },
        subtitle: { fontSize: 14, color: colors.foregroundSecondary, marginBottom: 16 },
        card: {
          flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 18,
          backgroundColor: colors.card, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
        },
        iconBox: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
        cardTitle: { fontSize: 16, fontWeight: '700', color: colors.foreground, marginBottom: 4 },
        cardSub: { fontSize: 13, lineHeight: 18, color: colors.foregroundSecondary },
        messageInput: {
          minHeight: 90, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 14,
          fontSize: 15, color: colors.foreground, textAlignVertical: 'top', backgroundColor: colors.card, marginTop: 8,
        },
        emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 },
        emptyStateText: { fontSize: 14, color: colors.foregroundSecondary, textAlign: 'center' },
        emptyStateBtn: { marginTop: 8, backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14 },
        emptyStateBtnText: { color: colors.primaryForeground, fontSize: 14, fontWeight: '700' },
        successWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 32 },
        successCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
        successTitle: { fontSize: 20, fontWeight: '700', color: colors.foreground },
        successSub: { fontSize: 14, color: colors.foregroundSecondary, textAlign: 'center' },
        successEta: { fontSize: 13, color: colors.foregroundMuted, marginBottom: 20 },
        successBtn: { paddingHorizontal: 24, paddingVertical: 14, borderRadius: 16, borderWidth: 1.5, borderColor: colors.border },
        successBtnText: { fontSize: 15, fontWeight: '700', color: colors.foreground },
      }),
    [colors],
  );

  if (!session?.tableId) {
    return (
      <ScreenContainer edges={['top', 'bottom']}>
        <View style={styles.emptyState}>
          <Ionicons name="qr-code-outline" size={40} color={colors.foregroundMuted} />
          <Text style={styles.emptyStateText}>Leia o QR Code da mesa para poder chamar a equipe.</Text>
          <TouchableOpacity style={styles.emptyStateBtn} onPress={() => navigation.navigate('QrScanner')} accessibilityRole="button">
            <Text style={styles.emptyStateBtnText}>Escanear QR</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  if (serviceTypeStatus === 'loading') {
    return (
      <ScreenContainer edges={['top', 'bottom']}>
        <View style={styles.emptyState}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  if (!features.callWaiter) {
    return (
      <ScreenContainer edges={['top', 'bottom']}>
        <View style={{ padding: 16 }}>
          <FeatureUnavailableMessage feature="Chamar Equipe" message="Este restaurante não usa chamada de garçom pelo app." />
        </View>
      </ScreenContainer>
    );
  }

  if (sentType) {
    return (
      <ScreenContainer edges={['top', 'bottom']}>
        <View style={styles.successWrap}>
          <View style={styles.successCircle}>
            <Ionicons name="checkmark" size={36} color="#16A34A" />
          </View>
          <Text style={styles.successTitle}>Chamado enviado!</Text>
          <Text style={styles.successSub}>{SUCCESS_COPY[sentType]}</Text>
          <Text style={styles.successEta}>Tempo estimado: ~2 min</Text>
          <TouchableOpacity
            style={styles.successBtn}
            onPress={() => rootNavigate(navigation, 'Menu', { restaurantId: session.restaurantId })}
            accessibilityRole="button"
          >
            <Text style={styles.successBtnText}>Voltar ao Cardápio</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={['top', 'bottom']}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.subtitle}>
          Mesa {session.tableNumber}{restaurant.data?.name ? ` · ${restaurant.data.name}` : ''}
        </Text>

        {CALL_TEAM_REASONS.map((reason) => (
          <TouchableOpacity
            key={reason.callType}
            style={styles.card}
            onPress={() => call.mutate({ type: reason.callType, message: message || reason.subtitle })}
            disabled={call.isPending}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <View style={[styles.iconBox, { backgroundColor: reason.tint }]}>
              <Ionicons name={reason.icon} size={24} color={reason.iconColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{reason.title}</Text>
              <Text style={styles.cardSub}>{reason.subtitle}</Text>
            </View>
          </TouchableOpacity>
        ))}

        <TextInput
          style={styles.messageInput}
          placeholder="Mensagem opcional (ex: preciso de talheres extras)"
          placeholderTextColor={colors.foregroundMuted}
          value={message}
          onChangeText={setMessage}
          multiline
        />
      </ScrollView>
    </ScreenContainer>
  );
}
