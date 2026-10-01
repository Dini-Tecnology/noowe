import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { Cake, Check, Coffee, Crown, Wine } from 'lucide-react-native';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { supabaseApiAdapter } from '@okinawa/shared/services/supabase-api';
import {
  FINE_DINING_AMBIANCE,
  FINE_DINING_AMBIANCE_PRESENTATION,
  type FineDiningAmbiance,
} from '@okinawa/shared/config/fine-dining';
import { useRestaurantRole } from '../../contexts/RestaurantRoleContext';
import { V2Shell } from './shared/V2Shell';
import { ConfigSectionCard } from './config/ConfigSectionCard';
import { userErrorMessage } from '@okinawa/shared/utils/user-error-message';

const AMBIANCE_ICONS: Record<FineDiningAmbiance, typeof Wine> = {
  casual: Cake,
  bar: Wine,
  cafe: Coffee,
};

/**
 * The "estilo do restaurante" filter tags a fine dining customer sees on the
 * discovery Home (Casual, Bar, Café). Mirrors CasualDiningScreen's amenity
 * chip editor, scoped to fine dining's own vocabulary.
 */
export default function FineDiningScreen() {
  const colors = useColors();
  const { restaurantId } = useRestaurantRole();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [amenities, setAmenities] = useState<FineDiningAmbiance[]>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const amenitiesRef = useRef(amenities);

  useEffect(() => { amenitiesRef.current = amenities; }, [amenities]);

  const load = useCallback(async () => {
    if (!restaurantId) return;
    try {
      setError(null);
      const data = await supabaseApiAdapter.getFineDiningAmenities(restaurantId);
      const raw = Array.isArray(data?.amenities) ? data.amenities : [];
      setAmenities(
        raw.filter((key: unknown): key is FineDiningAmbiance =>
          typeof key === 'string' && key in FINE_DINING_AMBIANCE_PRESENTATION,
        ),
      );
    } catch (err) {
      setError(userErrorMessage(err, 'Erro ao carregar configuração'));
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial remote load
    void load();
  }, [load]);

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  const persist = useCallback(async () => {
    if (!restaurantId) return;
    try {
      await supabaseApiAdapter.updateFineDiningAmenities(restaurantId, amenitiesRef.current);
      setError(null);
    } catch (err) {
      setError(userErrorMessage(err, 'Erro ao salvar configuração'));
    }
  }, [restaurantId]);

  const toggleAmenity = useCallback((key: FineDiningAmbiance) => {
    setAmenities((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void persist(); }, 350);
  }, [persist]);

  return (
    <V2Shell
      title="Fine Dining"
      subtitle="Estilo do restaurante"
      showBack
      onRefresh={load}
      headerRight={
        <View style={[styles.headerIcon, { backgroundColor: '#FEF3C7' }]}>
          <Crown size={18} color="#B45309" />
        </View>
      }
    >
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <>
          <ConfigSectionCard title="Filtros de Descoberta" Icon={Crown}>
            <View style={styles.chipsWrap}>
              {FINE_DINING_AMBIANCE.map((key) => {
                const selected = amenities.includes(key);
                const Icon = AMBIANCE_ICONS[key] ?? Check;
                const presentation = FINE_DINING_AMBIANCE_PRESENTATION[key];
                return (
                  <TouchableOpacity
                    key={key}
                    onPress={() => toggleAmenity(key)}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: selected ? colors.primary : colors.backgroundSecondary,
                        borderColor: selected ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Icon size={14} color={selected ? '#FFFFFF' : colors.foregroundSecondary} />
                    <Text style={[styles.chipText, { color: selected ? '#FFFFFF' : colors.foreground }]}>
                      {presentation.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ConfigSectionCard>

          {error ? (
            <Text style={{ textAlign: 'center', color: '#EF4444', marginTop: 8 }}>{error}</Text>
          ) : null}
        </>
      )}
    </V2Shell>
  );
}

const styles = StyleSheet.create({
  headerIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 14 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 9, borderRadius: 18, borderWidth: 1,
  },
  chipText: { fontSize: 13, fontWeight: '600' },
});
