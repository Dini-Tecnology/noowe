import React, { useMemo, useCallback } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';

/**
 * Aba Carteira. Saldo/cashback/pontos e transações ainda não têm suporte no
 * backend (tabelas wallets/wallet_transactions/payment_methods existem no
 * schema mas sem RLS/grants nem RPC customer_* — ver client_production_backend
 * migration para o padrão a seguir quando essa feature for implementada).
 */
export default function WalletScreen() {
  const navigation = useNavigation<any>();
  const colors = useColors();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
        },
        scrollContent: {
          flexGrow: 1,
          paddingBottom: 88,
        },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: 24,
          gap: 8,
        },
        backRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          minWidth: 72,
        },
        backText: {
          fontSize: 15,
          color: colors.foregroundSecondary,
        },
        headerTitle: {
          flex: 1,
          textAlign: 'center',
          fontSize: 18,
          fontWeight: '700',
          color: colors.foreground,
        },
        headerSpacer: {
          minWidth: 72,
        },
        heroCard: {
          marginHorizontal: 16,
          marginBottom: 24,
          borderRadius: 20,
          padding: 24,
          alignItems: 'center',
        },
        heroIcon: {
          width: 64,
          height: 64,
          borderRadius: 32,
          backgroundColor: 'rgba(255,255,255,0.2)',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 16,
        },
        heroTitle: {
          color: '#FFFFFF',
          fontSize: 20,
          fontWeight: '700',
          marginBottom: 8,
          textAlign: 'center',
        },
        heroSubtitle: {
          color: 'rgba(255,255,255,0.85)',
          fontSize: 14,
          textAlign: 'center',
          lineHeight: 20,
        },
        infoCard: {
          marginHorizontal: 16,
          padding: 16,
          borderRadius: 16,
          backgroundColor: colors.card,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          flexDirection: 'row',
          gap: 12,
        },
        infoText: {
          flex: 1,
          fontSize: 13,
          lineHeight: 19,
          color: colors.foregroundSecondary,
        },
      }),
    [colors],
  );

  const goProfile = useCallback(() => {
    navigation.navigate('Profile');
  }, [navigation]);

  return (
    <ScreenContainer edges={['top']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backRow}
            onPress={goProfile}
            accessibilityRole="button"
            accessibilityLabel="Voltar ao perfil"
          >
            <Ionicons name="arrow-back" size={20} color={colors.foregroundSecondary} />
            <Text style={styles.backText}>Perfil</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Minha Carteira</Text>
          <View style={styles.headerSpacer} />
        </View>

        <LinearGradient
          colors={[colors.primary, '#F97316']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <View style={styles.heroIcon}>
            <Ionicons name="wallet-outline" size={30} color="#FFFFFF" />
          </View>
          <Text style={styles.heroTitle}>Carteira em breve</Text>
          <Text style={styles.heroSubtitle}>
            Saldo, cashback, pontos e métodos de pagamento estarão disponíveis aqui assim que a
            carteira digital for lançada.
          </Text>
        </LinearGradient>

        <View style={styles.infoCard}>
          <Ionicons name="information-circle-outline" size={20} color={colors.foregroundMuted} />
          <Text style={styles.infoText}>
            Enquanto isso, você pode pagar suas comandas diretamente na tela de pagamento com PIX,
            cartão ou outros métodos disponíveis no restaurante.
          </Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
