import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { ChevronRight, Download, LogOut, Trash2, UserCog } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ConfigUserCard } from './ConfigUserCard';
import { useAccountActions } from './useAccountActions';

/**
 * Personal settings shown to roles that do not own the restaurant-wide config
 * hub (maître, chef, barman, cook, waiter). Exposes only what every staff
 * member is allowed to manage on their own account: profile, LGPD export,
 * account deletion and sign-out.
 */
export function PersonalSettingsContent() {
  const colors = useColors();
  const navigation = useNavigation<any>();
  const { handleSignOut, handleExportData, handleDeleteAccount } = useAccountActions();

  const items = [
    {
      icon: UserCog,
      label: 'Editar perfil',
      subtitle: 'Nome, telefone e foto',
      onPress: () => navigation.navigate('UserAccount'),
    },
    {
      icon: Download,
      label: 'Exportar meus dados',
      subtitle: 'Baixe uma cópia dos seus dados (LGPD)',
      onPress: () => void handleExportData(),
    },
    {
      icon: Trash2,
      label: 'Excluir minha conta',
      subtitle: 'Solicitar exclusão dos seus dados',
      onPress: handleDeleteAccount,
    },
    {
      icon: LogOut,
      label: 'Sair da conta',
      subtitle: 'Encerrar sessão neste dispositivo',
      onPress: handleSignOut,
    },
  ];

  return (
    <View style={styles.container}>
      <ConfigUserCard />

      <View style={[styles.list, { borderColor: colors.border, backgroundColor: colors.card }]}>
        {items.map((item, index) => {
          const Icon = item.icon;
          const isLast = index === items.length - 1;
          return (
            <TouchableOpacity
              key={item.label}
              onPress={item.onPress}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              style={[
                styles.row,
                !isLast && {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: colors.border,
                },
              ]}
            >
              <View style={[styles.icon, { backgroundColor: `${colors.primary}15` }]}>
                <Icon size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: colors.foreground }]}>{item.label}</Text>
                <Text style={[styles.sub, { color: colors.foregroundSecondary }]}>{item.subtitle}</Text>
              </View>
              <ChevronRight size={18} color={colors.foregroundSecondary} />
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 4 },
  list: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 14, fontWeight: '700' },
  sub: { fontSize: 11, marginTop: 2 },
});
