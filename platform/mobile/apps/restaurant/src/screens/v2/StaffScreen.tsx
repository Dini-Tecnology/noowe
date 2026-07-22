import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Pressable, RefreshControl, ScrollView, TextInput, View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { Users, Shield, UserCheck, UserX, Plus, Pencil, Ban, CheckCircle2, Trash2, Search } from 'lucide-react-native';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { supabaseApiAdapter } from '@okinawa/shared/services/supabase-api';
import { useRestaurantRole } from '../../contexts/RestaurantRoleContext';
import { V2Shell } from './shared/V2Shell';
import { V2FormSheet } from './shared/V2FormSheet';
import { V2ConfirmDialog } from './shared/V2ConfirmDialog';

interface StaffMember {
  id: string;
  user_id: string;
  full_name?: string;
  email?: string;
  avatar_url?: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
  shift?: { id: string; start_time: string; end_time: string; status: string } | null;
  sales_value?: number | string | null;
  tips_value?: number | string | null;
  operational_status?: 'inactive' | 'on_shift' | 'scheduled' | 'active';
}

type FoundUser = {
  id: string;
  full_name?: string;
  email?: string;
  already_in_this_restaurant: boolean;
  existing_role?: string;
  linked_to_other_restaurant?: string | null;
};

type DeleteState =
  | { kind: 'deactivate'; member: StaffMember }
  | { kind: 'reactivate'; member: StaffMember }
  | { kind: 'remove'; member: StaffMember };

const ROLE_LABELS: Record<string, string> = {
  owner: 'Dono',
  manager: 'Gerente',
  maitre: 'Maître',
  chef: 'Chef',
  barman: 'Barman',
  cook: 'Cozinheiro',
  waiter: 'Garçom',
};

const ROLE_COLORS: Record<string, string> = {
  owner: '#7C3AED',
  manager: '#1D4ED8',
  maitre: '#0891B2',
  chef: '#B45309',
  barman: '#BE185D',
  cook: '#059669',
  waiter: '#374151',
};

const ASSIGNABLE_ROLES = ['manager', 'maitre', 'chef', 'barman', 'cook', 'waiter'];

function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return fallback;
}

function formatMoney(value: number | string | null | undefined): string {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);
}

export default function StaffScreen() {
  const colors = useColors();
  const { restaurantId, serverRole } = useRestaurantRole();
  const canManage = serverRole === 'owner' || serverRole === 'manager';
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteMode, setInviteMode] = useState<'link' | 'create'>('link');
  const [editingMember, setEditingMember] = useState<StaffMember | null>(null);
  const [email, setEmail] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [foundUser, setFoundUser] = useState<FoundUser | null>(null);
  const [selectedRole, setSelectedRole] = useState('waiter');
  const [newFullName, setNewFullName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const [deleting, setDeleting] = useState<DeleteState | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await supabaseApiAdapter.getStaff(restaurantId ?? undefined);
      setStaff(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(getErrorMessage(err, 'Erro ao carregar equipe'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [restaurantId]);

  useEffect(() => { void load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); void load(); };

  const active = useMemo(() => staff.filter((s) => s.is_active), [staff]);
  const inactive = useMemo(() => staff.filter((s) => !s.is_active), [staff]);

  const groupedByRole = useMemo(() => active.reduce<Record<string, StaffMember[]>>((acc, member) => {
    const key = member.role;
    if (!acc[key]) acc[key] = [];
    acc[key].push(member);
    return acc;
  }, {}), [active]);

  const openInvite = () => {
    setEmail('');
    setFoundUser(null);
    setSearchError(null);
    setSelectedRole('waiter');
    setNewFullName('');
    setNewPassword('');
    setInviteMode('link');
    setEditingMember(null);
    setInviteOpen(true);
  };

  const openEdit = (member: StaffMember) => {
    setEditingMember(member);
    setSelectedRole(member.role);
    setSearchError(null);
    setInviteOpen(true);
  };

  const closeInvite = () => {
    if (saving) return;
    setInviteOpen(false);
    setEditingMember(null);
    setFoundUser(null);
  };

  const runSearch = async () => {
    if (!restaurantId || !email.trim()) return;
    setSearching(true);
    setSearchError(null);
    setFoundUser(null);
    try {
      const result = await supabaseApiAdapter.findUserByEmail(restaurantId, email.trim());
      if (!result) {
        setSearchError('Nenhum usuário encontrado com este e-mail. Peça para a pessoa se cadastrar no app primeiro e tente novamente.');
        return;
      }
      setFoundUser(result);
      if (result.existing_role && result.already_in_this_restaurant) {
        setSelectedRole(result.existing_role);
      }
    } catch (err) {
      setSearchError(getErrorMessage(err, 'Não foi possível buscar o usuário.'));
    } finally {
      setSearching(false);
    }
  };

  const canSubmitInvite = editingMember
    ? true
    : inviteMode === 'link'
      ? Boolean(foundUser && !foundUser.already_in_this_restaurant && !foundUser.linked_to_other_restaurant)
      : Boolean(newFullName.trim() && email.trim() && newPassword.length >= 6);

  const submit = async () => {
    if (!restaurantId) return;
    setSaving(true);
    try {
      if (editingMember) {
        await supabaseApiAdapter.updateStaffRole(editingMember.id, selectedRole);
      } else if (inviteMode === 'link') {
        if (foundUser) await supabaseApiAdapter.upsertStaffRole(restaurantId, foundUser.id, selectedRole);
      } else {
        await supabaseApiAdapter.createStaffUser(restaurantId, email.trim(), newPassword, newFullName.trim(), selectedRole);
      }
      setInviteOpen(false);
      setEditingMember(null);
      setFoundUser(null);
      await load();
    } catch (err) {
      setSearchError(getErrorMessage(err, 'Não foi possível salvar.'));
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteAction = async () => {
    if (!deleting) return;
    try {
      if (deleting.kind === 'deactivate') {
        await supabaseApiAdapter.deactivateStaff(deleting.member.id);
      } else if (deleting.kind === 'reactivate') {
        await supabaseApiAdapter.reactivateStaff(deleting.member.id);
      } else {
        await supabaseApiAdapter.removeStaffRole(deleting.member.id);
      }
      setDeleting(null);
      await load();
    } catch (err) {
      setDeleting(null);
      setError(getErrorMessage(err, 'Não foi possível concluir a ação.'));
    }
  };

  return (
    <>
      <V2Shell
        title="Equipe"
        subtitle="Gestão de staff"
        showBack
        headerRight={canManage ? (
          <Pressable
            accessibilityLabel="Adicionar membro"
            style={[styles.addHeaderButton, { backgroundColor: colors.primary }]}
            onPress={openInvite}
          >
            <Plus size={17} color="#FFF" />
            <Text style={styles.addHeaderLabel}>Membro</Text>
          </Pressable>
        ) : undefined}
      >
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
        >
          {loading && (
            <Text style={{ textAlign: 'center', color: colors.foregroundSecondary, marginTop: 24 }}>
              Carregando equipe…
            </Text>
          )}
          {error && (
            <Text style={{ textAlign: 'center', color: '#EF4444', marginTop: 24 }}>{error}</Text>
          )}

          {!loading && !error && (
            <>
              <View style={styles.summaryRow}>
                <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <UserCheck size={18} color="#22C55E" />
                  <Text style={{ fontSize: 22, fontWeight: '700', color: colors.foreground, marginTop: 6 }}>
                    {active.length}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.foregroundSecondary }}>Ativos</Text>
                </View>
                <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Users size={18} color={colors.primary} />
                  <Text style={{ fontSize: 22, fontWeight: '700', color: colors.foreground, marginTop: 6 }}>
                    {staff.length}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.foregroundSecondary }}>Total</Text>
                </View>
                <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <UserX size={18} color="#EF4444" />
                  <Text style={{ fontSize: 22, fontWeight: '700', color: colors.foreground, marginTop: 6 }}>
                    {inactive.length}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.foregroundSecondary }}>Inativos</Text>
                </View>
              </View>

              {staff.length === 0 && (
                <View style={[styles.emptyBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Users size={32} color={colors.foregroundSecondary} />
                  <Text style={{ color: colors.foregroundSecondary, marginTop: 10, textAlign: 'center' }}>
                    Nenhum membro de equipe cadastrado.
                  </Text>
                </View>
              )}

              {Object.entries(groupedByRole).map(([role, members]) => (
                <View key={role} style={{ marginBottom: 20 }}>
                  <View style={styles.roleHeader}>
                    <Shield size={14} color={ROLE_COLORS[role] ?? colors.primary} />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: ROLE_COLORS[role] ?? colors.primary, marginLeft: 6 }}>
                      {ROLE_LABELS[role] ?? role} ({members.length})
                    </Text>
                  </View>
                  <View style={[styles.groupCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    {members.map((member, index) => (
                      <View
                        key={member.id}
                        style={[
                          styles.memberRow,
                          index < members.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                        ]}
                      >
                        <View style={[styles.avatar, { backgroundColor: `${ROLE_COLORS[member.role] ?? colors.primary}20` }]}>
                          {member.avatar_url ? (
                            <Image
                              source={{ uri: member.avatar_url }}
                              style={styles.avatarImage}
                              accessibilityLabel={`Foto de ${member.full_name ?? member.email ?? 'membro da equipe'}`}
                            />
                          ) : (
                            <Text style={{ fontSize: 16, fontWeight: '700', color: ROLE_COLORS[member.role] ?? colors.primary }}>
                              {(member.full_name ?? member.email ?? '?')[0].toUpperCase()}
                            </Text>
                          )}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontWeight: '600', color: colors.foreground }}>
                            {member.full_name ?? 'Sem nome'}
                          </Text>
                          {member.email && (
                            <Text style={{ fontSize: 12, color: colors.foregroundSecondary }}>{member.email}</Text>
                          )}
                          <StaffFacts member={member} />
                        </View>
                        {canManage && role !== 'owner' ? (
                          <View style={styles.rowActions}>
                            <IconAction label="Editar função" onPress={() => openEdit(member)}>
                              <Pencil size={15} color={colors.foregroundSecondary} />
                            </IconAction>
                            <IconAction label="Inativar" onPress={() => setDeleting({ kind: 'deactivate', member })}>
                              <Ban size={15} color="#F59E0B" />
                            </IconAction>
                          </View>
                        ) : (
                          <View style={[styles.activeBadge, { backgroundColor: '#F0FDF4', borderColor: '#22C55E' }]}>
                            <Text style={{ fontSize: 10, fontWeight: '700', color: '#166534' }}>Ativo</Text>
                          </View>
                        )}
                      </View>
                    ))}
                  </View>
                </View>
              ))}

              {canManage && inactive.length > 0 ? (
                <View style={{ marginBottom: 20 }}>
                  <View style={styles.roleHeader}>
                    <UserX size={14} color="#9CA3AF" />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#6B7280', marginLeft: 6 }}>
                      Inativos ({inactive.length})
                    </Text>
                  </View>
                  <View style={[styles.groupCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    {inactive.map((member, index) => (
                      <View
                        key={member.id}
                        style={[
                          styles.memberRow,
                          index < inactive.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                        ]}
                      >
                        <View style={[styles.avatar, { backgroundColor: '#9CA3AF20' }]}>
                          {member.avatar_url ? (
                            <Image
                              source={{ uri: member.avatar_url }}
                              style={[styles.avatarImage, styles.inactiveAvatarImage]}
                              accessibilityLabel={`Foto de ${member.full_name ?? member.email ?? 'membro da equipe'}`}
                            />
                          ) : (
                            <Text style={{ fontSize: 16, fontWeight: '700', color: '#6B7280' }}>
                              {(member.full_name ?? member.email ?? '?')[0].toUpperCase()}
                            </Text>
                          )}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontWeight: '600', color: colors.foreground }}>
                            {member.full_name ?? 'Sem nome'}
                          </Text>
                          <Text style={{ fontSize: 12, color: colors.foregroundSecondary }}>
                            {ROLE_LABELS[member.role] ?? member.role}
                          </Text>
                          <StaffFacts member={member} />
                        </View>
                        <View style={styles.rowActions}>
                          <IconAction label="Reativar" onPress={() => setDeleting({ kind: 'reactivate', member })}>
                            <CheckCircle2 size={15} color="#22C55E" />
                          </IconAction>
                          <IconAction label="Excluir" onPress={() => setDeleting({ kind: 'remove', member })}>
                            <Trash2 size={15} color="#EF4444" />
                          </IconAction>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}
            </>
          )}
        </ScrollView>
      </V2Shell>

      <V2FormSheet
        visible={inviteOpen}
        title={editingMember ? 'Editar função' : 'Adicionar membro'}
        subtitle={editingMember
          ? 'Altere a função deste membro da equipe'
          : inviteMode === 'link'
            ? 'Busque por e-mail um usuário já cadastrado no app'
            : 'Crie uma conta nova e vincule à sua equipe'}
        saveLabel={editingMember ? 'Salvar alterações' : inviteMode === 'link' ? 'Vincular à equipe' : 'Criar e vincular'}
        saving={saving}
        saveDisabled={!canSubmitInvite}
        onClose={closeInvite}
        onSave={() => void submit()}
      >
        {editingMember ? (
          <Text style={{ color: colors.foregroundSecondary, marginBottom: 16 }}>
            {editingMember.full_name ?? editingMember.email}
          </Text>
        ) : (
          <>
            <View style={styles.modeTabs}>
              <Pressable
                onPress={() => { setInviteMode('link'); setSearchError(null); }}
                style={[styles.modeTab, { borderColor: colors.border }, inviteMode === 'link' && { backgroundColor: colors.primary, borderColor: colors.primary }]}
              >
                <Text style={{ fontWeight: '800', fontSize: 12, color: inviteMode === 'link' ? '#FFF' : colors.foreground }}>
                  Vincular existente
                </Text>
              </Pressable>
              <Pressable
                onPress={() => { setInviteMode('create'); setSearchError(null); }}
                style={[styles.modeTab, { borderColor: colors.border }, inviteMode === 'create' && { backgroundColor: colors.primary, borderColor: colors.primary }]}
              >
                <Text style={{ fontWeight: '800', fontSize: 12, color: inviteMode === 'create' ? '#FFF' : colors.foreground }}>
                  Criar novo usuário
                </Text>
              </Pressable>
            </View>

            {inviteMode === 'link' ? (
              <>
                <Field label="E-mail do usuário" required>
                  <View style={styles.searchRow}>
                    <TextInput
                      value={email}
                      onChangeText={setEmail}
                      autoCapitalize="none"
                      keyboardType="email-address"
                      placeholder="usuario@exemplo.com"
                      placeholderTextColor={colors.foregroundMuted}
                      style={[styles.input, { flex: 1, color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
                    />
                    <Pressable
                      disabled={searching || !email.trim()}
                      onPress={() => void runSearch()}
                      style={[styles.searchButton, { backgroundColor: colors.primary, opacity: searching || !email.trim() ? 0.5 : 1 }]}
                    >
                      <Search size={18} color="#FFF" />
                    </Pressable>
                  </View>
                </Field>

                {searchError ? <Text style={styles.formError}>{searchError}</Text> : null}

                {foundUser ? (
                  foundUser.already_in_this_restaurant ? (
                    <Text style={styles.infoWarn}>
                      Este usuário já faz parte da sua equipe como {ROLE_LABELS[foundUser.existing_role ?? ''] ?? foundUser.existing_role}.
                    </Text>
                  ) : foundUser.linked_to_other_restaurant ? (
                    <Text style={styles.infoWarn}>
                      Este usuário já está vinculado a outro restaurante ({foundUser.linked_to_other_restaurant}) e não pode ser adicionado aqui.
                    </Text>
                  ) : (
                    <Text style={styles.infoOk}>
                      Usuário encontrado: {foundUser.full_name ?? foundUser.email}. Ele já existe na aplicação — ao confirmar, você vai vinculá-lo à sua equipe.
                    </Text>
                  )
                ) : null}
              </>
            ) : (
              <>
                <Field label="Nome completo" required>
                  <TextInput
                    value={newFullName}
                    onChangeText={setNewFullName}
                    placeholder="Ex.: Maria Souza"
                    placeholderTextColor={colors.foregroundMuted}
                    style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
                  />
                </Field>
                <Field label="E-mail" required>
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    placeholder="usuario@exemplo.com"
                    placeholderTextColor={colors.foregroundMuted}
                    style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
                  />
                </Field>
                <Field label="Senha provisória" required>
                  <TextInput
                    value={newPassword}
                    onChangeText={setNewPassword}
                    secureTextEntry
                    placeholder="Mínimo 6 caracteres"
                    placeholderTextColor={colors.foregroundMuted}
                    style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
                  />
                </Field>
                {searchError ? <Text style={styles.formError}>{searchError}</Text> : null}
              </>
            )}
          </>
        )}

        {(editingMember
          || inviteMode === 'create'
          || (foundUser && !foundUser.already_in_this_restaurant && !foundUser.linked_to_other_restaurant)) ? (
          <Field label="Função" required>
            <View style={styles.roleOptions}>
              {ASSIGNABLE_ROLES.map((role) => {
                const selected = selectedRole === role;
                return (
                  <Pressable
                    key={role}
                    onPress={() => setSelectedRole(role)}
                    style={[
                      styles.roleOption,
                      { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? `${colors.primary}12` : colors.card },
                    ]}
                  >
                    <Text style={{ color: selected ? colors.primary : colors.foreground, fontWeight: selected ? '800' : '600' }}>
                      {ROLE_LABELS[role]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Field>
        ) : null}
      </V2FormSheet>

      <V2ConfirmDialog
        visible={deleting !== null}
        title={
          deleting?.kind === 'deactivate' ? 'Inativar membro?'
            : deleting?.kind === 'reactivate' ? 'Reativar membro?'
              : 'Excluir membro?'
        }
        message={
          deleting?.kind === 'deactivate'
            ? `${deleting.member.full_name ?? 'Este membro'} perderá o acesso ao painel do restaurante.`
            : deleting?.kind === 'reactivate'
              ? `${deleting.member.full_name ?? 'Este membro'} voltará a ter acesso ao painel do restaurante.`
              : `${deleting?.member.full_name ?? 'Este membro'} será removido permanentemente da equipe.`
        }
        confirmLabel={
          deleting?.kind === 'deactivate' ? 'Inativar' : deleting?.kind === 'reactivate' ? 'Reativar' : 'Excluir'
        }
        destructive={deleting?.kind !== 'reactivate'}
        onCancel={() => setDeleting(null)}
        onConfirm={() => void confirmDeleteAction()}
      />
    </>
  );
}

function StaffFacts({ member }: { member: StaffMember }) {
  const colors = useColors();
  const shift = member.shift ? `${member.shift.start_time}–${member.shift.end_time}` : 'Sem turno';
  const status = member.operational_status === 'on_shift'
    ? 'Em turno'
    : member.operational_status === 'scheduled'
      ? 'Escalado'
      : member.is_active
        ? 'Ativo'
        : 'Inativo';
  const facts = [
    ['Função', ROLE_LABELS[member.role] ?? member.role],
    ['Turno', shift],
    ['Vendas', formatMoney(member.sales_value)],
    ['Gorjetas', formatMoney(member.tips_value)],
    ['Status', status],
  ];

  return (
    <View style={styles.memberFacts}>
      {facts.map(([label, value]) => (
        <View key={label} style={[styles.memberFact, { backgroundColor: colors.backgroundSecondary }]}>
          <Text style={[styles.memberFactLabel, { color: colors.foregroundSecondary }]}>{label}</Text>
          <Text numberOfLines={1} style={[styles.memberFactValue, { color: colors.foreground }]}>{value}</Text>
        </View>
      ))}
    </View>
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
      style={({ pressed }) => [styles.iconAction, { backgroundColor: colors.backgroundSecondary }, pressed && styles.pressed]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  addHeaderButton: { minHeight: 38, paddingHorizontal: 12, borderRadius: 13, flexDirection: 'row', alignItems: 'center', gap: 5 },
  addHeaderLabel: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  summaryCard: {
    flex: 1, borderRadius: 12, borderWidth: 1,
    padding: 12, alignItems: 'center',
  },
  roleHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  groupCard: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },
  inactiveAvatarImage: { opacity: 0.55 },
  memberFacts: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 9 },
  memberFact: { width: '48%', minHeight: 42, borderRadius: 9, paddingHorizontal: 8, justifyContent: 'center' },
  memberFactLabel: { fontSize: 8, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.35 },
  memberFactValue: { fontSize: 10, fontWeight: '800', marginTop: 2 },
  activeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, borderWidth: 1 },
  emptyBox: { borderRadius: 16, borderWidth: 1, padding: 32, alignItems: 'center', marginTop: 24 },
  rowActions: { flexDirection: 'row', gap: 6 },
  iconAction: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.72 },
  field: { marginBottom: 18 },
  fieldLabel: { fontSize: 13, fontWeight: '800', marginBottom: 8 },
  input: { minHeight: 50, borderWidth: 1, borderRadius: 15, paddingHorizontal: 14, fontSize: 15 },
  modeTabs: { flexDirection: 'row', gap: 8, marginBottom: 18 },
  modeTab: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  searchRow: { flexDirection: 'row', gap: 8 },
  searchButton: { width: 50, height: 50, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  formError: { color: '#DC2626', backgroundColor: '#FEF2F2', borderRadius: 12, padding: 12, fontSize: 13, marginBottom: 12 },
  infoWarn: { color: '#9A3412', backgroundColor: '#FFEDD5', borderRadius: 12, padding: 12, fontSize: 13, marginBottom: 12 },
  infoOk: { color: '#166534', backgroundColor: '#F0FDF4', borderRadius: 12, padding: 12, fontSize: 13, marginBottom: 12 },
  roleOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  roleOption: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
});
