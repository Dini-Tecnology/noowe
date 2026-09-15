import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';

export interface ConfigTabOption<T extends string> {
  id: T;
  label: string;
}

interface ConfigSegmentedTabsProps<T extends string> {
  tabs: ConfigTabOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function ConfigSegmentedTabs<T extends string>({ tabs, value, onChange }: ConfigSegmentedTabsProps<T>) {
  const colors = useColors();

  return (
    <View style={[styles.wrap, { backgroundColor: `${colors.foreground}08` }]}>
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <TouchableOpacity
            key={tab.id}
            onPress={() => onChange(tab.id)}
            style={[
              styles.tab,
              active && { backgroundColor: colors.card, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 1 },
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.label, { color: active ? colors.foreground : colors.foregroundSecondary }]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', borderRadius: 12, padding: 3, marginBottom: 14 },
  tab: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center' },
  label: { fontSize: 11, fontWeight: '700' },
});
