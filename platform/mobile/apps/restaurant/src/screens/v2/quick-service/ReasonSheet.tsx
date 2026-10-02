import React, { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';

interface ReasonSheetProps {
  visible: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}

/**
 * Motivo obrigatório (ADR-013): cancelar, recusar, reprovar conferência ou estornar item
 * sempre grava o motivo no audit_log. Sem texto, o botão não habilita.
 */
export function ReasonSheet({ visible, title, description, confirmLabel, busy, onCancel, onConfirm }: ReasonSheetProps) {
  const colors = useColors();
  const [reason, setReason] = useState('');
  const trimmed = reason.trim();

  const styles = useMemo(() => StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.card, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, gap: 12 },
    title: { fontSize: 17, fontWeight: '800', color: colors.foreground },
    description: { fontSize: 13, color: colors.foregroundSecondary },
    input: {
      minHeight: 84, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12,
      fontSize: 14, color: colors.foreground, textAlignVertical: 'top',
    },
    row: { flexDirection: 'row', gap: 10 },
    btn: { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
    cancel: { backgroundColor: colors.backgroundSecondary },
    confirm: { backgroundColor: '#DC2626' },
    disabled: { opacity: 0.45 },
    btnText: { fontSize: 14, fontWeight: '700' },
  }), [colors]);

  const close = () => { setReason(''); onCancel(); };
  const confirm = () => { if (trimmed) { onConfirm(trimmed); setReason(''); } };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>
          <TextInput
            style={styles.input}
            value={reason}
            onChangeText={setReason}
            placeholder="Motivo (obrigatório)"
            placeholderTextColor={colors.foregroundMuted}
            multiline
            maxLength={200}
            accessibilityLabel="Motivo"
          />
          <View style={styles.row}>
            <TouchableOpacity style={[styles.btn, styles.cancel]} onPress={close} accessibilityRole="button">
              <Text style={[styles.btnText, { color: colors.foreground }]}>Voltar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.confirm, (!trimmed || busy) && styles.disabled]}
              onPress={confirm}
              disabled={!trimmed || busy}
              accessibilityRole="button"
              accessibilityState={{ disabled: !trimmed || !!busy }}
            >
              <Text style={[styles.btnText, { color: '#FFFFFF' }]}>{busy ? 'Aguarde...' : confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
