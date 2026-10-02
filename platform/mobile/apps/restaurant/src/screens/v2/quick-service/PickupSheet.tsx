import React, { useMemo, useRef, useState } from 'react';
import { Modal, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { normalizePickupCode, parsePickupScan } from './quick-panel';

interface PickupSheetProps {
  visible: boolean;
  /** Pedido específico (botão "Confirmar retirada"). Sem pedido, qualquer QR/código do dia vale. */
  orderRef?: { id: string; label: string } | null;
  busy?: boolean;
  onClose: () => void;
  /** QR lido: a validação do código é do servidor. */
  onScanned: (orderId: string, code: string) => void;
  /** Código digitado pelo cliente. */
  onTyped: (code: string) => void;
}

/**
 * Retirada validada (ADR-013 §2.7): o balcão lê o QR do cliente ou digita o código dele.
 * Nunca reenvia o código guardado no pedido — quem valida é o servidor, com o que o cliente mostrou.
 */
export function PickupSheet({ visible, orderRef, busy, onClose, onScanned, onTyped }: PickupSheetProps) {
  const colors = useColors();
  const [mode, setMode] = useState<'scan' | 'type'>('scan');
  const [code, setCode] = useState('');
  const [permission, requestPermission] = useCameraPermissions();
  const [message, setMessage] = useState<string | null>(null);
  const lastScan = useRef<string>('');

  const styles = useMemo(() => StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.card, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, gap: 12 },
    title: { fontSize: 17, fontWeight: '800', color: colors.foreground },
    hint: { fontSize: 13, color: colors.foregroundSecondary },
    modes: { flexDirection: 'row', gap: 8 },
    mode: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center', borderWidth: 1.5 },
    camera: { height: 260, borderRadius: 16, overflow: 'hidden' },
    input: {
      borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, fontSize: 24, fontWeight: '800',
      letterSpacing: 4, textAlign: 'center', color: colors.foreground,
    },
    primary: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', backgroundColor: '#16A34A' },
    close: { alignItems: 'center', paddingVertical: 10 },
    error: { fontSize: 13, color: '#DC2626', textAlign: 'center' },
  }), [colors]);

  const handleScan = ({ data }: { data: string }) => {
    if (busy || data === lastScan.current) return;
    lastScan.current = data;
    const parsed = parsePickupScan(data);
    if (!parsed) {
      setMessage('Este QR não é de retirada de pedido.');
      return;
    }
    if (orderRef && parsed.orderId !== orderRef.id) {
      setMessage('Este QR é de outro pedido.');
      return;
    }
    setMessage(null);
    onScanned(parsed.orderId, parsed.code);
  };

  const close = () => { lastScan.current = ''; setMessage(null); setCode(''); onClose(); };
  const normalized = normalizePickupCode(code);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{orderRef ? `Retirada · ${orderRef.label}` : 'Confirmar retirada'}</Text>
          <Text style={styles.hint}>Peça o QR ou o código ao cliente. Só conclui com o que ele mostrar.</Text>
          <View style={styles.modes}>
            {([['scan', 'Ler QR'], ['type', 'Digitar código']] as const).map(([key, label]) => (
              <TouchableOpacity
                key={key}
                style={[styles.mode, { borderColor: mode === key ? colors.primary : colors.border }]}
                onPress={() => { setMode(key); setMessage(null); lastScan.current = ''; }}
                accessibilityRole="button"
                accessibilityState={{ selected: mode === key }}
              >
                <Text style={{ fontWeight: '700', color: mode === key ? colors.primary : colors.foreground }}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {mode === 'scan' ? (
            permission?.granted ? (
              <View style={styles.camera}>
                <CameraView
                  style={StyleSheet.absoluteFill}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                  onBarcodeScanned={handleScan}
                />
              </View>
            ) : (
              <TouchableOpacity style={styles.primary} onPress={() => { void requestPermission(); }} accessibilityRole="button">
                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Permitir câmera</Text>
              </TouchableOpacity>
            )
          ) : (
            <>
              <TextInput
                style={styles.input}
                value={code}
                onChangeText={setCode}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={12}
                placeholder="CÓDIGO"
                placeholderTextColor={colors.foregroundMuted}
                accessibilityLabel="Código de retirada"
              />
              <TouchableOpacity
                style={[styles.primary, (normalized.length < 4 || busy) && { opacity: 0.45 }]}
                disabled={normalized.length < 4 || busy}
                onPress={() => onTyped(normalized)}
                accessibilityRole="button"
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>{busy ? 'Confirmando...' : 'Confirmar retirada'}</Text>
              </TouchableOpacity>
            </>
          )}

          {message ? <Text style={styles.error}>{message}</Text> : null}
          <TouchableOpacity style={styles.close} onPress={close} accessibilityRole="button">
            <Text style={{ color: colors.foregroundSecondary, fontWeight: '600' }}>Fechar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
