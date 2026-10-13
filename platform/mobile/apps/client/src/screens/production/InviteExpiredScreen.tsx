import React, { useMemo } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import { rootNavigate } from './shared';

/**
 * T-G2-07 — link ou QR de convite que não vale mais. Explica o motivo e não abre mesa nem sessão:
 * o convite só entra numa sessão existente, e esta já não aceita novos convidados por ele.
 */
export default function InviteExpiredScreen({ navigation }: any) {
  const colors = useColors();

  const styles = useMemo(() => StyleSheet.create({
    page: { flex: 1, padding: 24, justifyContent: 'center', gap: 16 },
    icon: { alignSelf: 'center', marginBottom: 4 },
    title: { fontSize: 24, fontWeight: '800', color: colors.foreground, textAlign: 'center' },
    text: { fontSize: 15, lineHeight: 22, color: colors.foregroundSecondary, textAlign: 'center' },
    reasons: { gap: 6, paddingHorizontal: 8 },
    reason: { fontSize: 14, lineHeight: 20, color: colors.foregroundSecondary },
    primary: { height: 52, borderRadius: 16, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
    primaryText: { color: '#fff', fontSize: 16, fontWeight: '800' },
    secondary: { height: 48, alignItems: 'center', justifyContent: 'center' },
    secondaryText: { color: colors.primary, fontSize: 15, fontWeight: '700' },
  }), [colors]);

  return (
    <ScreenContainer>
      <View style={styles.page} testID="invite-expired-screen">
        <Ionicons name="time-outline" size={56} color={colors.foregroundSecondary} style={styles.icon} />
        <Text style={styles.title}>Este convite não vale mais</Text>
        <Text style={styles.text}>Nenhuma mesa foi aberta. Convites só entram numa mesa que já está em andamento.</Text>
        <View style={styles.reasons}>
          <Text style={styles.reason}>• O tempo do convite acabou;</Text>
          <Text style={styles.reason}>• a conta da mesa já foi encerrada; ou</Text>
          <Text style={styles.reason}>• o anfitrião cancelou o convite.</Text>
        </View>
        <Text style={styles.text}>Peça um novo link, QR ou código ao anfitrião.</Text>
        <TouchableOpacity
          style={styles.primary}
          onPress={() => rootNavigate(navigation, 'TableCode')}
          accessibilityRole="button"
          testID="invite-expired-enter-code"
        >
          <Text style={styles.primaryText}>Digitar um código</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondary}
          onPress={() => rootNavigate(navigation, 'Home')}
          accessibilityRole="button"
          testID="invite-expired-home"
        >
          <Text style={styles.secondaryText}>Voltar ao início</Text>
        </TouchableOpacity>
      </View>
    </ScreenContainer>
  );
}
