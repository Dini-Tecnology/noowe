/* Hallmark · macrostructure: Stat-Led · genre: modern-minimal · theme: studied-DNA (source: user image) + Noowe tokens · enrichment: none · designed-as-app · pre-emit critique: P5 H5 E4 S5 R4 V5 */
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
import { useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import { useWallet } from '../../hooks/useWallet';
import type { CustomerPaymentMethod, CustomerWalletTransaction } from '../../services/customer-backend';
import { money, rootNavigate, useQueryRefreshControl } from '../production/shared';
import { formatWalletDate, isWalletCredit, parseWalletAmount } from './wallet-formatters';
import { isUsernameFormatValid, normalizeUsernameInput } from '../../utils/username';
import { CardBrandIcon } from '../../components/payment/CardBrandIcon';
import { detectCardBrand, formatCardNumber, formatExpiry, isExpired, isValidLuhn, onlyDigits, parseExpiry } from '../../utils/card';

type MethodKind = 'credit_card' | 'debit_card' | 'pix';
const KIND_LABELS: Record<MethodKind, string> = { credit_card: 'Crédito', debit_card: 'Débito', pix: 'PIX' };

type WalletModalProps = {
  visible: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
};

function WalletModal({ visible, title, children, onClose }: WalletModalProps) {
  const colors = useColors();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={modalStyles.fill}
      >
        <Pressable style={[modalStyles.backdrop, { backgroundColor: colors.overlay }]} onPress={onClose} />
        <View style={[modalStyles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={modalStyles.headingRow}>
            <Text style={[modalStyles.title, { color: colors.foreground }]}>{title}</Text>
            <TouchableOpacity
              style={modalStyles.closeButton}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Fechar"
            >
              <Ionicons name="close" size={22} color={colors.foregroundSecondary} />
            </TouchableOpacity>
          </View>
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function WalletScreen() {
  const navigation = useNavigation<any>();
  const colors = useColors();
  const { query, addPix, addCard, setDefault, removeMethod, transfer } = useWallet();
  const refreshControl = useQueryRefreshControl([query]);
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [pixModalVisible, setPixModalVisible] = useState(false);
  const [methodModalVisible, setMethodModalVisible] = useState(false);
  const [transferModalVisible, setTransferModalVisible] = useState(false);
  const [methodKind, setMethodKind] = useState<MethodKind>('credit_card');
  const [pixKey, setPixKey] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [holderName, setHolderName] = useState('');
  const [expiry, setExpiry] = useState('');
  const [pixDefault, setPixDefault] = useState(true);
  const [recipientUsername, setRecipientUsername] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const data = query.data;
  const hasMethods = (data?.paymentMethods.length ?? 0) > 0;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        scrollContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 120 },
        header: { flexDirection: 'row', alignItems: 'center', paddingBottom: 20 },
        backRow: { minWidth: 80, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4 },
        backText: { fontSize: 13, color: colors.foregroundSecondary },
        headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: colors.foreground },
        headerSpacer: { minWidth: 80 },
        balanceCard: { minHeight: 152, borderRadius: 20, padding: 16, justifyContent: 'space-between' },
        balanceHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
        balanceLabel: { fontSize: 12, color: colors.walletForeground },
        eyeButton: { width: 44, height: 44, marginRight: -12, alignItems: 'center', justifyContent: 'center' },
        balance: { marginTop: 4, marginBottom: 16, fontSize: 25, lineHeight: 30, fontWeight: '800', color: colors.walletForeground, fontVariant: ['tabular-nums'] },
        metricsRow: { flexDirection: 'row', gap: 8 },
        metric: { flex: 1, minHeight: 48, borderRadius: 12, backgroundColor: colors.walletSurfaceMetric, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
        metricValue: { fontSize: 14, fontWeight: '800', color: colors.walletForeground, fontVariant: ['tabular-nums'] },
        metricLabel: { marginTop: 4, fontSize: 10, color: colors.walletForeground },
        actionsRow: { flexDirection: 'row', gap: 8, marginTop: 16, marginBottom: 20 },
        action: { flex: 1, minWidth: 0, minHeight: 72, paddingHorizontal: 4, paddingVertical: 12, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', gap: 8 },
        actionIcon: { width: 32, height: 32, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
        actionLabel: { fontSize: 10, color: colors.foreground, textAlign: 'center' },
        section: { marginBottom: 24 },
        sectionHeading: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
        sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.foreground },
        sectionAction: { minHeight: 44, paddingLeft: 16, justifyContent: 'center' },
        sectionActionText: { fontSize: 12, color: colors.primaryDark },
        row: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
        rowIcon: { width: 38, height: 38, borderRadius: 13, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
        rowContent: { flex: 1, minWidth: 0 },
        rowTitle: { fontSize: 12, color: colors.foreground },
        rowDetail: { marginTop: 4, fontSize: 10, color: colors.foregroundSecondary },
        defaultBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, backgroundColor: colors.errorBackground },
        defaultBadgeText: { fontSize: 10, color: colors.primaryDark },
        amountColumn: { alignItems: 'flex-end', maxWidth: 116 },
        amount: { fontSize: 11, fontWeight: '800', color: colors.foreground, fontVariant: ['tabular-nums'] },
        amountCredit: { color: colors.walletPositive },
        cashback: { marginTop: 4, fontSize: 10, color: colors.walletPositive },
        empty: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12 },
        emptyText: { flex: 1, fontSize: 12, lineHeight: 18, color: colors.foregroundSecondary },
        loading: { paddingVertical: 48, alignItems: 'center', gap: 12 },
        loadingText: { fontSize: 12, color: colors.foregroundSecondary },
        error: { paddingVertical: 40, alignItems: 'center', gap: 12 },
        errorText: { maxWidth: 260, textAlign: 'center', fontSize: 13, lineHeight: 19, color: colors.foregroundSecondary },
        retry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 },
        retryText: { color: colors.primary, fontWeight: '700' },
        fieldLabel: { marginTop: 16, marginBottom: 8, fontSize: 12, fontWeight: '700', color: colors.foreground },
        input: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.inputBorder, backgroundColor: colors.input, paddingHorizontal: 16, fontSize: 15, color: colors.foreground },
        helper: { minHeight: 32, paddingTop: 8, fontSize: 11, lineHeight: 16, color: colors.foregroundSecondary },
        errorMessage: { color: colors.error },
        kindRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
        kindChip: { flex: 1, minHeight: 40, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
        kindChipActive: { borderColor: colors.walletSurfaceEnd, backgroundColor: colors.walletSurfaceEnd },
        kindText: { fontSize: 12, fontWeight: '800', color: colors.foregroundSecondary },
        kindTextActive: { color: colors.walletForeground },
        inputRow: { flexDirection: 'row', gap: 12 },
        inputHalf: { flex: 1 },
        checkRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12 },
        checkbox: { width: 24, height: 24, borderRadius: 8, borderWidth: 1, borderColor: pixDefault ? colors.walletSurfaceEnd : colors.border, backgroundColor: pixDefault ? colors.walletSurfaceEnd : colors.card, alignItems: 'center', justifyContent: 'center' },
        checkLabel: { fontSize: 13, color: colors.foreground },
        modalActions: { flexDirection: 'row', gap: 12, marginTop: 16 },
        secondaryButton: { flex: 1, minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
        secondaryButtonText: { fontSize: 14, fontWeight: '700', color: colors.foregroundSecondary },
        primaryButton: { flex: 1, minHeight: 48, borderRadius: 12, backgroundColor: colors.walletSurfaceEnd, alignItems: 'center', justifyContent: 'center' },
        primaryButtonDisabled: { opacity: 0.55 },
        primaryButtonText: { fontSize: 14, fontWeight: '700', color: colors.walletForeground },
      }),
    [colors, pixDefault],
  );

  const goProfile = useCallback(() => navigation.navigate('Profile'), [navigation]);
  const openPixModal = useCallback(() => {
    setMethodModalVisible(false);
    setFormError(null);
    setPixKey('');
    setCardNumber('');
    setHolderName('');
    setExpiry('');
    setMethodKind('credit_card');
    setPixDefault(!hasMethods);
    setPixModalVisible(true);
  }, [hasMethods]);

  const selectSavedMethod = useCallback(async (method: CustomerPaymentMethod) => {
    try {
      if (!method.isDefault) await setDefault.mutateAsync(method.id);
      setMethodModalVisible(false);
    } catch {
      Alert.alert('Método de pagamento', 'Não foi possível selecionar este método. Tente novamente.');
    }
  }, [setDefault]);

  const submitMethod = useCallback(async () => {
    setFormError(null);
    if (methodKind === 'pix') {
      if (pixKey.trim().length < 5) {
        setFormError('Informe uma chave PIX válida para continuar.');
        return;
      }
      try {
        await addPix.mutateAsync({ pixKey, setDefault: pixDefault });
        setPixModalVisible(false);
      } catch (error) {
        setFormError(error instanceof Error ? error.message : 'Não foi possível salvar a chave PIX. Tente novamente.');
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
        cardType: methodKind,
        brand: detectCardBrand(digits) === 'unknown' ? 'cartão' : detectCardBrand(digits),
        lastFour: digits.slice(-4),
        expMonth: parsed.month,
        expYear: parsed.year,
        holderName: holderName.trim(),
        setDefault: pixDefault,
      });
      setPixModalVisible(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Não foi possível salvar o cartão. Tente novamente.');
    }
  }, [addCard, addPix, cardNumber, expiry, holderName, methodKind, pixDefault, pixKey]);

  const submitTransfer = useCallback(async () => {
    const amount = parseWalletAmount(transferAmount);
    if (!isUsernameFormatValid(recipientUsername)) {
      setFormError('Informe o @usuário da conta Noowe que receberá a transferência.');
      return;
    }
    if (amount < 1) {
      setFormError('Informe um valor a partir de R$ 1,00.');
      return;
    }
    setFormError(null);
    try {
      await transfer.mutateAsync({ recipientUsername, amount });
      setTransferModalVisible(false);
      setRecipientUsername('');
      setTransferAmount('');
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'A transferência não foi concluída. Confira os dados e tente novamente.');
    }
  }, [recipientUsername, transfer, transferAmount]);

  const openMethodActions = useCallback((method: CustomerPaymentMethod) => {
    const actions: Parameters<typeof Alert.alert>[2] = [];
    if (!method.isDefault) {
      actions.push({
        text: 'Tornar padrão',
        onPress: () => void setDefault.mutateAsync(method.id).catch(() => {
          Alert.alert('Método de pagamento', 'Não foi possível alterar o método padrão. Tente novamente.');
        }),
      });
    }
    actions.push({
      text: 'Remover',
      style: 'destructive',
      onPress: () => void removeMethod.mutateAsync(method.id).catch(() => {
        Alert.alert('Método de pagamento', 'Não foi possível remover este método. Tente novamente.');
      }),
    });
    actions.push({ text: 'Cancelar', style: 'cancel' });
    Alert.alert(method.displayName, method.detail, actions);
  }, [removeMethod, setDefault]);

  const openTransfer = useCallback(() => {
    setFormError(null);
    setTransferModalVisible(true);
  }, []);

  const quickActions = useMemo(() => [
    { label: 'Transferir', icon: 'paper-plane-outline' as const, color: colors.walletInfo, background: colors.walletInfoBackground, onPress: openTransfer },
    { label: 'Pagar QR', icon: 'qr-code-outline' as const, color: colors.primaryDark, background: colors.errorBackground, onPress: () => rootNavigate(navigation, 'QrScanner') },
    { label: 'Resgatar', icon: 'gift-outline' as const, color: colors.walletWarning, background: colors.walletWarningBackground, onPress: () => rootNavigate(navigation, 'Loyalty') },
  ], [colors, navigation, openTransfer]);

  const renderTransaction = (transaction: CustomerWalletTransaction) => {
    const credit = isWalletCredit(transaction);
    const payment = transaction.kind === 'payment';
    const icon = credit ? 'gift-outline' : payment ? 'receipt-outline' : 'swap-horizontal-outline';
    const amount = payment
      ? money(Math.abs(transaction.amount))
      : `${credit ? '+' : '−'}${money(Math.abs(transaction.amount))}`;
    return (
      <View key={`${transaction.kind}:${transaction.id}`} style={styles.row}>
        <View style={[styles.rowIcon, credit && { backgroundColor: colors.walletPositiveBackground, borderColor: colors.walletPositiveBackground }]}>
          <Ionicons name={icon} size={17} color={credit ? colors.walletPositive : colors.foregroundSecondary} />
        </View>
        <View style={styles.rowContent}>
          <Text numberOfLines={1} style={styles.rowTitle}>{transaction.description}</Text>
          <Text style={styles.rowDetail}>{formatWalletDate(transaction.createdAt)}</Text>
        </View>
        <View style={styles.amountColumn}>
          <Text style={[styles.amount, credit && styles.amountCredit]}>{amount}</Text>
          {transaction.cashbackAmount && transaction.cashbackAmount > 0 ? (
            <Text style={styles.cashback}>+{money(transaction.cashbackAmount)} cashback</Text>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <ScreenContainer edges={['top']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        refreshControl={refreshControl}
        alwaysBounceVertical
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TouchableOpacity style={styles.backRow} onPress={goProfile} accessibilityRole="button" accessibilityLabel="Voltar ao perfil">
            <Ionicons name="chevron-back" size={18} color={colors.foregroundSecondary} />
            <Text style={styles.backText}>Perfil</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Minha Carteira</Text>
          <View style={styles.headerSpacer} />
        </View>

        {query.isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.loadingText}>Carregando sua carteira…</Text>
          </View>
        ) : query.error ? (
          <View style={styles.error}>
            <Ionicons name="cloud-offline-outline" size={30} color={colors.foregroundSecondary} />
            <Text style={styles.errorText}>Não foi possível carregar sua carteira. Verifique a conexão e tente novamente.</Text>
            <TouchableOpacity style={styles.retry} onPress={() => query.refetch()} accessibilityRole="button">
              <Text style={styles.retryText}>Tentar novamente</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <LinearGradient colors={[colors.walletSurfaceStart, colors.walletSurfaceEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.balanceCard}>
              <View style={styles.balanceHeader}>
                <Text style={styles.balanceLabel}>Saldo disponível</Text>
                <TouchableOpacity
                  style={styles.eyeButton}
                  onPress={() => setBalanceVisible((visible) => !visible)}
                  accessibilityRole="button"
                  accessibilityLabel={balanceVisible ? 'Ocultar saldo' : 'Mostrar saldo'}
                >
                  <Ionicons name={balanceVisible ? 'eye-outline' : 'eye-off-outline'} size={17} color={colors.walletForeground} />
                </TouchableOpacity>
              </View>
              <Text accessibilityLiveRegion="polite" style={styles.balance}>
                {balanceVisible ? money(data?.balance ?? 0) : 'R$ ••••'}
              </Text>
              <View style={styles.metricsRow}>
                <View style={styles.metric}>
                  <Text numberOfLines={1} adjustsFontSizeToFit style={styles.metricValue}>{balanceVisible ? money(data?.cashback ?? 0) : '••••'}</Text>
                  <Text style={styles.metricLabel}>Cashback</Text>
                </View>
                <View style={styles.metric}>
                  <Text numberOfLines={1} adjustsFontSizeToFit style={styles.metricValue}>{balanceVisible ? Math.round(data?.points ?? 0).toLocaleString('pt-BR') : '••••'}</Text>
                  <Text style={styles.metricLabel}>Pontos</Text>
                </View>
                <View style={styles.metric}>
                  <Text numberOfLines={1} adjustsFontSizeToFit style={styles.metricValue}>{balanceVisible ? money(data?.credits ?? 0) : '••••'}</Text>
                  <Text style={styles.metricLabel}>Créditos</Text>
                </View>
              </View>
            </LinearGradient>

            <View style={styles.actionsRow}>
              {quickActions.map((action) => (
                <TouchableOpacity key={action.label} style={styles.action} onPress={action.onPress} accessibilityRole="button" accessibilityLabel={action.label}>
                  <View style={[styles.actionIcon, { backgroundColor: action.background }]}>
                    <Ionicons name={action.icon} size={18} color={action.color} />
                  </View>
                  <Text numberOfLines={1} adjustsFontSizeToFit style={styles.actionLabel}>{action.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeading}>
                <Text style={styles.sectionTitle}>Métodos de Pagamento</Text>
                <TouchableOpacity style={styles.sectionAction} onPress={openPixModal} accessibilityRole="button" accessibilityLabel="Adicionar método de pagamento">
                  <Text style={styles.sectionActionText}>+ Adicionar</Text>
                </TouchableOpacity>
              </View>
              {data?.paymentMethods.length ? data.paymentMethods.map((method) => (
                <TouchableOpacity key={method.id} style={styles.row} onPress={() => openMethodActions(method)} accessibilityRole="button" accessibilityLabel={`${method.displayName}, ${method.detail}`}>
                  <View style={styles.rowIcon}>
                    <Ionicons name={method.methodType === 'pix' ? 'qr-code-outline' : 'card-outline'} size={19} color={colors.foregroundSecondary} />
                  </View>
                  <View style={styles.rowContent}>
                    <Text numberOfLines={1} style={styles.rowTitle}>{method.displayName}</Text>
                    <Text style={styles.rowDetail}>{method.detail}</Text>
                  </View>
                  {method.isDefault ? (
                    <View style={styles.defaultBadge}><Text style={styles.defaultBadgeText}>Padrão</Text></View>
                  ) : (
                  <Ionicons name="ellipsis-horizontal" size={18} color={colors.foregroundSecondary} />
                  )}
                </TouchableOpacity>
              )) : (
                <View style={styles.empty}>
                  <Ionicons name="card-outline" size={22} color={colors.foregroundSecondary} />
                  <Text style={styles.emptyText}>Nenhum método salvo. Adicione um cartão ou uma chave PIX.</Text>
                </View>
              )}
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeading}>
                <Text style={styles.sectionTitle}>Últimas Transações</Text>
              </View>
              {data?.transactions.length ? data.transactions.map(renderTransaction) : (
                <View style={styles.empty}>
                  <Ionicons name="receipt-outline" size={22} color={colors.foregroundSecondary} />
                  <Text style={styles.emptyText}>Sua primeira movimentação aparecerá aqui.</Text>
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>

      <WalletModal visible={methodModalVisible} title="Selecionar método" onClose={() => setMethodModalVisible(false)}>
        <Text style={styles.helper}>Escolha uma chave PIX ou outro método já cadastrado.</Text>
        {(data?.paymentMethods ?? []).map((method) => (
          <TouchableOpacity
            key={method.id}
            style={styles.row}
            onPress={() => void selectSavedMethod(method)}
            accessibilityRole="radio"
            accessibilityState={{ selected: method.isDefault }}
          >
            <View style={styles.rowIcon}>
              <Ionicons name={method.methodType === 'pix' ? 'qr-code-outline' : 'card-outline'} size={19} color={colors.foregroundSecondary} />
            </View>
            <View style={styles.rowContent}>
              <Text style={styles.rowTitle}>{method.displayName}</Text>
              <Text style={styles.rowDetail}>{method.detail}</Text>
            </View>
            <Ionicons name={method.isDefault ? 'radio-button-on' : 'radio-button-off'} size={20} color={method.isDefault ? colors.primary : colors.foregroundMuted} />
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={[styles.secondaryButton, { marginTop: 16 }]} onPress={openPixModal} accessibilityRole="button">
          <Text style={styles.secondaryButtonText}>Adicionar novo método</Text>
        </TouchableOpacity>
      </WalletModal>

      <WalletModal visible={pixModalVisible} title="Novo método de pagamento" onClose={() => setPixModalVisible(false)}>
        <View style={styles.kindRow}>
          {(Object.keys(KIND_LABELS) as MethodKind[]).map((option) => (
            <TouchableOpacity
              key={option}
              style={[styles.kindChip, methodKind === option && styles.kindChipActive]}
              onPress={() => { setMethodKind(option); setFormError(null); }}
              accessibilityRole="button"
              accessibilityState={{ selected: methodKind === option }}
            >
              <Text style={[styles.kindText, methodKind === option && styles.kindTextActive]}>{KIND_LABELS[option]}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {methodKind === 'pix' ? (
          <>
            <Text style={styles.fieldLabel}>Chave PIX</Text>
            <TextInput
              value={pixKey}
              onChangeText={(value) => { setPixKey(value); if (formError) setFormError(null); }}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="CPF, e-mail, telefone ou chave aleatória"
              placeholderTextColor={colors.foregroundSecondary}
              style={styles.input}
              accessibilityLabel="Chave PIX"
            />
          </>
        ) : (
          <>
            <Text style={styles.fieldLabel}>Número do cartão</Text>
            <TextInput
              value={cardNumber}
              onChangeText={(value) => { setCardNumber(formatCardNumber(value)); if (formError) setFormError(null); }}
              keyboardType="number-pad"
              autoComplete="cc-number"
              maxLength={23}
              placeholder="0000 0000 0000 0000"
              placeholderTextColor={colors.foregroundSecondary}
              style={styles.input}
              accessibilityLabel="Número do cartão"
            />
            <View style={styles.inputRow}>
              <View style={styles.inputHalf}>
                <Text style={styles.fieldLabel}>Validade</Text>
                <TextInput
                  value={expiry}
                  onChangeText={(value) => { setExpiry(formatExpiry(value)); if (formError) setFormError(null); }}
                  keyboardType="number-pad"
                  autoComplete="cc-exp"
                  maxLength={5}
                  placeholder="MM/AA"
                  placeholderTextColor={colors.foregroundSecondary}
                  style={styles.input}
                  accessibilityLabel="Validade do cartão"
                />
              </View>
              <View style={styles.inputHalf}>
                <Text style={styles.fieldLabel}>Bandeira</Text>
                <View style={[styles.input, { justifyContent: 'center' }]}>
                  {detectCardBrand(cardNumber) === 'unknown' ? (
                    <Text style={{ color: colors.foregroundSecondary, fontSize: 15 }}>—</Text>
                  ) : (
                    <CardBrandIcon brand={detectCardBrand(cardNumber)} width={46} />
                  )}
                </View>
              </View>
            </View>
            <Text style={styles.fieldLabel}>Nome impresso no cartão</Text>
            <TextInput
              value={holderName}
              onChangeText={(value) => { setHolderName(value.toUpperCase()); if (formError) setFormError(null); }}
              autoCapitalize="characters"
              autoCorrect={false}
              autoComplete="cc-name"
              placeholder="NOME COMO NO CARTÃO"
              placeholderTextColor={colors.foregroundSecondary}
              style={styles.input}
              accessibilityLabel="Nome impresso no cartão"
            />
          </>
        )}
        <Text style={[styles.helper, formError && styles.errorMessage]}>{formError ?? (methodKind === 'pix' ? 'A chave é armazenada com acesso restrito à sua conta.' : 'Guardamos apenas a bandeira, os 4 últimos dígitos e a validade. O número completo e o CVV nunca são salvos.')}</Text>
        <TouchableOpacity style={styles.checkRow} onPress={() => setPixDefault((value) => !value)} accessibilityRole="checkbox" accessibilityState={{ checked: pixDefault }}>
          <View style={styles.checkbox}>{pixDefault ? <Ionicons name="checkmark" size={16} color={colors.walletForeground} /> : null}</View>
          <Text style={styles.checkLabel}>Usar como método padrão</Text>
        </TouchableOpacity>
        <View style={styles.modalActions}>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => setPixModalVisible(false)} accessibilityRole="button">
            <Text style={styles.secondaryButtonText}>Cancelar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.primaryButton, (addPix.isPending || addCard.isPending) && styles.primaryButtonDisabled]} onPress={() => void submitMethod()} disabled={addPix.isPending || addCard.isPending} accessibilityRole="button">
            {addPix.isPending || addCard.isPending ? <ActivityIndicator color={colors.walletForeground} /> : <Text style={styles.primaryButtonText}>{methodKind === 'pix' ? 'Salvar PIX' : 'Salvar cartão'}</Text>}
          </TouchableOpacity>
        </View>
      </WalletModal>

      <WalletModal visible={transferModalVisible} title="Transferir saldo" onClose={() => setTransferModalVisible(false)}>
        <Text style={styles.fieldLabel}>@usuário da conta Noowe</Text>
        <TextInput
          value={recipientUsername}
          onChangeText={(value) => { setRecipientUsername(normalizeUsernameInput(value)); if (formError) setFormError(null); }}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="@usuario"
          placeholderTextColor={colors.foregroundSecondary}
          style={styles.input}
          accessibilityLabel="@usuário de quem receberá a transferência"
        />
        <Text style={styles.fieldLabel}>Valor</Text>
        <TextInput
          value={transferAmount}
          onChangeText={(value) => { setTransferAmount(value); if (formError) setFormError(null); }}
          keyboardType="decimal-pad"
          placeholder="R$ 0,00"
          placeholderTextColor={colors.foregroundSecondary}
          style={styles.input}
          accessibilityLabel="Valor da transferência"
        />
        <Text style={[styles.helper, formError && styles.errorMessage]}>{formError ?? 'A transferência usa seu saldo disponível e não pode ser cancelada.'}</Text>
        <View style={styles.modalActions}>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => setTransferModalVisible(false)} accessibilityRole="button">
            <Text style={styles.secondaryButtonText}>Cancelar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.primaryButton, transfer.isPending && styles.primaryButtonDisabled]} onPress={() => void submitTransfer()} disabled={transfer.isPending} accessibilityRole="button">
            {transfer.isPending ? <ActivityIndicator color={colors.walletForeground} /> : <Text style={styles.primaryButtonText}>Transferir</Text>}
          </TouchableOpacity>
        </View>
      </WalletModal>
    </ScreenContainer>
  );
}

const modalStyles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 28 },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 18, fontWeight: '700' },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
