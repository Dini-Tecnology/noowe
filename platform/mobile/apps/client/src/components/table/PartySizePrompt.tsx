import React, { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';

/** Teto de pessoas no seletor; é o mesmo teto de lugares que o servidor aceita por mesa. */
const MAX_PARTY_SIZE = 50;

type Request = { seats: number | null; resolve: (size: number | null) => void };

let listener: ((request: Request) => void) | null = null;

/**
 * Pergunta "Quantas pessoas?" a quem vai abrir uma mesa (ADR-016). Resolve null se o
 * cliente desistir. Sem a PartySizePromptHost montada, assume uma pessoa em vez de travar.
 */
export function requestPartySize(info: { seats: number | null }): Promise<number | null> {
  if (!listener) return Promise.resolve(1);
  const notify = listener;
  return new Promise((resolve) => notify({ seats: info.seats, resolve }));
}

export function PartySizePromptHost() {
  const colors = useColors();
  const [request, setRequest] = useState<Request | null>(null);
  const [size, setSize] = useState(1);

  useEffect(() => {
    listener = (next) => { setSize(1); setRequest(next); };
    return () => { listener = null; };
  }, []);

  const finish = useCallback((value: number | null) => {
    request?.resolve(value);
    setRequest(null);
  }, [request]);

  const overSeats = request?.seats != null && size > request.seats;

  return (
    <Modal visible={!!request} transparent animationType="fade" onRequestClose={() => finish(null)}>
      <Pressable style={styles.backdrop} onPress={() => finish(null)}>
        <Pressable style={[styles.sheet, { backgroundColor: colors.card }]} onPress={() => undefined}>
          <Text style={[styles.title, { color: colors.foreground }]}>Quantas pessoas?</Text>
          <Text style={[styles.hint, { color: colors.foregroundMuted }]}>
            {request?.seats != null ? `Esta mesa tem ${request.seats} lugares.` : 'Informe o tamanho do seu grupo.'}
          </Text>
          <View style={styles.stepper}>
            <TouchableOpacity
              style={[styles.stepButton, { borderColor: colors.border }]}
              onPress={() => setSize((n) => Math.max(1, n - 1))}
              accessibilityRole="button"
              accessibilityLabel="Menos uma pessoa"
              testID="party-size-minus"
            >
              <Text style={[styles.stepText, { color: colors.foreground }]}>−</Text>
            </TouchableOpacity>
            <Text style={[styles.count, { color: colors.foreground }]} testID="party-size-value">{size}</Text>
            <TouchableOpacity
              style={[styles.stepButton, { borderColor: colors.border }]}
              onPress={() => setSize((n) => Math.min(MAX_PARTY_SIZE, n + 1))}
              accessibilityRole="button"
              accessibilityLabel="Mais uma pessoa"
              testID="party-size-plus"
            >
              <Text style={[styles.stepText, { color: colors.foreground }]}>+</Text>
            </TouchableOpacity>
          </View>
          {overSeats ? (
            <Text style={[styles.warn, { color: colors.foregroundMuted }]}>
              Acima da lotação da mesa: a recepção precisa liberar a entrada do seu grupo.
            </Text>
          ) : null}
          <TouchableOpacity
            style={[styles.confirm, { backgroundColor: colors.primary }]}
            onPress={() => finish(size)}
            accessibilityRole="button"
            testID="party-size-confirm"
          >
            <Text style={styles.confirmText}>Abrir mesa</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => finish(null)} accessibilityRole="button" testID="party-size-cancel">
            <Text style={[styles.cancel, { color: colors.foregroundMuted }]}>Cancelar</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 },
  sheet: { borderRadius: 20, padding: 22, alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '700' },
  hint: { marginTop: 6, fontSize: 14, textAlign: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', marginTop: 22 },
  stepButton: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 24, fontWeight: '600' },
  count: { minWidth: 72, textAlign: 'center', fontSize: 36, fontWeight: '700' },
  warn: { marginTop: 14, fontSize: 13, textAlign: 'center' },
  confirm: { marginTop: 22, alignSelf: 'stretch', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  confirmText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  cancel: { marginTop: 14, fontSize: 14 },
});
