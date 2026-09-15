/* Hallmark · pre-emit critique: P5 H5 E4 S5 R4 V5 */
/* Hallmark · macrostructure: Form · tone: warm utilitarian · anchor hue: amber */
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useMutation, useQuery } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import { useVisitSession } from '../../contexts/VisitSessionContext';
import customerBackend, { type TableDiner } from '../../services/customer-backend';

const AVATAR_TONES = ['#EA580C', '#DB2777', '#2563EB', '#9333EA', '#0D9488', '#CA8A04'];

const INCLUDED_ITEMS = [
  { key: 'cake', icon: 'gift-outline', title: 'Bolo surpresa', subtitle: 'Brownie com vela · Cortesia' },
  { key: 'song', icon: 'musical-notes-outline', title: 'Parabéns musical', subtitle: 'Equipe canta na mesa' },
  { key: 'photo', icon: 'camera-outline', title: 'Foto polaroid', subtitle: 'Foto impressa de lembrança' },
  { key: 'decor', icon: 'sparkles-outline', title: 'Decoração na mesa', subtitle: 'Balões e toalha especial' },
] as const;

const EXTRA_DESSERT = { key: 'extra_dessert', title: 'Sobremesa extra', subtitle: 'Tiramisù ou gelato para o grupo', price: 35 };

export default function BirthdayScreen({ route, navigation }: any) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { session } = useVisitSession();
  const restaurantId: string | undefined = route?.params?.restaurantId ?? session?.restaurantId;
  const [selectedDinerId, setSelectedDinerId] = useState<string | null>(null);
  const [extraDessert, setExtraDessert] = useState(false);
  const [sent, setSent] = useState(false);

  const diners = useQuery({
    queryKey: ['table-diners', session?.tableSessionId],
    queryFn: () => customerBackend.listTableDiners(session!.tableSessionId),
    enabled: !!session?.tableSessionId,
  });
  const dinerList = useMemo<TableDiner[]>(() => {
    if (diners.data && diners.data.length > 0) return diners.data;
    return [{ dinerId: 'me', userId: null, displayName: 'Você', isHost: true, isKid: false, isMe: true, isCompanion: false, kidAge: null, kidAllergies: null }];
  }, [diners.data]);
  const activeDiner = dinerList.find((diner) => diner.dinerId === selectedDinerId) ?? dinerList.find((d) => d.isMe) ?? dinerList[0];

  const request = useMutation({
    mutationFn: () =>
      customerBackend.createSpecialRequest({
        restaurantId: restaurantId!,
        requestType: 'birthday',
        title: 'Comemoração de aniversário',
        description: `Aniversariante: ${activeDiner?.isMe ? 'Você' : activeDiner?.displayName ?? 'Convidado'}.${
          extraDessert ? ' Extra: sobremesa para o grupo (+R$ 35).' : ''
        }`,
        tableSessionId: session?.tableSessionId ?? null,
        actionLabel: 'Preparar comemoração',
        metadata: {
          diner_id: activeDiner && activeDiner.dinerId !== 'me' ? activeDiner.dinerId : null,
          diner_name: activeDiner?.displayName ?? null,
          extra_dessert: extraDessert,
        },
      }),
    onSuccess: () => setSent(true),
    onError: (error: Error) => Alert.alert('Não foi possível enviar', error.message),
  });

  const confirm = useCallback(() => {
    if (!restaurantId) return;
    request.mutate();
  }, [restaurantId, request]);

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
        hint: {
          flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, borderRadius: 16,
          backgroundColor: colors.backgroundSecondary, marginBottom: 16,
        },
        hintText: { flex: 1, fontSize: 13, lineHeight: 18, color: colors.primary },
        heroCard: {
          alignItems: 'center', padding: 24, borderRadius: 20, marginBottom: 20,
          backgroundColor: '#FFF7E6',
        },
        heroTitle: { fontSize: 18, fontWeight: '800', color: '#92400E', marginTop: 10, textAlign: 'center' },
        heroSubtitle: { fontSize: 13, color: '#B45309', marginTop: 4, textAlign: 'center' },
        sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.foreground, marginBottom: 12 },
        dinersRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
        diner: {
          width: 72, alignItems: 'center', gap: 6, paddingVertical: 10, borderRadius: 16,
          borderWidth: 2, borderColor: 'transparent',
        },
        dinerSelected: { borderColor: '#F59E0B', backgroundColor: '#FFFBEB' },
        dinerAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
        dinerAvatarText: { fontSize: 17, fontWeight: '700', color: '#FFFFFF' },
        dinerName: { fontSize: 12, color: colors.foregroundSecondary },
        itemRow: {
          flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16,
          backgroundColor: colors.card, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, marginBottom: 10,
        },
        itemIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF7E6' },
        itemTitle: { fontSize: 14, fontWeight: '600', color: colors.foreground },
        itemSubtitle: { fontSize: 12, color: colors.foregroundSecondary, marginTop: 2 },
        includedTag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: colors.successBackground },
        includedTagText: { fontSize: 11, fontWeight: '700', color: colors.success },
        extraTag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: colors.backgroundTertiary },
        extraTagText: { fontSize: 11, fontWeight: '700', color: colors.foreground },
        cta: {
          marginTop: 20, paddingVertical: 18, borderRadius: 20, alignItems: 'center', backgroundColor: '#EA580C',
        },
        ctaDisabled: { opacity: 0.6 },
        ctaText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
        successWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 32 },
        successCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
        successTitle: { fontSize: 20, fontWeight: '700', color: colors.foreground },
        successSub: { fontSize: 14, color: colors.foregroundSecondary, textAlign: 'center' },
        successBtn: { paddingHorizontal: 24, paddingVertical: 14, borderRadius: 16, borderWidth: 1.5, borderColor: colors.border, marginTop: 16 },
        successBtnText: { fontSize: 15, fontWeight: '700', color: colors.foreground },
      }),
    [colors],
  );

  if (sent) {
    return (
      <ScreenContainer edges={['top', 'bottom']}>
        <View style={styles.successWrap}>
          <View style={styles.successCircle}>
            <Ionicons name="gift" size={34} color="#B45309" />
          </View>
          <Text style={styles.successTitle}>Comemoração a caminho!</Text>
          <Text style={styles.successSub}>A equipe foi avisada e vai preparar tudo para a surpresa.</Text>
          <TouchableOpacity style={styles.successBtn} onPress={() => navigation.goBack()} accessibilityRole="button">
            <Text style={styles.successBtnText}>Voltar</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

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
          <Text style={styles.headerTitle}>Aniversário</Text>
        </View>

        <View style={styles.hint}>
          <Ionicons name="flash-outline" size={16} color={colors.primary} />
          <Text style={styles.hintText}>O restaurante detectou que hoje pode ser uma data especial!</Text>
        </View>

        <View style={styles.heroCard}>
          <Ionicons name="sparkles" size={34} color="#D97706" />
          <Text style={styles.heroTitle}>Comemoração Especial?</Text>
          <Text style={styles.heroSubtitle}>Configure tudo — nós cuidamos dos detalhes</Text>
        </View>

        <Text style={styles.sectionTitle}>Quem é o aniversariante?</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dinersRow}>
          {dinerList.map((diner, index) => {
            const selected = activeDiner?.dinerId === diner.dinerId;
            return (
              <TouchableOpacity
                key={diner.dinerId}
                style={[styles.diner, selected && styles.dinerSelected]}
                onPress={() => setSelectedDinerId(diner.dinerId)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <View style={[styles.dinerAvatar, { backgroundColor: AVATAR_TONES[index % AVATAR_TONES.length] }]}>
                  <Text style={styles.dinerAvatarText}>{(diner.isMe ? 'V' : diner.displayName.charAt(0)).toLocaleUpperCase('pt-BR')}</Text>
                </View>
                <Text style={styles.dinerName} numberOfLines={1}>{diner.isMe ? 'Você' : diner.displayName}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {INCLUDED_ITEMS.map((item) => (
          <View key={item.key} style={styles.itemRow}>
            <View style={styles.itemIcon}>
              <Ionicons name={item.icon as any} size={20} color="#D97706" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>{item.title}</Text>
              <Text style={styles.itemSubtitle}>{item.subtitle}</Text>
            </View>
            <View style={styles.includedTag}>
              <Text style={styles.includedTagText}>Incluso</Text>
            </View>
          </View>
        ))}

        <TouchableOpacity
          style={styles.itemRow}
          onPress={() => setExtraDessert((value) => !value)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityState={{ selected: extraDessert }}
        >
          <View style={styles.itemIcon}>
            <Ionicons name="ice-cream-outline" size={20} color="#D97706" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.itemTitle}>{EXTRA_DESSERT.title}</Text>
            <Text style={styles.itemSubtitle}>{EXTRA_DESSERT.subtitle}</Text>
          </View>
          <View style={extraDessert ? styles.includedTag : styles.extraTag}>
            <Text style={extraDessert ? styles.includedTagText : styles.extraTagText}>
              {extraDessert ? 'Adicionado' : `+R$ ${EXTRA_DESSERT.price}`}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.cta, (!restaurantId || request.isPending) && styles.ctaDisabled]}
          onPress={confirm}
          disabled={!restaurantId || request.isPending}
          activeOpacity={0.9}
          accessibilityRole="button"
        >
          <Text style={styles.ctaText}>{request.isPending ? 'Enviando…' : 'Confirmar Comemoração'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </ScreenContainer>
  );
}
