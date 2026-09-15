import { ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import type { IconComponent } from './configTypes';

interface ConfigSectionCardProps {
  title: string;
  Icon: IconComponent;
  action?: ReactNode;
  children: ReactNode;
}

export function ConfigSectionCard({ title, Icon, action, children }: ConfigSectionCardProps) {
  const colors = useColors();

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={[styles.iconBox, { backgroundColor: `${colors.primary}15` }]}>
            <Icon size={14} color={colors.primary} />
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
        </View>
        {action}
      </View>
      <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 14 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBox: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 13, fontWeight: '700' },
  card: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
});
