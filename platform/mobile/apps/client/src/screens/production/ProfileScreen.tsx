/* Hallmark · macrostructure: Profile-Led · genre: modern-minimal · theme: studied-DNA (user reference) + Noowe tokens · enrichment: none · designed-as-app · pre-emit critique: P5 H5 E5 S5 R5 V5 */
import React, { useMemo } from 'react';
import { ActivityIndicator, Image, ScrollView, Share, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import customerBackend from '../../services/customer-backend';
import { rootNavigate, StateView, useQueryRefreshControl } from './shared';

const MENU_ITEMS: { route: string; icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { route: 'Notifications', icon: 'notifications-outline', label: 'Notificações' },
  { route: 'OrdersTab', icon: 'time-outline', label: 'Histórico de Visitas' },
  { route: 'Reservations', icon: 'calendar-outline', label: 'Minhas Reservas' },
  { route: 'Loyalty', icon: 'gift-outline', label: 'Programa de Fidelidade' },
  { route: 'PaymentMethods', icon: 'card-outline', label: 'Métodos de Pagamento' },
  { route: 'Favorites', icon: 'heart-outline', label: 'Restaurantes Favoritos' },
  { route: 'Promotions', icon: 'pricetag-outline', label: 'Cupons' },
  { route: 'Reviews', icon: 'star-outline', label: 'Avaliações' },
  { route: 'Waitlist', icon: 'timer-outline', label: 'Fila de Espera' },
  { route: 'CallWaiter', icon: 'hand-left-outline', label: 'Chamar Atendimento' },
  { route: 'Privacy', icon: 'shield-checkmark-outline', label: 'Privacidade e LGPD' },
  { route: 'Support', icon: 'help-circle-outline', label: 'Ajuda' },
];

const LEVELS = [
  { name: 'Silver', threshold: 0 },
  { name: 'Gold', threshold: 500 },
  { name: 'Platinum', threshold: 2000 },
  { name: 'Black', threshold: 5000 },
] as const;

export default function ProfileScreen({ navigation }: any) {
  const colors = useColors();
  // The client tab bar floats over the screen instead of taking layout space.
  // Reserve its measured height so the last action can always scroll above it.
  const bottomTabBarHeight = useBottomTabBarHeight();
  const profileQuery = useQuery({ queryKey: ['profile'], queryFn: () => customerBackend.getProfile() });
  const loyaltyQuery = useQuery({ queryKey: ['loyalty'], queryFn: () => customerBackend.listLoyalty() });
  const notificationCount = useQuery({
    queryKey: ['notification-count'],
    queryFn: () => customerBackend.getUnreadNotificationCount(),
    refetchInterval: 60_000,
  });
  const refreshControl = useQueryRefreshControl([profileQuery, loyaltyQuery]);
  const totalPoints = Math.round((loyaltyQuery.data ?? []).reduce((sum, program) => sum + program.points, 0));
  const levelIndex = LEVELS.reduce((current, item, index) => totalPoints >= item.threshold ? index : current, 0);
  const level = LEVELS[levelIndex];
  const nextLevel = LEVELS[levelIndex + 1];
  const pointsToNext = nextLevel ? Math.max(0, nextLevel.threshold - totalPoints) : 0;
  const progress = nextLevel
    ? Math.min(1, Math.max(0, (totalPoints - level.threshold) / (nextLevel.threshold - level.threshold)))
    : 1;

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: bottomTabBarHeight + 24 },
    title: { color: colors.foreground, fontSize: 21, fontWeight: '800', marginBottom: 14 },
    profileCard: { minHeight: 80, flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 15, paddingVertical: 13, borderRadius: 18, backgroundColor: colors.backgroundSecondary },
    avatar: { width: 54, height: 54, borderRadius: 27, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.errorBackground },
    avatarImage: { width: '100%', height: '100%' },
    profileInfo: { flex: 1, minWidth: 0 },
    name: { color: colors.foreground, fontSize: 15, fontWeight: '800' },
    username: { marginTop: 3, color: colors.primary, fontSize: 12, fontWeight: '700' },
    email: { marginTop: 3, color: colors.foregroundSecondary, fontSize: 11 },
    pointsBlock: { minWidth: 56, alignItems: 'flex-end' },
    points: { color: colors.primary, fontSize: 15, fontWeight: '900', fontVariant: ['tabular-nums'] },
    pointsLabel: { marginTop: 3, color: colors.foregroundMuted, fontSize: 9 },
    profileChevron: { marginLeft: -3 },
    loyaltyCard: { minHeight: 86, marginTop: 14, marginBottom: 16, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 17, backgroundColor: colors.warningBackground },
    loyaltyTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    loyaltyTitle: { color: colors.foreground, fontSize: 13, fontWeight: '800' },
    progressTrack: { height: 6, marginTop: 12, borderRadius: 3, overflow: 'hidden', backgroundColor: '#EDEFF2' },
    progressBar: { height: '100%', borderRadius: 3, backgroundColor: colors.warning },
    loyaltyCaption: { marginTop: 6, color: colors.foregroundSecondary, fontSize: 10 },
    menuItem: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    menuIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: colors.backgroundTertiary, alignItems: 'center', justifyContent: 'center' },
    menuLabel: { flex: 1, color: colors.foreground, fontSize: 13, fontWeight: '700' },
    badge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.error },
    badgeText: { color: colors.primaryForeground, fontSize: 10, fontWeight: '800' },
    logout: { minHeight: 50, marginTop: 23, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 15, borderWidth: 1, borderColor: colors.error },
    logoutText: { color: colors.error, fontSize: 14, fontWeight: '800' },
  }), [bottomTabBarHeight, colors]);

  return (
    <ScreenContainer edges={['top']}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} refreshControl={refreshControl} alwaysBounceVertical showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Meu Perfil</Text>
        <StateView loading={profileQuery.isLoading} error={profileQuery.error} onRetry={() => profileQuery.refetch()} />

        {profileQuery.data ? (
          <TouchableOpacity
            style={styles.profileCard}
            onPress={() => rootNavigate(navigation, 'EditProfile')}
            onLongPress={() => {
              if (profileQuery.data?.username) void Share.share({ message: `Me chama na Noowe: @${profileQuery.data.username}` });
            }}
            activeOpacity={0.84}
            accessibilityRole="button"
            accessibilityLabel="Abrir edição do perfil"
            accessibilityHint="Toque e segure para compartilhar seu @"
          >
            <View style={styles.avatar}>
              {profileQuery.data.avatarUrl ? <Image source={{ uri: profileQuery.data.avatarUrl }} style={styles.avatarImage} resizeMode="cover" /> : <Ionicons name="person-outline" size={25} color={colors.primary} />}
            </View>
            <View style={styles.profileInfo}>
              <Text numberOfLines={1} style={styles.name}>{profileQuery.data.fullName || 'Usuário Noowe'}</Text>
              {profileQuery.data.username ? <Text numberOfLines={1} style={styles.username} testID="profile-username">@{profileQuery.data.username}</Text> : null}
              <Text numberOfLines={1} style={styles.email}>{profileQuery.data.email ?? 'Conta Noowe'}</Text>
            </View>
            <View style={styles.pointsBlock}>
              {loyaltyQuery.isLoading ? <ActivityIndicator size="small" color={colors.primary} /> : <Text style={styles.points}>{loyaltyQuery.error ? '—' : totalPoints.toLocaleString('pt-BR')}</Text>}
              <Text style={styles.pointsLabel}>pontos</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.foregroundMuted} style={styles.profileChevron} />
          </TouchableOpacity>
        ) : null}

        {profileQuery.data ? (
          <TouchableOpacity style={styles.loyaltyCard} onPress={() => rootNavigate(navigation, 'Loyalty')} activeOpacity={0.86} accessibilityRole="button" accessibilityLabel={loyaltyQuery.error ? 'Fidelidade indisponível' : `Fidelidade, nível ${level.name}, ${Math.round(progress * 100)} por cento do nível`}>
            <View style={styles.loyaltyTop}>
              <Ionicons name="trophy-outline" size={17} color={colors.warning} />
              <Text style={styles.loyaltyTitle}>{loyaltyQuery.error ? 'Programa de Fidelidade' : `Nível ${level.name}`}</Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressBar, { width: `${loyaltyQuery.isLoading || loyaltyQuery.error ? 0 : Math.max(3, progress * 100)}%` }]} />
            </View>
            <Text style={styles.loyaltyCaption}>
              {loyaltyQuery.isLoading ? 'Carregando seu progresso…' : loyaltyQuery.error ? 'Não foi possível carregar seu progresso.' : nextLevel ? `${pointsToNext.toLocaleString('pt-BR')} pontos para ${nextLevel.name}` : 'Você alcançou o nível máximo'}
            </Text>
          </TouchableOpacity>
        ) : null}

        {MENU_ITEMS.map((item) => (
          <TouchableOpacity
            key={item.route}
            style={styles.menuItem}
            onPress={() => item.route === 'OrdersTab' ? navigation.navigate('Orders') : rootNavigate(navigation, item.route, item.route === 'Waitlist' ? {} : undefined)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={item.label}
          >
            <View style={styles.menuIcon}><Ionicons name={item.icon} size={17} color={colors.primary} /></View>
            <Text style={styles.menuLabel}>{item.label}</Text>
            {item.route === 'Notifications' && (notificationCount.data ?? 0) > 0 ? (
              <View style={styles.badge}><Text style={styles.badgeText}>{Math.min(notificationCount.data ?? 0, 99)}</Text></View>
            ) : null}
            <Ionicons name="chevron-forward" size={17} color={colors.foregroundMuted} />
          </TouchableOpacity>
        ))}

        <TouchableOpacity style={styles.logout} onPress={() => void customerBackend.signOut()} accessibilityRole="button" accessibilityLabel="Sair da conta">
          <Ionicons name="log-out-outline" size={18} color={colors.error} />
          <Text style={styles.logoutText}>Sair</Text>
        </TouchableOpacity>
      </ScrollView>
    </ScreenContainer>
  );
}
