import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { ChevronRight, CheckCircle2, CircleDot, AlertTriangle } from 'lucide-react-native';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ConfigProgressBar } from './ConfigProgressBar';
import type { ConfigModuleStatus, IconComponent } from './configTypes';

interface ConfigModuleCardProps {
  label: string;
  desc: string;
  progress: number;
  status: ConfigModuleStatus;
  Icon: IconComponent;
  iconColor: string;
  onPress: () => void;
}

const STATUS_ICON = {
  complete: CheckCircle2,
  configured: CircleDot,
  'needs-attention': AlertTriangle,
} as const;

export function ConfigModuleCard({
  label,
  desc,
  progress,
  status,
  Icon,
  iconColor,
  onPress,
}: ConfigModuleCardProps) {
  const colors = useColors();
  const StatusIcon = STATUS_ICON[status];
  const statusColor =
    status === 'complete' ? colors.success : status === 'configured' ? colors.primary : colors.warning;

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}
      activeOpacity={0.85}
    >
      <View style={[styles.iconBox, { backgroundColor: colors.backgroundSecondary }]}>
        <Icon size={20} color={iconColor} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.titleRow}>
          <Text style={[styles.label, { color: colors.foreground }]} numberOfLines={1}>
            {label}
          </Text>
          <StatusIcon size={14} color={statusColor} />
        </View>
        <Text style={[styles.desc, { color: colors.foregroundSecondary }]} numberOfLines={1}>
          {desc}
        </Text>
        <View style={{ marginTop: 8 }}>
          <ConfigProgressBar progress={progress} />
        </View>
      </View>
      <ChevronRight size={16} color={colors.foregroundSecondary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  label: { fontSize: 13, fontWeight: '700', flexShrink: 1 },
  desc: { fontSize: 11 },
});
