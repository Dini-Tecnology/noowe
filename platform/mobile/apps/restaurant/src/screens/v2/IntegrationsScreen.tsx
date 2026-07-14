import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Image, StyleSheet, Switch, TextInput, View, type ImageSourcePropType } from 'react-native';
import { Text } from 'react-native-paper';
import { Plug } from 'lucide-react-native';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { supabaseApiAdapter } from '@okinawa/shared/services/supabase-api';
import { useRestaurantRole } from '../../contexts/RestaurantRoleContext';
import { V2Shell } from './shared/V2Shell';
import { V2FormSheet } from './shared/V2FormSheet';

interface Integration {
  provider: 'ifood' | 'rappi' | 'uber_eats';
  is_connected: boolean;
  external_store_id?: string;
}

const PROVIDERS: {
  key: Integration['provider'];
  name: string;
  description: string;
  logo: ImageSourcePropType;
  logoBg: string;
}[] = [
  {
    key: 'ifood',
    name: 'iFood',
    description: 'Receba pedidos do maior marketplace de delivery do Brasil.',
    logo: require('../../../assets/ifood.png'),
    logoBg: '#FFFFFF',
  },
  {
    key: 'rappi',
    name: 'Rappi',
    description: 'Sincronize cardápio e pedidos com a Rappi.',
    logo: require('../../../assets/rappi.webp'),
    logoBg: '#FFFFFF',
  },
  {
    key: 'uber_eats',
    name: 'Uber Eats',
    description: 'Conecte sua operação de delivery com o Uber Eats.',
    logo: require('../../../assets/uber-eats.png'),
    logoBg: '#000000',
  },
];

function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return fallback;
}

export default function IntegrationsScreen() {
  const colors = useColors();
  const { restaurantId } = useRestaurantRole();
  const [integrations, setIntegrations] = useState<Record<string, Integration>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<Integration['provider'] | null>(null);
  const [storeId, setStoreId] = useState('');
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!restaurantId) return;
    try {
      setError(null);
      const data = await supabaseApiAdapter.getIntegrations(restaurantId);
      const map: Record<string, Integration> = {};
      for (const row of Array.isArray(data) ? data : []) map[row.provider] = row;
      setIntegrations(map);
    } catch (err) {
      setError(getErrorMessage(err, 'Erro ao carregar integrações'));
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => { void load(); }, [load]);

  const toggle = async (provider: Integration['provider'], nextValue: boolean) => {
    if (!restaurantId) return;
    if (nextValue) {
      setStoreId('');
      setConnecting(provider);
      return;
    }
    setBusy(provider);
    try {
      await supabaseApiAdapter.setIntegrationConnection(restaurantId, provider, false);
      await load();
    } catch (err) {
      Alert.alert('Erro', getErrorMessage(err, 'Não foi possível desconectar.'));
    } finally {
      setBusy(null);
    }
  };

  const confirmConnect = async () => {
    if (!restaurantId || !connecting) return;
    setSaving(true);
    try {
      await supabaseApiAdapter.setIntegrationConnection(restaurantId, connecting, true, storeId.trim() || undefined);
      setConnecting(null);
      await load();
    } catch (err) {
      Alert.alert('Erro', getErrorMessage(err, 'Não foi possível conectar.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <V2Shell title="Integrações" subtitle="Marketplaces de delivery" showBack onRefresh={load}>
        <View>
          {loading ? (
            <Text style={{ textAlign: 'center', color: colors.foregroundSecondary, marginTop: 24 }}>Carregando…</Text>
          ) : error ? (
            <Text style={{ textAlign: 'center', color: '#EF4444', marginTop: 24 }}>{error}</Text>
          ) : (
            PROVIDERS.map((provider) => {
              const state = integrations[provider.key];
              const connected = state?.is_connected ?? false;
              return (
                <View key={provider.key} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={[styles.logoWrap, { backgroundColor: provider.logoBg, borderColor: colors.border }]}>
                    <Image source={provider.logo} style={styles.logo} resizeMode="contain" accessibilityLabel={`Logo ${provider.name}`} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '700', color: colors.foreground }}>{provider.name}</Text>
                    <Text style={{ fontSize: 12, color: colors.foregroundSecondary, marginTop: 2 }} numberOfLines={2}>
                      {provider.description}
                    </Text>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: connected ? '#22C55E' : colors.foregroundMuted, marginTop: 4 }}>
                      {connected ? `Conectado${state?.external_store_id ? ` · Loja ${state.external_store_id}` : ''}` : 'Não conectado'}
                    </Text>
                  </View>
                  <Switch
                    value={connected}
                    disabled={busy === provider.key}
                    onValueChange={(value) => void toggle(provider.key, value)}
                    trackColor={{ false: colors.border, true: `${colors.primary}80` }}
                    thumbColor={connected ? colors.primary : '#FFF'}
                  />
                </View>
              );
            })
          )}

          <View style={[styles.noteBox, { backgroundColor: `${colors.primary}10`, borderColor: `${colors.primary}30` }]}>
            <Plug size={16} color={colors.primary} />
            <Text style={{ color: colors.foregroundSecondary, fontSize: 12, lineHeight: 18, flex: 1 }}>
              Ao conectar, informe o ID da sua loja no marketplace. A sincronização automática de pedidos é configurada pela nossa equipe após a conexão.
            </Text>
          </View>
        </View>
      </V2Shell>

      <V2FormSheet
        visible={connecting !== null}
        title={`Conectar ${PROVIDERS.find((p) => p.key === connecting)?.name ?? ''}`}
        subtitle="Informe o identificador da loja nesse marketplace (opcional)"
        saveLabel="Conectar"
        saving={saving}
        onClose={() => !saving && setConnecting(null)}
        onSave={() => void confirmConnect()}
      >
        <Text style={[styles.fieldLabel, { color: colors.foreground }]}>ID da loja (opcional)</Text>
        <TextInput
          value={storeId}
          onChangeText={setStoreId}
          placeholder="Ex.: 123456"
          placeholderTextColor={colors.foregroundMuted}
          style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
        />
      </V2FormSheet>
    </>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1, padding: 13, marginBottom: 10 },
  logoWrap: {
    width: 56,
    height: 56,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    padding: 6,
  },
  logo: { width: '100%', height: '100%' },
  noteBox: { flexDirection: 'row', gap: 10, borderWidth: 1, borderRadius: 14, padding: 13, marginTop: 8, alignItems: 'flex-start' },
  fieldLabel: { fontSize: 13, fontWeight: '800', marginBottom: 8 },
  input: { minHeight: 50, borderWidth: 1, borderRadius: 15, paddingHorizontal: 14, fontSize: 15 },
});
