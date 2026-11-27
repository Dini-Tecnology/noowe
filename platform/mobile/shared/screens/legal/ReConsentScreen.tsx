/**
 * ReConsentScreen — aceite dos Termos e da Política de Privacidade vigentes (LEGAL_VERSIONS).
 *
 * Aparece quando o usuário logado ainda não aceitou as versões atuais. O aceite é gravado no servidor
 * (RPC accept_legal_terms). Os textos completos ficam publicados no site; a tela leva até eles.
 * Recusar oferece a exclusão da conta (RPC request_account_deletion).
 */

import React, { useMemo, useState } from 'react';
import { View, StyleSheet, Alert, Linking, TouchableOpacity } from 'react-native';
import { Text, Button } from 'react-native-paper';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '../../components/ScreenContainer';
import { supabaseAuthAdapter } from '@okinawa/shared/services/supabase-auth';
import { supabaseApiAdapter } from '@okinawa/shared/services/supabase-api';
import { LEGAL_VERSIONS } from '@okinawa/shared/config/legal';

/** Páginas públicas do site (site/src/App.tsx: /terms e /privacy). */
export const LEGAL_URLS = { terms: 'https://noowebr.com/terms', privacy: 'https://noowebr.com/privacy' } as const;

interface ReConsentScreenProps {
  navigation?: any;
  /** Versão dos Termos a aceitar. */
  termsVersion?: string;
  /** Versão da Política de Privacidade a aceitar. */
  privacyVersion?: string;
  /** Chamado depois que o aceite foi gravado. */
  onConsentAccepted?: () => void;
}

export const ReConsentScreen: React.FC<ReConsentScreenProps> = ({
  navigation,
  termsVersion,
  privacyVersion,
  onConsentAccepted,
}) => {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const [agreed, setAgreed] = useState(false);
  const terms = termsVersion || LEGAL_VERSIONS.terms;
  const privacy = privacyVersion || LEGAL_VERSIONS.privacy;

  const accept = useMutation({
    mutationFn: () => supabaseAuthAdapter.acceptLegalTerms(terms, privacy),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['legal'] });
      onConsentAccepted?.();
    },
    onError: () => Alert.alert('Erro', 'Não foi possível registrar seu aceite. Tente novamente.'),
  });

  const handleDecline = () => {
    Alert.alert(
      'Recusar os termos',
      'Sem aceitar os termos atualizados não dá para continuar usando o app. Você pode pedir a exclusão da sua conta.',
      [
        { text: 'Voltar', style: 'cancel' },
        {
          text: 'Excluir conta',
          style: 'destructive',
          onPress: async () => {
            try {
              await supabaseApiAdapter.requestAccountDeletion();
              await supabaseAuthAdapter.logout();
              navigation?.reset?.({ index: 0, routes: [{ name: 'Welcome' }] });
            } catch {
              Alert.alert('Erro', 'Não foi possível pedir a exclusão da conta. Tente novamente.');
            }
          },
        },
      ],
    );
  };

  const doc = (title: string, version: string, url: string, testID: string) => (
    <TouchableOpacity style={styles.doc} onPress={() => { void Linking.openURL(url); }} accessibilityRole="link" accessibilityLabel={`Ler ${title}, versão ${version}`} testID={testID}>
      <View style={styles.docText}>
        <Text style={styles.docTitle}>{title}</Text>
        <Text style={styles.docMeta}>Versão {version}</Text>
      </View>
      <Text style={styles.docLink}>Ler</Text>
    </TouchableOpacity>
  );

  return (
    <ScreenContainer>
      <View style={styles.container}>
        <View style={styles.body}>
          <Text style={styles.title}>Termos atualizados</Text>
          <Text style={styles.subtitle}>
            Atualizamos os Termos de Uso e a Política de Privacidade. Leia e aceite para continuar usando o app.
          </Text>
          {doc('Termos de Uso', terms, LEGAL_URLS.terms, 'reconsent-terms')}
          {doc('Política de Privacidade', privacy, LEGAL_URLS.privacy, 'reconsent-privacy')}
          <TouchableOpacity style={styles.check} onPress={() => setAgreed((v) => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: agreed }} testID="reconsent-agree">
            <View style={[styles.box, agreed && styles.boxOn]}>{agreed ? <Text style={styles.tick}>✓</Text> : null}</View>
            <Text style={styles.checkText}>Li e aceito os Termos de Uso e a Política de Privacidade.</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.footer}>
          <Button mode="contained" onPress={() => accept.mutate()} disabled={!agreed || accept.isPending} loading={accept.isPending} contentStyle={styles.buttonContent} style={styles.acceptButton} testID="reconsent-accept">
            Aceitar e continuar
          </Button>
          <Button mode="text" onPress={handleDecline} textColor={colors.destructive} testID="reconsent-decline">
            Recusar
          </Button>
        </View>
      </View>
    </ScreenContainer>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    body: { flex: 1, padding: 20, paddingTop: 40, gap: 14 },
    title: { fontSize: 24, fontWeight: 'bold', color: colors.foreground },
    subtitle: { fontSize: 14, lineHeight: 20, color: colors.mutedForeground, marginBottom: 6 },
    doc: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 14, borderWidth: 1, borderColor: colors.border },
    docText: { flex: 1, gap: 2 },
    docTitle: { fontSize: 16, fontWeight: '700', color: colors.foreground },
    docMeta: { fontSize: 12, color: colors.mutedForeground },
    docLink: { fontSize: 14, fontWeight: '700', color: colors.primary },
    check: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
    box: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    boxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    tick: { color: colors.primaryForeground ?? '#fff', fontWeight: '800' },
    checkText: { flex: 1, fontSize: 14, color: colors.foreground },
    footer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 34, borderTopWidth: 1, borderTopColor: colors.border, gap: 4 },
    acceptButton: { borderRadius: 8 },
    buttonContent: { paddingVertical: 6 },
  });

export default ReConsentScreen;
