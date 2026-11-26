import React, { useCallback, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { ScrollView, StyleSheet, Switch, TextInput, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import type { SavedCard } from '../../services/bill-shares';
import { moneyCents } from '../../screens/production/shared';
import { CardBrandIcon } from './CardBrandIcon';
import { ReceiptDocumentField, type ReceiptDocumentState } from './ReceiptDocumentField';

/** Uma escolha só. Carteiras (Apple Pay, Google Pay) entram aqui como outro `kind` quando houver cobrança real (ADR-020). */
export type PaymentSelection = { kind: 'pix' } | { kind: 'card'; cardId: string };

export type PaymentSheetProps = {
  /** Do servidor: abaixo do mínimo de um meio, ele some (resposta 79). `undefined` enquanto carrega. */
  pixAvailable?: boolean;
  cardAvailable?: boolean;
  /** Não dá para pagar pelo app: o motivo, no lugar das formas de pagamento. */
  offlineNotice?: string | null;
  savedCards: SavedCard[];
  onAddCard: () => void;
  /** Só quando a configuração do restaurante pede gorjeta. */
  tip?: { options: { key: string; label: string; detail?: string; selected: boolean; onPress: () => void }[]; customCents: number; onCustomChange: (text: string) => void };
  /** Só quando a configuração do restaurante cobra taxa de serviço opcional. */
  serviceFee?: { amountCents: number; waived: boolean; disabled: boolean; onToggle: (keep: boolean) => void };
  coupon?: { value: string; onChangeText: (text: string) => void; action: 'apply' | 'remove' | null; onAction: () => void; busy?: boolean; refusal?: string | null };
  receiptDocument?: { value: ReceiptDocumentState; onChange: (value: ReceiptDocumentState) => void };
  payerDocument: { required: boolean; value: string; onChange: (text: string) => void };
  /** A ScrollView que contém a folha (filha direta): CPF exigido rola até o campo (QA PAG-06). */
  scrollRef?: RefObject<ScrollView | null>;
  /** Linhas do resumo, já formatadas a partir dos valores do servidor. */
  summary: { label: string; value: string; hint?: string }[];
  /** Total do servidor; `null` enquanto não chegou. */
  totalCents: number | null;
  paying: boolean;
  disabled: boolean;
  onPay: (selection: PaymentSelection | null) => void;
  /** Cartão recusado na hora pelo provedor. */
  declined?: { reason: string | null } | null;
  onDismissDecline?: () => void;
  /** Conteúdo próprio do fluxo (política de retirada, avisos), antes do botão. */
  children?: ReactNode;
  footer?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

const brandName = (brand: string | null) => (brand ? brand.charAt(0).toUpperCase() + brand.slice(1) : 'Cartão');

/** Pagamento único do app (Quick e mesa): formas salvas, uma escolha, extras do restaurante e "Pagar R$ X". Só exibe; o servidor calcula. */
export function PaymentSheet(props: PaymentSheetProps) {
  const { pixAvailable, cardAvailable, savedCards, totalCents, payerDocument, scrollRef } = props;
  const colors = useColors();
  const [picked, setPicked] = useState<PaymentSelection | null>(null);
  const rootY = useRef(0);
  const payerY = useRef(0);

  const pixOk = pixAvailable !== false;
  const cardOk = cardAvailable !== false;
  const zeroTotal = totalCents === 0;
  const offline = !!props.offlineNotice || (!pixOk && !cardOk);
  const valid = (s: PaymentSelection | null) =>
    !!s && (s.kind === 'pix' ? pixOk : cardOk && savedCards.some((c) => c.id === s.cardId));
  const defaultCard = savedCards.find((c) => c.isDefault) ?? savedCards[0];
  const fallback: PaymentSelection | null = pixOk ? { kind: 'pix' } : cardOk && defaultCard ? { kind: 'card', cardId: defaultCard.id } : null;
  const selection = zeroTotal || offline ? null : valid(picked) ? picked : fallback;
  const isSelected = (s: PaymentSelection) => selection?.kind === s.kind && (s.kind === 'pix' || (selection as { cardId: string }).cardId === s.cardId);

  const scrollToPayer = useCallback(() => {
    scrollRef?.current?.scrollTo({ y: Math.max(0, rootY.current + payerY.current - 24), animated: true });
  }, [scrollRef]);

  const retryOtherCard = useCallback(() => {
    const current = selection?.kind === 'card' ? selection.cardId : null;
    const other = savedCards.find((c) => c.id !== current);
    setPicked(other && cardOk ? { kind: 'card', cardId: other.id } : pixOk ? { kind: 'pix' } : null);
    props.onDismissDecline?.();
  }, [cardOk, pixOk, props, savedCards, selection]);

  const styles = useMemo(() => StyleSheet.create({
    root: { paddingHorizontal: 16, gap: 16 },
    card: { borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 16, gap: 12 },
    title: { fontSize: 15, fontWeight: '700', color: colors.foreground },
    option: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.backgroundTertiary },
    optionActive: { borderColor: colors.primary, backgroundColor: colors.backgroundSecondary },
    optionLabel: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.foreground },
    optionLabelActive: { color: colors.primary },
    badge: { fontSize: 11, fontWeight: '700', color: colors.foregroundSecondary },
    row: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
    chip: { flexGrow: 1, alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.backgroundTertiary, gap: 2 },
    chipValue: { fontSize: 11, color: colors.foregroundSecondary },
    inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 14, height: 48, backgroundColor: colors.backgroundTertiary },
    input: { flex: 1, fontSize: 16, color: colors.foreground },
    payerInput: { height: 48, borderRadius: 12, paddingHorizontal: 14, fontSize: 16, backgroundColor: colors.backgroundTertiary, color: colors.foreground, borderWidth: 1.5, borderColor: colors.error },
    hint: { fontSize: 12, color: colors.foregroundSecondary },
    error: { fontSize: 13, color: colors.error, fontWeight: '700' },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
    summaryLabel: { flex: 1, fontSize: 13, color: colors.foregroundSecondary },
    summaryValue: { fontSize: 13, fontWeight: '600', color: colors.foreground },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    totalLabel: { fontSize: 15, fontWeight: '700', color: colors.foreground },
    totalValue: { fontSize: 20, fontWeight: '800', color: colors.primary },
    declined: { borderColor: colors.error },
    cta: { paddingVertical: 16, borderRadius: 16, backgroundColor: colors.primary, alignItems: 'center' },
    ctaDisabled: { opacity: 0.5 },
    ctaText: { color: colors.primaryForeground, fontSize: 16, fontWeight: '700' },
    link: { alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center' },
    linkText: { fontSize: 14, fontWeight: '700', color: colors.primary },
  }), [colors]);

  const option = (key: string, s: PaymentSelection, label: string, icon: ReactNode, badge?: string) => {
    const active = isSelected(s);
    return (
      <TouchableOpacity key={key} testID={key} style={[styles.option, active && styles.optionActive]} onPress={() => setPicked(s)} accessibilityRole="button" accessibilityState={{ selected: active }}>
        {icon}
        <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>{label}</Text>
        {badge ? <Text style={styles.badge}>{badge}</Text> : null}
        <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={20} color={active ? colors.primary : colors.foregroundSecondary} />
      </TouchableOpacity>
    );
  };

  const payLabel = props.paying ? 'Gerando cobrança…' : zeroTotal ? 'Confirmar pedido' : totalCents != null ? `Pagar ${moneyCents(totalCents)}` : 'Pagar';
  const payDisabled = props.disabled || props.paying || (!zeroTotal && !selection);

  return (
    <View style={[styles.root, props.style]} onLayout={(e) => { rootY.current = e.nativeEvent.layout.y; }}>
      {props.declined && (
        <View style={[styles.card, styles.declined]} accessibilityRole="alert" testID="card-declined">
          <Text style={styles.title}>Cartão recusado</Text>
          <Text style={styles.hint}>{props.declined.reason ?? 'O banco não autorizou a compra. Tente outro cartão ou pague com Pix.'}</Text>
          <TouchableOpacity style={styles.link} onPress={retryOtherCard} accessibilityRole="button">
            <Text style={styles.linkText}>Tentar outro cartão</Text>
          </TouchableOpacity>
        </View>
      )}

      {!zeroTotal && (
        <View style={styles.card}>
          <Text style={styles.title}>Forma de pagamento</Text>
          {offline ? (
            <Text style={styles.hint} testID="pay-offline">{props.offlineNotice ?? 'O valor está abaixo do mínimo para pagar pelo app.'}</Text>
          ) : (
            <>
              {cardOk && savedCards.map((card) => option(`saved-card-${card.id}`, { kind: 'card', cardId: card.id }, `${brandName(card.brand)} •••• ${card.lastFour}`, <CardBrandIcon brand={card.brand} width={36} />, card.isDefault ? 'Padrão' : undefined))}
              {pixOk && option('method-pix', { kind: 'pix' }, 'Pix', <Ionicons name="qr-code-outline" size={22} color={colors.foregroundSecondary} />)}
              {cardOk && (
                <TouchableOpacity testID="add-card" style={styles.option} onPress={props.onAddCard} accessibilityRole="button">
                  <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
                  <Text style={[styles.optionLabel, styles.optionLabelActive]}>Adicionar novo cartão</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      )}

      {payerDocument.required && (
        <View style={styles.card} onLayout={(e) => { payerY.current = e.nativeEvent.layout.y; scrollToPayer(); }}>
          <Text style={styles.title}>CPF do pagador</Text>
          <Text style={styles.error}>Informe o CPF do pagador para gerar a cobrança (só na primeira vez).</Text>
          <TextInput
            style={styles.payerInput}
            autoFocus
            placeholder="000.000.000-00"
            placeholderTextColor={colors.foregroundMuted}
            keyboardType="number-pad"
            maxLength={14}
            value={payerDocument.value}
            onChangeText={payerDocument.onChange}
            accessibilityLabel="CPF do pagador"
          />
        </View>
      )}

      {props.tip && (
        <View style={styles.card}>
          <Text style={styles.title}>Gorjeta (opcional)</Text>
          <View style={styles.row}>
            {props.tip.options.map((o) => (
              <TouchableOpacity key={o.key} style={[styles.chip, o.selected && styles.optionActive]} onPress={o.onPress} accessibilityRole="button" accessibilityState={{ selected: o.selected }}>
                <Text style={[styles.optionLabel, { flex: 0 }, o.selected && styles.optionLabelActive]}>{o.label}</Text>
                {o.detail ? <Text style={styles.chipValue}>{o.detail}</Text> : null}
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.inputRow}>
            <Text style={styles.chipValue}>Outro valor R$</Text>
            <TextInput
              style={styles.input}
              placeholder="0,00"
              placeholderTextColor={colors.foregroundMuted}
              keyboardType="number-pad"
              value={props.tip.customCents > 0 ? moneyCents(props.tip.customCents).replace(/^R\$\s?/, '') : ''}
              onChangeText={props.tip.onCustomChange}
              accessibilityLabel="Gorjeta em valor"
            />
          </View>
        </View>
      )}

      {props.serviceFee && (
        <View style={[styles.card, { flexDirection: 'row', alignItems: 'center' }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.title}>Taxa de serviço (opcional)</Text>
            <Text style={styles.summaryValue}>{props.serviceFee.waived ? 'Retirada' : moneyCents(props.serviceFee.amountCents)}</Text>
          </View>
          <Switch
            value={!props.serviceFee.waived}
            disabled={props.serviceFee.disabled}
            onValueChange={props.serviceFee.onToggle}
            accessibilityLabel="Taxa de serviço opcional"
            testID="service-fee-switch"
          />
        </View>
      )}

      {props.coupon && (
        <View style={styles.card}>
          <Text style={styles.title}>Cupom</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="Tem um cupom?"
              placeholderTextColor={colors.foregroundMuted}
              autoCapitalize="characters"
              value={props.coupon.value}
              onChangeText={props.coupon.onChangeText}
              accessibilityLabel="Cupom"
            />
            {props.coupon.action && (
              <TouchableOpacity onPress={props.coupon.onAction} disabled={props.coupon.busy} accessibilityRole="button" accessibilityLabel={props.coupon.action === 'apply' ? 'Aplicar cupom' : 'Remover cupom'}>
                <Text style={styles.linkText}>{props.coupon.action === 'apply' ? 'Aplicar' : 'Remover'}</Text>
              </TouchableOpacity>
            )}
          </View>
          {props.coupon.refusal ? <Text style={styles.hint} accessibilityRole="alert">{props.coupon.refusal}</Text> : null}
        </View>
      )}

      {props.receiptDocument && (
        <View style={styles.card}>
          <ReceiptDocumentField value={props.receiptDocument.value} onChange={props.receiptDocument.onChange} fallback={payerDocument.value} />
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.title}>Resumo</Text>
        {props.summary.map((line) => (
          <View key={line.label} style={{ gap: 2 }}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{line.label}</Text>
              <Text style={styles.summaryValue}>{line.value}</Text>
            </View>
            {line.hint ? <Text style={styles.hint}>{line.hint}</Text> : null}
          </View>
        ))}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total a pagar</Text>
          <Text style={styles.totalValue}>{totalCents != null ? moneyCents(totalCents) : '—'}</Text>
        </View>
      </View>

      {props.children}

      <TouchableOpacity
        testID="pay-button"
        style={[styles.cta, payDisabled && styles.ctaDisabled]}
        onPress={() => props.onPay(selection)}
        disabled={payDisabled}
        accessibilityRole="button"
        accessibilityState={{ disabled: payDisabled }}
      >
        <Text style={styles.ctaText}>{payLabel}</Text>
      </TouchableOpacity>
      {props.footer}
    </View>
  );
}

/** Cobrança criada, esperando o servidor confirmar (webhook). Igual nos dois fluxos. */
export function PaymentPending({ hint, style }: { hint?: string; style?: StyleProp<ViewStyle> }) {
  const colors = useColors();
  return (
    <View style={[{ borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 16, gap: 8, marginHorizontal: 16 }, style]}>
      <Text style={{ fontSize: 15, fontWeight: '700', color: colors.foreground }}>Aguardando confirmação</Text>
      <Text style={{ fontSize: 12, color: colors.foregroundSecondary }}>{hint ?? 'Esta tela atualiza sozinha quando o pagamento for confirmado.'}</Text>
    </View>
  );
}
