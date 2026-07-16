/**
 * BiometricEnrollmentScreen - Enable Biometric Authentication
 * 
 * Presented after successful registration to enable quick login.
 * Shows benefits and handles enrollment flow.
 */

import React, { useMemo, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '../../components/ScreenContainer';
import { useI18n } from '@/shared/hooks/useI18n';
import { BiometricPrompt } from '@/shared/components/auth';
import { biometricAuthService } from '@/shared/services/biometric-auth';
import { showSuccessToast, showErrorToast } from '@/shared/utils/error-handler';
import Haptic from '@/shared/utils/haptics';
import { useScreenTracking } from '@/shared/hooks/useAnalytics';

interface BiometricEnrollmentScreenProps {
  navigation: any;
  route: {
    params?: {
      enrollmentToken?: string;
      userId?: string;
    };
  };
  onComplete: () => void;
  onSkip: () => void;
}

export const BiometricEnrollmentScreen: React.FC<BiometricEnrollmentScreenProps> = ({
  navigation,
  route,
  onComplete,
  onSkip,
}) => {
  useScreenTracking('BiometricEnrollment');
  const { t } = useI18n();
  const colors = useColors();
  
  const enrollmentToken = route.params?.enrollmentToken;
  const userId = route.params?.userId;
  
  const [loading, setLoading] = useState(false);

  const styles = useMemo(() => createStyles(colors), [colors]);

  const handleEnable = async () => {
    if (!enrollmentToken || !userId) {
      showErrorToast(new Error('Enrollment session expired'));
      onSkip();
      return;
    }

    setLoading(true);

    try {
      // Use the simpler enable method which handles biometric verification internally
      const result = await biometricAuthService.enable(userId);

      if (result.success) {
        Haptic.successNotification();
        showSuccessToast(t('auth.biometricEnabled') || 'Biometric login enabled!');
        onComplete();
      } else {
        Haptic.errorNotification();
        showErrorToast(new Error(result.error || t('auth.biometricEnableFailed')));
      }
    } catch (error: any) {
      Haptic.errorNotification();
      showErrorToast(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    Haptic.lightImpact();
    onSkip();
  };

  return (
    <ScreenContainer>
      <BiometricPrompt
        onEnable={handleEnable}
        onSkip={handleSkip}
        loading={loading}
      />
    </ScreenContainer>
  );
};

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
});

export default BiometricEnrollmentScreen;
