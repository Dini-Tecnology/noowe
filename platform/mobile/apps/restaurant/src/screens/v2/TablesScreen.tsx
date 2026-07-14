import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { Text } from 'react-native-paper';
import { Pencil, Plus, QrCode, Trash2, Users } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import ApiService from '@okinawa/shared/services/api';
import { supabaseApiAdapter } from '@okinawa/shared/services/supabase-api';
import { useRestaurantRole } from '../../contexts/RestaurantRoleContext';
import { V2ConfirmDialog } from './shared/V2ConfirmDialog';
import { V2FormSheet } from './shared/V2FormSheet';
import { V2Shell } from './shared/V2Shell';
import { useRestaurantTables, type V2Table } from './shared/useRestaurantOperations';

type StatusKey = 'available' | 'occupied' | 'reserved' | 'cleaning' | 'blocked' | 'payment';

const STATUS_META: Record<StatusKey, { label: string; bg: string; color: string; border: string }> = {
  available: { label: 'LIVRE', bg: '#ECFDF5', color: '#15803D', border: '#BBF7D0' },
  occupied: { label: 'OCUPADA', bg: '#FFF7ED', color: '#EA580C', border: '#FED7AA' },
  reserved: { label: 'RESERVADA', bg: '#F5F3FF', color: '#7C3AED', border: '#DDD6FE' },
  cleaning: { label: 'LIMPEZA', bg: '#FEFCE8', color: '#A16207', border: '#FEF08A' },
  blocked: { label: 'BLOQUEADA', bg: '#F3F4F6', color: '#4B5563', border: '#D1D5DB' },
  payment: { label: 'PAGAMENTO', bg: '#EFF6FF', color: '#0284C7', border: '#BAE6FD' },
};

function statusMeta(status: string) {
  return STATUS_META[status as StatusKey] ?? STATUS_META.available;
}

export default function TablesScreen() {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const navigation = useNavigation<any>();
  const { restaurantId, serverRole } = useRestaurantRole();
  const canManage = serverRole === 'owner' || serverRole === 'manager';
  const [selected, setSelected] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [editorTable, setEditorTable] = useState<V2Table | null | undefined>(undefined);
  const [deleteTable, setDeleteTable] = useState<V2Table | null>(null);
  const [tableNumber, setTableNumber] = useState('');
  const [seats, setSeats] = useState('2');
  const [section, setSection] = useState('Salão');
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const { data: tables, loading, error, refresh } = useRestaurantTables();
  const selectedTable = tables.find((table) => table.id === selected);
  const gridColumns = width >= 900 ? 6 : width >= 600 ? 5 : width < 350 ? 2 : 3;
  const gridGap = 8;
  const cellSize = Math.floor((width - 40 - gridGap * (gridColumns - 1)) / gridColumns);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  };

  const updateSelectedStatus = async (status: string) => {
    if (!selected) return;
    setIsSubmitting(true);
    setActionError(null);
    try {
      await ApiService.updateTableStatus(selected, status);
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Não foi possível alterar o status.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditor = (table?: V2Table) => {
    setTableNumber(table?.label ?? '');
    setSeats(String(table?.seats ?? 2));
    setSection(table?.section === 'Salao' ? 'Salão' : table?.section ?? 'Salão');
    setFormError(null);
    setEditorTable(table ?? null);
  };

  const closeEditor = () => {
    if (isSubmitting) return;
    setEditorTable(undefined);
    setFormError(null);
  };

  const saveTable = async () => {
    if (!restaurantId) return;
    const cleanNumber = tableNumber.trim();
    const capacity = Number(seats);
    if (!cleanNumber) {
      setFormError('Informe o número ou nome da mesa.');
      return;
    }
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 50) {
      setFormError('Informe uma capacidade entre 1 e 50 pessoas.');
      return;
    }
    const duplicate = tables.some(
      (table) => table.label.toLocaleLowerCase('pt-BR') === cleanNumber.toLocaleLowerCase('pt-BR') && table.id !== editorTable?.id,
    );
    if (duplicate) {
      setFormError('Já existe uma mesa com esse número ou nome.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    try {
      const payload = {
        table_number: cleanNumber,
        seats: capacity,
        section: section.trim() || 'Salão',
      };
      if (editorTable) {
        await supabaseApiAdapter.updateRestaurantTable(editorTable.id, payload);
      } else {
        await supabaseApiAdapter.createRestaurantTable(restaurantId, payload);
      }
      setEditorTable(undefined);
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Não foi possível salvar a mesa.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const requestDelete = (table: V2Table) => {
    if (table.status !== 'available') {
      setActionError('Para excluir uma mesa, altere primeiro o status dela para Livre.');
      return;
    }
    setDeleteTable(table);
  };

  const confirmDelete = async () => {
    if (!deleteTable) return;
    setIsSubmitting(true);
    setActionError(null);
    try {
      await supabaseApiAdapter.deleteRestaurantTable(deleteTable.id);
      if (selected === deleteTable.id) setSelected(null);
      setDeleteTable(null);
      await refresh();
    } catch (err) {
      setDeleteTable(null);
      setActionError(err instanceof Error ? err.message : 'Não foi possível excluir a mesa.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <V2Shell
        title="Mapa de Mesas"
        subtitle={canManage ? 'Cadastre e organize o salão' : 'Acompanhe a ocupação em tempo real'}
        scroll={false}
        headerRight={
          <View style={styles.headerActions}>
            <Pressable
              accessibilityLabel="Gerar QR Codes"
              onPress={() => navigation.navigate('QRBatch')}
              style={[styles.qrButton, { backgroundColor: `${colors.primary}15` }]}
            >
              <QrCode size={16} color={colors.primary} />
              <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>QR</Text>
            </Pressable>
            {canManage ? (
              <Pressable
                accessibilityLabel="Cadastrar mesa"
                onPress={() => openEditor()}
                style={[styles.addButton, { backgroundColor: colors.primary }]}
              >
                <Plus size={17} color="#FFF" />
                <Text style={styles.addButtonLabel}>Mesa</Text>
              </Pressable>
            ) : null}
          </View>
        }
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          alwaysBounceVertical
          refreshControl={(
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { void onRefresh(); }}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          )}
        >
          <View style={styles.legend} accessibilityLabel="Legenda de status das mesas">
            <Legend meta={STATUS_META.available} label="Livre" />
            <Legend meta={STATUS_META.occupied} label="Ocupada" />
            <Legend meta={STATUS_META.reserved} label="Reservada" />
            <Legend meta={STATUS_META.cleaning} label="Limpeza" />
            <Legend meta={STATUS_META.blocked} label="Bloqueada" />
          </View>

          {actionError ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{actionError}</Text>
              <Pressable hitSlop={8} onPress={() => setActionError(null)}>
                <Text style={styles.errorDismiss}>Fechar</Text>
              </Pressable>
            </View>
          ) : null}

          {loading ? (
            <StateCard message="Carregando mesas…" />
          ) : error ? (
            <StateCard message={error} actionLabel="Tentar novamente" onAction={refresh} />
          ) : tables.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.emptyIcon, { backgroundColor: `${colors.primary}12` }]}>
                <Users size={30} color={colors.primary} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Monte o mapa do seu salão</Text>
              <Text style={[styles.emptyDescription, { color: colors.foregroundSecondary }]}>
                {canManage
                  ? 'Cadastre as mesas com capacidade e setor para começar a operação.'
                  : 'Nenhuma mesa foi cadastrada para este restaurante.'}
              </Text>
              {canManage ? (
                <Pressable style={[styles.emptyCta, { backgroundColor: colors.primary }]} onPress={() => openEditor()}>
                  <Plus size={17} color="#FFF" />
                  <Text style={styles.emptyCtaLabel}>Cadastrar primeira mesa</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <View style={[styles.grid, { gap: gridGap }]}>
            {tables.map((table) => (
              <TableCell
                key={table.id}
                table={table}
                size={cellSize}
                isSelected={selected === table.id}
                onPress={() => setSelected(selected === table.id ? null : table.id)}
              />
            ))}
          </View>

          {selectedTable ? (
            <View style={[styles.detail, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.detailAccent, { backgroundColor: statusMeta(selectedTable.status).color }]} />
              <View style={styles.detailHeader}>
                <View style={styles.detailIdentity}>
                  <Text style={[styles.detailEyebrow, { color: colors.foregroundSecondary }]}>MESA SELECIONADA</Text>
                  <Text style={[styles.detailTitle, { color: colors.foreground }]}>Mesa {selectedTable.label}</Text>
                </View>
                {canManage ? (
                  <View style={styles.detailActions}>
                    <Pressable
                      accessibilityLabel="Editar mesa"
                      onPress={() => openEditor(selectedTable)}
                      style={[styles.iconAction, { backgroundColor: colors.backgroundSecondary }]}
                    >
                      <Pencil size={15} color={colors.foregroundSecondary} />
                    </Pressable>
                    <Pressable
                      accessibilityLabel="Excluir mesa"
                      onPress={() => requestDelete(selectedTable)}
                      style={[styles.iconAction, { backgroundColor: '#FEF2F2' }]}
                    >
                      <Trash2 size={15} color="#EF4444" />
                    </Pressable>
                  </View>
                ) : null}
              </View>

              <View style={styles.detailSummary}>
                <View style={[styles.currentStatus, { backgroundColor: statusMeta(selectedTable.status).bg }]}>
                  <View style={[styles.currentStatusDot, { backgroundColor: statusMeta(selectedTable.status).color }]} />
                  <View>
                    <Text style={[styles.summaryLabel, { color: colors.foregroundSecondary }]}>Status atual</Text>
                    <Text style={[styles.currentStatusText, { color: statusMeta(selectedTable.status).color }]}>
                      {statusMeta(selectedTable.status).label.charAt(0) + statusMeta(selectedTable.status).label.slice(1).toLowerCase()}
                    </Text>
                  </View>
                </View>
                <View style={[styles.summaryItem, { borderColor: colors.border }]}>
                  <Text style={[styles.summaryLabel, { color: colors.foregroundSecondary }]}>Salão</Text>
                  <Text numberOfLines={1} style={[styles.summaryValue, { color: colors.foreground }]}>{selectedTable.section}</Text>
                </View>
                <View style={[styles.summaryItem, { borderColor: colors.border }]}>
                  <Text style={[styles.summaryLabel, { color: colors.foregroundSecondary }]}>Lugares</Text>
                  <Text style={[styles.summaryValue, { color: colors.foreground }]}>{selectedTable.seats}</Text>
                </View>
              </View>

              <Text style={[styles.actionLabel, { color: colors.foregroundSecondary }]}>ALTERAR STATUS</Text>
              <View style={styles.statusActions}>
                {(['available', 'occupied', 'reserved', 'cleaning', 'blocked'] as StatusKey[]).map((status) => {
                  const meta = STATUS_META[status];
                  const active = selectedTable.status === status;
                  return (
                    <Pressable
                      key={status}
                      disabled={isSubmitting}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active, disabled: isSubmitting }}
                      accessibilityLabel={`Alterar status para ${meta.label.toLowerCase()}`}
                      style={[
                        styles.statusButton,
                        {
                          borderColor: active ? meta.color : colors.border,
                          backgroundColor: active ? meta.bg : 'transparent',
                        },
                      ]}
                      onPress={() => void updateSelectedStatus(status)}
                    >
                      <View style={[styles.statusButtonDot, { backgroundColor: meta.color }]} />
                      <Text style={{ color: active ? meta.color : colors.foreground, fontWeight: '700', fontSize: 12 }}>
                        {meta.label.charAt(0) + meta.label.slice(1).toLowerCase()}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Gerar QR Code da mesa ${selectedTable.label}`}
                style={({ pressed }) => [styles.generateButton, { backgroundColor: colors.primary }, pressed && styles.primaryPressed]}
                onPress={() => navigation.navigate('QRGenerator')}
              >
                <QrCode size={17} color="#FFF" />
                <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 15 }}>Gerar QR Code</Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
      </V2Shell>

      <V2FormSheet
        visible={editorTable !== undefined}
        title={editorTable ? 'Editar mesa' : 'Nova mesa'}
        subtitle="Defina a identificação, capacidade e localização no salão"
        saveLabel={editorTable ? 'Salvar alterações' : 'Cadastrar mesa'}
        saving={isSubmitting}
        onClose={closeEditor}
        onSave={() => void saveTable()}
      >
        <Field label="Número ou nome" required>
          <TextInput
            value={tableNumber}
            onChangeText={setTableNumber}
            placeholder="Ex.: 12 ou Varanda 2"
            placeholderTextColor={colors.foregroundMuted}
            style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
          />
        </Field>
        <Field label="Capacidade" required>
          <TextInput
            value={seats}
            onChangeText={(value) => setSeats(value.replace(/\D/g, '').slice(0, 2))}
            keyboardType="number-pad"
            placeholder="2"
            placeholderTextColor={colors.foregroundMuted}
            style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
          />
        </Field>
        <Field label="Setor">
          <TextInput
            value={section}
            onChangeText={setSection}
            placeholder="Ex.: Salão, Varanda ou Área VIP"
            placeholderTextColor={colors.foregroundMuted}
            style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
          />
        </Field>
        <View style={[styles.formTip, { backgroundColor: `${colors.primary}10`, borderColor: `${colors.primary}30` }]}>
          <Text style={{ color: colors.foregroundSecondary, fontSize: 12, lineHeight: 18 }}>
            A mesa será cadastrada como Livre. Você poderá gerar o QR Code depois.
          </Text>
        </View>
        {formError ? <Text style={styles.formError}>{formError}</Text> : null}
      </V2FormSheet>

      <V2ConfirmDialog
        visible={deleteTable !== null}
        title="Excluir mesa?"
        message={`A mesa “${deleteTable?.label ?? ''}” será removida do mapa. Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        destructive
        onCancel={() => setDeleteTable(null)}
        onConfirm={() => void confirmDelete()}
      />
    </>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
        {label}{required ? <Text style={{ color: colors.primary }}> *</Text> : null}
      </Text>
      {children}
    </View>
  );
}

function StateCard({ message, actionLabel, onAction }: { message: string; actionLabel?: string; onAction?: () => void }) {
  const colors = useColors();
  return (
    <View style={[styles.stateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={{ color: colors.foregroundSecondary, textAlign: 'center' }}>{message}</Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} style={[styles.retryButton, { backgroundColor: colors.primary }]}>
          <Text style={{ color: '#FFF', fontWeight: '800' }}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Legend({ meta, label }: { meta: (typeof STATUS_META)[StatusKey]; label: string }) {
  return (
    <View style={[styles.legendItem, { backgroundColor: meta.bg, borderColor: meta.border }]}>
      <View style={[styles.dot, { backgroundColor: meta.color }]} />
      <Text style={{ fontSize: 10, fontWeight: '700', color: meta.color }}>{label}</Text>
    </View>
  );
}

function TableCell({ table, size, isSelected, onPress }: { table: V2Table; size: number; isSelected: boolean; onPress: () => void }) {
  const colors = useColors();
  const meta = statusMeta(table.status);
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(scale, {
      toValue: isSelected ? 1.05 : 1,
      useNativeDriver: true,
      speed: 18,
      bounciness: 6,
    }).start();
  }, [isSelected, scale]);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      accessibilityLabel={`Mesa ${table.label}, ${meta.label.toLowerCase()}, ${table.section}, ${table.seats} lugares`}
      style={({ pressed }) => [{ width: size, height: size }, pressed && styles.cellPressed]}
    >
      <Animated.View
        style={[
          styles.cell,
          {
            backgroundColor: meta.bg,
            borderColor: isSelected ? colors.primary : meta.border,
            borderWidth: isSelected ? 3 : 1,
            transform: [{ scale }],
          },
          isSelected && styles.cellSelectedShadow,
        ]}
      >
        <View style={[styles.statusBar, { backgroundColor: meta.color }]} />
        {table.hasQR ? <QrCode size={12} color={meta.color} style={styles.qrIcon} /> : null}
        <View style={styles.statusRow}>
          <Text style={{ fontSize: 9, fontWeight: '800', color: meta.color, letterSpacing: 0.4 }}>{meta.label}</Text>
        </View>
        <View style={styles.tableNumberRow}>
          <Text style={[styles.tablePrefix, { color: colors.foregroundSecondary }]}>Mesa</Text>
          <Text adjustsFontSizeToFit numberOfLines={1} style={[styles.tableNumber, { color: colors.foreground }]}>{table.label}</Text>
        </View>
        <Text numberOfLines={1} style={[styles.tableSection, { color: colors.foregroundSecondary }]}>{table.section}</Text>
        <View style={styles.capacityRow}>
          <Users size={12} color={colors.foregroundSecondary} />
          <Text style={[styles.capacityText, { color: colors.foregroundSecondary }]}>{table.seats} lugares</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingBottom: 24 },
  headerActions: { flexDirection: 'row', gap: 8 },
  qrButton: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, borderRadius: 13 },
  addButton: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, borderRadius: 13 },
  addButtonLabel: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cellPressed: { opacity: 0.86 },
  cell: { flex: 1, borderRadius: 14, paddingHorizontal: 7, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  cellSelectedShadow: { shadowColor: '#7C2D12', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.24, shadowRadius: 9, elevation: 7 },
  statusBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 4 },
  qrIcon: { position: 'absolute', top: 9, right: 7 },
  statusRow: { flexDirection: 'row', alignItems: 'center', minHeight: 12 },
  tableNumberRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 4, marginTop: 1, maxWidth: '100%' },
  tablePrefix: { fontSize: 10, fontWeight: '700' },
  tableNumber: { fontSize: 35, lineHeight: 39, fontWeight: '900', letterSpacing: -1.2, maxWidth: '72%' },
  tableSection: { fontSize: 11, fontWeight: '600', maxWidth: '94%' },
  capacityRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  capacityText: { fontSize: 10, fontWeight: '600' },
  detail: { marginTop: 14, padding: 16, borderRadius: 18, borderWidth: 1, overflow: 'hidden' },
  detailAccent: { position: 'absolute', top: 0, left: 0, bottom: 0, width: 4 },
  detailHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  detailIdentity: { flex: 1 },
  detailEyebrow: { fontSize: 9, fontWeight: '800', letterSpacing: 0.9 },
  detailTitle: { fontWeight: '900', fontSize: 22, marginTop: 1, letterSpacing: -0.3 },
  detailActions: { flexDirection: 'row', gap: 7 },
  iconAction: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  detailSummary: { flexDirection: 'row', gap: 7, marginTop: 14 },
  currentStatus: { flex: 1.35, minHeight: 54, borderRadius: 12, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  currentStatusDot: { width: 8, height: 8, borderRadius: 4 },
  currentStatusText: { fontSize: 13, fontWeight: '800', marginTop: 1 },
  summaryItem: { flex: 1, minWidth: 0, minHeight: 54, borderWidth: 1, borderRadius: 12, paddingHorizontal: 9, justifyContent: 'center' },
  summaryLabel: { fontSize: 9, fontWeight: '700' },
  summaryValue: { fontSize: 13, fontWeight: '800', marginTop: 2 },
  actionLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8, marginTop: 16, marginBottom: 8 },
  statusActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusButton: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 12, paddingHorizontal: 11, paddingVertical: 8 },
  statusButtonDot: { width: 7, height: 7, borderRadius: 3.5 },
  generateButton: { marginTop: 14, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14 },
  primaryPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  stateCard: { borderWidth: 1, borderRadius: 16, padding: 20, marginBottom: 12, alignItems: 'center', gap: 10 },
  retryButton: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  emptyCard: { borderWidth: 1, borderRadius: 20, padding: 28, alignItems: 'center', marginBottom: 18 },
  emptyIcon: { width: 58, height: 58, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 17, fontWeight: '800', marginTop: 15 },
  emptyDescription: { fontSize: 13, lineHeight: 19, textAlign: 'center', maxWidth: 280, marginTop: 6 },
  emptyCta: { minHeight: 46, borderRadius: 14, paddingHorizontal: 18, marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 8 },
  emptyCtaLabel: { color: '#FFF', fontWeight: '800' },
  errorBanner: { backgroundColor: '#FEF2F2', borderColor: '#FECACA', borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  errorText: { color: '#B91C1C', fontSize: 12, lineHeight: 17, flex: 1 },
  errorDismiss: { color: '#B91C1C', fontSize: 12, fontWeight: '800' },
  field: { marginBottom: 18 },
  fieldLabel: { fontSize: 13, fontWeight: '800', marginBottom: 8 },
  input: { minHeight: 50, borderWidth: 1, borderRadius: 15, paddingHorizontal: 14, fontSize: 15 },
  formTip: { borderWidth: 1, borderRadius: 14, padding: 13 },
  formError: { color: '#DC2626', backgroundColor: '#FEF2F2', borderRadius: 12, padding: 12, fontSize: 13, marginTop: 14 },
});
