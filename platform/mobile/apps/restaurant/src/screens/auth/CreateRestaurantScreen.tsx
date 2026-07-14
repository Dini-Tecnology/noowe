import React, { useMemo, useState } from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Text, HelperText } from 'react-native-paper';
import { LogOut } from 'lucide-react-native';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { supabaseApiAdapter } from '@okinawa/shared/services/supabase-api';
import { authService } from '@/shared/services/auth';
import Haptic from '@/shared/utils/haptics';
import { AuthScreenHeader } from '../../components/auth/AuthScreenHeader';
import { AuthTextField } from '../../components/auth/AuthTextField';
import { AUTH_BRAND } from '../../components/auth/authScreenTheme';
import {
  BrazilianAddressFields,
  type BrazilianAddressValue,
} from '../../components/forms/BrazilianAddressFields';
import { formatBrazilianPhone, validateBrazilianPhone } from '@okinawa/shared/utils/phone-validation';

interface CreateRestaurantScreenProps {
  onCreated: () => Promise<void> | void;
}

export default function CreateRestaurantScreen({ onCreated }: CreateRestaurantScreenProps) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState<BrazilianAddressValue>({
    postalCode: '',
    city: '',
    state: '',
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    const trimmedEmail = email.trim().toLowerCase();

    const hasRequiredAddress = address.postalCode.replace(/\D/g, '').length === 8
      && address.city
      && address.state
      && address.street.trim()
      && address.number.trim();

    if (!trimmedName || !trimmedPhone || !trimmedEmail || !hasRequiredAddress) {
      setError('Preencha os dados do restaurante e o endereço completo.');
      Haptic.errorNotification();
      return;
    }
    if (!validateBrazilianPhone(trimmedPhone)) {
      setError('Informe um telefone brasileiro válido com DDD.');
      Haptic.errorNotification();
      return;
    }

    setLoading(true);
    setError('');
    try {
      await supabaseApiAdapter.createMyRestaurant({
        name: trimmedName,
        phone: trimmedPhone,
        email: trimmedEmail,
        city: address.city,
        state: address.state,
        zipCode: address.postalCode,
        address: address.street.trim(),
        addressNumber: address.number.trim(),
        addressComplement: address.complement.trim(),
        neighborhood: address.neighborhood.trim(),
      });
      Haptic.successNotification();
      await onCreated();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Não foi possível criar o restaurante.';
      setError(message);
      Haptic.errorNotification();
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = () => {
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
  };

  return (
    <ScreenContainer edges={['top', 'bottom', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <AuthScreenHeader
            title="Cadastre seu restaurante"
            subtitle="Para liberar Cardápio, Equipe, Financeiro e o restante do app, precisamos vincular sua conta como dono de um estabelecimento."
          />

          <AuthTextField
            label="Nome do restaurante"
            value={name}
            onChangeText={setName}
            placeholder="Ex.: Casa Noowe"
            icon="storefront-outline"
            inputProps={{ autoCapitalize: 'words' }}
          />
          <AuthTextField
            label="Telefone"
            value={phone}
            onChangeText={(value) => setPhone(formatBrazilianPhone(value))}
            placeholder="(11) 99999-9999"
            icon="phone-outline"
            inputProps={{ keyboardType: 'phone-pad' }}
          />
          <AuthTextField
            label="E-mail do restaurante"
            value={email}
            onChangeText={setEmail}
            placeholder="contato@restaurante.com"
            icon="email-outline"
            inputProps={{
              keyboardType: 'email-address',
              autoCapitalize: 'none',
              autoCorrect: false,
            }}
          />
          <BrazilianAddressFields value={address} onChange={setAddress} disabled={loading} />

          {error ? <HelperText type="error">{error}</HelperText> : null}

          <TouchableOpacity
            style={[
              styles.primaryButton,
              { backgroundColor: colors.primary },
              loading && styles.buttonDisabled,
            ]}
            onPress={() => void handleCreate()}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="Criar restaurante e continuar"
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>Criar e continuar</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.logoutButton}
            onPress={handleSignOut}
            accessibilityRole="button"
            accessibilityLabel="Sair da conta"
          >
            <LogOut size={18} color={colors.foregroundSecondary} />
            <Text style={[styles.logoutText, { color: colors.foregroundSecondary }]}>
              Sair da conta
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const createStyles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    flex: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      flexGrow: 1,
      paddingHorizontal: 24,
      paddingTop: 40,
      paddingBottom: 32,
    },
    primaryButton: {
      borderRadius: AUTH_BRAND.borderRadius,
      paddingVertical: 16,
      alignItems: 'center',
      marginTop: 8,
      marginBottom: 20,
    },
    primaryButtonText: {
      color: '#FFFFFF',
      fontSize: 17,
      fontWeight: '700',
    },
    buttonDisabled: {
      opacity: 0.7,
    },
    logoutButton: {
      marginTop: 'auto',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 12,
    },
    logoutText: {
      fontSize: 15,
      fontWeight: '600',
    },
  });
