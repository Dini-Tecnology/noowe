import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  TouchableOpacity,
  View,
  StyleSheet,
} from 'react-native';
import { Text } from 'react-native-paper';
import { pickImageFromLibrary } from '@okinawa/shared/utils/pick-image';
import { Camera, Plus, Repeat, Store, User } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { getSupabaseClient } from '@okinawa/shared/services/supabase';
import { supabaseAuthAdapter } from '@okinawa/shared/services/supabase-auth';
import { authService } from '@/shared/services/auth';
import { formatBrazilianPhone, validateBrazilianPhone } from '@okinawa/shared/utils/phone-validation';
import { useRestaurantRole } from '../../contexts/RestaurantRoleContext';
import { V2Shell } from './shared/V2Shell';
import { V2FormField } from './shared/V2FormField';
import { userErrorMessage } from '@okinawa/shared/utils/user-error-message';

export default function UserAccountScreen() {
  const colors = useColors();
  const navigation = useNavigation<any>();
  const { restaurants, restaurantId, serverRole } = useRestaurantRole();
  const activeRestaurant = restaurants.find((item) => item.id === restaurantId);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const user = await authService.getCurrentUser();
      if (!user) {
        setError('Sessão não encontrada.');
        return;
      }
      setUserId(user.id);
      setFullName(user.full_name ?? '');
      setPhone(user.phone ? formatBrazilianPhone(user.phone) : '');
      setEmail(user.email ?? '');
      setAvatarUrl(user.avatar_url ?? null);
    } catch (err) {
      setError(userErrorMessage(err, 'Erro ao carregar perfil'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const uploadAvatar = async () => {
    if (!userId || uploading) return;
    const picked = await pickImageFromLibrary({ aspect: [1, 1], quality: 0.85 });
    if (!picked) return;

    setUploading(true);
    try {
      const asset = picked;
      const response = await fetch(asset.uri);
      if (!response.ok) throw new Error('Não foi possível preparar a imagem.');
      const file = await response.arrayBuffer();
      const supabase = getSupabaseClient();
      const path = `${userId}/avatar`;
      const { error: uploadError } = await supabase.storage
        .from('user-avatars')
        .upload(path, file, {
          contentType: asset.mimeType ?? 'image/jpeg',
          upsert: true,
          cacheControl: '3600',
        });
      if (uploadError) throw uploadError;
      const { data: publicData } = supabase.storage.from('user-avatars').getPublicUrl(path);
      const url = `${publicData.publicUrl}?v=${Date.now()}`;
      await supabaseAuthAdapter.updateProfile({ avatar_url: url });
      setAvatarUrl(url);
      setSaved(true);
    } catch (err) {
      Alert.alert('Falha no upload', userErrorMessage(err, 'Tente novamente.'));
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (phone && !validateBrazilianPhone(phone)) {
      setError('Informe um telefone brasileiro válido com DDD.');
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await supabaseAuthAdapter.updateProfile({
        full_name: fullName.trim(),
        phone: phone.trim() || undefined,
      });
      setSaved(true);
    } catch (err) {
      setError(userErrorMessage(err, 'Erro ao salvar perfil'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <V2Shell title="Meu perfil" subtitle="Seus dados pessoais na conta" showBack>
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <>
          <View style={styles.avatarBlock}>
            <View style={styles.avatarWrap}>
              <TouchableOpacity
                onPress={() => void uploadAvatar()}
                disabled={uploading}
                style={[styles.avatarBox, { backgroundColor: `${colors.primary}18`, borderColor: colors.card }]}
              >
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
                ) : (
                  <User size={32} color={colors.primary} />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void uploadAvatar()}
                disabled={uploading}
                style={[styles.camBadge, { backgroundColor: colors.primary, borderColor: colors.background }]}
                accessibilityLabel="Alterar foto"
              >
                {uploading ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Camera size={12} color="#FFF" />
                )}
              </TouchableOpacity>
            </View>
            <Text style={[styles.hint, { color: colors.foregroundSecondary }]}>Toque para alterar a foto</Text>
          </View>

          {restaurants.length > 1 ? (
            <TouchableOpacity
              onPress={() => navigation.navigate('RestaurantSelector')}
              accessibilityRole="button"
              accessibilityLabel="Trocar de restaurante"
              style={[styles.switchRow, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <View style={[styles.switchIcon, { backgroundColor: `${colors.primary}15` }]}>
                <Store size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, color: colors.foregroundSecondary }}>Restaurante em uso</Text>
                <Text style={{ fontWeight: '700', color: colors.foreground }} numberOfLines={1}>
                  {activeRestaurant?.name ?? 'Selecionar restaurante'}
                </Text>
              </View>
              <Repeat size={16} color={colors.primary} />
              <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12 }}>Trocar</Text>
            </TouchableOpacity>
          ) : null}

          {serverRole === 'owner' ? (
            <TouchableOpacity
              onPress={() => navigation.navigate('CreateRestaurant')}
              accessibilityRole="button"
              accessibilityLabel="Cadastrar novo restaurante"
              style={[styles.switchRow, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <View style={[styles.switchIcon, { backgroundColor: `${colors.primary}15` }]}>
                <Plus size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: colors.foreground }}>Cadastrar novo restaurante</Text>
                <Text style={{ fontSize: 11, color: colors.foregroundSecondary }}>Você pode ser dono de vários restaurantes</Text>
              </View>
            </TouchableOpacity>
          ) : null}

          <View style={[styles.form, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <V2FormField label="Nome" value={fullName} onChangeText={(v) => { setFullName(v); setSaved(false); }} />
            <V2FormField
              label="Telefone"
              value={phone}
              onChangeText={(v) => { setPhone(formatBrazilianPhone(v)); setSaved(false); }}
              keyboardType="phone-pad"
            />
            <V2FormField label="E-mail" value={email} editable={false} />
            <Text style={{ fontSize: 11, color: colors.foregroundSecondary, marginTop: -4 }}>
              O e-mail é gerenciado pela autenticação e não pode ser alterado aqui.
            </Text>
          </View>

          {error ? <Text style={{ textAlign: 'center', color: colors.error, marginBottom: 8 }}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 }]}
            onPress={() => void handleSave()}
            disabled={saving}
          >
            <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 15 }}>
              {saving ? 'Salvando…' : 'Salvar alterações'}
            </Text>
          </TouchableOpacity>

          {saved ? (
            <Text style={{ textAlign: 'center', color: colors.success, marginTop: 12, fontWeight: '600' }}>
              Perfil atualizado
            </Text>
          ) : null}
        </>
      )}
    </V2Shell>
  );
}

const styles = StyleSheet.create({
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    marginBottom: 14,
  },
  switchIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  avatarBlock: { alignItems: 'center', marginBottom: 18 },
  avatarWrap: { width: 96, height: 96, position: 'relative' },
  avatarBox: {
    width: 88,
    height: 88,
    borderRadius: 28,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  camBadge: {
    position: 'absolute',
    right: 0,
    bottom: 4,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: { fontSize: 11, marginTop: 8 },
  form: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 16, gap: 4 },
  saveBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
});
