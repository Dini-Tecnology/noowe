import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { Zap, X } from 'lucide-react-native';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';

interface ConfigTipCardProps {
  onDismiss: () => void;
}

export function ConfigTipCard({ onDismiss }: ConfigTipCardProps) {
  const colors = useColors();

  return (
    <View style={[styles.card, { borderColor: `${colors.primary}33`, backgroundColor: `${colors.primary}0D` }]}>
      <View style={[styles.iconBox, { backgroundColor: `${colors.primary}1A` }]}>
        <Zap size={16} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: colors.foreground }]}>Dica: Configure na ordem</Text>
        <Text style={[styles.body, { color: colors.foregroundSecondary }]}>
          Comece pelo Perfil → Tipos de Serviço → Experiência. A plataforma vai sugerir configurações inteligentes com
          base nas suas escolhas.
        </Text>
      </View>
      <TouchableOpacity onPress={onDismiss} hitSlop={10} accessibilityLabel="Dispensar dica">
        <X size={14} color={colors.foregroundSecondary} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  title: { fontSize: 12, fontWeight: '700' },
  body: { fontSize: 11, marginTop: 3, lineHeight: 15 },
});
