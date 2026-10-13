import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { Link2, Unlink2, ArrowRightLeft } from 'lucide-react-native';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { supabaseApiAdapter } from '@okinawa/shared/services/supabase-api';
import { V2ConfirmDialog } from '../shared/V2ConfirmDialog';
import { TablePickerSheet } from '../shared/TablePickerSheet';
import { describeLayoutError, joinCandidates, swapCandidates } from '../shared/tableLayout';
import type { V2Table } from '../shared/useRestaurantOperations';

type Props = {
  table: V2Table;
  tables: V2Table[];
  /** Recarrega o mapa depois de uma operação. */
  onChanged: () => void | Promise<void>;
  onError: (message: string | null) => void;
};

type Mode = 'swap' | 'join' | 'unmerge' | null;

/**
 * Trocar a mesa de uma sessão, juntar mesas e separar a junção (ADR-018). Só aparece para quem o
 * servidor autoriza (`canRearrange`); o servidor repete todas as checagens e audita cada ação.
 */
export function TableLayoutPanel({ table, tables, onChanged, onError }: Props) {
  const colors = useColors();
  const [mode, setMode] = useState<Mode>(null);
  const [saving, setSaving] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);

  if (!table.canRearrange) return null;

  const isChild = Boolean(table.mergedIntoId);
  const hasChildren = table.mergedChildren.length > 0;
  const hasSession = Boolean(table.sessionId);
  const canSwap = !isChild && !hasChildren && hasSession;
  const canJoin = !isChild && ['available', 'reserved', 'occupied'].includes(table.status);
  const needed = Math.max(table.headcount, 0);

  const close = () => { setMode(null); setSheetError(null); };
  const run = async (action: () => Promise<unknown>, afterError: 'sheet' | 'banner') => {
    setSaving(true);
    try {
      await action();
      close();
      onError(null);
      await onChanged();
    } catch (error) {
      const message = describeLayoutError(error);
      if (afterError === 'sheet') setSheetError(message);
      else { close(); onError(message); }
    } finally {
      setSaving(false);
    }
  };

  const Button = ({ label, icon, onPress, testID }: { label: string; icon: React.ReactNode; onPress: () => void; testID: string }) => (
    <Pressable
      accessibilityRole="button"
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [styles.button, { borderColor: colors.border, backgroundColor: colors.backgroundSecondary }, pressed && { opacity: 0.8 }]}
    >
      {icon}
      <Text style={[styles.buttonText, { color: colors.foreground }]}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={styles.wrap} testID="table-layout-panel">
      <Text style={[styles.label, { color: colors.foregroundSecondary }]}>ORGANIZAR MESAS</Text>
      {isChild ? (
        <Text style={{ color: colors.foreground, marginBottom: 8 }} testID="table-layout-child-note">
          Unida à mesa {table.mergedIntoLabel}. Sessão, conta e QR seguem a mesa principal.
        </Text>
      ) : null}
      {hasChildren ? (
        <Text style={{ color: colors.foreground, marginBottom: 8 }} testID="table-layout-group-note">
          Unida com {table.mergedChildren.map((child) => child.label).join(', ')} · {table.effectiveSeats} lugares no total.
        </Text>
      ) : null}
      <View style={styles.row}>
        {canSwap ? <Button testID="layout-swap" label="Trocar mesa" icon={<ArrowRightLeft size={16} color={colors.foreground} />} onPress={() => setMode('swap')} /> : null}
        {canJoin ? <Button testID="layout-join" label="Juntar mesas" icon={<Link2 size={16} color={colors.foreground} />} onPress={() => setMode('join')} /> : null}
        {hasChildren ? <Button testID="layout-unmerge" label="Desfazer junção" icon={<Unlink2 size={16} color={colors.foreground} />} onPress={() => setMode('unmerge')} /> : null}
        {isChild ? <Button testID="layout-split" label="Separar desta mesa" icon={<Unlink2 size={16} color={colors.foreground} />} onPress={() => setMode('unmerge')} /> : null}
      </View>

      <TablePickerSheet
        visible={mode === 'swap'}
        title={`Trocar a mesa ${table.label}`}
        subtitle={`${needed} pessoa(s) na mesa`}
        mode="single"
        candidates={swapCandidates(tables, { excludeId: table.id, needed })}
        needed={needed}
        requireFit
        saving={saving}
        error={sheetError}
        confirmLabel="Trocar"
        onClose={close}
        onConfirm={(ids) => void run(() => supabaseApiAdapter.moveTableSession(table.sessionId!, ids[0]), 'sheet')}
      />
      <TablePickerSheet
        visible={mode === 'join'}
        title={`Juntar à mesa ${table.label}`}
        subtitle={`${table.effectiveSeats} lugares hoje`}
        mode="multi"
        candidates={joinCandidates(tables, table.id)}
        baseSeats={table.effectiveSeats}
        needed={needed}
        requireFit={false}
        saving={saving}
        error={sheetError}
        confirmLabel="Juntar"
        onClose={close}
        onConfirm={(ids) => void run(() => supabaseApiAdapter.mergeTables(table.id, ids), 'sheet')}
      />
      <V2ConfirmDialog
        visible={mode === 'unmerge'}
        title={isChild ? 'Separar esta mesa?' : 'Desfazer a junção?'}
        message={isChild
          ? `A mesa ${table.label} deixa o grupo da mesa ${table.mergedIntoLabel}. A decisão fica registrada.`
          : `As mesas ${table.mergedChildren.map((child) => child.label).join(', ')} voltam a ser separadas. A decisão fica registrada.`}
        confirmLabel="Separar"
        destructive
        onConfirm={() => void run(
          () => (isChild
            ? supabaseApiAdapter.unmergeTables(table.mergedIntoId!, [table.id])
            : supabaseApiAdapter.unmergeTables(table.id, null)),
          'banner',
        )}
        onCancel={close}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 14 },
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, marginBottom: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  button: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11 },
  buttonText: { fontSize: 13, fontWeight: '700' },
});
