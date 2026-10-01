import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';

/** The restaurant row used on Home; Orders reuses it so both lists look identical. */
export const restaurantRowStyles = (colors: ReturnType<typeof useColors>) => ({
  nearbyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    padding: 14,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  nearbyIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  nearbyPhoto: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: colors.backgroundSecondary,
    marginRight: 14,
  },
  nearbyInfo: { flex: 1 },
  nearbyName: { color: colors.foreground, fontWeight: '700', fontSize: 16, marginBottom: 4 },
  nearbySub: { color: colors.foregroundSecondary, fontSize: 14 },
  nearbyTrailing: { alignItems: 'flex-end', gap: 2 },
} as const);

export const money = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

/**
 * Mapeia mensagens de erro conhecidas dos RPCs (em inglês) para textos
 * amigáveis em pt-BR antes de exibir ao cliente. Se a mensagem já vier em
 * português (novos RPCs), passa direto.
 */
const RPC_ERROR_TRANSLATIONS: Array<[RegExp, string]> = [
  [/^Authentication required/i, 'Faça login novamente para continuar.'],
  [/^Order must contain at least one item/i, 'O pedido precisa ter pelo menos um item.'],
  [
    /Menu item .* is not available at this restaurant/i,
    'Um item do carrinho não pertence a este restaurante. Limpe o carrinho e escolha novamente.',
  ],
  [/^Active table session required/i, 'Escaneie o QR da mesa para fazer o pedido.'],
  [
    /^Ordering is unavailable for this restaurant/i,
    'Este restaurante está com o pedido pelo app desabilitado.',
  ],
  [/^Invalid or expired QR code/i, 'QR code inválido ou expirado.'],
  [/^Invalid or expired invitation/i, 'Convite inválido ou expirado.'],
  [/^This table session has ended/i, 'Esta comanda já foi encerrada.'],
  [/^Table session not accessible/i, 'Você não faz parte desta mesa.'],
];

export function translateOrderError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  for (const [pattern, replacement] of RPC_ERROR_TRANSLATIONS) {
    if (pattern.test(message)) return replacement;
  }
  return message || 'Não foi possível concluir a operação.';
}

/**
 * "Mesa 12" for display. Restaurants name tables freely (`12`, `S04`,
 * `Varanda 1`, `Mesa 3`), so the prefix is only added when the name doesn't
 * already start with it — otherwise the UI reads "Mesa Mesa 3".
 */
export function tableLabel(tableNumber: string | number | null | undefined): string {
  const name = String(tableNumber ?? '').trim();
  if (!name) return 'Mesa';
  return /^mesa\b/i.test(name) ? name : `Mesa ${name}`;
}

export function distanceKm(
  a: { latitude: number; longitude: number },
  b: { lat: number; lng: number },
): number {
  const radians = (value: number) => (value * Math.PI) / 180;
  const earth = 6371;
  const dLat = radians(b.lat - a.latitude);
  const dLng = radians(b.lng - a.longitude);
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(a.latitude)) * Math.cos(radians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return earth * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

/**
 * Navigate on the root stack even from a screen nested inside the tab
 * navigator. React Navigation already walks up the navigator tree on its
 * own when the current navigator doesn't own the route — forcing a single
 * `getParent()` hop here breaks calls made from a screen that's *already*
 * on the root stack, by skipping past it into whatever wraps the app.
 */
export const rootNavigate = (navigation: any, name: string, params?: object) =>
  navigation.navigate(name, params);

type RefreshableQuery = {
  refetch: () => Promise<unknown>;
};

/**
 * Native pull-to-refresh wired to one or more TanStack Query results.
 *
 * The spinner tracks only the refresh the user pulled, not `isRefetching`:
 * background refetches (focus, remount, invalidation after navigating back)
 * flip `refreshing` while the list isn't being dragged, and on iOS that
 * leaves the indicator stuck on screen until the user scrolls.
 */
export function useQueryRefreshControl(queries: readonly RefreshableQuery[]) {
  const colors = useColors();
  const [pulling, setPulling] = useState(false);
  const onRefresh = useCallback(() => {
    setPulling(true);
    void Promise.allSettled(queries.map((query) => query.refetch())).finally(() => setPulling(false));
  }, [queries]);

  return (
    <RefreshControl
      refreshing={pulling}
      onRefresh={onRefresh}
      tintColor={colors.primary}
      colors={[colors.primary]}
      progressBackgroundColor={colors.card}
    />
  );
}

type StateViewProps = {
  loading?: boolean;
  error?: unknown;
  empty?: string;
  emptyIcon?: keyof typeof Ionicons.glyphMap;
  onRetry?: () => void;
};

/** Loading / error / empty placeholder, themed. Renders nothing when none apply. */
export function StateView({ loading, error, empty, emptyIcon = 'file-tray-outline', onRetry }: StateViewProps) {
  const colors = useColors();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: {
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: 48,
          paddingHorizontal: 24,
          gap: 12,
        },
        text: {
          fontSize: 14,
          color: colors.foregroundSecondary,
          textAlign: 'center',
        },
        retry: {
          marginTop: 4,
          fontSize: 14,
          fontWeight: '700',
          color: colors.primary,
        },
      }),
    [colors],
  );

  if (loading) {
    return (
      <View style={styles.wrap}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.wrap}>
        <Ionicons name="cloud-offline-outline" size={32} color={colors.foregroundMuted} />
        <Text style={styles.text}>Não foi possível carregar os dados.</Text>
        {onRetry ? (
          <TouchableOpacity onPress={onRetry} accessibilityRole="button">
            <Text style={styles.retry}>Tentar novamente</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  if (empty) {
    return (
      <View style={styles.wrap}>
        <Ionicons name={emptyIcon} size={32} color={colors.foregroundMuted} />
        <Text style={styles.text}>{empty}</Text>
      </View>
    );
  }

  return null;
}

/** Simple top bar for tab-root screens: greeting-style title + optional right action. */
export function TabHeader({
  title,
  right,
}: {
  title: string;
  right?: React.ReactNode;
}) {
  const colors = useColors();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 4,
          paddingBottom: 16,
        },
        title: {
          fontSize: 26,
          fontWeight: '700',
          color: colors.foreground,
          letterSpacing: -0.5,
        },
      }),
    [colors],
  );

  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      {right}
    </View>
  );
}

export const cardStyles = StyleSheet.create({
  hairline: {
    borderWidth: StyleSheet.hairlineWidth,
  },
});
