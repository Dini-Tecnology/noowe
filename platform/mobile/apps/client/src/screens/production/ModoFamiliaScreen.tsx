/* Hallmark · pre-emit critique: P5 H5 E4 S5 R4 V5 */
/* Hallmark · macrostructure: Form · tone: warm utilitarian · anchor hue: orange */
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import { useVisitSession } from '../../contexts/VisitSessionContext';
import customerBackend from '../../services/customer-backend';
import { rootNavigate, StateView } from './shared';

const BENEFITS = [
  { icon: 'restaurant-outline', title: 'Cardápio Kids em destaque', subtitle: 'Itens especiais para crianças primeiro' },
  { icon: 'body-outline', title: 'Cadeirão reservado', subtitle: 'Já preparamos tudo para vocês' },
  { icon: 'color-palette-outline', title: 'Kit de atividades', subtitle: 'Jogos e colorir na mesa' },
  { icon: 'star-outline', title: 'Pratos kids primeiro', subtitle: 'Crianças comem antes, sem espera' },
  { icon: 'warning-outline', title: 'Alerta de alérgenos', subtitle: 'Itens com alérgenos infantis destacados' },
] as const;

export default function ModoFamiliaScreen({ route, navigation }: any) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { session } = useVisitSession();
  const queryClient = useQueryClient();
  const restaurantId: string | undefined = route?.params?.restaurantId ?? session?.restaurantId;
  const [companionName, setCompanionName] = useState('');
  const [companionAge, setCompanionAge] = useState('');
  const [companionAllergies, setCompanionAllergies] = useState('');
  const [formOpen, setFormOpen] = useState(false);

  const familyMode = useQuery({
    queryKey: ['table-family-mode', session?.tableSessionId],
    queryFn: () => customerBackend.getTableFamilyMode(session!.tableSessionId),
    enabled: !!session?.tableSessionId,
  });
  const diners = useQuery({
    queryKey: ['table-diners', session?.tableSessionId],
    queryFn: () => customerBackend.listTableDiners(session!.tableSessionId),
    enabled: !!session?.tableSessionId,
  });
  const kids = (diners.data ?? []).filter((diner) => diner.isKid);

  const toggle = useMutation({
    mutationFn: (enabled: boolean) => customerBackend.setTableFamilyMode(session!.tableSessionId, enabled),
    onSuccess: (enabled) => {
      queryClient.setQueryData(['table-family-mode', session?.tableSessionId], enabled);
    },
    onError: (error: Error) => Alert.alert('Modo Família', error.message),
  });

  const addKid = useMutation({
    mutationFn: () =>
      customerBackend.addTableCompanion({
        tableSessionId: session!.tableSessionId,
        name: companionName,
        isKid: true,
        kidAge: companionAge.trim() ? Number(companionAge.trim()) : undefined,
        kidAllergies: companionAllergies.trim() || undefined,
      }),
    onSuccess: () => {
      setCompanionName('');
      setCompanionAge('');
      setCompanionAllergies('');
      setFormOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['table-diners', session?.tableSessionId] });
    },
    onError: (error: Error) => Alert.alert('Não foi possível adicionar', error.message),
  });

  const openActivities = useCallback(() => navigation.navigate('KidsActivities', { restaurantId }), [navigation, restaurantId]);
  const openMenu = useCallback(() => rootNavigate(navigation, 'Menu', { restaurantId }), [navigation, restaurantId]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        scroll: { flex: 1, backgroundColor: colors.background },
        content: { paddingHorizontal: 16, paddingBottom: 40 },
        header: { flexDirection: 'row', alignItems: 'center', paddingBottom: 12, gap: 12 },
        headerBtn: {
          width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
          backgroundColor: colors.backgroundTertiary,
        },
        headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: colors.foreground, marginRight: 36 },
        activatedCard: {
          borderRadius: 20, padding: 16, backgroundColor: colors.backgroundSecondary,
          borderWidth: 1, borderColor: colors.primaryLight, marginBottom: 20,
        },
        activatedTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
        activatedTitle: { fontSize: 15, fontWeight: '700', color: colors.foreground },
        benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
        benefitIcon: {
          width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card,
        },
        benefitTitle: { fontSize: 13, fontWeight: '600', color: colors.foreground },
        benefitSub: { fontSize: 12, color: colors.foregroundSecondary, marginTop: 1 },
        toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
        toggleLabel: { fontSize: 15, fontWeight: '700', color: colors.foreground },
        toggleBtn: { paddingHorizontal: 18, paddingVertical: 11, borderRadius: 16, backgroundColor: colors.primary },
        toggleBtnOff: { backgroundColor: colors.backgroundTertiary },
        toggleBtnText: { fontSize: 14, fontWeight: '700', color: colors.primaryForeground },
        toggleBtnTextOff: { color: colors.foreground },
        sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
        sectionTitleText: { fontSize: 15, fontWeight: '700', color: colors.foreground },
        kidRow: {
          flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16,
          backgroundColor: colors.card, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, marginBottom: 10,
        },
        kidAvatar: {
          width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryLight,
        },
        kidAvatarText: { fontSize: 15, fontWeight: '700', color: colors.primary },
        kidName: { fontSize: 14, fontWeight: '600', color: colors.foreground },
        kidSub: { fontSize: 12, color: colors.foregroundSecondary, marginTop: 1 },
        addKidBtn: {
          borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.border,
          paddingVertical: 14, alignItems: 'center', marginBottom: 20, flexDirection: 'row', justifyContent: 'center', gap: 8,
        },
        addKidText: { fontSize: 14, fontWeight: '600', color: colors.foregroundSecondary },
        companionForm: { flexDirection: 'row', gap: 10, marginBottom: 20 },
        input: {
          flex: 1, height: 48, paddingHorizontal: 14, borderRadius: 14, fontSize: 15,
          color: colors.foreground, backgroundColor: colors.backgroundTertiary,
        },
        saveBtn: { paddingVertical: 13, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
        saveBtnText: { fontSize: 14, fontWeight: '700', color: colors.primaryForeground },
        secondaryBtn: {
          paddingVertical: 15, borderRadius: 16, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', marginBottom: 12,
        },
        secondaryBtnText: { fontSize: 15, fontWeight: '700', color: colors.foreground },
        primaryBtn: { paddingVertical: 17, borderRadius: 18, alignItems: 'center', backgroundColor: colors.primary },
        primaryBtnText: { fontSize: 16, fontWeight: '700', color: colors.primaryForeground },
      }),
    [colors],
  );

  if (!session?.tableSessionId) {
    return (
      <ScreenContainer edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Voltar">
            <Ionicons name="arrow-back" size={20} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Modo Família</Text>
        </View>
        <StateView empty="Leia o QR da mesa para ativar o Modo Família." emptyIcon="happy-outline" />
      </ScreenContainer>
    );
  }

  const enabled = familyMode.data ?? false;

  return (
    <ScreenContainer edges={['bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 8 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Voltar">
            <Ionicons name="arrow-back" size={20} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Modo Família</Text>
        </View>

        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>{enabled ? 'Modo Família Ativado' : 'Ativar Modo Família'}</Text>
          <TouchableOpacity
            style={[styles.toggleBtn, !enabled && styles.toggleBtnOff]}
            onPress={() => toggle.mutate(!enabled)}
            disabled={toggle.isPending || familyMode.isLoading}
            accessibilityRole="button"
            accessibilityState={{ selected: enabled }}
          >
            <Text style={[styles.toggleBtnText, !enabled && styles.toggleBtnTextOff]}>
              {enabled ? 'Ativado' : 'Ativar'}
            </Text>
          </TouchableOpacity>
        </View>

        {enabled && (
          <View style={styles.activatedCard}>
            <View style={styles.activatedTitleRow}>
              <Ionicons name="people" size={18} color={colors.primary} />
              <Text style={styles.activatedTitle}>Modo Família Ativado</Text>
            </View>
            {BENEFITS.map((benefit) => (
              <View key={benefit.title} style={styles.benefitRow}>
                <View style={styles.benefitIcon}>
                  <Ionicons name={benefit.icon as any} size={17} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.benefitTitle}>{benefit.title}</Text>
                  <Text style={styles.benefitSub}>{benefit.subtitle}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={styles.sectionTitle}>
          <Ionicons name="happy-outline" size={16} color={colors.primary} />
          <Text style={styles.sectionTitleText}>Quem são as crianças?</Text>
        </View>

        {kids.map((kid) => (
          <View key={kid.dinerId} style={styles.kidRow}>
            <View style={styles.kidAvatar}>
              <Text style={styles.kidAvatarText}>{kid.displayName.charAt(0).toLocaleUpperCase('pt-BR')}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.kidName}>
                {kid.displayName}{kid.kidAge != null ? ` · ${kid.kidAge} anos` : ''}
              </Text>
              <Text style={styles.kidSub}>Alergias: {kid.kidAllergies?.trim() || 'Nenhuma'}</Text>
            </View>
            <Ionicons name="checkmark-circle" size={22} color={colors.success} />
          </View>
        ))}

        {formOpen ? (
          <View style={{ gap: 10, marginBottom: 20 }}>
            <TextInput
              style={styles.input}
              placeholder="Nome da criança"
              placeholderTextColor={colors.foregroundMuted}
              value={companionName}
              onChangeText={setCompanionName}
              maxLength={40}
              autoFocus
              accessibilityLabel="Nome da criança"
            />
            <View style={styles.companionForm}>
              <TextInput
                style={styles.input}
                placeholder="Idade"
                placeholderTextColor={colors.foregroundMuted}
                value={companionAge}
                onChangeText={(text) => setCompanionAge(text.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                maxLength={2}
                accessibilityLabel="Idade da criança"
              />
              <TextInput
                style={[styles.input, { flex: 2 }]}
                placeholder="Alergias (opcional)"
                placeholderTextColor={colors.foregroundMuted}
                value={companionAllergies}
                onChangeText={setCompanionAllergies}
                maxLength={200}
                accessibilityLabel="Alergias da criança"
              />
            </View>
            <TouchableOpacity
              style={styles.saveBtn}
              onPress={() => addKid.mutate()}
              disabled={!companionName.trim() || addKid.isPending}
              accessibilityRole="button"
            >
              <Text style={styles.saveBtnText}>{addKid.isPending ? 'Salvando…' : 'Salvar'}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.addKidBtn} onPress={() => setFormOpen(true)} activeOpacity={0.85} accessibilityRole="button">
            <Ionicons name="add" size={18} color={colors.foregroundSecondary} />
            <Text style={styles.addKidText}>Adicionar criança</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.secondaryBtn} onPress={openActivities} activeOpacity={0.85} accessibilityRole="button">
          <Text style={styles.secondaryBtnText}>Ver Atividades Disponíveis</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.primaryBtn} onPress={openMenu} activeOpacity={0.9} accessibilityRole="button">
          <Text style={styles.primaryBtnText}>Ver Cardápio Completo</Text>
        </TouchableOpacity>
      </ScrollView>
    </ScreenContainer>
  );
}
