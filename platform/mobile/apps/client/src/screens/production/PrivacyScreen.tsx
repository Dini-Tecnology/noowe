import React, { useMemo } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import { useMutation } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import customerBackend from '../../services/customer-backend';

export default function PrivacyScreen() {
  const colors = useColors();
  const exportData = useMutation({
    mutationFn: () => customerBackend.exportUserData(),
    onSuccess: () => Alert.alert('Exportação solicitada', 'Seus dados foram preparados conforme a política vigente.'),
    onError: (error: Error) => Alert.alert('Erro', error.message),
  });
  const remove = useMutation({
    mutationFn: () => customerBackend.requestAccountDeletion(),
    onSuccess: () => Alert.alert('Solicitação registrada'),
  });

  const policy = process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL;
  const terms = process.env.EXPO_PUBLIC_TERMS_OF_SERVICE_URL;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        scroll: { flex: 1, backgroundColor: colors.background },
        content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32, gap: 12 },
        title: { fontSize: 26, fontWeight: '700', color: colors.foreground },
        subtitle: { fontSize: 14, color: colors.foregroundSecondary, marginBottom: 8 },
        row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
        rowText: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.foreground },
        rowDisabled: { opacity: 0.4 },
        dangerBtn: { marginTop: 16, paddingVertical: 14, borderRadius: 16, borderWidth: 1.5, borderColor: '#DC2626', alignItems: 'center' },
        dangerBtnText: { color: '#DC2626', fontSize: 15, fontWeight: '700' },
      }),
    [colors],
  );

  return (
    <ScreenContainer edges={['top']}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Privacidade e LGPD</Text>
        <Text style={styles.subtitle}>Consulte, exporte ou solicite a exclusão dos seus dados.</Text>

        <TouchableOpacity style={[styles.row, !policy && styles.rowDisabled]} onPress={() => policy && Linking.openURL(policy)} disabled={!policy} accessibilityRole="button">
          <Ionicons name="document-text-outline" size={20} color={colors.primary} />
          <Text style={styles.rowText}>Política de privacidade</Text>
          <Ionicons name="open-outline" size={18} color={colors.foregroundMuted} />
        </TouchableOpacity>

        <TouchableOpacity style={[styles.row, !terms && styles.rowDisabled]} onPress={() => terms && Linking.openURL(terms)} disabled={!terms} accessibilityRole="button">
          <Ionicons name="reader-outline" size={20} color={colors.primary} />
          <Text style={styles.rowText}>Termos de uso</Text>
          <Ionicons name="open-outline" size={18} color={colors.foregroundMuted} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.row} onPress={() => exportData.mutate()} disabled={exportData.isPending} accessibilityRole="button">
          <Ionicons name="download-outline" size={20} color={colors.primary} />
          <Text style={styles.rowText}>{exportData.isPending ? 'Exportando...' : 'Exportar meus dados'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.dangerBtn}
          onPress={() =>
            Alert.alert('Excluir conta?', 'A solicitação seguirá os prazos legais.', [
              { text: 'Cancelar' },
              { text: 'Solicitar', style: 'destructive', onPress: () => remove.mutate() },
            ])
          }
          disabled={remove.isPending}
          accessibilityRole="button"
        >
          <Text style={styles.dangerBtnText}>{remove.isPending ? 'Enviando...' : 'Solicitar exclusão de conta'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </ScreenContainer>
  );
}
