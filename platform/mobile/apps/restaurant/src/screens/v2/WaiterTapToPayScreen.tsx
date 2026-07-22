import React, { useMemo, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Text } from 'react-native-paper';
import {
  Delete,
  Nfc,
  CheckCircle2,
  CreditCard,
  Smartphone,
  Link2,
  X,
} from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { formatCurrency } from '@okinawa/shared/utils/formatters';
import { supabaseApiAdapter } from '@okinawa/shared/services/supabase-api';
import { V2Shell } from './shared/V2Shell';
import { useTableBills, type TableBill } from './shared/useRestaurantOperations';

type Stage = 'amount' | 'tap' | 'success';

type ChargeMethod = { id: string; label: string; icon: React.ComponentType<{ size?: number; color?: string }> };

const METHODS: ChargeMethod[] = [
  { id: 'credit_card', label: 'Crédito', icon: CreditCard },
  { id: 'debit_card', label: 'Débito', icon: CreditCard },
  { id: 'pix', label: 'Pix', icon: Smartphone },
  { id: 'wallet', label: 'Carteira', icon: Smartphone },
];

const METHOD_LABEL: Record<string, string> = {
  credit_card: 'Crédito',
  debit_card: 'Débito',
  pix: 'Pix',
  wallet: 'Carteira digital',
  cash: 'Dinheiro',
};

const TIP_OPTIONS = [0, 0.1, 0.15];

export default function WaiterTapToPayScreen() {
  const colors = useColors();
  const navigation = useNavigation<any>();
  const { data: bills } = useTableBills();

  const [stage, setStage] = useState<Stage>('amount');
  const [digits, setDigits] = useState('');
  const [linkedBill, setLinkedBill] = useState<TableBill | null>(null);
  const [tipPercent, setTipPercent] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [settled, setSettled] = useState<{ method: string; persisted: boolean } | null>(null);

  const cents = parseInt(digits || '0', 10);
  const amount = cents / 100;
  const tipAmount = Math.round(amount * tipPercent * 100) / 100;
  const total = amount + tipAmount;

  const openBills = useMemo(() => bills.filter((b) => !b.isPaid), [bills]);

  const pressDigit = (d: string) => {
    setDigits((prev) => {
      const next = (prev + d).replace(/^0+/, '');
      // Cap at R$ 999.999,99 to avoid overflow / typos.
      return next.length > 8 ? prev : next;
    });
  };
  const backspace = () => setDigits((prev) => prev.slice(0, -1));

  const linkBill = (bill: TableBill) => {
    setLinkedBill(bill);
    setDigits(String(Math.round(bill.totalAmount * 100)));
    setPickerOpen(false);
  };

  const clearLink = () => {
    setLinkedBill(null);
    setDigits('');
  };

  const startCharge = () => {
    if (amount <= 0) return;
    setStage('tap');
  };

  const settle = async (method: string) => {
    setSubmitting(true);
    try {
      if (linkedBill) {
        await supabaseApiAdapter.recordPayment(linkedBill.orderId, method, amount, tipAmount);
        setSettled({ method, persisted: true });
      } else {
        // No linked order — the backend can't persist an order-less charge.
        setSettled({ method, persisted: false });
      }
      setStage('success');
    } catch (err) {
      Alert.alert('Falha na cobrança', err instanceof Error ? err.message : 'Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setStage('amount');
    setDigits('');
    setLinkedBill(null);
    setTipPercent(0);
    setSettled(null);
  };

  // ── Success stage ──────────────────────────────────────────────────────────
  if (stage === 'success') {
    return (
      <V2Shell title="Tap to Pay" subtitle="Cobrança concluída" showBack scroll={false}>
        <View style={styles.centered}>
          <View style={[styles.successIcon, { backgroundColor: '#DCFCE7' }]}>
            <CheckCircle2 size={54} color="#22C55E" />
          </View>
          <Text style={[styles.successTotal, { color: colors.foreground }]}>{formatCurrency(total)}</Text>
          <Text style={[styles.successSub, { color: colors.foregroundSecondary }]}>
            {METHOD_LABEL[settled?.method ?? ''] ?? settled?.method}
            {tipAmount > 0 ? ` · gorjeta ${formatCurrency(tipAmount)}` : ''}
          </Text>
          {linkedBill ? (
            <View style={[styles.linkChip, { backgroundColor: `${colors.primary}14` }]}>
              <Text style={[styles.linkChipText, { color: colors.primary }]}>Mesa {linkedBill.tableNumber}</Text>
            </View>
          ) : null}
          {settled && !settled.persisted ? (
            <Text style={styles.warnNote}>
              Cobrança avulsa — não vinculada a uma mesa, portanto não foi registrada no sistema.
            </Text>
          ) : null}

          <View style={styles.successActions}>
            <TouchableOpacity onPress={reset} style={[styles.secondaryBtn, { borderColor: colors.border }]}>
              <Text style={[styles.secondaryBtnText, { color: colors.foreground }]}>Nova cobrança</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.primaryBtn, { backgroundColor: colors.primary }]}>
              <Text style={styles.primaryBtnText}>Concluir</Text>
            </TouchableOpacity>
          </View>
        </View>
      </V2Shell>
    );
  }

  // ── Tap / approach stage ───────────────────────────────────────────────────
  if (stage === 'tap') {
    return (
      <V2Shell title="Tap to Pay" subtitle="Aguardando pagamento" showBack scroll={false} onBack={() => setStage('amount')}>
        <View style={styles.centered}>
          <View style={[styles.nfcPulseOuter, { borderColor: `${colors.primary}22` }]}>
            <View style={[styles.nfcPulseMid, { borderColor: `${colors.primary}44` }]}>
              <View style={[styles.nfcCore, { backgroundColor: colors.primary }]}>
                <Nfc size={40} color="#FFF" />
              </View>
            </View>
          </View>
          <Text style={[styles.tapTotal, { color: colors.foreground }]}>{formatCurrency(total)}</Text>
          <Text style={[styles.tapHint, { color: colors.foregroundSecondary }]}>
            Aproxime o cartão ou celular do cliente
          </Text>
          {linkedBill ? (
            <View style={[styles.linkChip, { backgroundColor: `${colors.primary}14` }]}>
              <Link2 size={12} color={colors.primary} />
              <Text style={[styles.linkChipText, { color: colors.primary }]}>Mesa {linkedBill.tableNumber}</Text>
            </View>
          ) : null}

          <Text style={[styles.methodLabel, { color: colors.foregroundSecondary }]}>Confirme a forma recebida</Text>
          <View style={styles.methodGrid}>
            {METHODS.map((m) => {
              const Icon = m.icon;
              return (
                <TouchableOpacity
                  key={m.id}
                  disabled={submitting}
                  onPress={() => void settle(m.id)}
                  style={[styles.methodBtn, { borderColor: colors.border, backgroundColor: colors.card, opacity: submitting ? 0.5 : 1 }]}
                >
                  <Icon size={18} color={colors.primary} />
                  <Text style={[styles.methodBtnText, { color: colors.foreground }]}>{m.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {submitting ? <ActivityIndicator style={{ marginTop: 16 }} color={colors.primary} /> : null}

          <TouchableOpacity disabled={submitting} onPress={() => setStage('amount')} style={styles.cancelLink}>
            <Text style={{ color: colors.foregroundSecondary, fontWeight: '700' }}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </V2Shell>
    );
  }

  // ── Amount entry stage ─────────────────────────────────────────────────────
  return (
    <V2Shell title="Tap to Pay" subtitle="Cobrança por aproximação" showBack scroll={false}>
      <View style={styles.amountWrap}>
        <View style={styles.amountDisplayBox}>
          <Text style={[styles.amountCaption, { color: colors.foregroundSecondary }]}>Valor da cobrança</Text>
          <Text style={[styles.amountValue, { color: amount > 0 ? colors.foreground : colors.foregroundMuted }]}>
            {formatCurrency(amount)}
          </Text>
          {tipAmount > 0 ? (
            <Text style={[styles.amountTip, { color: colors.foregroundSecondary }]}>
              + gorjeta {formatCurrency(tipAmount)} · total {formatCurrency(total)}
            </Text>
          ) : null}
        </View>

        {/* Link to table */}
        {linkedBill ? (
          <View style={[styles.linkedRow, { borderColor: colors.primary, backgroundColor: `${colors.primary}0D` }]}>
            <Link2 size={16} color={colors.primary} />
            <Text style={[styles.linkedText, { color: colors.foreground }]}>
              Vinculado à Mesa {linkedBill.tableNumber}
            </Text>
            <TouchableOpacity onPress={clearLink} hitSlop={8}>
              <X size={18} color={colors.foregroundSecondary} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            onPress={() => setPickerOpen((v) => !v)}
            style={[styles.linkedRow, { borderColor: colors.border, backgroundColor: colors.card }]}
          >
            <Link2 size={16} color={colors.foregroundSecondary} />
            <Text style={[styles.linkedText, { color: colors.foregroundSecondary }]}>
              Vincular a uma mesa (opcional)
            </Text>
            <Text style={{ color: colors.primary, fontWeight: '800' }}>{pickerOpen ? 'Fechar' : 'Escolher'}</Text>
          </TouchableOpacity>
        )}

        {pickerOpen && !linkedBill ? (
          <View style={[styles.pickerBox, { borderColor: colors.border, backgroundColor: colors.card }]}>
            {openBills.length === 0 ? (
              <Text style={{ color: colors.foregroundSecondary, padding: 12 }}>Nenhuma conta em aberto.</Text>
            ) : (
              openBills.map((bill) => (
                <TouchableOpacity
                  key={bill.orderId}
                  onPress={() => linkBill(bill)}
                  style={styles.pickerRow}
                >
                  <View style={[styles.pickerNum, { backgroundColor: `${colors.primary}14` }]}>
                    <Text style={{ color: colors.primary, fontWeight: '800' }}>{bill.tableNumber}</Text>
                  </View>
                  <Text style={[styles.linkedText, { color: colors.foreground }]}>Mesa {bill.tableNumber}</Text>
                  <Text style={{ color: colors.foreground, fontWeight: '800' }}>{formatCurrency(bill.totalAmount)}</Text>
                </TouchableOpacity>
              ))
            )}
          </View>
        ) : null}

        {/* Tip */}
        <View style={styles.tipRow}>
          {TIP_OPTIONS.map((pct) => {
            const active = tipPercent === pct;
            return (
              <TouchableOpacity
                key={pct}
                onPress={() => setTipPercent(pct)}
                style={[styles.tipChip, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? `${colors.primary}12` : colors.card }]}
              >
                <Text style={{ color: active ? colors.primary : colors.foregroundSecondary, fontWeight: '800', fontSize: 12 }}>
                  {pct === 0 ? 'Sem gorjeta' : `+${Math.round(pct * 100)}%`}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Keypad */}
        <View style={styles.keypad}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'del'].map((key) => (
            <TouchableOpacity
              key={key}
              onPress={() => (key === 'del' ? backspace() : pressDigit(key))}
              style={[styles.key, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              {key === 'del' ? (
                <Delete size={22} color={colors.foreground} />
              ) : (
                <Text style={[styles.keyText, { color: colors.foreground }]}>{key}</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          disabled={amount <= 0}
          onPress={startCharge}
          style={[styles.chargeBtn, { backgroundColor: colors.primary, opacity: amount <= 0 ? 0.4 : 1 }]}
        >
          <Nfc size={20} color="#FFF" />
          <Text style={styles.chargeBtnText}>Iniciar cobrança</Text>
        </TouchableOpacity>
      </View>
    </V2Shell>
  );
}

const styles = StyleSheet.create({
  amountWrap: { flex: 1, gap: 12 },
  amountDisplayBox: { alignItems: 'center', paddingVertical: 12 },
  amountCaption: { fontSize: 12, fontWeight: '700' },
  amountValue: { fontSize: 40, fontWeight: '900', marginTop: 4, letterSpacing: -1 },
  amountTip: { fontSize: 12, marginTop: 4 },
  linkedRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, minHeight: 50 },
  linkedText: { flex: 1, fontSize: 14, fontWeight: '600' },
  pickerBox: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 12 },
  pickerNum: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tipRow: { flexDirection: 'row', gap: 8 },
  tipChip: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  keypad: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' },
  key: { width: '31.5%', height: 58, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  keyText: { fontSize: 24, fontWeight: '800' },
  chargeBtn: { minHeight: 54, borderRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 'auto' },
  chargeBtnText: { color: '#FFF', fontSize: 16, fontWeight: '800' },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  nfcPulseOuter: { width: 180, height: 180, borderRadius: 90, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  nfcPulseMid: { width: 130, height: 130, borderRadius: 65, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  nfcCore: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
  tapTotal: { fontSize: 34, fontWeight: '900', marginTop: 28, letterSpacing: -1 },
  tapHint: { fontSize: 14, marginTop: 6, textAlign: 'center' },
  methodLabel: { fontSize: 12, fontWeight: '700', marginTop: 28, marginBottom: 10 },
  methodGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  methodBtn: { width: '46%', minHeight: 52, borderWidth: 1, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  methodBtnText: { fontSize: 14, fontWeight: '800' },
  cancelLink: { marginTop: 20, paddingVertical: 10 },

  successIcon: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  successTotal: { fontSize: 38, fontWeight: '900', marginTop: 20, letterSpacing: -1 },
  successSub: { fontSize: 14, marginTop: 6 },
  warnNote: { color: '#B45309', backgroundColor: '#FFEDD5', borderRadius: 12, padding: 12, fontSize: 12, marginTop: 16, textAlign: 'center' },
  linkChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, marginTop: 12 },
  linkChipText: { fontSize: 12, fontWeight: '800' },
  successActions: { flexDirection: 'row', gap: 12, marginTop: 32, alignSelf: 'stretch' },
  secondaryBtn: { flex: 1, minHeight: 50, borderWidth: 1, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  secondaryBtnText: { fontSize: 14, fontWeight: '800' },
  primaryBtn: { flex: 1, minHeight: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  primaryBtnText: { color: '#FFF', fontSize: 14, fontWeight: '800' },
});
