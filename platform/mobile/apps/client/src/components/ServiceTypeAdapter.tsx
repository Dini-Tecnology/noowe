import React, { ReactNode, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useServiceType, ServiceType } from '../contexts/ServiceTypeContext';
import { useConditionalFeature } from '../hooks/useServiceTypeFeatures';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { colorPalette } from '@okinawa/shared/theme/colors';
import { typography } from '@okinawa/shared/theme/typography';
import { spacing } from '@okinawa/shared/theme/spacing';

interface ConditionalFeatureProps {
  feature:
    | 'reservations'
    | 'virtualQueue'
    | 'tableManagement'
    | 'menuPersonalization'
    | 'callWaiter'
    | 'splitPayment'
    | 'guestInvitations'
    | 'aiPairing'
    | 'loyalty';
  children: ReactNode;
  fallback?: ReactNode;
}

// Conditionally render children based on feature availability
export const ConditionalFeature: React.FC<ConditionalFeatureProps> = ({
  feature,
  children,
  fallback = null,
}) => {
  const isEnabled = useConditionalFeature(feature);
  return <>{isEnabled ? children : fallback}</>;
};

interface ServiceTypeGateProps {
  allowedTypes: ServiceType[];
  children: ReactNode;
  fallback?: ReactNode;
}

// Only render children for specific service types
export const ServiceTypeGate: React.FC<ServiceTypeGateProps> = ({
  allowedTypes,
  children,
  fallback = null,
}) => {
  const { currentServiceType } = useServiceType();
  
  if (!currentServiceType || !allowedTypes.includes(currentServiceType)) {
    return <>{fallback}</>;
  }
  
  return <>{children}</>;
};

interface ServiceTypeSwitchProps {
  cases: Partial<Record<ServiceType, ReactNode>>;
  default?: ReactNode;
}

// Switch between different content based on service type
export const ServiceTypeSwitch: React.FC<ServiceTypeSwitchProps> = ({
  cases,
  default: defaultCase = null,
}) => {
  const { currentServiceType } = useServiceType();
  
  if (!currentServiceType) {
    return <>{defaultCase}</>;
  }
  
  const content = cases[currentServiceType];
  return <>{content ?? defaultCase}</>;
};

interface FeatureUnavailableMessageProps {
  feature: string;
  message?: string;
}

// Display message when a feature is not available for current service type
export const FeatureUnavailableMessage: React.FC<FeatureUnavailableMessageProps> = ({
  feature,
  message,
}) => {
  const { config } = useServiceType();
  const colors = useColors();

  return (
    <View style={[staticStyles.unavailableContainer, { backgroundColor: colors.backgroundSecondary }]}>
      <Text style={[staticStyles.unavailableTitle, { color: colorPalette.neutral[700] }]}>
        {feature} não disponível
      </Text>
      <Text style={[staticStyles.unavailableText, { color: colorPalette.neutral[500] }]}>
        {message ?? `Esta funcionalidade não está disponível para ${config?.name ?? 'este tipo de estabelecimento'}.`}
      </Text>
    </View>
  );
};

interface ServiceTypeBadgeProps {
  showIcon?: boolean;
  size?: 'small' | 'medium' | 'large';
}

// Display current service type as a badge
export const ServiceTypeBadge: React.FC<ServiceTypeBadgeProps> = ({
  showIcon = true,
  size = 'medium',
}) => {
  const { config } = useServiceType();
  const colors = useColors();
  const dynamicStyles = useMemo(() => createBadgeStyles(colors), [colors]);

  if (!config) return null;

  const sizeStyles = {
    small: dynamicStyles.badgeSmall,
    medium: dynamicStyles.badgeMedium,
    large: dynamicStyles.badgeLarge,
  };

  const textStyles = {
    small: dynamicStyles.badgeTextSmall,
    medium: dynamicStyles.badgeTextMedium,
    large: dynamicStyles.badgeTextLarge,
  };

  return (
    <View style={[dynamicStyles.badge, sizeStyles[size]]}>
      <Text style={textStyles[size]}>{config.name}</Text>
    </View>
  );
};

const staticStyles = StyleSheet.create({
  unavailableContainer: {
    padding: spacing.lg,
    borderRadius: 16,
    alignItems: 'center',
  },
  unavailableTitle: {
    ...typography.h4,
    marginBottom: spacing.xs,
  },
  unavailableText: {
    ...typography.bodyMedium,
    textAlign: 'center',
  },
  badgeSmall: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  badgeMedium: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  badgeLarge: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
});

const createBadgeStyles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    badge: {
      backgroundColor: colorPalette.primary[600] + '20',
      borderRadius: 8,
      alignSelf: 'flex-start',
    },
    badgeSmall: {
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
    },
    badgeMedium: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    badgeLarge: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    badgeTextSmall: {
      ...typography.bodySmall,
      color: colorPalette.primary[600],
      fontWeight: '600',
    },
    badgeTextMedium: {
      ...typography.bodyMedium,
      color: colorPalette.primary[600],
      fontWeight: '600',
    },
    badgeTextLarge: {
      ...typography.bodyLarge,
      color: colorPalette.primary[600],
      fontWeight: '600',
    },
  });
