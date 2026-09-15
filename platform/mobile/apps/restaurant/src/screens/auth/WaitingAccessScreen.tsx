import React, { useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Text } from 'react-native-paper';
import { Clock3, LogOut, RefreshCw } from 'lucide-react-native';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { authService } from '@/shared/services/auth';
import Haptic from '@/shared/utils/haptics';
import { showErrorToast, showSuccessToast } from '@/shared/utils/error-handler';
import { AuthScreenHeader } from '../../components/auth/AuthScreenHeader';
import { AUTH_BRAND } from '../../components/auth/authScreenTheme';

interface WaitingAccessScreenProps {
  onRefresh: () => Promise<boolean>;
  onChangeRole: () => Promise<void> | void;
}

export default function WaitingAccessScreen({
  onRefresh,
  onChangeRole,
}: WaitingAccessScreenProps) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [refreshing, setRefreshing] = useState(false);
  const [changingRole, setChangingRole] = useState(false);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      Haptic.lightImpact();
      const linked = await onRefresh();
      if (!linked) {
        Haptic.selectionChanged();
        showErrorToast('Ainda sem vínculo. Peça ao dono do restaurante para vincular sua conta.');
      } else {
        Haptic.successNotification();
        showSuccessToast('Acesso liberado!');
      }
    } finally {
      setRefreshing(false);
    }
  };

  const handleChangeRole = async () => {
    if (changingRole) return;
    setChangingRole(true);
    try {
      await onChangeRole();
    } finally {
      setChangingRole(false);
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
      <View style={styles.container}>
        <AuthScreenHeader
          title="Aguardando acesso"
          subtitle="Sua conta foi criada, mas ainda não está vinculada a um restaurante."
        />

        <View style={[styles.card, { borderColor: AUTH_BRAND.inputBorder, backgroundColor: colors.card ?? colors.background }]}>
          <View style={[styles.iconWrap, { backgroundColor: `${colors.primary}14` }]}>
            <Clock3 size={28} color={colors.primary} />
          </View>
          <Text style={[styles.message, { color: colors.foreground }]}>
            Para utilizar o aplicativo, será necessário que o proprietário do restaurante vincule sua conta ao estabelecimento.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: colors.primary }, refreshing && styles.buttonDisabled]}
          onPress={() => void handleRefresh()}
          disabled={refreshing}
          accessibilityRole="button"
          accessibilityLabel="Verificar acesso"
        >
          {refreshing ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <View style={styles.buttonRow}>
              <RefreshCw size={18} color="#FFFFFF" />
              <Text style={styles.primaryButtonText}>Já fui vinculado — verificar</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => void handleChangeRole()}
          disabled={changingRole}
          accessibilityRole="button"
          accessibilityLabel="Escolher outro papel"
        >
          <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>
            Escolher outro papel
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleSignOut}
          accessibilityRole="button"
          accessibilityLabel="Sair da conta"
        >
          <LogOut size={18} color={colors.foregroundSecondary} />
          <Text style={[styles.logoutText, { color: colors.foregroundSecondary }]}>Sair da conta</Text>
        </TouchableOpacity>
      </View>
    </ScreenContainer>
  );
}

const createStyles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      paddingHorizontal: 24,
      paddingTop: 48,
      paddingBottom: 32,
    },
    card: {
      borderWidth: 1,
      borderRadius: AUTH_BRAND.borderRadius,
      padding: 20,
      alignItems: 'center',
      gap: 16,
      marginBottom: 28,
    },
    iconWrap: {
      width: 56,
      height: 56,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    message: {
      fontSize: 16,
      lineHeight: 24,
      textAlign: 'center',
      fontWeight: '500',
    },
    primaryButton: {
      borderRadius: AUTH_BRAND.borderRadius,
      paddingVertical: 16,
      alignItems: 'center',
      marginBottom: 12,
    },
    buttonRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    primaryButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '700',
    },
    buttonDisabled: {
      opacity: 0.7,
    },
    secondaryButton: {
      alignItems: 'center',
      paddingVertical: 14,
      marginBottom: 8,
    },
    secondaryButtonText: {
      fontSize: 15,
      fontWeight: '600',
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
