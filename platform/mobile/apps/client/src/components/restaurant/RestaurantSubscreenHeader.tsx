import React, { useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';

type Props = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
};

export function RestaurantSubscreenHeader({ title, subtitle, onBack }: Props) {
  const navigation = useNavigation<any>();
  const colors = useColors();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: {
          paddingHorizontal: 12,
          paddingTop: 4,
          paddingBottom: subtitle ? 8 : 12,
        },
        row: {
          minHeight: 52,
          flexDirection: 'row',
          alignItems: 'center',
        },
        backButton: {
          width: 38,
          height: 38,
          borderRadius: 19,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.backgroundTertiary,
        },
        title: {
          flex: 1,
          textAlign: 'center',
          fontSize: 18,
          fontWeight: '700',
          color: colors.foreground,
        },
        spacer: {
          width: 38,
        },
        subtitle: {
          marginTop: 4,
          marginBottom: 8,
          paddingHorizontal: 4,
          fontSize: 14,
          color: colors.foregroundSecondary,
        },
      }),
    [colors, subtitle],
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={onBack ?? (() => navigation.goBack())}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <Ionicons name="arrow-back" size={20} color={colors.foregroundSecondary} />
        </TouchableOpacity>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.spacer} />
      </View>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}
