import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { Settings } from 'lucide-react-native';
import { ConfigProgressBar } from './ConfigProgressBar';

interface ConfigHeroProps {
  restaurantName: string;
  serviceLabel: string;
  overallProgress: number;
}

export function ConfigHero({ restaurantName, serviceLabel, overallProgress }: ConfigHeroProps) {
  return (
    <View style={styles.hero}>
      <View style={styles.glow} />
      <View style={styles.row}>
        <View style={styles.iconBox}>
          <Settings size={22} color="#FF5A3D" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Central de Configuração</Text>
          <Text style={styles.sub} numberOfLines={1}>
            {restaurantName}
            {serviceLabel ? ` · ${serviceLabel}` : ''}
          </Text>
        </View>
      </View>
      <View style={styles.progressBlock}>
        <View style={styles.progressLabels}>
          <Text style={styles.progressHint}>Progresso geral</Text>
          <Text style={styles.progressValue}>{overallProgress}%</Text>
        </View>
        <ConfigProgressBar progress={overallProgress} height={8} trackColor="rgba(255,255,255,0.18)" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: 18,
    backgroundColor: '#1F2937',
    padding: 16,
    marginBottom: 12,
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,90,61,0.12)',
    right: -40,
    top: -48,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,90,61,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  sub: { color: 'rgba(255,255,255,0.65)', fontSize: 11, marginTop: 2 },
  progressBlock: { gap: 6 },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressHint: { color: 'rgba(255,255,255,0.65)', fontSize: 11 },
  progressValue: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
});
