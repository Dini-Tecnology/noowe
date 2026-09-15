import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { useRoute } from '@react-navigation/native';
import { Sparkles } from 'lucide-react-native';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { V2Shell } from '../shared/V2Shell';
import { CONFIG_MODULES } from './configTypes';

const COPY: Record<string, { title: string; body: string }> = {};

export default function ConfigPlaceholderScreen() {
  const colors = useColors();
  const route = useRoute();
  const routeName = route.name;
  const meta = COPY[routeName] ?? {
    title: 'Em breve',
    body: 'Este módulo da Central de Configuração será detalhado no próximo passo.',
  };
  const module = CONFIG_MODULES.find((m) => m.route === routeName);

  return (
    <V2Shell title={meta.title} subtitle={module?.desc ?? 'Módulo em preparação'} showBack>
      <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <View style={[styles.iconBox, { backgroundColor: `${colors.primary}15` }]}>
          <Sparkles size={22} color={colors.primary} />
        </View>
        <Text style={[styles.title, { color: colors.foreground }]}>{meta.title}</Text>
        <Text style={[styles.body, { color: colors.foregroundSecondary }]}>{meta.body}</Text>
      </View>
    </V2Shell>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 20,
    alignItems: 'flex-start',
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: { fontSize: 16, fontWeight: '800', marginBottom: 8 },
  body: { fontSize: 13, lineHeight: 19, marginBottom: 16 },
});
