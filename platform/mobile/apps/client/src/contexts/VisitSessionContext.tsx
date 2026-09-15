import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import customerBackend, { type VisitSession } from '../services/customer-backend';

const STORAGE_KEY = '@noowe/client/visit-session/v1';

type VisitSessionContextValue = {
  session: VisitSession | null;
  restoring: boolean;
  openFromQr: (qrData: string) => Promise<VisitSession>;
  joinFromInvite: (token: string) => Promise<VisitSession>;
  selectRestaurant: (restaurantId: string) => Promise<void>;
  leaveTable: () => Promise<void>;
  clearSession: () => Promise<void>;
};

const VisitSessionContext = createContext<VisitSessionContextValue | null>(null);

export function VisitSessionProvider({ children }: React.PropsWithChildren) {
  const [session, setSession] = useState<VisitSession | null>(null);
  const [restoring, setRestoring] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!stored) return;
        const parsed = JSON.parse(stored) as VisitSession;
        if (parsed.restaurantId) setSession(parsed);
      })
      .catch(() => AsyncStorage.removeItem(STORAGE_KEY))
      .finally(() => setRestoring(false));
  }, []);

  const persist = useCallback(async (next: VisitSession | null) => {
    setSession(next);
    if (next) await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else await AsyncStorage.removeItem(STORAGE_KEY);
  }, []);

  const openFromQr = useCallback(async (qrData: string) => {
    const next = await customerBackend.openTableSession(qrData);
    await persist(next);
    return next;
  }, [persist]);

  const joinFromInvite = useCallback(async (token: string) => {
    const next = await customerBackend.joinTableInvite(token);
    await persist(next);
    return next;
  }, [persist]);

  const selectRestaurant = useCallback(async (restaurantId: string) => {
    // Already browsing/seated at this restaurant: keep whatever table
    // session is active instead of wiping it out from under the user.
    if (session?.restaurantId === restaurantId) return;
    await persist({ restaurantId, tableId: '', tableSessionId: '', tableNumber: '' });
  }, [persist, session]);

  const clearSession = useCallback(() => persist(null), [persist]);

  const leaveTable = useCallback(async () => {
    if (session?.tableSessionId) {
      await customerBackend.leaveTableSession(session.tableSessionId);
    }
    await persist(null);
  }, [persist, session]);

  const value = useMemo(() => ({ session, restoring, openFromQr, joinFromInvite, selectRestaurant, leaveTable, clearSession }), [
    session, restoring, openFromQr, joinFromInvite, selectRestaurant, leaveTable, clearSession,
  ]);

  return <VisitSessionContext.Provider value={value}>{children}</VisitSessionContext.Provider>;
}

export function useVisitSession(): VisitSessionContextValue {
  const context = useContext(VisitSessionContext);
  if (!context) throw new Error('useVisitSession must be used inside VisitSessionProvider');
  return context;
}
