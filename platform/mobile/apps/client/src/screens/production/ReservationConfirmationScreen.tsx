import React, { useMemo } from 'react';
import { Alert, ScrollView, Share, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useMutation, useQuery } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import customerBackend, { type CustomerReservation } from '../../services/customer-backend';
import { rootNavigate } from './shared';

export default function ReservationConfirmationScreen({ route, navigation }: any) {
  const colors = useColors();
  const reservation = route.params?.reservation as CustomerReservation;
  const suppliedInviteUrl = route.params?.inviteUrl as string | undefined;
  const profile = useQuery({ queryKey: ['profile'], queryFn: () => customerBackend.getProfile() });
  const guests = useQuery({ queryKey: ['reservation-guests', reservation.id], queryFn: () => customerBackend.listReservationGuests(reservation.id) });
  const inviteLink = useQuery({
    queryKey: ['reservation-invite', reservation.id],
    queryFn: () => customerBackend.createReservationInvite(reservation.id),
    initialData: suppliedInviteUrl,
  });
  const invite = useMutation({
    mutationFn: () => inviteLink.data ? Promise.resolve(inviteLink.data) : customerBackend.createReservationInvite(reservation.id),
    onSuccess: (url) => Share.share({ message: `Participe da minha reserva na Noowe: ${url}`, url }),
    onError: (error: Error) => Alert.alert('Não foi possível compartilhar', error.message),
  });
  const date = new Date(reservation.reservationTime);
  const inviteUrl = inviteLink.data;

  const styles = useMemo(() => StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { paddingHorizontal: 19, paddingTop: 22, paddingBottom: 36 },
    success: { width: 64, height: 64, borderRadius: 32, alignSelf: 'center', backgroundColor: '#EAF8F1', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
    title: { color: colors.foreground, fontSize: 22, fontWeight: '800', textAlign: 'center', marginBottom: 9 },
    subtitle: { color: colors.foregroundSecondary, fontSize: 14, textAlign: 'center', lineHeight: 22 },
    codeCard: { marginTop: 18, marginBottom: 20, borderRadius: 17, paddingVertical: 16, backgroundColor: colors.card, alignItems: 'center' },
    codeLabel: { color: colors.foregroundSecondary, fontSize: 12, marginBottom: 6 },
    code: { color: colors.foreground, fontSize: 25, fontWeight: '900', letterSpacing: 2 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
    sectionTitle: { flex: 1, color: colors.foreground, fontSize: 15, fontWeight: '800', marginLeft: 7 },
    inviteLabel: { color: colors.primary, fontSize: 12, fontWeight: '700' },
    guest: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingHorizontal: 13, marginBottom: 8 },
    avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#2CB67D', alignItems: 'center', justifyContent: 'center' },
    avatarPending: { backgroundColor: '#F5A623' },
    initial: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
    guestBody: { flex: 1 },
    guestName: { color: colors.foreground, fontSize: 14, fontWeight: '700' },
    guestStatus: { color: colors.foregroundSecondary, fontSize: 11, marginTop: 2 },
    check: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#EAF8F1', alignItems: 'center', justifyContent: 'center' },
    shareCard: { marginTop: 10, minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 17, borderWidth: 1, borderColor: '#FFD2C6', backgroundColor: '#FFF9F7' },
    shareBody: { flex: 1 },
    shareTitle: { color: colors.foreground, fontSize: 14, fontWeight: '700', marginBottom: 3 },
    link: { color: colors.foregroundSecondary, fontSize: 11 },
    shareIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#FFF0EA', alignItems: 'center', justifyContent: 'center' },
    menu: { height: 48, borderRadius: 15, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
    menuText: { color: colors.primaryForeground, fontSize: 14, fontWeight: '800' },
    done: { height: 46, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
    doneText: { color: colors.foregroundSecondary, fontSize: 13, fontWeight: '700' },
  }), [colors]);

  const guestRows = guests.data ?? [];
  return (
    <ScreenContainer edges={['top', 'bottom']}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.success}><Ionicons name="checkmark" size={34} color="#19A66F" /></View>
        <Text style={styles.title}>Reserva Confirmada!</Text>
        <Text style={styles.subtitle}>{reservation.restaurantName} · {date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} às {date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}{'\n'}{reservation.partySize} {reservation.partySize === 1 ? 'pessoa' : 'pessoas'} · Reserva confirmada</Text>

        <View style={styles.codeCard}><Text style={styles.codeLabel}>Código de confirmação</Text><Text style={styles.code}>{reservation.confirmationCode}</Text></View>

        <View style={styles.sectionHeader}>
          <Ionicons name="people-outline" size={18} color={colors.primary} />
          <Text style={styles.sectionTitle}>Convidados</Text>
          <TouchableOpacity onPress={() => invite.mutate()} accessibilityRole="button"><Text style={styles.inviteLabel}>Convidar</Text></TouchableOpacity>
        </View>

        <View style={styles.guest}>
          <View style={styles.avatar}><Text style={styles.initial}>{(profile.data?.fullName || 'V').charAt(0).toUpperCase()}</Text></View>
          <View style={styles.guestBody}><Text style={styles.guestName}>Você</Text><Text style={styles.guestStatus}>Anfitrião · Confirmado</Text></View>
          <View style={styles.check}><Ionicons name="checkmark" size={18} color="#19A66F" /></View>
        </View>
        {guestRows.filter((guest) => !guest.isHost).map((guest) => (
          <View key={guest.id} style={styles.guest}>
            <View style={[styles.avatar, guest.status !== 'confirmed' && styles.avatarPending]}><Text style={styles.initial}>{guest.name.charAt(0).toUpperCase()}</Text></View>
            <View style={styles.guestBody}><Text style={styles.guestName}>{guest.name}</Text><Text style={styles.guestStatus}>{guest.status === 'confirmed' ? 'Confirmado' : 'Pendente'}</Text></View>
            <View style={styles.check}><Ionicons name={guest.status === 'confirmed' ? 'checkmark' : 'paper-plane-outline'} size={17} color={guest.status === 'confirmed' ? '#19A66F' : colors.primary} /></View>
          </View>
        ))}

        <TouchableOpacity style={styles.shareCard} onPress={() => invite.mutate()} activeOpacity={0.84} accessibilityRole="button">
          <Ionicons name="share-social-outline" size={21} color={colors.primary} />
          <View style={styles.shareBody}><Text style={styles.shareTitle}>Compartilhar reserva</Text><Text style={styles.link} numberOfLines={1}>{inviteUrl ? inviteUrl.replace(/^https?:\/\//, '') : 'Gerando link de convite...'}</Text></View>
          <View style={styles.shareIcon}><Ionicons name="share-outline" size={19} color={colors.primary} /></View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.menu} onPress={() => rootNavigate(navigation, 'Menu', { restaurantId: reservation.restaurantId })} accessibilityRole="button"><Text style={styles.menuText}>Ver Cardápio</Text></TouchableOpacity>
        <TouchableOpacity style={styles.done} onPress={() => navigation.navigate('Reservations')} accessibilityRole="button"><Text style={styles.doneText}>Voltar às reservas</Text></TouchableOpacity>
      </ScrollView>
    </ScreenContainer>
  );
}
