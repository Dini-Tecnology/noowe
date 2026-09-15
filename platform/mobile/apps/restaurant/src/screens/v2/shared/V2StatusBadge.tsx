import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { V2_TONE, V2Tone } from './v2Theme';

interface V2StatusBadgeProps {
  label: string;
  tone: V2Tone;
}

export function V2StatusBadge({ label, tone }: V2StatusBadgeProps) {
  const colors = V2_TONE[tone] ?? V2_TONE.info;

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
  },
});
