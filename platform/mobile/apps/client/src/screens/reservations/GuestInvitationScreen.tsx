import React, { useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, ScrollView, Alert, TouchableOpacity, Share, RefreshControl } from 'react-native';
import { Text, Card, Button, TextInput, IconButton, ActivityIndicator, Avatar, Chip, Divider } from 'react-native-paper';
import { useRoute, useNavigation } from '@react-navigation/native';
import ApiService from '@/shared/services/api';
import { useScreenTracking, useAnalytics } from '@/shared/hooks/useAnalytics';
import { useI18n } from '@/shared/hooks/useI18n';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import { usePullToRefresh } from '@okinawa/shared/hooks/usePullToRefresh';

interface Guest {
  id: string;
  guest_user_id?: string;
  guest_name?: string;
  guest_phone?: string;
  guest_email?: string;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  is_host: boolean;
  invite_method?: string;
  invited_at: string;
  responded_at?: string;
  guest_user?: {
    id: string;
    full_name: string;
    avatar_url?: string;
  };
}

interface Contact {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  avatar_url?: string;
  isAppUser: boolean;
}

const getSTATUS_COLORS = (colors: any) => ({
  pending: colors.statusPending,
  accepted: colors.success,
  declined: colors.error,
  cancelled: colors.foregroundMuted,
});

const getGuestStatusLabel = (status: string, t: (key: string) => string): string =>
  t(`reservations.guestStatus.${status}`);

export default function GuestInvitationScreen() {
  useScreenTracking('Guest Invitation');
  const { t } = useI18n();
  const colors = useColors();
  const STATUS_COLORS = getSTATUS_COLORS(colors);
  const route = useRoute();
  const navigation = useNavigation();
  const analytics = useAnalytics();
  
  const { reservationId, partySize } = route.params as { reservationId: string; partySize: number };

  const [loading, setLoading] = useState(true);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddManual, setShowAddManual] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [manualEmail, setManualEmail] = useState('');
  const [inviting, setInviting] = useState(false);

  const styles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.backgroundSecondary,
      padding: 16,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.backgroundSecondary,
    },
    loadingText: {
      marginTop: 15,
      color: colors.foregroundMuted,
    },
    summaryCard: {
      marginBottom: 15,
      backgroundColor: colors.primary,
    },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      alignItems: 'center',
    },
    summaryItem: {
      alignItems: 'center',
      flex: 1,
    },
    summaryNumber: {
      fontSize: 28,
      fontWeight: 'bold',
      color: colors.premiumCardForeground,
    },
    summaryLabel: {
      fontSize: 12,
      color: 'rgba(255,255,255,0.8)',
      marginTop: 4,
    },
    summaryDivider: {
      width: 1,
      height: 40,
      backgroundColor: 'rgba(255,255,255,0.3)',
    },
    warningText: {
      color: colors.accent,
    },
    card: {
      marginBottom: 15,
      backgroundColor: colors.card,
    },
    sectionTitle: {
      marginBottom: 15,
      color: colors.foreground,
    },
    guestItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    avatar: {
      marginRight: 12,
    },
    guestInfo: {
      flex: 1,
    },
    guestNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    guestName: {
      color: colors.foreground,
    },
    guestContact: {
      color: colors.foregroundMuted,
      marginTop: 2,
    },
    hostChip: {
      backgroundColor: colors.primary,
      height: 24,
    },
    statusChip: {
      height: 24,
      marginTop: 4,
    },
    statusText: {
      color: colors.premiumCardForeground,
      fontSize: 10,
    },
    emptyText: {
      textAlign: 'center',
      color: colors.foregroundMuted,
      paddingVertical: 20,
    },
    searchInput: {
      marginBottom: 15,
      backgroundColor: colors.card,
    },
    contactItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    contactAvatar: {
      marginRight: 12,
      backgroundColor: colors.primary,
    },
    contactInfo: {
      flex: 1,
    },
    contactDetail: {
      color: colors.foregroundMuted,
    },
    appUserChip: {
      backgroundColor: colors.primaryLight,
      height: 24,
    },
    divider: {
      marginVertical: 15,
      backgroundColor: colors.border,
    },
    addButton: {
      borderColor: colors.primary,
    },
    manualForm: {
      marginTop: 10,
    },
    input: {
      marginBottom: 10,
      backgroundColor: colors.card,
    },
    manualButtons: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 10,
    },
    cancelButton: {
      flex: 1,
      borderColor: colors.border,
    },
    sendButton: {
      flex: 1,
      backgroundColor: colors.primary,
    },
    shareButton: {
      marginTop: 5,
    },
    noteCard: {
      marginBottom: 15,
      backgroundColor: colors.primaryLight,
    },
    noteContainer: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    noteText: {
      flex: 1,
      color: colors.foreground,
    },
    doneButton: {
      marginBottom: 30,
      backgroundColor: colors.primary,
    },
  }), [colors]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [guestsData, contactsRes] = await Promise.all([
        ApiService.getReservationGuests(reservationId),
        ApiService.get('/users/contacts').then(r => r.data).catch(() => []),
      ]);
      const contactsData = contactsRes as Contact[];
      setGuests(guestsData);
      setContacts(contactsData);
    } catch (error) {
      console.error('Failed to load data:', error);
      Alert.alert(t('common.error'), t('errors.generic'));
    } finally {
      setLoading(false);
    }
  };

  const pullToRefresh = usePullToRefresh(loadData);

  const confirmedGuests = guests.filter(g => g.status === 'accepted' || g.is_host);
  const pendingGuests = guests.filter(g => g.status === 'pending' && !g.is_host);
  const remainingSlots = partySize - confirmedGuests.length;

  const filteredContacts = contacts.filter(contact => {
    const matchesSearch = contact.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contact.phone?.includes(searchQuery) ||
      contact.email?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const alreadyInvited = guests.some(g => 
      g.guest_user_id === contact.id || 
      g.guest_phone === contact.phone ||
      g.guest_email === contact.email
    );
    
    return matchesSearch && !alreadyInvited;
  });

  const handleInviteContact = async (contact: Contact) => {
    if (remainingSlots <= 0) {
      Alert.alert(
        'Limite atingido',
        'O número máximo de convidados foi atingido. Deseja solicitar aumento do grupo?',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Solicitar', onPress: () => requestPartyIncrease() },
        ]
      );
      return;
    }

    setInviting(true);
    try {
      await ApiService.inviteGuestToReservation(reservationId, {
        guest_user_id: contact.isAppUser ? contact.id : undefined,
        guest_name: contact.name,
        guest_phone: contact.phone,
        guest_email: contact.email,
        invite_method: contact.isAppUser ? 'app' : (contact.phone ? 'sms' : 'email'),
      });
      
      await analytics.logEvent('guest_invited', {
        reservation_id: reservationId,
        invite_method: contact.isAppUser ? 'app' : 'external',
      });
      
      Alert.alert(t('common.success'), `Convite enviado para ${contact.name}`);
      loadData();
    } catch (error: any) {
      Alert.alert(t('common.error'), error.response?.data?.message || t('errors.generic'));
    } finally {
      setInviting(false);
    }
  };

  const handleInviteManual = async () => {
    if (!manualName.trim()) {
      Alert.alert(t('common.error'), 'Nome é obrigatório');
      return;
    }
    if (!manualPhone && !manualEmail) {
      Alert.alert(t('common.error'), 'Telefone ou email é obrigatório');
      return;
    }

    if (remainingSlots <= 0) {
      Alert.alert(
        'Limite atingido',
        'O número máximo de convidados foi atingido.',
      );
      return;
    }

    setInviting(true);
    try {
      await ApiService.inviteGuestToReservation(reservationId, {
        guest_name: manualName,
        guest_phone: manualPhone || undefined,
        guest_email: manualEmail || undefined,
        invite_method: manualPhone ? 'sms' : 'email',
      });
      
      await analytics.logEvent('guest_invited', {
        reservation_id: reservationId,
        invite_method: 'manual',
      });
      
      Alert.alert(t('common.success'), `Convite enviado para ${manualName}`);
      setManualName('');
      setManualPhone('');
      setManualEmail('');
      setShowAddManual(false);
      loadData();
    } catch (error: any) {
      Alert.alert(t('common.error'), error.response?.data?.message || t('errors.generic'));
    } finally {
      setInviting(false);
    }
  };

  const handleShareInviteLink = async () => {
    try {
      const inviteLinkRes = await ApiService.post(`/reservation-guests/reservations/${reservationId}/invite-link`);
      const inviteLink = inviteLinkRes.data?.url || inviteLinkRes.data;
      await Share.share({
        message: `Você foi convidado para uma reserva no Noowe! Clique para aceitar: ${inviteLink}`,
        title: 'Convite de Reserva',
      });
      
      await analytics.logEvent('invite_link_shared', {
        reservation_id: reservationId,
      });
    } catch (error) {
      console.error('Failed to share:', error);
    }
  };

  const handleCancelInvite = async (guestId: string) => {
    Alert.alert(
      'Cancelar convite',
      'Tem certeza que deseja cancelar este convite?',
      [
        { text: 'Não', style: 'cancel' },
        {
          text: 'Sim',
          style: 'destructive',
          onPress: async () => {
            try {
              await ApiService.removeReservationGuest(reservationId, guestId);
              Alert.alert(t('common.success'), 'Convite cancelado');
              loadData();
            } catch (error: any) {
              Alert.alert(t('common.error'), error.response?.data?.message || t('errors.generic'));
            }
          },
        },
      ]
    );
  };

  const requestPartyIncrease = async () => {
    try {
      await ApiService.patch(`/reservations/${reservationId}`, { party_size: partySize + 2 });
      Alert.alert(
        'Solicitação enviada',
        'O restaurante receberá sua solicitação de aumento do grupo.'
      );
    } catch (error: any) {
      Alert.alert(t('common.error'), error.response?.data?.message || t('errors.generic'));
    }
  };

  if (loading) {
    return (
      <ScreenContainer>
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>{t('common.loading')}</Text>
      </View>
    
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer hasKeyboard>
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={pullToRefresh.refreshing} onRefresh={() => { void pullToRefresh.onRefresh(); }} tintColor={colors.primary} colors={[colors.primary]} />}
    >
      {/* Header Summary */}
      <Card style={styles.summaryCard}>
        <Card.Content>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryNumber}>{confirmedGuests.length}</Text>
              <Text style={styles.summaryLabel}>{t('reservations.guestSummary.confirmed')}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryNumber}>{pendingGuests.length}</Text>
              <Text style={styles.summaryLabel}>{t('reservations.guestSummary.pending')}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryNumber, remainingSlots <= 0 && styles.warningText]}>
                {remainingSlots}
              </Text>
              <Text style={styles.summaryLabel}>{t('reservations.guestSummary.slots')}</Text>
            </View>
          </View>
        </Card.Content>
      </Card>

      {/* Current Guests */}
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            {t('reservations.guestsLabel', { count: guests.length })}
          </Text>

          {guests.map((guest) => (
            <View key={guest.id} style={styles.guestItem}>
              <Avatar.Text
                size={40}
                label={(guest.guest_user?.full_name || guest.guest_name || '?').substring(0, 2).toUpperCase()}
                style={[styles.avatar, { backgroundColor: STATUS_COLORS[guest.status] }]}
              />
              <View style={styles.guestInfo}>
                <View style={styles.guestNameRow}>
                  <Text variant="bodyLarge" style={styles.guestName}>
                    {guest.guest_user?.full_name || guest.guest_name}
                  </Text>
                  {guest.is_host && (
                    <Chip compact style={styles.hostChip} textStyle={{ color: colors.premiumCardForeground, fontSize: 10 }}>Host</Chip>
                  )}
                </View>
                <Text variant="bodySmall" style={styles.guestContact}>
                  {guest.guest_phone || guest.guest_email || 'App user'}
                </Text>
                <Chip
                  compact
                  style={[styles.statusChip, { backgroundColor: STATUS_COLORS[guest.status] }]}
                  textStyle={styles.statusText}
                >
                  {getGuestStatusLabel(guest.status, t)}
                </Chip>
              </View>
              {!guest.is_host && guest.status === 'pending' && (
                <IconButton
                  icon="close"
                  size={20}
                  onPress={() => handleCancelInvite(guest.id)}
                  iconColor={colors.foregroundMuted}
                  accessibilityLabel="Cancel invite"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                />
              )}
            </View>
          ))}

          {guests.length === 0 && (
            <Text style={styles.emptyText}>Nenhum convidado ainda</Text>
          )}
        </Card.Content>
      </Card>

      {/* Add Guests Section */}
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            Convidar Pessoas
          </Text>

          {/* Search Contacts */}
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            mode="outlined"
            placeholder={t('placeholders.searchContacts')}
            left={<TextInput.Icon icon="magnify" />}
            style={styles.searchInput}
            textColor={colors.foreground}
            placeholderTextColor={colors.foregroundMuted}
          />

          {/* Contact List */}
          {filteredContacts.slice(0, 5).map((contact) => (
            <TouchableOpacity
              key={contact.id}
              style={styles.contactItem}
              onPress={() => handleInviteContact(contact)}
              disabled={inviting}
              accessibilityLabel={`Invite ${contact.name}`}
            >
              <Avatar.Text
                size={40}
                label={contact.name.substring(0, 2).toUpperCase()}
                style={styles.contactAvatar}
              />
              <View style={styles.contactInfo}>
                <Text variant="bodyLarge" style={{ color: colors.foreground }}>{contact.name}</Text>
                <Text variant="bodySmall" style={styles.contactDetail}>
                  {contact.phone || contact.email}
                </Text>
              </View>
              {contact.isAppUser && (
                <Chip compact style={styles.appUserChip} textStyle={{ color: colors.primary, fontSize: 10 }}>App</Chip>
              )}
              <IconButton icon="plus" size={20} iconColor={colors.primary} />
            </TouchableOpacity>
          ))}

          <Divider style={styles.divider} />

          {/* Manual Add */}
          {!showAddManual ? (
            <Button
              mode="outlined"
              icon="account-plus"
              onPress={() => setShowAddManual(true)}
              style={styles.addButton}
              textColor={colors.primary}
            >
              Adicionar manualmente
            </Button>
          ) : (
            <View style={styles.manualForm}>
              <TextInput
                value={manualName}
                onChangeText={setManualName}
                mode="outlined"
                label={t('formLabels.nameRequired')}
                style={styles.input}
                textColor={colors.foreground}
              />
              <TextInput
                value={manualPhone}
                onChangeText={setManualPhone}
                mode="outlined"
                label={t('formLabels.phone')}
                keyboardType="phone-pad"
                style={styles.input}
                textColor={colors.foreground}
              />
              <TextInput
                value={manualEmail}
                onChangeText={setManualEmail}
                mode="outlined"
                label={t('formLabels.email')}
                keyboardType="email-address"
                autoCapitalize="none"
                style={styles.input}
                textColor={colors.foreground}
              />
              <View style={styles.manualButtons}>
                <Button
                  mode="outlined"
                  onPress={() => setShowAddManual(false)}
                  style={styles.cancelButton}
                  textColor={colors.foregroundMuted}
                >
                  Cancelar
                </Button>
                <Button
                  mode="contained"
                  onPress={handleInviteManual}
                  loading={inviting}
                  disabled={inviting}
                  style={styles.sendButton}
                >
                  Enviar Convite
                </Button>
              </View>
            </View>
          )}

          <Divider style={styles.divider} />

          {/* Share Link */}
          <Button
            mode="text"
            icon="share-variant"
            onPress={handleShareInviteLink}
            style={styles.shareButton}
            textColor={colors.primary}
          >
            Compartilhar link de convite
          </Button>
        </Card.Content>
      </Card>

      {/* Info Note */}
      <Card style={styles.noteCard}>
        <Card.Content>
          <View style={styles.noteContainer}>
            <IconButton icon="information" size={24} iconColor={colors.primary} />
            <Text variant="bodySmall" style={styles.noteText}>
              Convidados com o app Noowe receberão uma notificação.
              Outros receberão um SMS ou email com o link do convite.
            </Text>
          </View>
        </Card.Content>
      </Card>

      <Button
        mode="contained"
        onPress={() => navigation.goBack()}
        style={styles.doneButton}
        icon="check"
      >
        {t('common.done')}
      </Button>
    </ScrollView>
  
    </ScreenContainer>
  );
}
