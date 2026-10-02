import React, { useMemo, useRef, useState } from 'react';
import * as Crypto from 'expo-crypto';
import {
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  View,
} from 'react-native';
import { Text, HelperText } from 'react-native-paper';
import { Crown, LogOut, Utensils, Zap } from 'lucide-react-native';
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
import {
  SERVICE_TYPE_CONFIGS,
  type ServiceType,
} from '@okinawa/shared/config/service-types';
import { userErrorMessage } from '@okinawa/shared/utils/user-error-message';

const SERVICE_TYPE_OPTIONS = [
  { type: 'fine_dining' as const, Icon: Crown },
  { type: 'casual_dining' as const, Icon: Utensils },
  { type: 'quick_service' as const, Icon: Zap },
];

interface CreateRestaurantScreenProps {
  /** Recebe o id do restaurante criado (o app o torna o restaurante em uso). */
  onCreated: (restaurantId: string | null) => Promise<void> | void;
  /**
   * Quem já tem restaurante cadastra outro de dentro do app: em vez de "Sair da conta",
   * a tela oferece "Voltar".
   */
  onCancel?: () => void;
}

export default function CreateRestaurantScreen({ onCreated, onCancel }: CreateRestaurantScreenProps) {
  const colors = useColors();
  // Uma chave por abertura da tela: tocar duas vezes ou tentar de novo devolve o mesmo restaurante.
  const requestId = useRef(Crypto.randomUUID());
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [serviceType, setServiceType] = useState<ServiceType | null>(null);
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

    if (!trimmedName || !trimmedPhone || !trimmedEmail || !hasRequiredAddress || !serviceType) {
      setError(serviceType
        ? 'Preencha os dados do restaurante e o endereço completo.'
        : 'Selecione o tipo de serviço do restaurante.');
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
      const created = await supabaseApiAdapter.createMyRestaurant({
        requestId: requestId.current,
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
        serviceType,
      });
      Haptic.successNotification();
      const createdId = created && typeof created === 'object' && 'id' in created ? String((created as { id: unknown }).id) : null;
      await onCreated(createdId);
    } catch (err) {
      const message = userErrorMessage(err, 'Não foi possível criar o restaurante.');
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
            title={onCancel ? 'Novo restaurante' : 'Cadastre seu restaurante'}
            subtitle={onCancel
              ? 'Você será dono do novo restaurante e poderá alternar entre eles quando quiser.'
              : 'Para liberar Cardápio, Equipe, Financeiro e o restante do app, precisamos vincular sua conta como dono de um estabelecimento.'}
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

          <View style={styles.serviceSection}>
            <Text style={[styles.serviceTitle, { color: colors.foreground }]}>Tipo de serviço *</Text>
            <Text style={[styles.serviceHint, { color: colors.foregroundSecondary }]}>Essa escolha define a jornada do cliente e as ferramentas disponíveis para a equipe.</Text>
            <View style={styles.serviceOptions}>
              {SERVICE_TYPE_OPTIONS.map(({ type, Icon }) => {
                const config = SERVICE_TYPE_CONFIGS[type];
                const selected = serviceType === type;
                return (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.serviceCard,
                      {
                        borderColor: selected ? colors.primary : colors.border,
                        backgroundColor: selected ? `${colors.primary}0D` : colors.card,
                      },
                    ]}
                    onPress={() => {
                      setServiceType(type);
                      setError('');
                    }}
                    disabled={loading}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={`${config.name}: ${config.description}`}
                  >
                    <View style={[styles.serviceIcon, { backgroundColor: `${colors.primary}18` }]}>
                      <Icon size={20} color={colors.primary} />
                    </View>
                    <View style={styles.serviceCopy}>
                      <Text style={[styles.serviceName, { color: colors.foreground }]}>{config.name}</Text>
                      <Text style={[styles.serviceDescription, { color: colors.foregroundSecondary }]}>{config.description}</Text>
                    </View>
                    <View style={[styles.radio, { borderColor: selected ? colors.primary : colors.border }]}>
                      {selected ? <View style={[styles.radioDot, { backgroundColor: colors.primary }]} /> : null}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

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
            onPress={onCancel ?? handleSignOut}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel={onCancel ? 'Voltar sem cadastrar' : 'Sair da conta'}
          >
            {onCancel ? null : <LogOut size={18} color={colors.foregroundSecondary} />}
            <Text style={[styles.logoutText, { color: colors.foregroundSecondary }]}>
              {onCancel ? 'Voltar' : 'Sair da conta'}
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
    serviceSection: {
      marginBottom: 18,
    },
    serviceTitle: {
      fontSize: 15,
      fontWeight: '700',
      marginBottom: 4,
    },
    serviceHint: {
      fontSize: 12,
      lineHeight: 17,
      marginBottom: 10,
    },
    serviceOptions: {
      gap: 8,
    },
    serviceCard: {
      minHeight: 76,
      borderWidth: 1.5,
      borderRadius: 16,
      padding: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    serviceIcon: {
      width: 42,
      height: 42,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
    },
    serviceCopy: {
      flex: 1,
    },
    serviceName: {
      fontSize: 14,
      fontWeight: '800',
      marginBottom: 2,
    },
    serviceDescription: {
      fontSize: 11,
      lineHeight: 15,
    },
    radio: {
      width: 20,
      height: 20,
      borderWidth: 2,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
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
