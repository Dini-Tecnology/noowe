import React, { useCallback } from 'react';
import { View, ScrollView, StyleSheet, Alert, RefreshControl } from 'react-native';
import { Text, Switch, Button, ActivityIndicator, Divider } from 'react-native-paper';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { t } from '@okinawa/shared/i18n';
import ApiService from '@okinawa/shared/services/api';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';

interface ConsentRecord {
  id: string;
  consent_type: string;
  version: string;
  accepted_at: string;
}

const CONSENT_LABELS: Record<string, { label: string; description: string; revocable: boolean }> = {
  terms_of_service: {
    label: 'Termos de Uso',
    description: 'Necessário para utilizar a plataforma.',
    revocable: false,
  },
  privacy_policy: {
    label: 'Política de Privacidade',
    description: 'Necessário para utilizar a plataforma.',
    revocable: false,
  },
  marketing: {
    label: 'Comunicações de Marketing',
    description: 'Receber ofertas, novidades e promoções por email e push.',
    revocable: true,
  },
  analytics: {
    label: 'Análise de Uso',
    description: 'Permitir coleta de dados anônimos para melhoria do app.',
    revocable: true,
  },
  geolocation: {
    label: 'Geolocalização',
    description: 'Permitir uso da localização para encontrar restaurantes próximos.',
    revocable: true,
  },
};

export default function ManageConsentsScreen() {
  const colors = useColors();
  const queryClient = useQueryClient();

  const { data: consents, isLoading, isRefetching, refetch } = useQuery<ConsentRecord[]>({
    queryKey: ['user-consents'],
    queryFn: async () => {
      const res = await ApiService.get('/users/me/consent');
      return res.data;
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (consentType: string) => {
      await ApiService.delete(`/users/me/consent/${consentType}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-consents'] });
    },
    onError: (error: any) => {
      Alert.alert(
        t('common.error'),
        error?.response?.data?.message || t('common.genericError'),
      );
    },
  });

  const activeTypes = new Set(consents?.map((c) => c.consent_type) || []);

  const handleToggle = useCallback(
    (consentType: string, isActive: boolean) => {
      if (!isActive) {
        // Revoking consent
        Alert.alert(
          'Revogar Consentimento',
          `Deseja revogar o consentimento para "${CONSENT_LABELS[consentType]?.label || consentType}"?`,
          [
            { text: 'Cancelar', style: 'cancel' },
            {
              text: 'Revogar',
              style: 'destructive',
              onPress: () => revokeMutation.mutate(consentType),
            },
          ],
        );
      }
    },
    [revokeMutation],
  );

  if (isLoading) {
    return (
      <ScreenContainer>
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" />
      </View>
    
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { void refetch(); }} tintColor={colors.primary} colors={[colors.primary]} />}
    >
      <Text style={[styles.header, { color: colors.foreground }]}>
        Gerenciar Consentimentos
      </Text>
      <Text style={[styles.subtitle, { color: colors.foregroundSecondary }]}>
        Você pode revogar consentimentos opcionais a qualquer momento, conforme a LGPD.
      </Text>

      {Object.entries(CONSENT_LABELS).map(([type, info]) => {
        const isActive = activeTypes.has(type);
        return (
          <View key={type}>
            <View style={styles.row}>
              <View style={styles.labelContainer}>
                <Text style={[styles.label, { color: colors.foreground }]}>{info.label}</Text>
                <Text style={[styles.description, { color: colors.foregroundSecondary }]}>
                  {info.description}
                </Text>
                {!info.revocable && (
                  <Text style={[styles.required, { color: colors.warning }]}>
                    Obrigatório
                  </Text>
                )}
              </View>
              <Switch
                value={isActive}
                disabled={!info.revocable || revokeMutation.isPending}
                onValueChange={() => handleToggle(type, !isActive)}
                color={colors.primary}
                accessibilityLabel={`${info.label} consent toggle`}
              />
            </View>
            <Divider />
          </View>
        );
      })}

      {/* Export Data Section */}
      <View style={styles.exportSection}>
        <Text style={[styles.exportTitle, { color: colors.foreground }]}>
          Exportar Meus Dados
        </Text>
        <Text style={[styles.description, { color: colors.foregroundSecondary }]}>
          Solicite uma cópia de todos os seus dados pessoais, conforme previsto pela LGPD.
        </Text>
        <Button
          mode="outlined"
          style={styles.exportButton}
          onPress={async () => {
            try {
              const res = await ApiService.get('/users/me/export/download');
              const downloadUrl = res.data?.url || res.data?.download_url || '';
              Alert.alert(
                'Exportar Dados',
                `Seu arquivo estará disponível por 72h.\n\n${downloadUrl || 'A exportação foi solicitada com sucesso.'}`,
              );
            } catch {
              Alert.alert(t('common.error'), t('common.genericError'));
            }
          }}
        >
          Exportar Meus Dados
        </Button>
      </View>

      <Divider style={{ marginVertical: 16 }} />

      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: colors.foregroundSecondary }]}>
          Para revogar os Termos de Uso ou Política de Privacidade, é necessário excluir sua conta.
        </Text>
        <Button
          mode="outlined"
          textColor={colors.destructive}
          style={[styles.deleteButton, { borderColor: colors.error }]}
          onPress={() => {
            Alert.alert(
              'Excluir Conta',
              'Esta ação é irreversível. Todos os seus dados pessoais serão anonimizados.',
              [
                { text: 'Cancelar', style: 'cancel' },
                {
                  text: 'Excluir Conta',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await ApiService.delete('/users/me');
                      Alert.alert('Conta excluída', 'Seus dados foram anonimizados.');
                    } catch {
                      Alert.alert(t('common.error'), t('common.genericError'));
                    }
                  },
                },
              ],
            );
          }}
        >
          Excluir Minha Conta
        </Button>
      </View>
    </ScrollView>
  
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { fontSize: 24, fontWeight: '700', marginBottom: 4 },
  subtitle: { fontSize: 14, marginBottom: 20, lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16 },
  labelContainer: { flex: 1, marginRight: 12 },
  label: { fontSize: 16, fontWeight: '600' },
  description: { fontSize: 14, marginTop: 2, lineHeight: 18 },
  required: { fontSize: 12, fontWeight: '600', marginTop: 4 },
  exportSection: { marginTop: 32 },
  exportTitle: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  exportButton: { marginTop: 12 },
  footer: { marginBottom: 40 },
  footerText: { fontSize: 14, lineHeight: 18, marginBottom: 16 },
  deleteButton: {},
});
