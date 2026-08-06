import React, { useMemo } from 'react';
import { Linking, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';

const FAQ = [
  { q: 'Como faço um pedido?', a: 'Escolha o restaurante, leia o QR da mesa, adicione itens ao carrinho e envie o pedido.' },
  { q: 'Como acompanho meu pedido?', a: 'A aba Pedidos atualiza o status em tempo real, direto da cozinha.' },
  { q: 'Como cancelo um pedido?', a: 'Enquanto o pedido está como "Recebido" ou "Confirmado", você pode cancelar na tela de detalhes do pedido.' },
  { q: 'Como reservo uma mesa?', a: 'No perfil do restaurante, toque em "Reservar" e escolha data, horário e número de convidados.' },
];

export default function SupportScreen() {
  const colors = useColors();
  const phone = process.env.EXPO_PUBLIC_SUPPORT_WHATSAPP;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        scroll: { flex: 1, backgroundColor: colors.background },
        content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32, gap: 12 },
        title: { fontSize: 26, fontWeight: '700', color: colors.foreground, marginBottom: 4 },
        card: { padding: 16, borderRadius: 16, backgroundColor: colors.card, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, gap: 6 },
        question: { fontSize: 15, fontWeight: '700', color: colors.foreground },
        answer: { fontSize: 13, color: colors.foregroundSecondary, lineHeight: 19 },
        whatsappCard: {
          flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 16,
          backgroundColor: '#DCFCE7', marginTop: 8,
        },
        whatsappText: { flex: 1, fontSize: 14, fontWeight: '700', color: '#166534' },
        note: { fontSize: 12, color: colors.foregroundMuted, textAlign: 'center' },
      }),
    [colors],
  );

  return (
    <ScreenContainer edges={['top']}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Ajuda</Text>

        {FAQ.map((item) => (
          <View key={item.q} style={styles.card}>
            <Text style={styles.question}>{item.q}</Text>
            <Text style={styles.answer}>{item.a}</Text>
          </View>
        ))}

        {phone ? (
          <TouchableOpacity
            style={styles.whatsappCard}
            onPress={() => Linking.openURL(`https://wa.me/${phone.replace(/\D/g, '')}`)}
            accessibilityRole="button"
          >
            <Ionicons name="logo-whatsapp" size={26} color="#166534" />
            <Text style={styles.whatsappText}>Falar pelo WhatsApp</Text>
            <Ionicons name="chevron-forward" size={20} color="#166534" />
          </TouchableOpacity>
        ) : (
          <Text style={styles.note}>Canal de WhatsApp ainda não configurado para este ambiente.</Text>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
