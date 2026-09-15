import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  type AppRole,
  type AuthUser,
  hasAnyRole,
  supabaseAuthService,
} from '@/lib/supabase-auth';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<AuthUser>;
  signOut: () => Promise<void>;
  refresh: () => Promise<AuthUser | null>;
  hasAnyRole: (roles: AppRole[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const currentUser = await supabaseAuthService.getCurrentUser();
    setUser(currentUser);
    return currentUser;
  }, []);

  useEffect(() => {
    let mounted = true;

    supabaseAuthService
      .getCurrentUser()
      .then((currentUser) => {
        if (mounted) setUser(currentUser);
      })
      .catch(() => {
        if (mounted) setUser(null);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    const unsubscribe = supabaseAuthService.onAuthStateChange((currentUser) => {
      if (mounted) {
        setUser(currentUser);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const authUser = await supabaseAuthService.signIn(email, password);
    setUser(authUser);
    return authUser;
  }, []);

  const signOut = useCallback(async () => {
    await supabaseAuthService.signOut();
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      isAuthenticated: Boolean(user),
      signIn,
      signOut,
      refresh,
      hasAnyRole: (roles) => hasAnyRole(user, roles),
    }),
    [loading, refresh, signIn, signOut, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
