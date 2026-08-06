import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import customerBackend, { type CustomerProfile } from '../../services/customer-backend';
import { rootNavigate, StateView } from './shared';

const MENU_ITEMS: { route: string; icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { route: 'Reservations', icon: 'calendar-outline', label: 'Reservas' },
  { route: 'Favorites', icon: 'heart-outline', label: 'Favoritos' },
  { route: 'Loyalty', icon: 'ribbon-outline', label: 'Fidelidade' },
  { route: 'Promotions', icon: 'pricetag-outline', label: 'Cupons' },
  { route: 'Reviews', icon: 'star-outline', label: 'Avaliações' },
  { route: 'Waitlist', icon: 'timer-outline', label: 'Fila de Espera' },
  { route: 'CallWaiter', icon: 'hand-left-outline', label: 'Chamar Atendimento' },
  { route: 'Privacy', icon: 'shield-checkmark-outline', label: 'Privacidade e LGPD' },
  { route: 'Support', icon: 'help-circle-outline', label: 'Ajuda' },
];

function ProfileForm({ profile }: { profile: CustomerProfile }) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const [name, setName] = useState(profile.fullName);
  const [phone, setPhone] = useState(profile.phone ?? '');

  const save = useMutation({
    mutationFn: () => customerBackend.updateProfile({ fullName: name.trim(), phone: phone.trim() || null }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profile'] }),
  });

  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: { padding: 18, borderRadius: 18, backgroundColor: colors.card, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, marginBottom: 20, gap: 12 },
        email: { fontSize: 13, color: colors.foregroundSecondary },
        input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.foreground },
        label: { fontSize: 12, fontWeight: '600', color: colors.foregroundSecondary, marginBottom: -6 },
        saveBtn: { alignSelf: 'flex-start', backgroundColor: colors.backgroundTertiary, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12 },
        saveBtnText: { color: colors.foreground, fontSize: 13, fontWeight: '700' },
      }),
    [colors],
  );

  return (
    <View style={styles.card}>
      <Text style={styles.email}>{profile.email}</Text>
      <Text style={styles.label}>Nome</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholderTextColor={colors.foregroundMuted} />
      <Text style={styles.label}>Telefone</Text>
      <TextInput style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholderTextColor={colors.foregroundMuted} />
      <TouchableOpacity style={styles.saveBtn} onPress={() => save.mutate()} disabled={!name.trim() || save.isPending} accessibilityRole="button">
        <Text style={styles.saveBtnText}>{save.isPending ? 'Salvando...' : 'Salvar perfil'}</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function ProfileScreen({ navigation }: any) {
  const colors = useColors();
  const query = useQuery({ queryKey: ['profile'], queryFn: () => customerBackend.getProfile() });
  const logout = () => customerBackend.signOut();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        title: { fontSize: 26, fontWeight: '700', color: colors.foreground, marginBottom: 16 },
        menuItem: {
          flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 4,
          borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
        },
        menuIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.backgroundTertiary, alignItems: 'center', justifyContent: 'center' },
        menuLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.foreground },
        logoutBtn: { marginTop: 24, paddingVertical: 14, borderRadius: 16, borderWidth: 1.5, borderColor: '#DC2626', alignItems: 'center' },
        logoutText: { color: '#DC2626', fontSize: 15, fontWeight: '700' },
      }),
    [colors],
  );

  return (
    <ScreenContainer edges={['top']}>
      <ScrollView style={styles.container} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Perfil</Text>
        <StateView loading={query.isLoading} error={query.error} onRetry={() => query.refetch()} />
        {query.data && <ProfileForm key={query.data.id} profile={query.data} />}

        {MENU_ITEMS.map((item) => (
          <TouchableOpacity
            key={item.route}
            style={styles.menuItem}
            onPress={() => rootNavigate(navigation, item.route, item.route === 'Waitlist' ? {} : undefined)}
            activeOpacity={0.7}
            accessibilityRole="button"
          >
            <View style={styles.menuIcon}>
              <Ionicons name={item.icon} size={18} color={colors.primary} />
            </View>
            <Text style={styles.menuLabel}>{item.label}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.foregroundMuted} />
          </TouchableOpacity>
        ))}

        <TouchableOpacity style={styles.logoutBtn} onPress={logout} accessibilityRole="button">
          <Text style={styles.logoutText}>Sair</Text>
        </TouchableOpacity>
      </ScrollView>
    </ScreenContainer>
  );
}
