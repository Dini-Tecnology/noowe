/* Hallmark · macrostructure: List-Led · genre: modern-minimal · theme: Noowe tokens · enrichment: none · designed-as-app · pre-emit critique: P5 H5 E4 S5 R5 V5 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import { useWallet } from '../../hooks/useWallet';
import { CardBrandIcon, cardBrandFromLabel } from '../../components/payment/CardBrandIcon';
import type { CustomerPaymentMethod } from '../../services/customer-backend';
import { useQueryRefreshControl } from './shared';
import { detectCardBrand, formatCardNumber, formatExpiry, isExpired, isValidLuhn, onlyDigits, parseExpiry } from '../../utils/card';

type MethodKind = 'credit_card' | 'debit_card' | 'pix';
const KIND_LABELS: Record<MethodKind, string> = { credit_card: 'Crédito', debit_card: 'Débito', pix: 'PIX' };

const ORANGE = '#FF4B22';

export default function PaymentMethodsScreen({ navigation }: any) {
  const colors = useColors();
  const { query, addPix, addCard, setDefault, removeMethod } = useWallet();
  const refreshControl = useQueryRefreshControl([query]);
  const [modalVisible, setModalVisible] = useState(false);
  const [kind, setKind] = useState<MethodKind>('credit_card');
  const [pixKey, setPixKey] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [holderName, setHolderName] = useState('');
  const [expiry, setExpiry] = useState('');
  const [makeDefault, setMakeDefault] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const methods = query.data?.paymentMethods ?? [];

  const openAdd = useCallback(() => {
    setPixKey('');
    setCardNumber('');
    setHolderName('');
    setExpiry('');
    setKind('credit_card');
    setFormError(null);
    setMakeDefault(methods.length === 0);
    setModalVisible(true);
  }, [methods.length]);

  const submit = useCallback(async () => {
    setFormError(null);
    if (kind === 'pix') {
      if (pixKey.trim().length < 5) {
        setFormError('Informe uma chave PIX válida para continuar.');
        return;
      }
      try {
        await addPix.mutateAsync({ pixKey, setDefault: makeDefault });
        setModalVisible(false);
      } catch (error) {
        setFormError(error instanceof Error ? error.message : 'Não foi possível salvar a chave PIX.');
      }
      return;
    }

    if (!isValidLuhn(cardNumber)) {
      setFormError('Número do cartão inválido.');
      return;
    }
    const parsed = parseExpiry(expiry);
    if (!parsed) {
      setFormError('Informe a validade no formato MM/AA.');
      return;
    }
    if (isExpired(parsed)) {
      setFormError('Este cartão está vencido.');
      return;
    }
    if (holderName.trim().length < 3) {
      setFormError('Informe o nome impresso no cartão.');
      return;
    }
    const digits = onlyDigits(cardNumber);
    try {
      // Only brand, last four digits and expiry are sent; the full number stays on the device.
      await addCard.mutateAsync({
        cardType: kind,
        brand: detectCardBrand(digits) === 'unknown' ? 'cartão' : detectCardBrand(digits),
        lastFour: digits.slice(-4),
        expMonth: parsed.month,
        expYear: parsed.year,
        holderName: holderName.trim(),
        setDefault: makeDefault,
      });
      setModalVisible(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Não foi possível salvar o cartão.');
    }
  }, [addCard, addPix, cardNumber, expiry, holderName, kind, makeDefault, pixKey]);

  const showActions = useCallback((method: CustomerPaymentMethod) => {
    const actions: Parameters<typeof Alert.alert>[2] = [];
    if (!method.isDefault) {
      actions.push({
        text: 'Tornar padrão',
        onPress: () => void setDefault.mutateAsync(method.id).catch(() => Alert.alert('Método de pagamento', 'Não foi possível alterar o método padrão.')),
      });
    }
    actions.push({
      text: 'Remover',
      style: 'destructive',
      onPress: () => Alert.alert('Remover método?', `${method.displayName} deixará de ficar disponível no app.`, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Remover', style: 'destructive', onPress: () => void removeMethod.mutateAsync(method.id).catch(() => Alert.alert('Método de pagamento', 'Não foi possível remover este método.')) },
      ]),
    });
    actions.push({ text: 'Cancelar', style: 'cancel' });
    Alert.alert(method.displayName, method.detail, actions);
  }, [removeMethod, setDefault]);

  const styles = useMemo(() => StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { paddingHorizontal: 20, paddingBottom: 44 },
    header: { height: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    back: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.backgroundTertiary, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontSize: 17, fontWeight: '800', color: colors.foreground },
    headerAction: { minWidth: 64, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
    headerActionText: { color: ORANGE, fontSize: 12, fontWeight: '700' },
    intro: { marginTop: 8, marginBottom: 20, color: colors.foregroundSecondary, fontSize: 13, lineHeight: 19 },
    methodCard: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 14, marginBottom: 10, borderRadius: 17, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
    brandSlot: { width: 42, alignItems: 'center', justifyContent: 'center' },
    methodIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF0EA' },
    methodBody: { flex: 1, minWidth: 0 },
    methodTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    methodTitle: { flexShrink: 1, color: colors.foreground, fontSize: 14, fontWeight: '700' },
    defaultBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, backgroundColor: '#FFF0EA' },
    defaultText: { color: ORANGE, fontSize: 9, fontWeight: '800' },
    methodDetail: { marginTop: 4, color: colors.foregroundSecondary, fontSize: 11 },
    option: { width: 38, height: 44, alignItems: 'center', justifyContent: 'center' },
    empty: { alignItems: 'center', paddingHorizontal: 24, paddingVertical: 50 },
    emptyIcon: { width: 62, height: 62, borderRadius: 22, backgroundColor: '#FFF0EA', alignItems: 'center', justifyContent: 'center' },
    emptyTitle: { marginTop: 18, color: colors.foreground, fontSize: 16, fontWeight: '800' },
    emptyText: { marginTop: 7, color: colors.foregroundSecondary, fontSize: 13, lineHeight: 19, textAlign: 'center' },
    emptyButton: { minHeight: 44, marginTop: 18, paddingHorizontal: 20, borderRadius: 14, backgroundColor: ORANGE, alignItems: 'center', justifyContent: 'center' },
    emptyButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
    security: { marginTop: 18, flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 14, borderRadius: 15, backgroundColor: colors.backgroundTertiary },
    securityText: { flex: 1, color: colors.foregroundSecondary, fontSize: 11, lineHeight: 17 },
    loading: { paddingVertical: 70 },
    error: { alignItems: 'center', paddingVertical: 55, gap: 12 },
    errorText: { color: colors.foregroundSecondary, fontSize: 13, textAlign: 'center' },
    retry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 18 },
    retryText: { color: ORANGE, fontSize: 13, fontWeight: '800' },
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.overlay },
    keyboard: { flex: 1, justifyContent: 'flex-end' },
    sheet: { paddingHorizontal: 20, paddingTop: 15, paddingBottom: 30, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.card, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
    sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sheetTitle: { color: colors.foreground, fontSize: 18, fontWeight: '800' },
    close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    label: { marginTop: 14, marginBottom: 8, color: colors.foreground, fontSize: 12, fontWeight: '700' },
    input: { minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: formError ? colors.error : colors.inputBorder, backgroundColor: colors.input, paddingHorizontal: 15, color: colors.foreground, fontSize: 14 },
    helper: { minHeight: 39, paddingTop: 8, color: formError ? colors.error : colors.foregroundSecondary, fontSize: 11, lineHeight: 16 },
    defaultRow: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 11 },
    checkbox: { width: 24, height: 24, borderRadius: 8, borderWidth: 1, borderColor: makeDefault ? ORANGE : colors.border, backgroundColor: makeDefault ? ORANGE : colors.card, alignItems: 'center', justifyContent: 'center' },
    defaultLabel: { color: colors.foreground, fontSize: 13 },
    kindRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
    kindChip: { flex: 1, minHeight: 40, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
    kindChipActive: { borderColor: ORANGE, backgroundColor: ORANGE },
    kindText: { color: colors.foregroundSecondary, fontSize: 12, fontWeight: '800' },
    kindTextActive: { color: '#FFFFFF' },
    inputRow: { flexDirection: 'row', gap: 10 },
    inputHalf: { flex: 1 },
    actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
    cancel: { flex: 1, minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    cancelText: { color: colors.foregroundSecondary, fontSize: 13, fontWeight: '800' },
    save: { flex: 1, minHeight: 48, borderRadius: 14, backgroundColor: ORANGE, alignItems: 'center', justifyContent: 'center' },
    saveDisabled: { opacity: 0.55 },
    saveText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  }), [colors, formError, makeDefault]);

  return (
    <ScreenContainer edges={['top']}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} refreshControl={refreshControl} alwaysBounceVertical showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Voltar">
            <Ionicons name="arrow-back" size={18} color={colors.foregroundSecondary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Métodos de Pagamento</Text>
          <TouchableOpacity style={styles.headerAction} onPress={openAdd} accessibilityRole="button" accessibilityLabel="Adicionar método de pagamento">
            <Text style={styles.headerActionText}>Adicionar</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.intro}>Gerencie os métodos usados para pagamentos e recebimentos na Noowe.</Text>

        {query.isLoading ? <ActivityIndicator style={styles.loading} color={ORANGE} /> : query.error ? (
          <View style={styles.error}>
            <Ionicons name="cloud-offline-outline" size={30} color={colors.foregroundMuted} />
            <Text style={styles.errorText}>Não foi possível carregar seus métodos.</Text>
            <TouchableOpacity style={styles.retry} onPress={() => query.refetch()} accessibilityRole="button"><Text style={styles.retryText}>Tentar novamente</Text></TouchableOpacity>
          </View>
        ) : methods.length ? methods.map((method) => (
          <TouchableOpacity key={method.id} style={styles.methodCard} onPress={() => showActions(method)} activeOpacity={0.84} accessibilityRole="button" accessibilityLabel={`${method.displayName}, ${method.detail}${method.isDefault ? ', padrão' : ''}`}>
            {method.methodType === 'credit_card' || method.methodType === 'debit_card' ? (
              <View style={styles.brandSlot}><CardBrandIcon brand={cardBrandFromLabel(method.displayName)} width={44} /></View>
            ) : (
              <View style={styles.methodIcon}>
                <Ionicons name={method.methodType === 'pix' ? 'qr-code-outline' : 'card-outline'} size={20} color={ORANGE} />
              </View>
            )}
            <View style={styles.methodBody}>
              <View style={styles.methodTitleRow}>
                <Text numberOfLines={1} style={styles.methodTitle}>{method.displayName}</Text>
                {method.isDefault ? <View style={styles.defaultBadge}><Text style={styles.defaultText}>PADRÃO</Text></View> : null}
              </View>
              <Text style={styles.methodDetail}>{method.detail}</Text>
            </View>
            <View style={styles.option}><Ionicons name="ellipsis-horizontal" size={19} color={colors.foregroundMuted} /></View>
          </TouchableOpacity>
        )) : (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}><Ionicons name="card-outline" size={28} color={ORANGE} /></View>
            <Text style={styles.emptyTitle}>Nenhum método salvo</Text>
            <Text style={styles.emptyText}>Adicione um cartão de crédito, débito ou uma chave PIX para pagar suas contas mais rápido.</Text>
            <TouchableOpacity style={styles.emptyButton} onPress={openAdd} accessibilityRole="button"><Text style={styles.emptyButtonText}>Adicionar método</Text></TouchableOpacity>
          </View>
        )}

        {!query.isLoading && !query.error ? (
          <View style={styles.security}>
            <Ionicons name="shield-checkmark-outline" size={18} color={colors.foregroundSecondary} />
            <Text style={styles.securityText}>Seus dados ficam protegidos e só podem ser acessados pela sua conta autenticada.</Text>
          </View>
        ) : null}
      </ScrollView>

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboard}>
          <Pressable style={styles.backdrop} onPress={() => setModalVisible(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Novo método de pagamento</Text>
              <TouchableOpacity style={styles.close} onPress={() => setModalVisible(false)} accessibilityRole="button" accessibilityLabel="Fechar"><Ionicons name="close" size={22} color={colors.foregroundSecondary} /></TouchableOpacity>
            </View>
            <View style={styles.kindRow}>
              {(Object.keys(KIND_LABELS) as MethodKind[]).map((option) => (
                <TouchableOpacity
                  key={option}
                  style={[styles.kindChip, kind === option && styles.kindChipActive]}
                  onPress={() => { setKind(option); setFormError(null); }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: kind === option }}
                >
                  <Text style={[styles.kindText, kind === option && styles.kindTextActive]}>{KIND_LABELS[option]}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {kind === 'pix' ? (
              <>
                <Text style={styles.label}>Chave PIX</Text>
                <TextInput
                  value={pixKey}
                  onChangeText={(value) => { setPixKey(value); if (formError) setFormError(null); }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="CPF, e-mail, telefone ou chave aleatória"
                  placeholderTextColor={colors.foregroundMuted}
                  style={styles.input}
                  accessibilityLabel="Chave PIX"
                />
              </>
            ) : (
              <>
                <Text style={styles.label}>Número do cartão</Text>
                <TextInput
                  value={cardNumber}
                  onChangeText={(value) => { setCardNumber(formatCardNumber(value)); if (formError) setFormError(null); }}
                  keyboardType="number-pad"
                  autoComplete="cc-number"
                  maxLength={23}
                  placeholder="0000 0000 0000 0000"
                  placeholderTextColor={colors.foregroundMuted}
                  style={styles.input}
                  accessibilityLabel="Número do cartão"
                />
                <View style={styles.inputRow}>
                  <View style={styles.inputHalf}>
                    <Text style={styles.label}>Validade</Text>
                    <TextInput
                      value={expiry}
                      onChangeText={(value) => { setExpiry(formatExpiry(value)); if (formError) setFormError(null); }}
                      keyboardType="number-pad"
                      autoComplete="cc-exp"
                      maxLength={5}
                      placeholder="MM/AA"
                      placeholderTextColor={colors.foregroundMuted}
                      style={styles.input}
                      accessibilityLabel="Validade do cartão"
                    />
                  </View>
                  <View style={styles.inputHalf}>
                    <Text style={styles.label}>Bandeira</Text>
                    <View style={[styles.input, { justifyContent: 'center' }]}>
                      {detectCardBrand(cardNumber) === 'unknown' ? (
                        <Text style={{ color: colors.foregroundMuted, fontSize: 14 }}>—</Text>
                      ) : (
                        <CardBrandIcon brand={detectCardBrand(cardNumber)} width={46} />
                      )}
                    </View>
                  </View>
                </View>
                <Text style={styles.label}>Nome impresso no cartão</Text>
                <TextInput
                  value={holderName}
                  onChangeText={(value) => { setHolderName(value.toUpperCase()); if (formError) setFormError(null); }}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  autoComplete="cc-name"
                  placeholder="NOME COMO NO CARTÃO"
                  placeholderTextColor={colors.foregroundMuted}
                  style={styles.input}
                  accessibilityLabel="Nome impresso no cartão"
                />
              </>
            )}
            <Text style={styles.helper}>{formError ?? (kind === 'pix' ? 'A chave será usada somente para movimentações autorizadas por você.' : 'Guardamos apenas a bandeira, os 4 últimos dígitos e a validade. O número completo e o CVV nunca são salvos.')}</Text>
            <TouchableOpacity style={styles.defaultRow} onPress={() => setMakeDefault((value) => !value)} accessibilityRole="checkbox" accessibilityState={{ checked: makeDefault }}>
              <View style={styles.checkbox}>{makeDefault ? <Ionicons name="checkmark" size={16} color="#FFFFFF" /> : null}</View>
              <Text style={styles.defaultLabel}>Usar como método padrão</Text>
            </TouchableOpacity>
            <View style={styles.actions}>
              <TouchableOpacity style={styles.cancel} onPress={() => setModalVisible(false)} accessibilityRole="button"><Text style={styles.cancelText}>Cancelar</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.save, (addPix.isPending || addCard.isPending) && styles.saveDisabled]} onPress={() => void submit()} disabled={addPix.isPending || addCard.isPending} accessibilityRole="button">
                {addPix.isPending || addCard.isPending ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveText}>{kind === 'pix' ? 'Salvar PIX' : 'Salvar cartão'}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScreenContainer>
  );
}

