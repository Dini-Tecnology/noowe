import type { AuthError, Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export type AppRole =
  | 'customer'
  | 'waiter'
  | 'barman'
  | 'chef'
  | 'cook'
  | 'maitre'
  | 'manager'
  | 'owner'
  | 'admin';

export interface AppProfile {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  phone?: string | null;
  is_active?: boolean | null;
  last_login_at?: string | null;
  created_at?: string | null;
}

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string | null;
  roles: AppRole[];
  restaurantIds: string[];
  session: Session;
  profile?: AppProfile | null;
}

export interface SignUpInput {
  email: string;
  password: string;
  fullName: string;
  redirectTo?: string;
}

export interface SignUpResult {
  user: User | null;
  session: Session | null;
  needsEmailConfirmation: boolean;
}

export class AuthServiceError extends Error {
  status?: number;
  code?: string;

  constructor(message: string, options?: { status?: number; code?: string }) {
    super(message);
    this.name = 'AuthServiceError';
    this.status = options?.status;
    this.code = options?.code;
  }
}

function getBrowserUrl(path: string) {
  if (typeof window === 'undefined') return undefined;
  return new URL(path, window.location.origin).toString();
}

function normalizeRole(role: string | null | undefined): AppRole | null {
  const value = role?.toLowerCase();
  const allowed: AppRole[] = ['customer', 'waiter', 'barman', 'chef', 'cook', 'maitre', 'manager', 'owner', 'admin'];
  return allowed.includes(value as AppRole) ? (value as AppRole) : null;
}

function uniqueRoles(values: Array<string | null | undefined>): AppRole[] {
  const roles = values.map(normalizeRole).filter(Boolean) as AppRole[];
  return Array.from(new Set(roles.length > 0 ? roles : ['customer']));
}

function readJwtClaims(session: Session | null): Record<string, unknown> {
  if (!session?.access_token) return {};

  try {
    const payload = session.access_token.split('.')[1];
    if (!payload) return {};
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(window.atob(normalized));
  } catch {
    return {};
  }
}

function mapAuthError(error: AuthError | Error): AuthServiceError {
  const message = error.message.toLowerCase();

  if (message.includes('invalid login') || message.includes('invalid credentials')) {
    return new AuthServiceError('E-mail ou senha inválidos.', { status: 401, code: 'invalid_credentials' });
  }

  if (message.includes('email not confirmed')) {
    return new AuthServiceError('Confirme seu e-mail antes de entrar.', { status: 403, code: 'email_not_confirmed' });
  }

  if (message.includes('already registered') || message.includes('already exists')) {
    return new AuthServiceError('Este e-mail já possui uma conta.', { status: 409, code: 'email_exists' });
  }

  if (message.includes('rate limit')) {
    return new AuthServiceError('Muitas tentativas. Aguarde alguns minutos e tente novamente.', {
      status: 429,
      code: 'rate_limited',
    });
  }

  return new AuthServiceError(error.message || 'Não foi possível concluir a autenticação.', {
    status: 'status' in error ? (error as AuthError).status : undefined,
    code: 'code' in error ? (error as AuthError).code : undefined,
  });
}

async function loadProfile(userId: string): Promise<AppProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id,email,full_name,avatar_url,phone,is_active,last_login_at,created_at')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw mapAuthError(error);
  return (data as AppProfile | null) ?? null;
}

async function loadProfileRoles(userId: string): Promise<AppRole[]> {
  const [{ data: profileRoles, error: profileRolesError }, { data: restaurantRoles, error: restaurantRolesError }] =
    await Promise.all([
      supabase.from('profile_roles').select('role_key,is_active').eq('user_id', userId).eq('is_active', true),
      supabase.from('user_roles').select('role,is_active').eq('user_id', userId).eq('is_active', true),
    ]);

  if (profileRolesError) throw mapAuthError(profileRolesError);
  if (restaurantRolesError) throw mapAuthError(restaurantRolesError);

  return uniqueRoles([
    ...((profileRoles as Array<{ role_key?: string }> | null)?.map((row) => row.role_key) ?? []),
    ...((restaurantRoles as Array<{ role?: string }> | null)?.map((row) => row.role) ?? []),
  ]);
}

async function loadRestaurantIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('user_roles')
    .select('restaurant_id,is_active')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (error) throw mapAuthError(error);

  return Array.from(
    new Set(
      ((data as Array<{ restaurant_id?: string | null }> | null) ?? [])
        .map((row) => row.restaurant_id)
        .filter(Boolean) as string[]
    )
  );
}

async function buildAuthUser(session: Session | null): Promise<AuthUser | null> {
  if (!session?.user) return null;

  const claims = readJwtClaims(session);
  const appMetadata = (session.user.app_metadata ?? {}) as Record<string, unknown>;
  const claimRoles = [
    ...(((claims.roles as string[] | undefined) ?? []) as string[]),
    ...(((appMetadata.roles as string[] | undefined) ?? []) as string[]),
    claims.app_role as string | undefined,
  ];

  const [profile, dbRoles, dbRestaurantIds] = await Promise.all([
    loadProfile(session.user.id),
    loadProfileRoles(session.user.id),
    loadRestaurantIds(session.user.id),
  ]);

  const restaurantIdsFromClaims = [
    ...(((claims.restaurant_ids as string[] | undefined) ?? []) as string[]),
    ...(((appMetadata.restaurant_ids as string[] | undefined) ?? []) as string[]),
  ];

  const roles = uniqueRoles([...claimRoles, ...dbRoles]);
  const email = session.user.email ?? profile?.email ?? '';

  return {
    id: session.user.id,
    email,
    full_name:
      profile?.full_name ??
      (typeof session.user.user_metadata?.full_name === 'string' ? session.user.user_metadata.full_name : '') ??
      email,
    avatar_url: profile?.avatar_url,
    roles,
    restaurantIds: Array.from(new Set([...restaurantIdsFromClaims, ...dbRestaurantIds].filter(Boolean))),
    session,
    profile,
  };
}

export function hasAnyRole(user: Pick<AuthUser, 'roles'> | null | undefined, roles: AppRole[]) {
  if (!user) return false;
  return user.roles.some((role) => roles.includes(role));
}

export const supabaseAuthService = {
  async signUp({ email, password, fullName, redirectTo }: SignUpInput): Promise<SignUpResult> {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectTo ?? getBrowserUrl('/auth/callback'),
        data: {
          full_name: fullName,
        },
      },
    });

    if (error) throw mapAuthError(error);

    return {
      user: data.user,
      session: data.session,
      needsEmailConfirmation: Boolean(data.user && !data.session),
    };
  },

  async signIn(email: string, password: string): Promise<AuthUser> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw mapAuthError(error);

    if (data.user) {
      await supabase.from('profiles').update({ last_login_at: new Date().toISOString() }).eq('id', data.user.id);
    }

    const authUser = await buildAuthUser(data.session);
    if (!authUser) throw new AuthServiceError('Sessão Supabase não foi criada.', { status: 401 });
    return authUser;
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw mapAuthError(error);
  },

  async sendPasswordReset(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: getBrowserUrl('/auth/reset-password'),
    });
    if (error) throw mapAuthError(error);
  },

  async updatePassword(password: string) {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw mapAuthError(error);
  },

  async exchangeCodeForSession(code: string) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw mapAuthError(error);
    return data.session;
  },

  async setSessionFromTokens(accessToken: string, refreshToken: string) {
    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) throw mapAuthError(error);
    return data.session;
  },

  async getCurrentUser(): Promise<AuthUser | null> {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw mapAuthError(error);
    return buildAuthUser(data.session);
  },

  async refreshSession(): Promise<AuthUser | null> {
    const { data, error } = await supabase.auth.refreshSession();
    if (error) throw mapAuthError(error);
    return buildAuthUser(data.session);
  },

  onAuthStateChange(callback: (user: AuthUser | null) => void) {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => {
        buildAuthUser(session)
          .then(callback)
          .catch(() => callback(null));
      }, 0);
    });

    return () => data.subscription.unsubscribe();
  },
};
