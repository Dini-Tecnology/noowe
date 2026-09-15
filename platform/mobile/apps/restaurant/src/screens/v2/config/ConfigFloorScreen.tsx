import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Text } from 'react-native-paper';
import {
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Pencil,
  Plus,
  Table2,
  Trash2,
  X,
} from 'lucide-react-native';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { supabaseApiAdapter } from '@okinawa/shared/services/supabase-api';
import { useRestaurantRole } from '../../../contexts/RestaurantRoleContext';
import { V2ConfirmDialog } from '../shared/V2ConfirmDialog';
import { V2FormSheet } from '../shared/V2FormSheet';
import { V2Shell } from '../shared/V2Shell';
import { useRestaurantTables, type V2Table } from '../shared/useRestaurantOperations';

const ZONE_PALETTE = [
  { bg: '#FFEDD5', text: '#C2410C', badge: '#FED7AA' },
  { bg: '#DCFCE7', text: '#15803D', badge: '#BBF7D0' },
  { bg: '#FEF9C3', text: '#A16207', badge: '#FDE68A' },
  { bg: '#DBEAFE', text: '#1D4ED8', badge: '#BFDBFE' },
  { bg: '#F3E8FF', text: '#7C3AED', badge: '#DDD6FE' },
  { bg: '#FCE7F3', text: '#DB2777', badge: '#FBCFE8' },
];

function normalizeSection(section: string) {
  if (section === 'Salao') return 'Salão';
  return section || 'Salão';
}

function shapeLabel(shape: string) {
  const key = shape.toLowerCase();
  if (key.includes('round') || key.includes('circle') || key.includes('redond')) return 'Redonda';
  if (key.includes('square') || key.includes('quadrad')) return 'Quadrada';
  return 'Retangular';
}

function zoneColor(index: number) {
  return ZONE_PALETTE[index % ZONE_PALETTE.length];
}

export default function ConfigFloorScreen() {
  const colors = useColors();
  const { restaurantId } = useRestaurantRole();
  const { data: tables, loading, error, refresh } = useRestaurantTables();
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editorTable, setEditorTable] = useState<V2Table | null | undefined>(undefined);
  const [deleteTable, setDeleteTable] = useState<V2Table | null>(null);
  const [tableNumber, setTableNumber] = useState('');
  const [seats, setSeats] = useState('2');
  const [section, setSection] = useState('Salão Principal');
  const [shape, setShape] = useState('rectangle');
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const zones = useMemo(() => {
    const map = new Map<string, V2Table[]>();
    for (const table of tables) {
      const key = normalizeSection(table.section);
      const list = map.get(key) ?? [];
      list.push(table);
      map.set(key, list);
    }
    return Array.from(map.entries()).map(([name, zoneTables], index) => ({
      name,
      tables: zoneTables,
      color: zoneColor(index),
    }));
  }, [tables]);

  const activeZoneName = selectedZone && zones.some((z) => z.name === selectedZone)
    ? selectedZone
    : zones[0]?.name ?? null;

  const activeZone = zones.find((z) => z.name === activeZoneName) ?? null;
  const totalSeats = tables.reduce((sum, table) => sum + table.seats, 0);

  const openEditor = (table?: V2Table) => {
    setTableNumber(table?.label ?? '');
    setSeats(String(table?.seats ?? 2));
    setSection(normalizeSection(table?.section ?? activeZoneName ?? 'Salão Principal'));
    setShape(table?.shape ?? 'rectangle');
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
      (table) =>
        table.label.toLocaleLowerCase('pt-BR') === cleanNumber.toLocaleLowerCase('pt-BR') &&
        table.id !== editorTable?.id,
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
        section: section.trim() || 'Salão Principal',
        shape,
      };
      if (editorTable) {
        await supabaseApiAdapter.updateRestaurantTable(editorTable.id, payload);
      } else {
        await supabaseApiAdapter.createRestaurantTable(restaurantId, payload);
      }
      setEditorTable(undefined);
      setSelectedZone(payload.section);
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Não foi possível salvar a mesa.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTable) return;
    setIsSubmitting(true);
    setActionError(null);
    try {
      await supabaseApiAdapter.deleteRestaurantTable(deleteTable.id);
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
        title="Mapa do Salão"
        subtitle="Mesas, zonas e áreas VIP"
        showBack
        onRefresh={refresh}
      >
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : error ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={{ color: colors.foregroundSecondary, textAlign: 'center' }}>{error}</Text>
            <Pressable style={[styles.retryBtn, { backgroundColor: colors.primary }]} onPress={() => void refresh()}>
              <Text style={styles.retryLabel}>Tentar novamente</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.statsRow}>
              <StatCard value={tables.length} label="Mesas" tone="primary" colors={colors} />
              <StatCard value={zones.length} label="Zonas" tone="neutral" colors={colors} />
              <StatCard value={totalSeats} label="Lugares" tone="success" colors={colors} />
            </View>

            <View style={[styles.plantCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.plantTitle, { color: colors.foregroundSecondary }]}>PLANTA VISUAL</Text>
              {tables.length === 0 ? (
                <Text style={{ color: colors.foregroundSecondary, fontSize: 13, textAlign: 'center', paddingVertical: 24 }}>
                  Cadastre mesas para ver a planta do salão.
                </Text>
              ) : (
                <View style={styles.plantGrid}>
                  {tables.map((table, index) => {
                    const zoneIndex = zones.findIndex((z) => z.name === normalizeSection(table.section));
                    const palette = zoneColor(zoneIndex < 0 ? index : zoneIndex);
                    const wide = table.seats >= 8;
                    return (
                      <View
                        key={table.id}
                        style={[
                          styles.plantCell,
                          wide && styles.plantCellWide,
                          { backgroundColor: palette.bg },
                        ]}
                      >
                        <Text style={[styles.plantNumber, { color: colors.foreground }]}>{table.label}</Text>
                        <Text style={[styles.plantSeats, { color: colors.foregroundSecondary }]}>
                          {table.seats}p
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>

            {zones.length > 0 ? (
              <View style={styles.zoneWrap}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.zoneTabs}>
                  {zones.map((zone) => {
                    const active = zone.name === activeZoneName;
                    return (
                      <Pressable
                        key={zone.name}
                        onPress={() => setSelectedZone(zone.name)}
                        style={[
                          styles.zoneTab,
                          {
                            borderColor: active ? colors.primary : colors.border,
                            backgroundColor: active ? `${colors.primary}10` : colors.card,
                          },
                        ]}
                      >
                        <Text
                          style={{
                            color: active ? colors.primary : colors.foregroundSecondary,
                            fontWeight: '700',
                            fontSize: 12,
                          }}
                        >
                          {zone.name} ({zone.tables.length})
                        </Text>
                        {active ? <X size={12} color={colors.primary} /> : null}
                      </Pressable>
                    );
                  })}
                </ScrollView>
                <View style={styles.zoneNav}>
                  <ChevronLeft size={14} color={colors.foregroundSecondary} />
                  <View style={[styles.zoneTrack, { backgroundColor: colors.border }]}>
                    <View style={[styles.zoneThumb, { backgroundColor: colors.foregroundSecondary }]} />
                  </View>
                  <ChevronRight size={14} color={colors.foregroundSecondary} />
                </View>
              </View>
            ) : null}

            <View style={styles.listHeader}>
              <View style={styles.listTitleRow}>
                <LayoutGrid size={16} color={colors.primary} />
                <Text style={[styles.listTitle, { color: colors.foreground }]}>
                  Mesas{activeZoneName ? ` — ${activeZoneName}` : ''}
                </Text>
              </View>
              <Pressable onPress={() => openEditor()} hitSlop={8} style={styles.newBtn}>
                <Plus size={14} color={colors.primary} />
                <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>Nova</Text>
              </Pressable>
            </View>

            {actionError ? (
              <Text style={{ color: '#EF4444', marginBottom: 8, fontSize: 12 }}>{actionError}</Text>
            ) : null}

            {(activeZone?.tables ?? []).length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Nenhuma mesa nesta zona</Text>
                <Text style={{ color: colors.foregroundSecondary, fontSize: 13, textAlign: 'center' }}>
                  Adicione mesas para montar o mapa do salão.
                </Text>
                <Pressable style={[styles.retryBtn, { backgroundColor: colors.primary }]} onPress={() => openEditor()}>
                  <Plus size={16} color="#FFF" />
                  <Text style={styles.retryLabel}>Nova mesa</Text>
                </Pressable>
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                {(activeZone?.tables ?? []).map((table) => {
                  const zoneIndex = zones.findIndex((z) => z.name === normalizeSection(table.section));
                  const palette = zoneColor(zoneIndex < 0 ? 0 : zoneIndex);
                  return (
                    <View
                      key={table.id}
                      style={[styles.tableRow, { backgroundColor: colors.card, borderColor: colors.border }]}
                    >
                      <View style={[styles.tableBadge, { backgroundColor: palette.bg }]}>
                        <Table2 size={18} color={palette.text} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.tableName, { color: colors.foreground }]}>Mesa {table.label}</Text>
                        <Text style={{ color: colors.foregroundSecondary, fontSize: 12, marginTop: 2 }}>
                          {table.seats} lugares - {shapeLabel(table.shape)}
                        </Text>
                      </View>
                      <Pressable
                        accessibilityLabel={`Editar mesa ${table.label}`}
                        onPress={() => openEditor(table)}
                        style={[styles.iconBtn, { backgroundColor: colors.backgroundSecondary }]}
                      >
                        <Pencil size={14} color={colors.foregroundSecondary} />
                      </Pressable>
                      <Pressable
                        accessibilityLabel={`Excluir mesa ${table.label}`}
                        onPress={() => setDeleteTable(table)}
                        style={[styles.iconBtn, { backgroundColor: '#FEF2F2' }]}
                      >
                        <Trash2 size={14} color="#EF4444" />
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            )}
          </>
        )}
      </V2Shell>

      <V2FormSheet
        visible={editorTable !== undefined}
        title={editorTable ? 'Editar mesa' : 'Nova mesa'}
        subtitle="Defina identificação, capacidade, zona e formato"
        saveLabel={editorTable ? 'Salvar alterações' : 'Cadastrar mesa'}
        saving={isSubmitting}
        onClose={closeEditor}
        onSave={() => void saveTable()}
      >
        <Field label="Número ou nome" required colors={colors}>
          <TextInput
            value={tableNumber}
            onChangeText={setTableNumber}
            placeholder="Ex.: 12 ou Varanda 2"
            placeholderTextColor={colors.foregroundMuted}
            style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
          />
        </Field>
        <Field label="Capacidade" required colors={colors}>
          <TextInput
            value={seats}
            onChangeText={(value) => setSeats(value.replace(/\D/g, '').slice(0, 2))}
            keyboardType="number-pad"
            placeholder="2"
            placeholderTextColor={colors.foregroundMuted}
            style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
          />
        </Field>
        <Field label="Zona" colors={colors}>
          <TextInput
            value={section}
            onChangeText={setSection}
            placeholder="Ex.: Salão Principal, Varanda ou Área VIP"
            placeholderTextColor={colors.foregroundMuted}
            style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
          />
        </Field>
        <Field label="Formato" colors={colors}>
          <View style={styles.shapeRow}>
            {[
              { id: 'rectangle', label: 'Retangular' },
              { id: 'round', label: 'Redonda' },
              { id: 'square', label: 'Quadrada' },
            ].map((option) => {
              const active = shape === option.id;
              return (
                <Pressable
                  key={option.id}
                  onPress={() => setShape(option.id)}
                  style={[
                    styles.shapeChip,
                    {
                      borderColor: active ? colors.primary : colors.border,
                      backgroundColor: active ? `${colors.primary}12` : colors.card,
                    },
                  ]}
                >
                  <Text style={{ color: active ? colors.primary : colors.foregroundSecondary, fontWeight: '700', fontSize: 12 }}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Field>
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

function StatCard({
  value,
  label,
  tone,
  colors,
}: {
  value: number;
  label: string;
  tone: 'primary' | 'neutral' | 'success';
  colors: ReturnType<typeof useColors>;
}) {
  const toneColor =
    tone === 'primary' ? colors.primary : tone === 'success' ? colors.success : colors.foreground;
  return (
    <View style={[styles.statCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <Text style={[styles.statValue, { color: toneColor }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.foregroundSecondary }]}>{label}</Text>
    </View>
  );
}

function Field({
  label,
  required,
  colors,
  children,
}: {
  label: string;
  required?: boolean;
  colors: ReturnType<typeof useColors>;
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: colors.foreground, fontWeight: '700', fontSize: 13, marginBottom: 8 }}>
        {label}
        {required ? <Text style={{ color: colors.primary }}> *</Text> : null}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  statCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  statValue: { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  plantCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  plantTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  plantGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  plantCell: {
    width: '22%',
    flexGrow: 1,
    minWidth: 64,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plantCellWide: {
    width: '48%',
    flexGrow: 1,
  },
  plantNumber: { fontSize: 18, fontWeight: '800' },
  plantSeats: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  zoneWrap: { marginBottom: 14 },
  zoneTabs: { gap: 8, paddingRight: 8 },
  zoneTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  zoneNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  zoneTrack: { flex: 1, height: 3, borderRadius: 2 },
  zoneThumb: { width: '28%', height: 3, borderRadius: 2 },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  listTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  listTitle: { fontSize: 14, fontWeight: '800' },
  newBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  tableBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tableName: { fontSize: 14, fontWeight: '700' },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    gap: 10,
  },
  emptyTitle: { fontSize: 15, fontWeight: '800' },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 4,
  },
  retryLabel: { color: '#FFF', fontWeight: '700', fontSize: 13 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
  },
  shapeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  shapeChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  formError: { color: '#EF4444', fontSize: 12, marginTop: 4 },
});
