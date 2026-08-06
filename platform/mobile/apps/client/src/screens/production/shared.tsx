import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';

export const money = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

export function distanceKm(
  a: { latitude: number; longitude: number },
  b: { lat: number; lng: number },
): number {
  const radians = (value: number) => (value * Math.PI) / 180;
  const earth = 6371;
  const dLat = radians(b.lat - a.latitude);
  const dLng = radians(b.lng - a.longitude);
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(a.latitude)) * Math.cos(radians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return earth * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

/** Navigate on the root stack even from a screen nested inside the tab navigator. */
export const rootNavigate = (navigation: any, name: string, params?: object) =>
  (navigation.getParent?.() ?? navigation).navigate(name, params);

type StateViewProps = {
  loading?: boolean;
  error?: unknown;
  empty?: string;
  emptyIcon?: keyof typeof Ionicons.glyphMap;
  onRetry?: () => void;
};

/** Loading / error / empty placeholder, themed. Renders nothing when none apply. */
export function StateView({ loading, error, empty, emptyIcon = 'file-tray-outline', onRetry }: StateViewProps) {
  const colors = useColors();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: {
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: 48,
          paddingHorizontal: 24,
          gap: 12,
        },
        text: {
          fontSize: 14,
          color: colors.foregroundSecondary,
          textAlign: 'center',
        },
        retry: {
          marginTop: 4,
          fontSize: 14,
          fontWeight: '700',
          color: colors.primary,
        },
      }),
    [colors],
  );

  if (loading) {
    return (
      <View style={styles.wrap}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.wrap}>
        <Ionicons name="cloud-offline-outline" size={32} color={colors.foregroundMuted} />
        <Text style={styles.text}>Não foi possível carregar os dados.</Text>
        {onRetry ? (
          <TouchableOpacity onPress={onRetry} accessibilityRole="button">
            <Text style={styles.retry}>Tentar novamente</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  if (empty) {
    return (
      <View style={styles.wrap}>
        <Ionicons name={emptyIcon} size={32} color={colors.foregroundMuted} />
        <Text style={styles.text}>{empty}</Text>
      </View>
    );
  }

  return null;
}

/** Simple top bar for tab-root screens: greeting-style title + optional right action. */
export function TabHeader({
  title,
  right,
}: {
  title: string;
  right?: React.ReactNode;
}) {
  const colors = useColors();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 4,
          paddingBottom: 16,
        },
        title: {
          fontSize: 26,
          fontWeight: '700',
          color: colors.foreground,
          letterSpacing: -0.5,
        },
      }),
    [colors],
  );

  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      {right}
    </View>
  );
}

export const cardStyles = StyleSheet.create({
  hairline: {
    borderWidth: StyleSheet.hairlineWidth,
  },
});
