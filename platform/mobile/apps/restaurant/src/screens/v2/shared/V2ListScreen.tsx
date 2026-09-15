import React, { ReactNode } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { V2Shell } from './V2Shell';

type IconComponent = any;

export interface V2ListItem {
  icon: IconComponent;
  label: string;
  subtitle?: string;
  onPress?: () => void;
}

interface V2ListScreenProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  hero?: ReactNode;
  items: V2ListItem[];
  onRefresh?: () => void | Promise<void>;
}

export function V2ListScreen({ title, subtitle, showBack, hero, items, onRefresh }: V2ListScreenProps) {
  const colors = useColors();

  return (
    <V2Shell title={title} subtitle={subtitle} showBack={showBack} onRefresh={onRefresh}>
      {hero}
      <View style={[styles.list, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {items.map((item, index) => {
          const Icon = item.icon;
          return (
            <TouchableOpacity
              key={item.label}
              onPress={item.onPress}
              style={[styles.row, index < items.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
            >
              <View style={[styles.iconBox, { backgroundColor: `${colors.primary}15` }]}>
                <Icon size={20} color={colors.primary} />
              </View>
              <View style={styles.textCol}>
                <Text style={{ fontWeight: '600', color: colors.foreground }}>{item.label}</Text>
                {item.subtitle ? <Text style={{ fontSize: 12, color: colors.foregroundSecondary }}>{item.subtitle}</Text> : null}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </V2Shell>
  );
}

const styles = StyleSheet.create({
  list: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  iconBox: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  textCol: { flex: 1 },
});
