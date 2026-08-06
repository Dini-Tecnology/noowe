import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useMutation } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import { useVisitSession } from '../../contexts/VisitSessionContext';
import customerBackend from '../../services/customer-backend';

const REASONS = [
  { id: 'waiter', icon: 'hand-left-outline' as const, title: 'Chamar Garçom', subtitle: 'Dúvidas sobre pratos, pedidos especiais' },
  { id: 'bill', icon: 'receipt-outline' as const, title: 'Fechar a Conta', subtitle: 'Solicitar o fechamento da comanda' },
  { id: 'help', icon: 'help-circle-outline' as const, title: 'Preciso de Ajuda', subtitle: 'Acessibilidade, limpeza, outros' },
];

export default function CallWaiterScreen({ navigation }: any) {
  const colors = useColors();
  const { session } = useVisitSession();
  const [message, setMessage] = useState('');
  const [sentId, setSentId] = useState<string | null>(null);

  const call = useMutation({
    mutationFn: (reasonMessage: string) =>
      customerBackend.callWaiter({ restaurantId: session!.restaurantId, tableId: session!.tableId, type: 'help', message: reasonMessage }),
    onSuccess: (_data, reasonMessage) => setSentId(reasonMessage),
    onError: (error: Error) => Alert.alert('Não foi possível chamar a equipe', error.message),
  });

  const styles = useMemo(
    () =>
      StyleSheet.create({
        scroll: { flex: 1, backgroundColor: colors.background },
        content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32, gap: 12 },
        title: { fontSize: 22, fontWeight: '700', color: colors.foreground, marginBottom: 4 },
        subtitle: { fontSize: 14, color: colors.foregroundSecondary, marginBottom: 16 },
        card: {
          flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 18,
          backgroundColor: colors.card, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
        },
        iconBox: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#FFF0EA', alignItems: 'center', justifyContent: 'center' },
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
        successWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 },
        successCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center' },
        successTitle: { fontSize: 18, fontWeight: '700', color: colors.foreground },
        successSub: { fontSize: 14, color: colors.foregroundSecondary, textAlign: 'center' },
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

  if (sentId) {
    return (
      <ScreenContainer edges={['top', 'bottom']}>
        <View style={styles.successWrap}>
          <View style={styles.successCircle}>
            <Ionicons name="checkmark" size={36} color="#16A34A" />
          </View>
          <Text style={styles.successTitle}>Chamado enviado</Text>
          <Text style={styles.successSub}>A equipe foi avisada e vai até a Mesa {session.tableNumber}.</Text>
          <TouchableOpacity onPress={() => setSentId(null)} accessibilityRole="button">
            <Text style={{ color: colors.primary, fontWeight: '700' }}>Chamar novamente</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={['top', 'bottom']}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Chamar Equipe</Text>
        <Text style={styles.subtitle}>Mesa {session.tableNumber}</Text>

        {REASONS.map((reason) => (
          <TouchableOpacity
            key={reason.id}
            style={styles.card}
            onPress={() => call.mutate(message || reason.subtitle)}
            disabled={call.isPending}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <View style={styles.iconBox}>
              <Ionicons name={reason.icon} size={24} color={colors.primary} />
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
