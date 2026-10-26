import { enterComanda } from '../../navigation/comanda';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import { OTPInput } from '@okinawa/shared/components/auth/OTPInput';
import { INVITE_FAILURE_MESSAGES, useTableInviteHandler } from '../../hooks/useTableInviteHandler';
import { rootNavigate } from './shared';

const CODE_LENGTH = 6;

/**
 * "Digite o código" — o convidado entra na mesa do anfitrião com o código de 6 dígitos que ele
 * lê em voz alta (ADR-019). O servidor limita as tentativas; aqui só se explica o motivo da recusa.
 */
export default function TableCodeScreen({ navigation }: any) {
  const colors = useColors();
  const { handleInviteCode } = useTableInviteHandler();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const submit = async (value: string) => {
    if (busy || value.length !== CODE_LENGTH) return;
    setBusy(true);
    setFailed(false);
    const outcome = await handleInviteCode(value);
    setBusy(false);
    if (outcome.ok) {
      enterComanda(navigation);
      return;
    }
    setFailed(true);
    setCode('');
    const { title, message } = INVITE_FAILURE_MESSAGES[outcome.reason];
    Alert.alert(title, message);
  };

  const styles = useMemo(() => StyleSheet.create({
    page: { flex: 1, padding: 24, gap: 18 },
    back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: 24, fontWeight: '800', color: colors.foreground },
    text: { fontSize: 14, lineHeight: 20, color: colors.foregroundSecondary },
    busy: { alignItems: 'center', marginTop: 8 },
  }), [colors]);

  return (
    <ScreenContainer>
      <View style={styles.page}>
        <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Voltar">
          <Ionicons name="chevron-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={styles.title}>Digite o código da mesa</Text>
        <Text style={styles.text}>Peça ao anfitrião o código de 6 dígitos que aparece em Convidar, na comanda dele.</Text>
        <OTPInput value={code} onChange={setCode} onComplete={(value) => void submit(value)} disabled={busy} error={failed} />
        {busy ? <View style={styles.busy}><ActivityIndicator color={colors.primary} /></View> : null}
      </View>
    </ScreenContainer>
  );
}
