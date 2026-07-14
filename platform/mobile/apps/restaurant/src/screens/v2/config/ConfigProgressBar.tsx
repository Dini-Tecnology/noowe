import { View, StyleSheet } from 'react-native';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';

interface ConfigProgressBarProps {
  progress: number;
  height?: number;
  trackColor?: string;
}

export function ConfigProgressBar({ progress, height = 4, trackColor }: ConfigProgressBarProps) {
  const colors = useColors();
  const clamped = Math.max(0, Math.min(100, progress));
  const fill =
    clamped >= 100 ? colors.success : clamped >= 70 ? colors.primary : colors.warning;

  return (
    <View style={[styles.track, { height, backgroundColor: trackColor ?? colors.backgroundSecondary }]}>
      <View style={[styles.fill, { width: `${clamped}%`, backgroundColor: fill, height }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { borderRadius: 999, overflow: 'hidden', width: '100%' },
  fill: { borderRadius: 999 },
});
