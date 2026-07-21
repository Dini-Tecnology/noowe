import type { EmailOtpType, Session, User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { getAuthRedirectUrl } from '../utils/auth-redirect';
import { getSupabaseClient } from './supabase';

type SocialProvider = 'apple' | 'google';

const EMAIL_OTP_TYPES: EmailOtpType[] = [
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email',
];

/**
 * Normaliza o `type` recebido no deep link para um EmailOtpType válido.
 * Links de recuperação de senha chegam com `type=recovery`; qualquer outro
 * valor cai no fluxo padrão de confirmação de e-mail (`email`).
 */
function normalizeEmailOtpType(type?: string | null): EmailOtpType {
  return type && (EMAIL_OTP_TYPES as string[]).includes(type)
    ? (type as EmailOtpType)
    : 'email';
}

export interface NormalizedAuthUser {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string | null;
  phone?: string | null;
  role: string;
  roles: Array<{ role: string; restaurant_id?: string | null }>;
  restaurant_ids: string[];
}

function getRedirectUrl(path: 'auth/callback' | 'auth/reset-password') {
  return getAuthRedirectUrl(path);
}

function mapAuthCallbackError(params: Record<string, string>) {
  const code = params.error_code ?? params.error;
  const description = params.error_description ?? params.error;

  if (code === 'otp_expired') {
    return 'Este link de confirmação expirou. Faça um novo cadastro ou solicite outro e-mail de confirmação.';
  }
  if (code === 'access_denied' && description) {
    return description;
  }
  if (description) {
    return description;
  }
  return 'Não foi possível confirmar este link.';
}

function readAuthParamsFromUrl(url: string) {
  const params: Record<string, string> = {};

  try {
    const parsed = Linking.parse(url);
    Object.entries(parsed.queryParams ?? {}).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        if (value[0] !== undefined) params[key] = String(value[0]);
      } else if (value !== undefined && value !== null) {
        params[key] = String(value);
      }
    });
  } catch {
    // Continue with manual parsing below.
  }

  const collect = (segment?: string) => {
    if (!segment) return;
    const query = segment.includes('?') ? segment.split('?').pop() : segment;
    if (!query) return;

    new URLSearchParams(query).forEach((value, key) => {
      if (value && params[key] === undefined) {
        params[key] = value;
      }
    });
  };

  collect(url.split('?')[1]?.split('#')[0]);
  collect(url.split('#')[1]);

  return params;
}

function decodeBase64Url(value: string) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  let buffer = 0;
  let bits = 0;
  let output = '';

  for (const char of base64) {
    const index = alphabet.indexOf(char);
    if (index < 0) continue;
    buffer = (buffer << 6) | index;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }

  try {
    return decodeURIComponent(
      output
        .split('')
        .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
        .join('')
    );
  } catch {
    return output;
  }
}

function readSessionClaims(session: Session | null): Record<string, unknown> {
  if (!session?.access_token) return {};

  try {
    const payload = session.access_token.split('.')[1];
    if (!payload) return {};
    return JSON.parse(decodeBase64Url(payload));
  } catch {
    return {};
  }
}

export function isMissingAuthSessionError(error: unknown) {
  const authError = error as { name?: string; message?: string; status?: number; __isAuthError?: boolean };
  const message = authError?.message ?? '';

  return (
    authError?.name === 'AuthSessionMissingError' ||
    message.includes('Auth session missing') ||
    Boolean(authError?.__isAuthError && authError?.status === 400 && message.toLowerCase().includes('session'))
  );
}

export async function getOptionalSupabaseSessionUser() {
  const supabase = getSupabaseClient();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

  if (sessionError) {
    if (isMissingAuthSessionError(sessionError)) {
      return { session: null, user: null };
    }
    throw sessionError;
  }

  const session = sessionData.session ?? null;
  if (!session?.access_token) {
    return { session: null, user: null };
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) {
    if (isMissingAuthSessionError(userError)) {
      return { session: null, user: null };
    }
    throw userError;
  }

  return { session, user: userData.user ?? null };
}

function uniqueRoleRows(rows: Array<{ role: string; restaurant_id?: string | null }>) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${row.role}:${row.restaurant_id ?? 'global'}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function loadProfile(userId: string) {
  const { data, error } = await getSupabaseClient()
    .from('profiles')
    .select('id,email,full_name,avatar_url,phone,is_active,last_login_at')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  return data as {
    id: string;
    email?: string | null;
    full_name?: string | null;
    avatar_url?: string | null;
    phone?: string | null;
  } | null;
}

async function loadRoles(userId: string) {
  const [{ data: profileRoles, error: profileRolesError }, { data: restaurantRoles, error: restaurantRolesError }] =
    await Promise.all([
      getSupabaseClient().from('profile_roles').select('role_key,restaurant_id,is_active').eq('user_id', userId).eq('is_active', true),
      getSupabaseClient().from('user_roles').select('role,restaurant_id,is_active').eq('user_id', userId).eq('is_active', true),
    ]);

  if (profileRolesError) throw profileRolesError;
  if (restaurantRolesError) throw restaurantRolesError;

  return uniqueRoleRows([
    ...(((profileRoles as Array<{ role_key: string; restaurant_id?: string | null }> | null) ?? []).map((row) => ({
      role: row.role_key,
      restaurant_id: row.restaurant_id,
    }))),
    ...(((restaurantRoles as Array<{ role: string; restaurant_id?: string | null }> | null) ?? []).map((row) => ({
      role: row.role,
      restaurant_id: row.restaurant_id,
    }))),
  ]);
}

async function upsertProfile(user: User | null, extra?: Record<string, unknown>) {
  if (!user) return null;

  const profile = {
    id: user.id,
    email: user.email ?? extra?.email ?? null,
    full_name:
      extra?.full_name ??
      (typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : null),
    avatar_url:
      extra?.avatar_url ??
      (typeof user.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url : null),
    phone: user.phone ?? extra?.phone ?? null,
    ...((user.phone || extra?.phone) ? { phone_verified: true } : {}),
    provider: extra?.provider ?? user.app_metadata?.provider ?? null,
    last_login_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await getSupabaseClient()
    .from('profiles')
    .upsert(profile, { onConflict: 'id' })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function normalizeUser(user: User | null, session: Session | null): Promise<NormalizedAuthUser | null> {
  if (!user) return null;

  const claims = readSessionClaims(session);
  const profile = await loadProfile(user.id).catch(() => null);
  const dbRoles = await loadRoles(user.id).catch(() => []);
  const claimRoles = ((claims.roles as string[] | undefined) ?? []).map((role) => ({ role }));
  const claimRestaurantIds = (claims.restaurant_ids as string[] | undefined) ?? [];
  const roles = uniqueRoleRows([...dbRoles, ...claimRoles]);
  const restaurantIds = Array.from(
    new Set([
      ...roles.map((row) => row.restaurant_id).filter(Boolean),
      ...claimRestaurantIds,
    ] as string[])
  );
  const primaryRole =
    (claims.app_role as string | undefined) ??
    roles.find((row) => ['admin', 'owner', 'manager'].includes(row.role))?.role ??
    roles[0]?.role ??
    'customer';

  return {
    id: user.id,
    email: user.email ?? profile?.email ?? '',
    full_name:
      profile?.full_name ??
      (typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : '') ??
      '',
    avatar_url:
      profile?.avatar_url ??
      (typeof user.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url : undefined),
    phone: profile?.phone ?? user.phone ?? undefined,
    role: primaryRole,
    roles: roles.length > 0 ? roles : [{ role: 'customer' }],
    restaurant_ids: restaurantIds,
  };
}

async function normalizeSession(session: Session | null, user: User | null = session?.user ?? null) {
  return {
    access_token: session?.access_token,
    refresh_token: session?.refresh_token,
    user: (await normalizeUser(user, session)) ?? undefined,
  };
}

async function throwFunctionError(error: unknown): Promise<never> {
  const context = (error as { context?: unknown })?.context;
  if (context instanceof Response) {
    const body = await context.json().catch(() => null);
    if (body?.error) {
      throw new Error(String(body.error));
    }
  }

  throw error instanceof Error ? error : new Error(String(error));
}

export const supabaseAuthAdapter = {
  async login(email: string, password: string) {
    const { data, error } = await getSupabaseClient().auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (data.user) {
      await upsertProfile(data.user);
    }

    return normalizeSession(data.session, data.user);
  },

  async resendSignupConfirmation(email: string) {
    const { error } = await getSupabaseClient().functions.invoke('register-with-resend', {
      body: {
        action: 'resend',
        email,
        emailRedirectTo: getRedirectUrl('auth/callback'),
      },
    });
    if (error) await throwFunctionError(error);
  },

  async register(email: string, password: string, fullName: string) {
    const { data, error } = await getSupabaseClient().functions.invoke('register-with-resend', {
      body: {
        email,
        password,
        fullName,
        emailRedirectTo: getRedirectUrl('auth/callback'),
      },
    });
    if (error) await throwFunctionError(error);

    return {
      user: data?.user
        ? {
            id: data.user.id,
            email: data.user.email ?? email,
            full_name: fullName,
            role: 'customer',
            roles: [{ role: 'customer' }],
            restaurant_ids: [],
          }
        : undefined,
      needsEmailConfirmation: true,
    };
  },

  async socialLogin(provider: SocialProvider, idToken: string) {
    const { data, error } = await getSupabaseClient().auth.signInWithIdToken({
      provider,
      token: idToken,
    });
    if (error) throw error;
    if (data.user) {
      await upsertProfile(data.user, { provider });
    }

    return {
      ...(await normalizeSession(data.session, data.user)),
      success: true,
      authenticated: Boolean(data.session?.access_token),
    };
  },

  async socialOAuthLogin(provider: SocialProvider, redirectTo?: string) {
    const { data, error } = await getSupabaseClient().auth.signInWithOAuth({
      provider,
      options: { redirectTo: redirectTo ?? getRedirectUrl('auth/callback') },
    });
    if (error) throw error;

    return {
      success: true,
      url: data.url,
    };
  },

  async sendPhoneOtp(phone: string, channel?: 'sms' | 'whatsapp') {
    const { error } = await getSupabaseClient().auth.signInWithOtp({
      phone,
      options: channel ? ({ channel } as any) : undefined,
    });
    if (error) throw error;
  },

  async verifyPhoneOtp(phone: string, token: string) {
    const { data, error } = await getSupabaseClient().auth.verifyOtp({
      phone,
      token,
      type: 'sms',
    });
    if (error) throw error;

    const profile = await upsertProfile(data.user, { phone });
    const sessionData = await normalizeSession(data.session, data.user);

    return {
      ...sessionData,
      profileComplete: Boolean(profile?.full_name),
    };
  },

  async updateProfile(patch: {
    full_name?: string;
    email?: string;
    birth_date?: string;
    phone?: string;
    avatar_url?: string;
    marketing_consent?: boolean;
    accepted_terms_version?: string;
    accepted_privacy_version?: string;
  }) {
    const { user } = await getOptionalSupabaseSessionUser();
    if (!user) throw new Error('No authenticated Supabase user');

    const prefs =
      patch.accepted_terms_version !== undefined || patch.accepted_privacy_version !== undefined
        ? {
            accepted_terms_version: patch.accepted_terms_version,
            accepted_privacy_version: patch.accepted_privacy_version,
          }
        : undefined;

    const { data, error } = await getSupabaseClient()
      .from('profiles')
      .update({
        full_name: patch.full_name,
        email: patch.email,
        birth_date: patch.birth_date,
        phone: patch.phone,
        avatar_url: patch.avatar_url,
        marketing_consent: patch.marketing_consent,
        ...(prefs ? { preferences: prefs } : {}),
        ...((patch.phone !== undefined && patch.phone !== '') ? { phone_verified: true } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)
      .select()
      .single();
    if (error) throw error;

    return data;
  },

  async sendEmailOtp(email: string) {
    const { error } = await getSupabaseClient().auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: getRedirectUrl('auth/callback'),
      },
    });
    if (error) throw error;
  },

  async verifyEmailOtp(email: string, token: string) {
    const { data, error } = await getSupabaseClient().auth.verifyOtp({
      email,
      token,
      type: 'email',
    });
    if (error) throw error;
    if (data.user) {
      await upsertProfile(data.user);
    }
    return normalizeSession(data.session, data.user ?? null);
  },

  async verifyEmailTokenHash(tokenHash: string, type: EmailOtpType = 'email') {
    const { data, error } = await getSupabaseClient().auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    if (error) throw error;
    if (data.user) {
      await upsertProfile(data.user);
    }
    return normalizeSession(data.session, data.user ?? null);
  },

  /**
   * Envia o e-mail de redefinição de senha pela Edge Function `register-with-resend`
   * (template NOOWE via Resend + deep link direto do app), em vez do e-mail padrão
   * do Supabase. O link chega como `<scheme>://auth/reset-password?token_hash=...&type=recovery`,
   * abrindo o app diretamente, sem passar por `/auth/v1/verify` no navegador.
   */
  async sendPasswordReset(email: string) {
    const { error } = await getSupabaseClient().functions.invoke('register-with-resend', {
      body: {
        action: 'password-reset',
        email,
        emailRedirectTo: getRedirectUrl('auth/reset-password'),
      },
    });
    if (error) await throwFunctionError(error);
  },

  async exchangeCodeForSession(code: string) {
    const { data, error } = await getSupabaseClient().auth.exchangeCodeForSession(code);
    if (error) throw error;
    if (data.user) {
      await upsertProfile(data.user);
    }

    return normalizeSession(data.session, data.user ?? null);
  },

  async recoverSessionFromUrl(url: string) {
    const params = readAuthParamsFromUrl(url);
    const authError = params.error ?? params.error_code ?? params.error_description;

    if (authError) {
      throw new Error(mapAuthCallbackError(params));
    }

    if (params.code) {
      return supabaseAuthAdapter.exchangeCodeForSession(params.code);
    }

    if (params.token_hash) {
      return supabaseAuthAdapter.verifyEmailTokenHash(
        params.token_hash,
        normalizeEmailOtpType(params.type),
      );
    }

    if (params.access_token && params.refresh_token) {
      const { data, error } = await getSupabaseClient().auth.setSession({
        access_token: params.access_token,
        refresh_token: params.refresh_token,
      });
      if (error) throw error;
      if (data.user) {
        await upsertProfile(data.user);
      }

      return normalizeSession(data.session, data.user ?? null);
    }

    return supabaseAuthAdapter.getSession();
  },

  async updatePassword(password: string) {
    const { error } = await getSupabaseClient().auth.updateUser({ password });
    if (error) throw error;
  },

  async logout() {
    const { error } = await getSupabaseClient().auth.signOut();
    if (error) throw error;
  },

  async getSession() {
    const { data, error } = await getSupabaseClient().auth.getSession();
    if (error) throw error;
    return normalizeSession(data.session);
  },

  async getCurrentUser() {
    const { session, user } = await getOptionalSupabaseSessionUser();
    return normalizeUser(user, session);
  },

  async isAuthenticated(): Promise<boolean> {
    const { data } = await getSupabaseClient().auth.getSession();
    return Boolean(data.session?.access_token);
  },

  async refreshToken(): Promise<boolean> {
    const { data, error } = await getSupabaseClient().auth.refreshSession();
    if (error) throw error;
    return Boolean(data.session?.access_token);
  },

  async refreshSession() {
    const { data, error } = await getSupabaseClient().auth.refreshSession();
    if (error) throw error;
    return normalizeSession(data.session);
  },

  onAuthStateChange(callback: (authenticated: boolean, user?: NormalizedAuthUser | null) => void) {
    const { data } = getSupabaseClient().auth.onAuthStateChange((_event, session) => {
      setTimeout(() => {
        normalizeSession(session)
          .then((payload) => callback(Boolean(payload.access_token), payload.user ?? null))
          .catch(() => callback(false, null));
      }, 0);
    });

    return () => data.subscription.unsubscribe();
  },
};
