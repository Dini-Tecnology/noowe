import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { CalendarClock, ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react-native';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { supabaseApiAdapter } from '@okinawa/shared/services/supabase-api';
import { useRestaurantRole } from '../../contexts/RestaurantRoleContext';
import { V2Shell } from './shared/V2Shell';
import { V2FormSheet } from './shared/V2FormSheet';
import { V2ConfirmDialog } from './shared/V2ConfirmDialog';
import { DateInput, saoPauloDateToIso } from './shared/DateInput';

interface Shift {
  id: string;
  staff_id: string;
  staff_name?: string;
  date: string;
  start_time: string;
  end_time: string;
  role?: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
  notes?: string;
}

interface StaffOption {
  id: string;
  full_name?: string;
  role: string;
}

const STATUS_META: Record<Shift['status'], { label: string; bg: string; color: string }> = {
  scheduled: { label: 'Agendado', bg: '#EFF6FF', color: '#1D4ED8' },
  in_progress: { label: 'Em turno', bg: '#F0FDF4', color: '#16A34A' },
  completed: { label: 'Concluído', bg: '#F3F4F6', color: '#4B5563' },
  cancelled: { label: 'Cancelado', bg: '#FEF2F2', color: '#DC2626' },
  no_show: { label: 'Faltou', bg: '#FFF7ED', color: '#C2410C' },
};

const WEEKDAY_LABELS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

function startOfWeek(base: Date): Date {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function isoDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return fallback;
}

export default function ShiftsScreen() {
  const colors = useColors();
  const { restaurantId } = useRestaurantRole();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [editing, setEditing] = useState<Shift | null | undefined>(undefined);
  const [staffId, setStaffId] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [role, setRole] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Shift | null>(null);

  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart]);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [shiftsData, staffData] = await Promise.all([
        supabaseApiAdapter.getShifts(restaurantId ?? undefined, weekStart.toISOString(), weekEnd.toISOString()),
        supabaseApiAdapter.getStaff(restaurantId ?? undefined),
      ]);
      setShifts(Array.isArray(shiftsData) ? shiftsData : []);
      setStaff((Array.isArray(staffData) ? staffData : []).filter((member: any) => member.is_active));
    } catch (err) {
      setError(getErrorMessage(err, 'Erro ao carregar escalas'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [restaurantId, weekStart, weekEnd]);

  useEffect(() => { void load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); void load(); };

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const shiftsByDay = useMemo(() => {
    const map = new Map<string, Shift[]>();
    for (const day of days) map.set(isoDate(day), []);
    for (const shift of shifts) {
      const key = shift.date.split('T')[0];
      if (map.has(key)) map.get(key)!.push(shift);
    }
    return map;
  }, [days, shifts]);

  const openCreate = () => {
    setStaffId(staff[0]?.id ?? '');
    const now = new Date();
    setDate(saoPauloDateToIso(now.getFullYear(), now.getMonth(), now.getDate()));
    setStartTime('18:00');
    setEndTime('23:00');
    setRole('');
    setFormError(null);
    setEditing(null);
  };

  const openEdit = (shift: Shift) => {
    setStaffId(shift.staff_id);
    setDate(shift.date);
    setStartTime(shift.start_time);
    setEndTime(shift.end_time);
    setRole(shift.role ?? '');
    setFormError(null);
    setEditing(shift);
  };

  const closeEditor = () => {
    if (saving) return;
    setEditing(undefined);
    setFormError(null);
  };

  const saveShift = async () => {
    if (!restaurantId) return;
    if (!staffId || !date || !startTime.trim() || !endTime.trim()) {
      setFormError('Selecione o funcionário, data e horários.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await supabaseApiAdapter.updateShift(editing.id, {
          date,
          start_time: startTime.trim(),
          end_time: endTime.trim(),
          role: role.trim() || null,
        });
      } else {
        await supabaseApiAdapter.createShift(restaurantId, staffId, date, startTime.trim(), endTime.trim(), role.trim() || undefined);
      }
      setEditing(undefined);
      await load();
    } catch (err) {
      setFormError(getErrorMessage(err, 'Não foi possível salvar a escala.'));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await supabaseApiAdapter.deleteShift(deleting.id);
      setDeleting(null);
      await load();
    } catch (err) {
      setDeleting(null);
      setError(getErrorMessage(err, 'Não foi possível excluir a escala.'));
    }
  };

  return (
    <>
      <V2Shell
        title="Escalas"
        subtitle="Turnos da equipe"
        showBack
        headerRight={
          <TouchableOpacity
            accessibilityLabel="Nova escala"
            style={[styles.addButton, { backgroundColor: colors.primary }]}
            onPress={openCreate}
          >
            <Plus size={17} color="#FFF" />
            <Text style={styles.addButtonLabel}>Turno</Text>
          </TouchableOpacity>
        }
      >
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.weekNav}>
            <Pressable onPress={() => setWeekStart((w) => addDays(w, -7))} style={[styles.weekNavButton, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <ChevronLeft size={18} color={colors.foreground} />
            </Pressable>
            <Text style={{ fontWeight: '800', color: colors.foreground, fontSize: 13 }}>
              {weekStart.toLocaleDateString('pt-BR')} – {addDays(weekStart, 6).toLocaleDateString('pt-BR')}
            </Text>
            <Pressable onPress={() => setWeekStart((w) => addDays(w, 7))} style={[styles.weekNavButton, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <ChevronRight size={18} color={colors.foreground} />
            </Pressable>
          </View>

          {loading ? (
            <Text style={{ textAlign: 'center', color: colors.foregroundSecondary, marginTop: 24 }}>Carregando escalas…</Text>
          ) : error ? (
            <Text style={{ textAlign: 'center', color: '#EF4444', marginTop: 24 }}>{error}</Text>
          ) : (
            days.map((day) => {
              const dayShifts = shiftsByDay.get(isoDate(day)) ?? [];
              const isToday = isoDate(day) === isoDate(new Date());
              return (
                <View key={isoDate(day)} style={{ marginBottom: 16 }}>
                  <View style={styles.dayHeader}>
                    <Text style={{ fontWeight: '800', fontSize: 13, color: isToday ? colors.primary : colors.foreground }}>
                      {WEEKDAY_LABELS[day.getDay()]}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.foregroundSecondary }}>{day.toLocaleDateString('pt-BR')}</Text>
                  </View>
                  {dayShifts.length === 0 ? (
                    <View style={[styles.emptyDay, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <Text style={{ fontSize: 12, color: colors.foregroundSecondary }}>Sem turnos.</Text>
                    </View>
                  ) : (
                    dayShifts.map((shift) => {
                      const meta = STATUS_META[shift.status] ?? STATUS_META.scheduled;
                      return (
                        <View key={shift.id} style={[styles.shiftRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontWeight: '700', color: colors.foreground }}>{shift.staff_name ?? 'Funcionário'}</Text>
                            <Text style={{ fontSize: 12, color: colors.foregroundSecondary, marginTop: 2 }}>
                              {shift.start_time} – {shift.end_time}{shift.role ? ` · ${shift.role}` : ''}
                            </Text>
                          </View>
                          <View style={[styles.statusBadge, { backgroundColor: meta.bg }]}>
                            <Text style={{ fontSize: 10, fontWeight: '800', color: meta.color }}>{meta.label}</Text>
                          </View>
                          <View style={styles.rowActions}>
                            <IconAction label="Editar turno" onPress={() => openEdit(shift)}>
                              <Pencil size={14} color={colors.foregroundSecondary} />
                            </IconAction>
                            <IconAction label="Excluir turno" onPress={() => setDeleting(shift)}>
                              <Trash2 size={14} color="#EF4444" />
                            </IconAction>
                          </View>
                        </View>
                      );
                    })
                  )}
                </View>
              );
            })
          )}

          {!loading && !error && shifts.length === 0 ? (
            <View style={[styles.emptyBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <CalendarClock size={30} color={colors.foregroundSecondary} />
              <Text style={{ color: colors.foregroundSecondary, marginTop: 10, textAlign: 'center' }}>
                Nenhum turno cadastrado nesta semana.
              </Text>
            </View>
          ) : null}
        </ScrollView>
      </V2Shell>

      <V2FormSheet
        visible={editing !== undefined}
        title={editing ? 'Editar turno' : 'Novo turno'}
        subtitle="Defina o funcionário, data e horário"
        saveLabel={editing ? 'Salvar alterações' : 'Cadastrar turno'}
        saving={saving}
        onClose={closeEditor}
        onSave={() => void saveShift()}
      >
        {!editing ? (
          <Field label="Funcionário" required>
            <View style={styles.staffOptions}>
              {staff.map((member) => {
                const selected = staffId === member.id;
                return (
                  <Pressable
                    key={member.id}
                    onPress={() => setStaffId(member.id)}
                    style={[
                      styles.staffOption,
                      { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? `${colors.primary}12` : colors.card },
                    ]}
                  >
                    <Text style={{ color: selected ? colors.primary : colors.foreground, fontWeight: selected ? '800' : '600', fontSize: 13 }}>
                      {member.full_name ?? 'Sem nome'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Field>
        ) : (
          <Text style={{ color: colors.foregroundSecondary, marginBottom: 16 }}>{editing.staff_name}</Text>
        )}
        <Field label="Data" required>
          <DateInput value={date} onChangeValue={setDate} placeholder="Selecione a data" />
        </Field>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Field label="Início (HH:MM)" required>
              <TextInput
                value={startTime}
                onChangeText={setStartTime}
                placeholder="18:00"
                placeholderTextColor={colors.foregroundMuted}
                style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
              />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Fim (HH:MM)" required>
              <TextInput
                value={endTime}
                onChangeText={setEndTime}
                placeholder="23:00"
                placeholderTextColor={colors.foregroundMuted}
                style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
              />
            </Field>
          </View>
        </View>
        <Field label="Função (opcional)">
          <TextInput
            value={role}
            onChangeText={setRole}
            placeholder="Ex.: Garçom, Caixa"
            placeholderTextColor={colors.foregroundMuted}
            style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
          />
        </Field>
        {formError ? <Text style={styles.formError}>{formError}</Text> : null}
      </V2FormSheet>

      <V2ConfirmDialog
        visible={deleting !== null}
        title="Excluir turno?"
        message={`O turno de "${deleting?.staff_name}" será removido da escala.`}
        confirmLabel="Excluir"
        destructive
        onCancel={() => setDeleting(null)}
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

function IconAction({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={7}
      onPress={onPress}
      style={({ pressed }) => [styles.iconAction, { backgroundColor: colors.backgroundSecondary }, pressed && { opacity: 0.72 }]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  addButton: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, borderRadius: 13 },
  addButtonLabel: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  weekNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  weekNavButton: { width: 36, height: 36, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  dayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  emptyDay: { borderRadius: 12, borderWidth: 1, padding: 10 },
  shiftRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 13, borderWidth: 1, padding: 11, marginBottom: 7 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  rowActions: { flexDirection: 'row', gap: 5 },
  iconAction: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  emptyBox: { borderRadius: 16, borderWidth: 1, padding: 28, alignItems: 'center', marginTop: 12 },
  field: { marginBottom: 18 },
  fieldLabel: { fontSize: 13, fontWeight: '800', marginBottom: 8 },
  input: { minHeight: 50, borderWidth: 1, borderRadius: 15, paddingHorizontal: 14, fontSize: 15 },
  formError: { color: '#DC2626', backgroundColor: '#FEF2F2', borderRadius: 12, padding: 12, fontSize: 13 },
  staffOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  staffOption: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
});
