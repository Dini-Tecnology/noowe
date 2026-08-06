import React, { useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Linking,
} from 'react-native';
import { Text } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const ORANGE = '#FF4B22';
const ORANGE_DARK = '#FF3214';
const ORANGE_SOFT = '#FFF0EA';
const WARNING = '#F59E0B';
const SUCCESS = '#22C55E';

function Header({
  title,
  rightLabel,
  onRightPress,
  backLabel,
}: {
  title: string;
  rightLabel?: string;
  onRightPress?: () => void;
  backLabel?: string;
}) {
  const navigation = useNavigation<any>();
  const colors = useColors();
  const styles = useMemo(() => createSharedStyles(colors), [colors]);

  return (
    <View style={styles.header}>
      <TouchableOpacity
        style={backLabel ? styles.backButtonRow : styles.backButton}
        onPress={() => navigation.goBack()}
        accessibilityRole="button"
        accessibilityLabel="Voltar"
      >
        <Ionicons name="arrow-back" size={20} color={colors.foregroundSecondary} />
        {backLabel ? <Text style={styles.backLabel}>{backLabel}</Text> : null}
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{title}</Text>
      {rightLabel ? (
        <TouchableOpacity onPress={onRightPress} accessibilityRole="button">
          <Text style={styles.headerAction}>{rightLabel}</Text>
        </TouchableOpacity>
      ) : (
        <View style={[styles.headerSpacer, backLabel && styles.headerSpacerWide]} />
      )}
    </View>
  );
}

function IconBubble({
  icon,
  color = ORANGE,
  background = ORANGE_SOFT,
}: {
  icon: IconName;
  color?: string;
  background?: string;
}) {
  return (
    <View style={[shared.iconBubble, { backgroundColor: background }]}>
      <Ionicons name={icon} size={21} color={color} />
    </View>
  );
}

export function ProfileNotificationsScreen() {
  const colors = useColors();
  const styles = useMemo(() => createSharedStyles(colors), [colors]);

  const notifications = [
    {
      id: '1',
      icon: 'calendar-outline' as IconName,
      title: 'Reserva confirmada!',
      subtitle: 'Bistrô Noowe · Hoje às 20:00 · 2 pessoas',
      time: 'Agora',
      color: SUCCESS,
      background: '#E9F9EF',
      highlighted: true,
    },
    {
      id: '2',
      icon: 'person-add-outline' as IconName,
      title: 'Maria te convidou!',
      subtitle: 'Junte-se à comanda da Mesa 7 no Bistrô Noowe',
      time: '5 min',
      color: ORANGE,
      background: ORANGE_SOFT,
      highlighted: true,
      actions: true,
    },
    {
      id: '3',
      icon: 'timer-outline' as IconName,
      title: 'Sua mesa está pronta!',
      subtitle: 'Bistrô Noowe · Mesa 12 está disponível',
      time: '12 min',
      color: WARNING,
      background: '#FFF7E6',
    },
    {
      id: '4',
      icon: 'gift-outline' as IconName,
      title: '+125 pontos ganhos',
      subtitle: 'Visita ao Bistrô Noowe · Total: 1.250 pts',
      time: '2h',
      color: WARNING,
      background: '#FFF7E6',
    },
    {
      id: '5',
      icon: 'sparkles-outline' as IconName,
      title: 'Happy Hour ativo!',
      subtitle: 'Drinks com 30% off até 19h no Bistrô Noowe',
      time: '3h',
      color: '#0F766E',
      background: '#E8F7F4',
    },
    {
      id: '6',
      icon: 'fast-food-outline' as IconName,
      title: 'Seu pedido está pronto!',
      subtitle: 'Tartare de Atum e Filé ao Molho de Vinho',
      time: 'Ontem',
      color: ORANGE,
      background: ORANGE_SOFT,
    },
  ];

  return (
    <ScreenContainer edges={['top']}>
      <View style={styles.screen}>
        <Header title="Notificações" rightLabel="Limpar" />
        <ScrollView contentContainerStyle={styles.pagePadding} showsVerticalScrollIndicator={false}>
          {notifications.map((item) => (
            <View
              key={item.id}
              style={[
                styles.notificationCard,
                item.highlighted && styles.notificationCardHighlighted,
              ]}
            >
              <IconBubble icon={item.icon} color={item.color} background={item.background} />
              <View style={styles.flex}>
                <View style={styles.rowBetween}>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <Text style={styles.miniMuted}>{item.time}</Text>
                </View>
                <Text style={styles.cardSub}>{item.subtitle}</Text>
                {item.actions && (
                  <View style={styles.actionRow}>
                    <TouchableOpacity style={styles.primaryPill} accessibilityRole="button">
                      <Text style={styles.primaryPillText}>Aceitar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.secondaryPill} accessibilityRole="button">
                      <Text style={styles.secondaryPillText}>Recusar</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    </ScreenContainer>
  );
}

export function VisitHistoryScreen() {
  const colors = useColors();
  const styles = useMemo(() => createSharedStyles(colors), [colors]);

  const visits = [
    { id: '1', name: 'Bistrô Noowe', meta: 'Hoje · 3 itens', value: 'R$ 186', rating: 5 },
    { id: '2', name: 'Bistrô Noowe', meta: 'Há 3 dias · 5 itens', value: 'R$ 312', rating: 4 },
    { id: '3', name: 'Sushi Kenzo', meta: 'Há 1 semana · 4 itens', value: 'R$ 248', rating: 5 },
  ];

  return (
    <ScreenContainer edges={['top']}>
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={styles.pagePaddingLarge} showsVerticalScrollIndicator={false}>
          <Text style={styles.largeTitle}>Meus Pedidos</Text>
          <Text style={styles.sectionLabel}>Últimas visitas</Text>
          {visits.map((visit) => (
            <View key={visit.id} style={styles.visitRow}>
              <IconBubble icon="restaurant-outline" />
              <View style={styles.flex}>
                <Text style={styles.cardTitle}>{visit.name}</Text>
                <Text style={styles.cardSub}>{visit.meta}</Text>
              </View>
              <View style={styles.visitRight}>
                <Text style={styles.visitValue}>{visit.value}</Text>
                <Text style={styles.stars}>{'★'.repeat(visit.rating)}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    </ScreenContainer>
  );
}

export function ProfileReservationsScreen() {
  const colors = useColors();
  const styles = useMemo(() => createSharedStyles(colors), [colors]);

  const reservations = [
    {
      id: '1',
      title: 'Bistrô Noowe',
      meta: 'Hoje · 20:00 · 2 pessoas',
      status: 'Confirmada',
      icon: 'calendar-outline' as IconName,
      color: SUCCESS,
    },
    {
      id: '2',
      title: 'Sushi Kenzo',
      meta: 'Sábado · 21:30 · 4 pessoas',
      status: 'Pendente',
      icon: 'time-outline' as IconName,
      color: WARNING,
    },
    {
      id: '3',
      title: 'Casa Nipo',
      meta: '12 Mai · 19:00 · 2 pessoas',
      status: 'Concluída',
      icon: 'checkmark-circle-outline' as IconName,
      color: colors.foregroundMuted,
    },
  ];

  return (
    <ScreenContainer edges={['top']}>
      <View style={styles.screen}>
        <Header title="Minhas Reservas" />
        <ScrollView contentContainerStyle={styles.pagePadding} showsVerticalScrollIndicator={false}>
          {reservations.map((reservation) => (
            <View key={reservation.id} style={styles.listCard}>
              <IconBubble icon={reservation.icon} color={reservation.color} background="#F7F7F8" />
              <View style={styles.flex}>
                <Text style={styles.cardTitle}>{reservation.title}</Text>
                <Text style={styles.cardSub}>{reservation.meta}</Text>
              </View>
              <View style={[styles.statusPill, { backgroundColor: `${reservation.color}18` }]}>
                <Text style={[styles.statusPillText, { color: reservation.color }]}>
                  {reservation.status}
                </Text>
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    </ScreenContainer>
  );
}

export function LoyaltyProgramScreen() {
  const colors = useColors();
  const styles = useMemo(() => createSharedStyles(colors), [colors]);

  const rewards = [
    { id: '1', icon: 'ice-cream-outline' as IconName, title: 'Sobremesa grátis', points: '500 pontos', active: true },
    { id: '2', icon: 'wine-outline' as IconName, title: 'Drink da casa', points: '800 pontos', active: true },
    { id: '3', icon: 'leaf-outline' as IconName, title: 'Entrada premium', points: '1200 pontos', active: true },
    { id: '4', icon: 'restaurant-outline' as IconName, title: 'Jantar para 2', points: '3000 pontos', active: false },
  ];

  return (
    <ScreenContainer edges={['top']}>
      <View style={styles.screen}>
        <Header title="Fidelidade" />
        <ScrollView contentContainerStyle={styles.pagePadding} showsVerticalScrollIndicator={false}>
          <LinearGradient
            colors={[ORANGE, ORANGE_DARK]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.loyaltyHero}
          >
            <View style={styles.loyaltyCircle} />
            <Ionicons name="trophy-outline" size={27} color="#FFFFFF" />
            <Text style={styles.loyaltyLabel}>SEUS PONTOS</Text>
            <Text style={styles.loyaltyPoints}>1.250</Text>
            <Text style={styles.loyaltyNext}>Nível: Gold · próximo nível em 750 pts</Text>
            <View style={styles.heroTrack}>
              <View style={styles.heroProgress} />
            </View>
          </LinearGradient>

          <View style={styles.tierTabs}>
            {['Silver', 'Gold', 'Platinum', 'Black'].map((tier) => (
              <View key={tier} style={[styles.tierTab, tier === 'Gold' && styles.tierTabActive]}>
                <Text style={[styles.tierTabText, tier === 'Gold' && styles.tierTabTextActive]}>
                  {tier}
                </Text>
              </View>
            ))}
          </View>

          <Text style={styles.sectionTitle}>Recompensas</Text>
          {rewards.map((reward) => (
            <View key={reward.id} style={styles.rewardRow}>
              <IconBubble icon={reward.icon} />
              <View style={styles.flex}>
                <Text style={styles.cardTitle}>{reward.title}</Text>
                <Text style={styles.cardSub}>{reward.points}</Text>
              </View>
              {reward.active ? (
                <TouchableOpacity style={styles.redeemButton} accessibilityRole="button">
                  <Text style={styles.redeemText}>Resgatar</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.lockedPill}>
                  <Text style={styles.lockedText}>1750 pts</Text>
                </View>
              )}
            </View>
          ))}

          <Text style={styles.sectionTitle}>Histórico</Text>
          <View style={styles.historyRow}>
            <View>
              <Text style={styles.cardTitle}>Visita ao Bistrô Noowe</Text>
              <Text style={styles.cardSub}>Hoje</Text>
            </View>
            <Text style={styles.positivePoints}>+125</Text>
          </View>
        </ScrollView>
      </View>
    </ScreenContainer>
  );
}

export function ProfilePaymentMethodsScreen() {
  const colors = useColors();
  const styles = useMemo(() => createSharedStyles(colors), [colors]);

  const methods = [
    { id: '1', icon: 'card-outline' as IconName, title: 'Mastercard final 4821', subtitle: 'Padrão para pagamentos' },
    { id: '2', icon: 'logo-apple' as IconName, title: 'Apple Pay', subtitle: 'Pagamento rápido no app' },
    { id: '3', icon: 'qr-code-outline' as IconName, title: 'Pix', subtitle: 'Aprovação instantânea' },
  ];

  return (
    <ScreenContainer edges={['top']}>
      <View style={styles.screen}>
        <Header title="Métodos de Pagamento" rightLabel="Adicionar" />
        <ScrollView contentContainerStyle={styles.pagePadding} showsVerticalScrollIndicator={false}>
          {methods.map((method) => (
            <View key={method.id} style={styles.listCard}>
              <IconBubble icon={method.icon} />
              <View style={styles.flex}>
                <Text style={styles.cardTitle}>{method.title}</Text>
                <Text style={styles.cardSub}>{method.subtitle}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.foregroundMuted} />
            </View>
          ))}
        </ScrollView>
      </View>
    </ScreenContainer>
  );
}

export function ProfileFavoritesScreen() {
  const colors = useColors();
  const styles = useMemo(() => createSharedStyles(colors), [colors]);

  const favorites = [
    { id: '1', title: 'Bistrô Noowe', meta: 'Contemporâneo · 4.9 · 1,2 km' },
    { id: '2', title: 'Sushi Kenzo', meta: 'Japonês · 4.8 · 2,4 km' },
    { id: '3', title: 'Casa Nipo', meta: 'Izakaya · 4.7 · 3,1 km' },
  ];

  return (
    <ScreenContainer edges={['top']}>
      <View style={styles.screen}>
        <Header title="Restaurantes Favoritos" />
        <ScrollView contentContainerStyle={styles.pagePadding} showsVerticalScrollIndicator={false}>
          {favorites.map((favorite) => (
            <View key={favorite.id} style={styles.listCard}>
              <IconBubble icon="heart-outline" />
              <View style={styles.flex}>
                <Text style={styles.cardTitle}>{favorite.title}</Text>
                <Text style={styles.cardSub}>{favorite.meta}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.foregroundMuted} />
            </View>
          ))}
        </ScrollView>
      </View>
    </ScreenContainer>
  );
}

export function ProfileSettingsScreen() {
  const colors = useColors();
  const styles = useMemo(() => createSharedStyles(colors), [colors]);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [locationEnabled, setLocationEnabled] = useState(false);

  return (
    <ScreenContainer edges={['top']}>
      <View style={styles.screen}>
        <Header title="Configurações" />
        <ScrollView contentContainerStyle={styles.pagePadding} showsVerticalScrollIndicator={false}>
          <View style={styles.settingsCard}>
            <View style={styles.settingsRow}>
              <IconBubble icon="notifications-outline" />
              <View style={styles.flex}>
                <Text style={styles.cardTitle}>Notificações push</Text>
                <Text style={styles.cardSub}>Reservas, convites e pedidos</Text>
              </View>
              <Switch
                value={pushEnabled}
                onValueChange={setPushEnabled}
                trackColor={{ false: '#E5E7EB', true: '#FFD5C8' }}
                thumbColor={pushEnabled ? ORANGE : '#FFFFFF'}
              />
            </View>
            <View style={styles.separator} />
            <View style={styles.settingsRow}>
              <IconBubble icon="location-outline" />
              <View style={styles.flex}>
                <Text style={styles.cardTitle}>Localização</Text>
                <Text style={styles.cardSub}>Restaurantes próximos</Text>
              </View>
              <Switch
                value={locationEnabled}
                onValueChange={setLocationEnabled}
                trackColor={{ false: '#E5E7EB', true: '#FFD5C8' }}
                thumbColor={locationEnabled ? ORANGE : '#FFFFFF'}
              />
            </View>
          </View>

          {['Idioma', 'Privacidade', 'Termos de uso', 'Sobre o app'].map((item) => (
            <View key={item} style={styles.listCard}>
              <IconBubble icon="settings-outline" />
              <Text style={[styles.cardTitle, styles.flex]}>{item}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.foregroundMuted} />
            </View>
          ))}
        </ScrollView>
      </View>
    </ScreenContainer>
  );
}

type SupportTab = 'FAQ' | 'Chat' | 'Histórico';

const SUPPORT_TABS: SupportTab[] = ['FAQ', 'Chat', 'Histórico'];

export function ProfileSupportScreen() {
  const colors = useColors();
  const styles = useMemo(() => createSharedStyles(colors), [colors]);
  const [activeTab, setActiveTab] = useState<SupportTab>('FAQ');

  const questions = [
    'Como funciona o pagamento?',
    'Posso cancelar um pedido?',
    'Como ganho pontos de fidelidade?',
    'Posso reservar uma mesa?',
    'Como chamar o garçom?',
  ];

  const handleStartChat = () => {
    Alert.alert('Chat ao vivo', 'Em breve você poderá conversar com nossa equipe pelo app.');
  };

  const handleWhatsApp = () => {
    Linking.openURL('https://wa.me/5511999999999?text=Olá, preciso de ajuda com o app NOOWE').catch(() => {
      Alert.alert('WhatsApp', 'Não foi possível abrir o WhatsApp neste dispositivo.');
    });
  };

  return (
    <ScreenContainer edges={['top']}>
      <View style={styles.screen}>
        <View style={styles.supportHeader}>
          <Header title="Ajuda & Suporte" backLabel="Voltar" />
        </View>

        <ScrollView
          contentContainerStyle={styles.supportContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.segmented}>
            {SUPPORT_TABS.map((tab) => {
              const isActive = tab === activeTab;
              return (
                <TouchableOpacity
                  key={tab}
                  style={[styles.segmentItem, isActive && styles.segmentActive]}
                  onPress={() => setActiveTab(tab)}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  accessibilityLabel={tab}
                >
                  <Text style={[styles.segmentText, isActive && styles.segmentTextActive]}>
                    {tab}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {activeTab === 'FAQ' && (
            <View style={styles.faqList}>
              {questions.map((question) => (
                <TouchableOpacity
                  key={question}
                  style={styles.faqRow}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                >
                  <Text style={styles.faqText}>{question}</Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.foregroundMuted} />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {activeTab === 'Chat' && (
            <View style={styles.supportTabContent}>
              <View style={styles.chatCard}>
                <View style={styles.chatIconCircle}>
                  <Ionicons name="chatbubble-outline" size={32} color={SUCCESS} />
                </View>
                <Text style={styles.chatTitle}>Chat ao Vivo</Text>
                <Text style={styles.chatResponse}>
                  Tempo médio de resposta:{' '}
                  <Text style={styles.chatResponseHighlight}>{'< 2 min'}</Text>
                </Text>
                <View style={styles.chatOnlineRow}>
                  <View style={styles.chatOnlineDot} />
                  <Text style={styles.chatOnlineText}>3 atendentes online</Text>
                </View>
                <TouchableOpacity
                  style={styles.chatPrimaryBtn}
                  onPress={handleStartChat}
                  activeOpacity={0.9}
                  accessibilityRole="button"
                  accessibilityLabel="Iniciar conversa"
                >
                  <Text style={styles.chatPrimaryBtnText}>Iniciar Conversa</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.whatsappCard}
                onPress={handleWhatsApp}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="WhatsApp"
              >
                <Ionicons name="call-outline" size={22} color={colors.foregroundSecondary} />
                <View style={styles.flex}>
                  <Text style={styles.whatsappTitle}>WhatsApp</Text>
                  <Text style={styles.whatsappSub}>Resposta em até 5 minutos</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.foregroundMuted} />
              </TouchableOpacity>
            </View>
          )}

          {activeTab === 'Histórico' && (
            <View style={styles.supportTabContent}>
              <View style={styles.faqRow}>
                <Ionicons name="time-outline" size={20} color={colors.foregroundMuted} />
                <Text style={[styles.faqText, { marginLeft: 10 }]}>
                  Nenhum chamado registrado ainda. Fale conosco pelo Chat ou WhatsApp acima.
                </Text>
              </View>
            </View>
          )}
        </ScrollView>
      </View>
    </ScreenContainer>
  );
}

const shared = StyleSheet.create({
  iconBubble: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const createSharedStyles = (colors: any) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
    },
    flex: {
      flex: 1,
    },
    header: {
      minHeight: 52,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    backButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.backgroundTertiary,
    },
    backButtonRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      minWidth: 88,
    },
    backLabel: {
      fontSize: 15,
      color: colors.foregroundSecondary,
      fontWeight: '500',
    },
    headerTitle: {
      flex: 1,
      textAlign: 'center',
      fontSize: 18,
      fontWeight: '700',
      color: colors.foreground,
    },
    headerAction: {
      minWidth: 54,
      textAlign: 'right',
      color: ORANGE,
      fontSize: 13,
      fontWeight: '600',
    },
    headerSpacer: {
      width: 38,
    },
    headerSpacerWide: {
      minWidth: 88,
    },
    pagePadding: {
      paddingHorizontal: 16,
      paddingBottom: 28,
    },
    pagePaddingLarge: {
      paddingHorizontal: 22,
      paddingTop: 22,
      paddingBottom: 28,
    },
    largeTitle: {
      fontSize: 24,
      fontWeight: '800',
      color: colors.foreground,
      marginBottom: 28,
    },
    sectionLabel: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.foregroundSecondary,
      marginBottom: 18,
    },
    sectionTitle: {
      fontSize: 17,
      fontWeight: '800',
      color: colors.foreground,
      marginTop: 18,
      marginBottom: 12,
    },
    rowBetween: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    cardTitle: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.foreground,
      marginBottom: 3,
    },
    cardSub: {
      fontSize: 12,
      lineHeight: 16,
      color: colors.foregroundSecondary,
    },
    miniMuted: {
      fontSize: 10,
      color: colors.foregroundMuted,
    },
    notificationCard: {
      flexDirection: 'row',
      gap: 12,
      borderRadius: 18,
      padding: 14,
      marginBottom: 10,
      backgroundColor: colors.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    notificationCardHighlighted: {
      backgroundColor: '#FFF8F5',
      borderColor: '#FFD7C8',
    },
    actionRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 12,
    },
    primaryPill: {
      backgroundColor: ORANGE,
      borderRadius: 14,
      paddingHorizontal: 20,
      paddingVertical: 9,
    },
    primaryPillText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '800',
    },
    secondaryPill: {
      borderRadius: 14,
      paddingHorizontal: 20,
      paddingVertical: 9,
      backgroundColor: colors.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    secondaryPillText: {
      color: colors.foregroundSecondary,
      fontSize: 12,
      fontWeight: '700',
    },
    visitRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingVertical: 13,
    },
    visitRight: {
      alignItems: 'flex-end',
    },
    visitValue: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.foreground,
    },
    stars: {
      color: WARNING,
      fontSize: 12,
      letterSpacing: 1,
      marginTop: 2,
    },
    listCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 14,
      borderRadius: 18,
      marginBottom: 10,
      backgroundColor: colors.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    statusPill: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 12,
    },
    statusPillText: {
      fontSize: 11,
      fontWeight: '800',
    },
    loyaltyHero: {
      minHeight: 178,
      borderRadius: 22,
      padding: 22,
      overflow: 'hidden',
      marginTop: 8,
    },
    loyaltyCircle: {
      position: 'absolute',
      right: -10,
      top: -44,
      width: 132,
      height: 132,
      borderRadius: 66,
      backgroundColor: 'rgba(255,255,255,0.14)',
    },
    loyaltyLabel: {
      color: '#FFE4DB',
      fontSize: 12,
      letterSpacing: 0.6,
      marginTop: 18,
      marginBottom: 4,
    },
    loyaltyPoints: {
      color: '#FFFFFF',
      fontSize: 38,
      fontWeight: '900',
      letterSpacing: -1,
    },
    loyaltyNext: {
      color: '#FFE4DB',
      fontSize: 12,
      marginTop: 4,
      marginBottom: 14,
    },
    heroTrack: {
      height: 6,
      borderRadius: 3,
      backgroundColor: 'rgba(255,255,255,0.28)',
      overflow: 'hidden',
    },
    heroProgress: {
      width: '62%',
      height: '100%',
      borderRadius: 3,
      backgroundColor: '#FFFFFF',
    },
    tierTabs: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 18,
    },
    tierTab: {
      flex: 1,
      borderRadius: 12,
      backgroundColor: colors.backgroundTertiary,
      paddingVertical: 9,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: 'transparent',
    },
    tierTabActive: {
      backgroundColor: '#FFF8EA',
      borderColor: WARNING,
    },
    tierTabText: {
      fontSize: 11,
      fontWeight: '800',
      color: colors.foregroundMuted,
    },
    tierTabTextActive: {
      color: colors.foreground,
    },
    rewardRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
    },
    redeemButton: {
      borderRadius: 14,
      backgroundColor: ORANGE,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    redeemText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '800',
    },
    lockedPill: {
      borderRadius: 14,
      backgroundColor: colors.backgroundTertiary,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    lockedText: {
      color: colors.foregroundMuted,
      fontSize: 12,
      fontWeight: '800',
    },
    historyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
    },
    positivePoints: {
      color: SUCCESS,
      fontSize: 15,
      fontWeight: '900',
    },
    settingsCard: {
      borderRadius: 18,
      backgroundColor: colors.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      marginBottom: 10,
      overflow: 'hidden',
    },
    settingsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 14,
    },
    separator: {
      height: StyleSheet.hairlineWidth,
      marginLeft: 70,
      backgroundColor: colors.border,
    },
    supportContent: {
      paddingHorizontal: 16,
      paddingBottom: 28,
    },
    supportHeader: {
      paddingHorizontal: 4,
    },
    supportTabContent: {
      gap: 12,
    },
    segmented: {
      flexDirection: 'row',
      borderRadius: 18,
      padding: 4,
      backgroundColor: colors.backgroundTertiary,
      marginBottom: 16,
    },
    segmentItem: {
      flex: 1,
      alignItems: 'center',
      borderRadius: 14,
      paddingVertical: 10,
    },
    segmentActive: {
      backgroundColor: colors.card,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 6,
      elevation: 3,
    },
    segmentText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.foregroundMuted,
    },
    segmentTextActive: {
      color: colors.foreground,
    },
    faqList: {
      gap: 10,
    },
    faqRow: {
      minHeight: 46,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      borderRadius: 16,
      backgroundColor: colors.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    faqText: {
      flex: 1,
      fontSize: 13,
      fontWeight: '700',
      color: colors.foreground,
    },
    chatCard: {
      alignItems: 'center',
      paddingVertical: 28,
      paddingHorizontal: 20,
      borderRadius: 18,
      backgroundColor: colors.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    chatIconCircle: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: '#E9F9EF',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    chatTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.foreground,
      marginBottom: 10,
    },
    chatResponse: {
      fontSize: 14,
      color: colors.foregroundSecondary,
      marginBottom: 10,
    },
    chatResponseHighlight: {
      fontWeight: '800',
      color: SUCCESS,
    },
    chatOnlineRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 22,
    },
    chatOnlineDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: SUCCESS,
    },
    chatOnlineText: {
      fontSize: 14,
      fontWeight: '600',
      color: SUCCESS,
    },
    chatPrimaryBtn: {
      alignSelf: 'stretch',
      backgroundColor: ORANGE,
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: 'center',
    },
    chatPrimaryBtnText: {
      fontSize: 16,
      fontWeight: '800',
      color: '#FFFFFF',
    },
    whatsappCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      padding: 16,
      borderRadius: 18,
      backgroundColor: colors.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    whatsappTitle: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.foreground,
      marginBottom: 2,
    },
    whatsappSub: {
      fontSize: 13,
      color: colors.foregroundSecondary,
    },
    historyTicketCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      padding: 16,
      borderRadius: 18,
      backgroundColor: colors.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    historyTicketTitle: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.foreground,
      marginBottom: 4,
    },
    historyTicketMeta: {
      fontSize: 13,
      color: colors.foregroundSecondary,
    },
    resolvedBadge: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 12,
      backgroundColor: '#E9F9EF',
    },
    resolvedBadgeText: {
      fontSize: 12,
      fontWeight: '700',
      color: SUCCESS,
    },
    historyFooter: {
      marginTop: 8,
      textAlign: 'center',
      fontSize: 14,
      color: colors.foregroundMuted,
    },
  });
