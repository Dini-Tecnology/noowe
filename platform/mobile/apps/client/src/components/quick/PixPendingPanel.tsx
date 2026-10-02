import React, { useEffect, useMemo, useState } from 'react';
import { Share, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import QRCode from 'react-native-qrcode-svg';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { formatCountdown, remainingSeconds } from '../../screens/production/quick-service-ui';

interface PixPendingPanelProps {
  code: string;
  expiresAt: string | null;
  checking: boolean;
  onCheck: () => void;
  /** Só em desenvolvimento: confirma o Pix simulado no banco. */
  onSimulatePaid?: () => void;
  onExpired: () => void;
}

/**
 * Pix pendente (ADR-013 §2.6): QR + copia-e-cola com contagem até expirar.
 * O pedido só vai para a cozinha quando o servidor confirmar o pagamento.
 */
export function PixPendingPanel({ code, expiresAt, checking, onCheck, onSimulatePaid, onExpired }: PixPendingPanelProps) {
  const colors = useColors();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = remainingSeconds(expiresAt, now);

  useEffect(() => {
    if (seconds === 0) onExpired();
  }, [seconds, onExpired]);

  const styles = useMemo(() => StyleSheet.create({
    card: { backgroundColor: colors.card, borderRadius: 16, padding: 16, gap: 12, alignItems: 'center' },
    title: { fontSize: 15, fontWeight: '800', color: colors.foreground },
    hint: { fontSize: 13, color: colors.foregroundSecondary, textAlign: 'center' },
    countdown: { fontSize: 24, fontWeight: '800', color: colors.primary },
    code: { fontSize: 11, color: colors.foregroundMuted, textAlign: 'center' },
    btn: { alignSelf: 'stretch', paddingVertical: 13, borderRadius: 14, alignItems: 'center', borderWidth: 1.5, borderColor: colors.primary },
    btnText: { fontSize: 14, fontWeight: '700', color: colors.primary },
    btnPrimary: { backgroundColor: colors.primary },
    btnPrimaryText: { color: colors.primaryForeground },
  }), [colors]);

  return (
    <View style={styles.card} accessibilityLabel="Pagamento por Pix pendente">
      <Text style={styles.title}>Pague com Pix</Text>
      <QRCode value={code} size={176} backgroundColor="#FFFFFF" color="#111111" />
      {seconds != null && (
        <Text style={styles.countdown} accessibilityLabel={`Pix expira em ${formatCountdown(seconds)}`}>
          {formatCountdown(seconds)}
        </Text>
      )}
      <Text style={styles.hint}>Escaneie o QR ou use o copia-e-cola. O pedido vai para a cozinha assim que o pagamento for confirmado.</Text>
      <Text style={styles.code} numberOfLines={2} selectable>{code}</Text>
      <TouchableOpacity
        style={styles.btn}
        onPress={() => { void Share.share({ message: code }); }}
        accessibilityRole="button"
        accessibilityLabel="Compartilhar código Pix"
      >
        <Text style={styles.btnText}>Copiar código Pix</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.btn, styles.btnPrimary]}
        onPress={onCheck}
        disabled={checking}
        accessibilityRole="button"
        accessibilityLabel="Já paguei"
      >
        <Text style={[styles.btnText, styles.btnPrimaryText]}>{checking ? 'Verificando...' : 'Já paguei'}</Text>
      </TouchableOpacity>
      {onSimulatePaid && (
        <TouchableOpacity style={styles.btn} onPress={onSimulatePaid} accessibilityRole="button" accessibilityLabel="Simular pagamento">
          <Text style={styles.btnText}>Simular pagamento (dev)</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
