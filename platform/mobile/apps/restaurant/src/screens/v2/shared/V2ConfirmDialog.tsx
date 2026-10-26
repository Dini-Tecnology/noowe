import React from 'react';
import { Modal, View, TouchableOpacity, StyleSheet, TextInput } from 'react-native';
import { Text } from 'react-native-paper';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';

interface V2ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** Quando informado, pede um motivo obrigatório: o botão de confirmar só habilita com texto. */
  reasonLabel?: string;
  reason?: string;
  onReasonChange?: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function V2ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  destructive = false,
  reasonLabel,
  reason = '',
  onReasonChange,
  onConfirm,
  onCancel,
}: V2ConfirmDialogProps) {
  const colors = useColors();
  const reasonMissing = reasonLabel !== undefined && reason.trim().length === 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
          <Text style={[styles.message, { color: colors.foregroundSecondary }]}>{message}</Text>
          {reasonLabel !== undefined && (
            <TextInput
              value={reason}
              onChangeText={onReasonChange}
              placeholder={reasonLabel}
              placeholderTextColor={colors.foregroundMuted}
              multiline
              accessibilityLabel={reasonLabel}
              testID="confirm-dialog-reason"
              style={[styles.reasonInput, { color: colors.foreground, borderColor: colors.border }]}
            />
          )}
          <View style={styles.actions}>
            <TouchableOpacity
              onPress={onCancel}
              style={[styles.btn, styles.cancelBtn, { borderColor: colors.border }]}
            >
              <Text style={{ color: colors.foreground, fontWeight: '600' }}>{cancelLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onConfirm}
              disabled={reasonMissing}
              testID="confirm-dialog-confirm"
              style={[
                styles.btn,
                { backgroundColor: destructive ? '#EF4444' : colors.primary },
                reasonMissing && styles.btnDisabled,
              ]}
            >
              <Text style={{ color: '#FFF', fontWeight: '700' }}>{confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.45 },
  reasonInput: {
    minHeight: 64, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 20, fontSize: 14, textAlignVertical: 'top',
  },
  cancelBtn: {
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
});
