/**
 * BiometricPrompt Component
 * 
 * Screen component for biometric enrollment after registration.
 * Explains benefits and offers opt-in/skip options.
 */

import React, { useMemo } from 'react';
import { View, StyleSheet, Image, Platform } from 'react-native';
import { Text, Button } from 'react-native-paper';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { useBiometricAuth, BiometricType } from '@/shared/hooks/useBiometricAuth';
import Haptic from '@/shared/utils/haptics';

interface BiometricPromptProps {
  onEnable: () => void;
  onSkip: () => void;
  loading?: boolean;
}

export const BiometricPrompt: React.FC<BiometricPromptProps> = ({
  onEnable,
  onSkip,
  loading = false,
}) => {
  const colors = useColors();
  const { biometricType, getBiometricDisplayName } = useBiometricAuth();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const getIllustration = () => {
    switch (biometricType) {
      case 'FaceID':
        return { icon: '🔐', title: 'Face ID' };
      case 'TouchID':
      case 'Fingerprint':
        return { icon: '👆', title: 'Touch ID' };
      default:
        return { icon: '🔐', title: 'a biometria' };
    }
  };

  const illustration = getIllustration();

  const handleEnable = () => {
    Haptic.mediumImpact();
    onEnable();
  };

  const handleSkip = () => {
    Haptic.lightImpact();
    onSkip();
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.illustrationContainer}>
          <Text style={styles.illustration}>{illustration.icon}</Text>
        </View>

        <Text style={styles.title}>
          Ativar {illustration.title}
        </Text>

        <Text style={styles.subtitle}>
          Entre mais rápido e com mais segurança, só com um olhar ou um toque.
        </Text>

        <View style={styles.benefitsList}>
          <BenefitItem
            icon="⚡"
            text="Login em menos de 1 segundo"
            colors={colors}
          />
          <BenefitItem
            icon="🔒"
            text="Mais seguro que senhas"
            colors={colors}
          />
          <BenefitItem
            icon="✨"
            text="Sem senhas para lembrar"
            colors={colors}
          />
        </View>
      </View>

      <View style={styles.actions}>
        <Button
          mode="contained"
          onPress={handleEnable}
          loading={loading}
          disabled={loading}
          style={styles.primaryButton}
          contentStyle={styles.buttonContent}
          icon={biometricType === 'FaceID' ? 'face-recognition' : 'fingerprint'}
        >
          Ativar {getBiometricDisplayName()}
        </Button>

        <Button
          mode="text"
          onPress={handleSkip}
          disabled={loading}
          style={styles.secondaryButton}
          textColor={colors.mutedForeground}
        >
          Agora não
        </Button>
      </View>
    </View>
  );
};

const BenefitItem: React.FC<{ icon: string; text: string; colors: any }> = ({
  icon,
  text,
  colors,
}) => (
  <View style={benefitStyles.container}>
    <Text style={benefitStyles.icon}>{icon}</Text>
    <Text style={[benefitStyles.text, { color: colors.foreground }]}>{text}</Text>
  </View>
);

const benefitStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  icon: {
    fontSize: 20,
    marginRight: 12,
  },
  text: {
    fontSize: 16,
  },
});

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 24,
    justifyContent: 'space-between',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  illustrationContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  illustration: {
    fontSize: 56,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.foreground,
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: colors.mutedForeground,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
    paddingHorizontal: 16,
  },
  benefitsList: {
    width: '100%',
    paddingHorizontal: 24,
  },
  actions: {
    paddingBottom: 24,
  },
  primaryButton: {
    marginBottom: 12,
    borderRadius: 12,
  },
  buttonContent: {
    height: 56,
  },
  secondaryButton: {
    marginTop: 8,
  },
});

export default BiometricPrompt;
