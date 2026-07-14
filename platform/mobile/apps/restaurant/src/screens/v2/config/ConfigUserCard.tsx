import { useCallback, useEffect, useState } from 'react';
import { Image, TouchableOpacity, View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { ChevronRight, User } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { authService } from '@/shared/services/auth';
import { ROLE_LABEL } from './configTypes';
import { useRestaurantRole } from '../../../contexts/RestaurantRoleContext';

export function ConfigUserCard() {
  const colors = useColors();
  const navigation = useNavigation<any>();
  const { role } = useRestaurantRole();
  const [name, setName] = useState('Carregando…');
  const [email, setEmail] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const user = await authService.getCurrentUser();
      if (!user) return;
      setName(user.full_name?.trim() || 'Seu perfil');
      setEmail(user.email ?? '');
      setAvatarUrl(user.avatar_url ?? null);
    } catch {
      setName('Seu perfil');
    }
  }, []);

  useEffect(() => {
    void load();
    const unsubscribe = navigation.addListener?.('focus', () => {
      void load();
    });
    return typeof unsubscribe === 'function' ? unsubscribe : undefined;
  }, [load, navigation]);

  return (
    <TouchableOpacity
      onPress={() => navigation.navigate('UserAccount')}
      style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}
      activeOpacity={0.88}
      accessibilityRole="button"
      accessibilityLabel="Editar meu perfil"
    >
      <View style={[styles.avatar, { backgroundColor: `${colors.primary}18` }]}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
        ) : (
          <User size={22} color={colors.primary} />
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>
          {name}
        </Text>
        <Text style={[styles.meta, { color: colors.foregroundSecondary }]} numberOfLines={1}>
          {[ROLE_LABEL[role] ?? role, email].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <ChevronRight size={18} color={colors.foregroundSecondary} />
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
    marginBottom: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  name: { fontSize: 14, fontWeight: '800' },
  meta: { fontSize: 11, marginTop: 2 },
});
