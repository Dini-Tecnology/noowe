import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import customerBackend, { type AcceptTableUserInviteResult, type ServiceQrResolution, type VisitSession } from '../services/customer-backend';

const STORAGE_KEY = '@noowe/client/visit-session/v1';

/** Lançado por `openFromQr` quando `beforeCheckIn` recusa — nada foi aberto no servidor. */
export class QrCheckInCancelled extends Error {
  constructor() {
    super('QR check-in cancelled');
    this.name = 'QrCheckInCancelled';
  }
}

export type OpenFromQrOptions = {
  dev?: boolean;
  /**
   * Chamado com o restaurante dono do QR antes de qualquer check-in. Devolver
   * false cancela sem tocar no servidor nem na sessão atual.
   */
  beforeCheckIn?: (resolution: ServiceQrResolution) => Promise<boolean>;
};

type VisitSessionContextValue = {
  session: VisitSession | null;
  restoring: boolean;
  /** `dev` uses the emulator check-in, which skips the reservation/waitlist requirement (database dev flag). */
  openFromQr: (qrData: string, options?: OpenFromQrOptions) => Promise<VisitSession>;
  joinFromInvite: (token: string) => Promise<VisitSession>;
  /**
   * Accepts an @username invite (ADR-011). Only an `accepted` result moves the
   * visit; `awaiting_capacity` and closed invites leave the current table as is.
   */
  joinFromUserInvite: (inviteId: string) => Promise<AcceptTableUserInviteResult>;
  selectRestaurant: (restaurantId: string) => Promise<void>;
  selectWaitlistJourney: (restaurantId: string, waitlistEntryId: string, serviceModel: 'fine_dining' | 'casual_dining') => Promise<void>;
  leaveTable: () => Promise<void>;
  clearSession: () => Promise<void>;
  refreshSession: () => Promise<VisitSession | null>;
  completeCheckout: (tableSessionId: string) => Promise<void>;
};

const VisitSessionContext = createContext<VisitSessionContextValue | null>(null);

export function VisitSessionProvider({ children }: React.PropsWithChildren) {
  const [session, setSession] = useState<VisitSession | null>(null);
  const [restoring, setRestoring] = useState(true);
  const currentSession = useRef<VisitSession | null>(null);
  const version = useRef(0);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!stored) return;
        const parsed = JSON.parse(stored) as VisitSession;
        // A cached table membership must be confirmed by the server.
        if (parsed.restaurantId && !parsed.tableSessionId && version.current === 0) {
          currentSession.current = parsed;
          setSession(parsed);
        }
      })
      .catch(() => AsyncStorage.removeItem(STORAGE_KEY))
      .then(async () => {
        const active = await customerBackend.getActiveVisit();
        if (version.current !== 0) return;
        currentSession.current = active ?? currentSession.current;
        setSession(currentSession.current);
        if (active) await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(active));
        else await AsyncStorage.removeItem(STORAGE_KEY);
      })
      .catch(() => { /* Offline: do not resurrect an unverified table. */ })
      .finally(() => setRestoring(false));
  }, []);

  const persist = useCallback(async (next: VisitSession | null) => {
    version.current += 1;
    currentSession.current = next;
    setSession(next);
    if (next) await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else await AsyncStorage.removeItem(STORAGE_KEY);
  }, []);

  const openFromQr = useCallback(async (qrData: string, options?: OpenFromQrOptions) => {
    const resolution = await customerBackend.resolveServiceQr(qrData);
    if (options?.beforeCheckIn && !(await options.beforeCheckIn(resolution))) throw new QrCheckInCancelled();
    const next = resolution.kind === 'counter'
      ? {
          restaurantId: resolution.restaurantId,
          tableId: '',
          tableSessionId: '',
          tableNumber: resolution.counterLabel,
          serviceModel: resolution.serviceModel,
        }
      : options?.dev
        ? await customerBackend.devCheckIn(qrData, resolution.serviceModel)
        : await customerBackend.checkIn(qrData, resolution.serviceModel);
    await persist(next);
    return next;
  }, [persist]);

  const joinFromInvite = useCallback(async (token: string) => {
    const next = await customerBackend.joinTableInvite(token);
    await persist(next);
    return next;
  }, [persist]);

  const joinFromUserInvite = useCallback(async (inviteId: string) => {
    const result = await customerBackend.acceptTableUserInvite(inviteId);
    if (result.status === 'accepted' && result.visit) await persist(result.visit);
    return result;
  }, [persist]);

  const selectRestaurant = useCallback(async (restaurantId: string) => {
    // Already browsing/seated at this restaurant: keep whatever table
    // session is active instead of wiping it out from under the user.
    if (session?.tableSessionId || session?.restaurantId === restaurantId) return;
    await persist({ restaurantId, tableId: '', tableSessionId: '', tableNumber: '' });
  }, [persist, session]);

  const selectWaitlistJourney = useCallback(async (
    restaurantId: string,
    waitlistEntryId: string,
    serviceModel: 'fine_dining' | 'casual_dining',
  ) => {
    if (session?.tableSessionId) return;
    await persist({ restaurantId, tableId: '', tableSessionId: '', tableNumber: '', waitlistEntryId, serviceModel });
  }, [persist, session]);

  const clearSession = useCallback(() => persist(null), [persist]);

  const refreshSession = useCallback(async () => {
    const active = await customerBackend.getActiveVisit();
    await persist(active);
    return active;
  }, [persist]);

  const completeCheckout = useCallback(async (tableSessionId: string) => {
    // Do not clear a newer visit if an older payment finishes in the background.
    if (currentSession.current?.tableSessionId === tableSessionId) await persist(null);
  }, [persist]);

  const leaveTable = useCallback(async () => {
    if (session?.tableSessionId) {
      await customerBackend.leaveTableSession(session.tableSessionId);
    }
    await persist(null);
  }, [persist, session]);

  const value = useMemo(() => ({
    session, restoring, openFromQr, joinFromInvite, joinFromUserInvite, selectRestaurant, selectWaitlistJourney, leaveTable, clearSession, refreshSession, completeCheckout,
  }), [
    session, restoring, openFromQr, joinFromInvite, joinFromUserInvite, selectRestaurant, selectWaitlistJourney, leaveTable, clearSession, refreshSession, completeCheckout,
  ]);

  return <VisitSessionContext.Provider value={value}>{children}</VisitSessionContext.Provider>;
}

export function useVisitSession(): VisitSessionContextValue {
  const context = useContext(VisitSessionContext);
  if (!context) throw new Error('useVisitSession must be used inside VisitSessionProvider');
  return context;
}
