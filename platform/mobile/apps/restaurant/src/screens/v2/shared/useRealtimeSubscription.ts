/**
 * Supabase Realtime subscriptions for the restaurant app.
 *
 * Each hook subscribes to a Postgres CDC channel and calls `onRefresh`
 * whenever a relevant INSERT / UPDATE / DELETE arrives.
 *
 * Pattern: subscribe on mount, unsubscribe on unmount.
 * Hooks are intentionally thin — they just signal the calling screen to
 * re-fetch via the existing refresh callback, keeping data logic in one place.
 */

import { useEffect, useRef } from 'react';
import { getSupabaseClient } from '@okinawa/shared/services/supabase';

type RefreshFn = () => void | Promise<void>;

interface RealtimeOpts {
  /** Identifier for the Supabase channel (must be unique per open subscription). */
  channelName: string;
  /** Postgres table name to watch. */
  table: string;
  /** Optional column filter, e.g. { column: 'restaurant_id', value: 'uuid...' } */
  filter?: { column: string; value: string };
  /** Called on any INSERT | UPDATE | DELETE event. */
  onRefresh: RefreshFn;
  /** Whether the subscription should be active. Set to false while IDs are loading. */
  enabled?: boolean;
}

export function useRealtimeSubscription({
  channelName,
  table,
  filter,
  onRefresh,
  enabled = true,
}: RealtimeOpts) {
  // Keep a stable ref so the effect closure always sees the latest callback.
  const refreshRef = useRef(onRefresh);
  const filterColumn = filter?.column;
  const filterValue = filter?.value;
  useEffect(() => { refreshRef.current = onRefresh; }, [onRefresh]);

  useEffect(() => {
    if (!enabled) return;

    const supabase = getSupabaseClient();

    const uniqueChannelName = `${channelName}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    let channel = supabase.channel(uniqueChannelName);

    const pgChangesConfig: Parameters<typeof channel.on>[1] = {
      event: '*',
      schema: 'public',
      table,
      ...(filterColumn && filterValue ? { filter: `${filterColumn}=eq.${filterValue}` } : {}),
    };

    channel = channel.on('postgres_changes' as any, pgChangesConfig, () => {
      void refreshRef.current();
    });

    channel.subscribe((status) => {
      if (status === 'CHANNEL_ERROR') {
        console.warn(`[Realtime] Channel error on ${channelName}`);
      }
    });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [channelName, table, filterColumn, filterValue, enabled]);
}

// ── Convenience hooks ──────────────────────────────────────────────────────────

/**
 * Subscribes to INSERT/UPDATE/DELETE on `orders` filtered by `restaurant_id`.
 */
export function useOrdersRealtime(restaurantId: string | null, onRefresh: RefreshFn) {
  useRealtimeSubscription({
    channelName: `orders:${restaurantId}`,
    table: 'orders',
    filter: restaurantId ? { column: 'restaurant_id', value: restaurantId } : undefined,
    onRefresh,
    enabled: !!restaurantId,
  });
}

/**
 * Subscribes to changes on `order_items` for a restaurant.
 * Uses the restaurant_id column if it exists, otherwise subscribes unfiltered
 * (KDS screens typically filter by table-level joins anyway).
 */
export function useOrderItemsRealtime(restaurantId: string | null, onRefresh: RefreshFn) {
  useRealtimeSubscription({
    channelName: `order_items:${restaurantId}`,
    table: 'order_items',
    onRefresh,
    enabled: !!restaurantId,
  });
}

/**
 * Subscribes to INSERT/UPDATE on `tables` filtered by `restaurant_id`.
 */
export function useTablesRealtime(restaurantId: string | null, onRefresh: RefreshFn) {
  useRealtimeSubscription({
    channelName: `tables:${restaurantId}`,
    table: 'tables',
    filter: restaurantId ? { column: 'restaurant_id', value: restaurantId } : undefined,
    onRefresh,
    enabled: !!restaurantId,
  });
}

/**
 * Subscribes to INSERT/UPDATE on `service_calls` filtered by `restaurant_id`.
 */
export function useServiceCallsRealtime(restaurantId: string | null, onRefresh: RefreshFn) {
  useRealtimeSubscription({
    channelName: `service_calls:${restaurantId}`,
    table: 'service_calls',
    filter: restaurantId ? { column: 'restaurant_id', value: restaurantId } : undefined,
    onRefresh,
    enabled: !!restaurantId,
  });
}

/**
 * Subscribes to INSERT/UPDATE/DELETE on `reservations` filtered by `restaurant_id`.
 */
export function useReservationsRealtime(restaurantId: string | null, onRefresh: RefreshFn) {
  useRealtimeSubscription({
    channelName: `reservations:${restaurantId}`,
    table: 'reservations',
    filter: restaurantId ? { column: 'restaurant_id', value: restaurantId } : undefined,
    onRefresh,
    enabled: !!restaurantId,
  });
}
