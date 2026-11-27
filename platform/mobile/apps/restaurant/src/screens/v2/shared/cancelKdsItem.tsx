import React, { useState } from 'react';
import { Alert, Text, TouchableOpacity } from 'react-native';
import { supabaseApiAdapter } from '@okinawa/shared/services/supabase-api';
import { userErrorMessage } from '@okinawa/shared/utils/user-error-message';
import { V2ConfirmDialog } from './V2ConfirmDialog';

/**
 * Cancelar item no KDS (AUD-ITEM, invariante 8): motivo digitado é obrigatório e o servidor
 * grava autor, motivo e horário no audit_log na mesma transação. Usado por cozinha, chef, cozinheiro e bar.
 */
export function useCancelKdsItem(onDone: () => void | Promise<void>) {
  const [target, setTarget] = useState<{ id: string; name: string } | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const request = (id: string, name: string) => {
    setReason('');
    setTarget({ id, name });
  };

  const confirm = async () => {
    if (!target || !reason.trim() || saving) return;
    setSaving(true);
    try {
      await supabaseApiAdapter.updateOrderItemStatus(target.id, 'cancelled', reason.trim());
      setTarget(null);
      await onDone();
    } catch (err) {
      Alert.alert('Não foi possível cancelar o item', userErrorMessage(err, 'Tente novamente.'));
    } finally {
      setSaving(false);
    }
  };

  const dialog = (
    <V2ConfirmDialog
      visible={!!target}
      title="Cancelar item"
      message={target ? `Cancelar ${target.name}? O motivo fica registrado.` : ''}
      confirmLabel={saving ? 'Cancelando…' : 'Cancelar item'}
      cancelLabel="Voltar"
      destructive
      reasonLabel="Motivo do cancelamento"
      reason={reason}
      onReasonChange={setReason}
      onConfirm={() => void confirm()}
      onCancel={() => setTarget(null)}
    />
  );

  return { request, dialog };
}

/** Link "Cancelar" ao lado do item; some quando o item já está pronto. */
export function CancelItemLink({ name, status, onPress }: { name: string; status: string; onPress: () => void }) {
  if (status === 'ready' || status === 'cancelled') return null;
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Cancelar ${name}`} onPress={onPress} hitSlop={8}>
      <Text style={{ color: '#DC2626', fontSize: 12, fontWeight: '700' }}>Cancelar</Text>
    </TouchableOpacity>
  );
}
