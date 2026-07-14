import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View, Switch, TouchableOpacity, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { Bell } from 'lucide-react-native';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { supabaseApiAdapter } from '@okinawa/shared/services/supabase-api';
import { V2Shell } from './shared/V2Shell';
import type { NotificationPrefs } from './shared/v2Types';

const PREF_ITEMS: { key: keyof NotificationPrefs; label: string; subtitle: string }[] = [
  { key: 'newOrders', label: 'Novos pedidos', subtitle: 'Alerta quando um pedido chegar' },
  { key: 'kitchen', label: 'Cozinha', subtitle: 'Atualizações do KDS e preparo' },
  { key: 'reservations', label: 'Reservas', subtitle: 'Confirmações e cancelamentos' },
  { key: 'payments', label: 'Pagamentos', subtitle: 'Transações e cobranças' },
  { key: 'sound', label: 'Som', subtitle: 'Reproduzir alerta sonoro' },
];

const DEFAULT_PREFS: NotificationPrefs = {
  newOrders: true,
  kitchen: true,
  reservations: true,
  payments: false,
  sound: true,
};

export default function NotificationSettingsScreen() {
  const colors = useColors();
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await supabaseApiAdapter.getRestaurantProfile();
      if (data) {
        setRestaurantId(data.id ?? null);
        const stored = data.settings?.notification_prefs;
        if (stored && typeof stored === 'object') {
          setPrefs({ ...DEFAULT_PREFS, ...stored } as NotificationPrefs);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar preferências');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const toggle = (key: keyof NotificationPrefs) => {
    setPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
    setSaved(false);
  };

  const handleSave = async () => {
    if (!restaurantId) return;
    setSaving(true);
    setError(null);
    try {
      const data = await supabaseApiAdapter.getRestaurantProfile();
      const currentSettings = data?.settings ?? {};
      await supabaseApiAdapter.updateRestaurantProfile(restaurantId, {
        settings: { ...currentSettings, notification_prefs: prefs },
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar preferências');
    } finally {
      setSaving(false);
    }
  };

  return (
    <V2Shell title="Notificações" subtitle="Alertas e avisos" showBack onRefresh={load}>
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <>
          <View style={[styles.infoCard, { backgroundColor: `${colors.primary}10`, borderColor: `${colors.primary}30` }]}>
            <Bell size={18} color={colors.primary} />
            <Text style={{ flex: 1, fontSize: 13, color: colors.foreground, marginLeft: 10 }}>
              Configure quais eventos geram notificações push e sonoras no app.
            </Text>
          </View>

          <View style={[styles.list, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {PREF_ITEMS.map((item, index) => (
              <View
                key={item.key}
                style={[
                  styles.row,
                  index < PREF_ITEMS.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '600', color: colors.foreground }}>{item.label}</Text>
                  <Text style={{ fontSize: 12, color: colors.foregroundSecondary, marginTop: 2 }}>{item.subtitle}</Text>
                </View>
                <Switch
                  value={prefs[item.key]}
                  onValueChange={() => toggle(item.key)}
                  trackColor={{ false: colors.border, true: `${colors.primary}80` }}
                  thumbColor={prefs[item.key] ? colors.primary : colors.foregroundSecondary}
                />
              </View>
            ))}
          </View>

          {error && (
            <Text style={{ textAlign: 'center', color: '#EF4444', marginBottom: 8 }}>{error}</Text>
          )}

          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 }]}
            onPress={() => void handleSave()}
            disabled={saving || !restaurantId}
          >
            <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 15 }}>
              {saving ? 'Salvando…' : 'Salvar preferências'}
            </Text>
          </TouchableOpacity>

          {saved && (
            <Text style={{ textAlign: 'center', color: '#22C55E', marginTop: 12, fontWeight: '600' }}>
              Preferências salvas
            </Text>
          )}
        </>
      )}
    </V2Shell>
  );
}

const styles = StyleSheet.create({
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 16,
  },
  list: { borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  saveBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
});
