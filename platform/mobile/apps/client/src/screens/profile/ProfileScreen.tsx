import React, { useCallback, useMemo } from 'react';
import { Alert, View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import { authService } from '@/shared/services/auth';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const ORANGE = '#FF4B22';
const ORANGE_SOFT = '#FFF0EA';
const WARNING = '#F59E0B';

type ProfileMenuItem = {
  id: string;
  label: string;
  icon: IconName;
  route: string;
  badge?: string;
};

const PROFILE_ITEMS: ProfileMenuItem[] = [
  { id: 'notifications', label: 'Notificações', icon: 'notifications-outline', route: 'ProfileNotifications', badge: '3' },
  { id: 'history', label: 'Histórico de Visitas', icon: 'time-outline', route: 'VisitHistory' },
  { id: 'reservations', label: 'Minhas Reservas', icon: 'calendar-outline', route: 'ProfileReservations' },
  { id: 'loyalty', label: 'Programa de Fidelidade', icon: 'gift-outline', route: 'LoyaltyProgram' },
  { id: 'payments', label: 'Métodos de Pagamento', icon: 'card-outline', route: 'ProfilePaymentMethods' },
  { id: 'favorites', label: 'Restaurantes Favoritos', icon: 'heart-outline', route: 'ProfileFavorites' },
  { id: 'settings', label: 'Configurações', icon: 'settings-outline', route: 'ProfileSettings' },
  { id: 'support', label: 'Ajuda & Suporte', icon: 'help-circle-outline', route: 'ProfileSupport' },
];

export default function ProfileScreen() {
  const navigation = useNavigation<any>();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const navigateTo = useCallback(
    (route: string) => {
      navigation.navigate(route);
    },
    [navigation],
  );

  const handleLogout = useCallback(() => {
    Alert.alert('Sair da conta', 'Deseja encerrar sua sessão neste dispositivo?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: () => {
          void authService.logout();
        },
      },
    ]);
  }, []);

  return (
    <ScreenContainer edges={['top']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Meu Perfil</Text>

        <View style={styles.userCard}>
          <View style={styles.avatar}>
            <Ionicons name="person-outline" size={29} color={ORANGE} />
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>Usuário Demo</Text>
            <Text style={styles.userEmail}>demo@noowe.com.br</Text>
          </View>
          <View style={styles.pointsWrap}>
            <Text style={styles.pointsValue}>1.250</Text>
            <Text style={styles.pointsLabel}>pontos</Text>
          </View>
        </View>

        <View style={styles.loyaltyCard}>
          <View style={styles.loyaltyHeader}>
            <Ionicons name="trophy-outline" size={18} color={WARNING} />
            <Text style={styles.loyaltyTitle}>Nível Gold</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={styles.progressFill} />
          </View>
          <Text style={styles.loyaltyMeta}>750 pontos para Platinum</Text>
        </View>

        <View style={styles.menu}>
          {PROFILE_ITEMS.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.menuRow}
              onPress={() => navigateTo(item.route)}
              activeOpacity={0.72}
              accessibilityRole="button"
              accessibilityLabel={item.label}
            >
              <Ionicons name={item.icon} size={22} color={colors.foregroundSecondary} />
              <Text style={styles.menuLabel}>{item.label}</Text>
              {item.badge && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{item.badge}</Text>
                </View>
              )}
              <Ionicons name="chevron-forward" size={18} color={colors.foregroundMuted} />
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={styles.logoutRow}
          onPress={handleLogout}
          activeOpacity={0.72}
          accessibilityRole="button"
          accessibilityLabel="Sair"
        >
          <Ionicons name="log-out-outline" size={22} color="#EF4444" />
          <Text style={styles.logoutText}>Sair</Text>
        </TouchableOpacity>
      </ScrollView>
    </ScreenContainer>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      paddingHorizontal: 18,
      paddingTop: 18,
      paddingBottom: 88,
    },
    title: {
      fontSize: 24,
      fontWeight: '800',
      color: colors.foreground,
      marginBottom: 20,
    },
    userCard: {
      minHeight: 88,
      borderRadius: 22,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      marginBottom: 22,
    },
    avatar: {
      width: 58,
      height: 58,
      borderRadius: 29,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: ORANGE_SOFT,
      marginRight: 14,
    },
    userInfo: {
      flex: 1,
    },
    userName: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.foreground,
      marginBottom: 4,
    },
    userEmail: {
      fontSize: 12,
      color: colors.foregroundSecondary,
    },
    pointsWrap: {
      alignItems: 'flex-end',
    },
    pointsValue: {
      color: ORANGE,
      fontSize: 17,
      fontWeight: '900',
      marginBottom: 2,
    },
    pointsLabel: {
      color: colors.foregroundSecondary,
      fontSize: 10,
      fontWeight: '600',
    },
    loyaltyCard: {
      borderRadius: 18,
      padding: 18,
      backgroundColor: '#FFF3E8',
      marginBottom: 22,
    },
    loyaltyHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 14,
    },
    loyaltyTitle: {
      color: colors.foreground,
      fontSize: 14,
      fontWeight: '800',
    },
    progressTrack: {
      height: 5,
      borderRadius: 3,
      overflow: 'hidden',
      backgroundColor: '#E7EAF0',
      marginBottom: 9,
    },
    progressFill: {
      width: '62%',
      height: '100%',
      borderRadius: 3,
      backgroundColor: WARNING,
    },
    loyaltyMeta: {
      color: colors.foregroundSecondary,
      fontSize: 11,
      fontWeight: '600',
    },
    menu: {
      gap: 3,
    },
    menuRow: {
      minHeight: 50,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    menuLabel: {
      flex: 1,
      fontSize: 15,
      color: colors.foreground,
      fontWeight: '600',
    },
    badge: {
      minWidth: 22,
      height: 22,
      borderRadius: 11,
      paddingHorizontal: 6,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#EF4444',
      marginRight: 6,
    },
    badgeText: {
      color: '#FFFFFF',
      fontSize: 10,
      fontWeight: '800',
    },
    logoutRow: {
      minHeight: 50,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      marginTop: 20,
    },
    logoutText: {
      color: '#EF4444',
      fontSize: 15,
      fontWeight: '700',
    },
  });
