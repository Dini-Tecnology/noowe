/* Hallmark · pre-emit critique: P5 H5 E4 S5 R4 V5 */
/* Hallmark · macrostructure: Long Document · tone: warm utilitarian · anchor hue: orange */
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, Share, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import customerBackend, { type DigitalReceipt, type PaymentMethodType } from '../../services/customer-backend';
import { rootNavigate, StateView } from './shared';

const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const PAYMENT_METHOD_LABELS: Record<PaymentMethodType, string> = {
  pix: 'PIX', credit_card: 'Crédito', debit_card: 'Débito', apple_pay: 'Apple Pay',
  google_pay: 'Google Pay', tap_to_pay: 'TAP to Pay', wallet: 'Carteira Noowe',
};

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return `${date.toLocaleDateString('pt-BR')} · ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

function receiptHtml(receipt: DigitalReceipt): string {
  const rows = receipt.items
    .map(
      (item) => `<tr>
        <td style="padding:6px 0;">${item.quantity}x ${item.name}</td>
        <td style="padding:6px 0;text-align:right;">${money(item.totalPrice)}</td>
      </tr>`,
    )
    .join('');
  return `
    <html>
      <head><meta charset="utf-8" /></head>
      <body style="font-family:-apple-system,Helvetica,Arial,sans-serif;color:#1a1a1a;padding:24px;">
        ${receipt.simulated ? '<p>RECIBO DE SIMULAÇÃO — Nenhum valor foi cobrado.</p>' : ''}
        <h2 style="margin-bottom:0;">${receipt.restaurantName}</h2>
        <p style="color:#666;margin-top:4px;">
          ${receipt.restaurantCnpj ? `CNPJ: ${receipt.restaurantCnpj}<br/>` : ''}
          ${formatDateTime(receipt.createdAt)}
        </p>
        <hr style="border:none;border-top:1px solid #eee;margin:16px 0;" />
        <table style="width:100%;border-collapse:collapse;">${rows}</table>
        <hr style="border:none;border-top:1px solid #eee;margin:16px 0;" />
        <table style="width:100%;border-collapse:collapse;">
          <tr><td>Subtotal</td><td style="text-align:right;">${money(receipt.subtotal)}</td></tr>
          <tr><td>Taxa de serviço (${receipt.serviceFeePercent}%)</td><td style="text-align:right;">${money(receipt.serviceFee)}</td></tr>
          ${receipt.discount > 0 ? `<tr><td>${receipt.discountReason ?? 'Desconto'}</td><td style="text-align:right;color:#16A34A;">-${money(receipt.discount)}</td></tr>` : ''}
          ${receipt.tip > 0 ? `<tr><td>Gorjeta</td><td style="text-align:right;">${money(receipt.tip)}</td></tr>` : ''}
          <tr><td style="font-weight:700;padding-top:8px;">Total</td><td style="text-align:right;font-weight:700;padding-top:8px;">${money(receipt.total + receipt.tip)}</td></tr>
        </table>
        <hr style="border:none;border-top:1px solid #eee;margin:16px 0;" />
        <p style="font-size:13px;color:#444;">
          Pagamento: ${PAYMENT_METHOD_LABELS[receipt.paymentMethod] ?? receipt.paymentMethod}<br/>
          ${receipt.cashback > 0 ? `Cashback ganho: +${money(receipt.cashback)}<br/>` : ''}
          ${receipt.pointsAwarded > 0 ? `Pontos ganhos: +${receipt.pointsAwarded} pts<br/>` : ''}
        </p>
        <p style="font-size:11px;color:#999;margin-top:24px;">
          ${receipt.simulated ? 'Simulação sem cobrança · Sem valor fiscal' : `Comprovante: ${receipt.id}`}
        </p>
      </body>
    </html>
  `;
}

export default function DigitalReceiptScreen({ route, navigation }: any) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const receiptId: string | undefined = route?.params?.receiptId;
  const [exporting, setExporting] = useState(false);

  const query = useQuery({
    queryKey: ['receipt', receiptId],
    queryFn: () => customerBackend.getReceipt(receiptId!),
    enabled: !!receiptId,
  });
  const receipt = query.data;

  const downloadPdf = useCallback(async () => {
    if (!receipt) return;
    setExporting(true);
    try {
      const { uri } = await Print.printToFileAsync({ html: receiptHtml(receipt) });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Recibo Digital' });
      } else {
        Alert.alert('Recibo gerado', 'O PDF foi criado, mas o compartilhamento não está disponível neste dispositivo.');
      }
    } catch {
      Alert.alert('Não foi possível gerar o PDF', 'Tente novamente em instantes.');
    } finally {
      setExporting(false);
    }
  }, [receipt]);

  const shareText = useCallback(() => {
    if (!receipt) return;
    Share.share({
      message: `${receipt.simulated ? 'Recibo de simulação' : 'Recibo'} · ${receipt.restaurantName}\n${formatDateTime(receipt.createdAt)}\nTotal: ${money(receipt.total + receipt.tip)}\n${receipt.simulated ? 'Simulação sem cobrança · Sem valor fiscal' : `Comprovante: ${receipt.id}`}`,
    });
  }, [receipt]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        scroll: { flex: 1, backgroundColor: colors.background },
        content: { paddingHorizontal: 16, paddingBottom: 40 },
        header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, gap: 12 },
        headerBtn: {
          width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
          backgroundColor: colors.backgroundTertiary,
        },
        headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: colors.foreground },
        card: {
          borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card,
          padding: 20, gap: 4,
        },
        cardIcon: {
          alignSelf: 'center', width: 52, height: 52, borderRadius: 16, backgroundColor: colors.backgroundSecondary,
          alignItems: 'center', justifyContent: 'center', marginBottom: 10,
        },
        restaurantName: { fontSize: 17, fontWeight: '800', color: colors.foreground, textAlign: 'center' },
        restaurantMeta: { fontSize: 12, color: colors.foregroundSecondary, textAlign: 'center', marginTop: 4, marginBottom: 16 },
        divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 14 },
        itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
        itemName: { fontSize: 13, color: colors.foreground, flex: 1, marginRight: 8 },
        itemPrice: { fontSize: 13, fontWeight: '600', color: colors.foreground },
        summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
        summaryLabel: { fontSize: 13, color: colors.foregroundSecondary },
        summaryValue: { fontSize: 13, fontWeight: '600', color: colors.foreground },
        discountValue: { fontSize: 13, fontWeight: '700', color: colors.success },
        totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 6 },
        totalLabel: { fontSize: 16, fontWeight: '800', color: colors.foreground },
        totalValue: { fontSize: 16, fontWeight: '800', color: colors.foreground },
        infoBox: { backgroundColor: colors.backgroundTertiary, borderRadius: 14, padding: 14, gap: 6, marginTop: 14 },
        infoRow: { flexDirection: 'row', justifyContent: 'space-between' },
        infoLabel: { fontSize: 13, color: colors.foregroundSecondary },
        infoValue: { fontSize: 13, fontWeight: '600', color: colors.foreground },
        infoValueGreen: { fontSize: 13, fontWeight: '700', color: colors.success },
        infoValueOrange: { fontSize: 13, fontWeight: '700', color: colors.primary },
        qrBox: {
          alignSelf: 'center', width: 96, height: 96, borderRadius: 12, backgroundColor: colors.backgroundTertiary,
          alignItems: 'center', justifyContent: 'center', marginTop: 18,
        },
        accessKeyText: { fontSize: 10, color: colors.foregroundMuted, textAlign: 'center', marginTop: 10, letterSpacing: 0.5 },
        nfceLabel: { fontSize: 11, color: colors.foregroundMuted, textAlign: 'center', marginTop: 4 },
        actionsRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
        actionBtn: {
          flex: 1, alignItems: 'center', gap: 6, paddingVertical: 14, borderRadius: 14,
          borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card,
        },
        actionBtnActive: { borderColor: colors.primary, backgroundColor: colors.backgroundSecondary },
        actionBtnText: { fontSize: 12, fontWeight: '600', color: colors.foreground },
        actionBtnTextActive: { color: colors.primary },
        cta: { marginTop: 16, paddingVertical: 17, borderRadius: 18, alignItems: 'center', backgroundColor: colors.primary },
        ctaText: { fontSize: 16, fontWeight: '700', color: colors.primaryForeground },
      }),
    [colors],
  );

  return (
    <ScreenContainer edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Voltar">
          <Ionicons name="arrow-back" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Recibo Digital</Text>
        <TouchableOpacity onPress={downloadPdf} disabled={!receipt || exporting} accessibilityRole="button" accessibilityLabel="Baixar PDF">
          <Ionicons name="download-outline" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
        <StateView loading={query.isLoading} error={query.error} onRetry={() => query.refetch()} />

        {receipt && (
          <View style={styles.card}>
            <View style={styles.cardIcon}>
              <Ionicons name="receipt" size={24} color={colors.primary} />
            </View>
            <Text style={styles.restaurantName}>{receipt.restaurantName}</Text>
            <Text style={styles.restaurantMeta}>
              {receipt.restaurantCnpj ? `CNPJ: ${receipt.restaurantCnpj}\n` : ''}{formatDateTime(receipt.createdAt)}
            </Text>

            {receipt.items.map((item, index) => (
              <View key={`${item.name}-${index}`} style={styles.itemRow}>
                <Text style={styles.itemName} numberOfLines={1}>{item.quantity}x {item.name}</Text>
                <Text style={styles.itemPrice}>{money(item.totalPrice)}</Text>
              </View>
            ))}

            <View style={styles.divider} />

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Subtotal</Text>
              <Text style={styles.summaryValue}>{money(receipt.subtotal)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Taxa de serviço ({receipt.serviceFeePercent}%)</Text>
              <Text style={styles.summaryValue}>{money(receipt.serviceFee)}</Text>
            </View>
            {receipt.discount > 0 && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>{receipt.discountReason ?? 'Desconto'}</Text>
                <Text style={styles.discountValue}>-{money(receipt.discount)}</Text>
              </View>
            )}
            {/* The tip is part of what was charged — listing it here keeps the
                rows above adding up to the total. */}
            {receipt.tip > 0 && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Gorjeta</Text>
                <Text style={styles.summaryValue}>{money(receipt.tip)}</Text>
              </View>
            )}

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>{money(receipt.total + receipt.tip)}</Text>
            </View>

            <View style={styles.infoBox}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Pagamento</Text>
                <Text style={styles.infoValue}>{PAYMENT_METHOD_LABELS[receipt.paymentMethod] ?? receipt.paymentMethod}</Text>
              </View>
              {receipt.cashback > 0 && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Cashback ganho</Text>
                  <Text style={styles.infoValueGreen}>+{money(receipt.cashback)}</Text>
                </View>
              )}
              {receipt.pointsAwarded > 0 && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Pontos ganhos</Text>
                  <Text style={styles.infoValueOrange}>+{receipt.pointsAwarded} pts</Text>
                </View>
              )}
            </View>

            <View style={styles.qrBox}>
              <Ionicons name="qr-code-outline" size={44} color={colors.foregroundMuted} />
            </View>
            <Text style={styles.nfceLabel}>Comprovante da conta · Sem valor fiscal</Text>
            <Text style={styles.accessKeyText}>{receipt.simulated ? 'Recibo de simulação · Nenhum valor foi cobrado.' : receipt.accessKey}</Text>

            <View style={styles.actionsRow}>
              <TouchableOpacity style={styles.actionBtn} onPress={downloadPdf} disabled={exporting} accessibilityRole="button">
                <Ionicons name="download-outline" size={18} color={colors.foreground} />
                <Text style={styles.actionBtnText}>{exporting ? 'Gerando…' : 'PDF'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={shareText} accessibilityRole="button">
                <Ionicons name="paper-plane-outline" size={18} color={colors.foreground} />
                <Text style={styles.actionBtnText}>Enviar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnActive]}
                onPress={() => rootNavigate(navigation, 'Wallet')}
                accessibilityRole="button"
              >
                <Ionicons name="wallet-outline" size={18} color={colors.primary} />
                <Text style={[styles.actionBtnText, styles.actionBtnTextActive]}>Carteira</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.cta} onPress={() => rootNavigate(navigation, 'Wallet')} activeOpacity={0.9} accessibilityRole="button">
              <Text style={styles.ctaText}>Ver Minha Carteira</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
