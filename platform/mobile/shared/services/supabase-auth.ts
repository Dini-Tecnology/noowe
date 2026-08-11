import type { Session, User } from '@supabase/supabase-js';
import { getSupabaseClient } from './supabase';

type SocialProvider = 'apple' | 'google';
type AppRole = 'owner' | 'manager' | 'chef' | 'waiter' | 'barman' | 'maitre' | 'cashier' | 'host';

export interface UserContextRole {
  role: AppRole;
  restaurant_id: string;
  restaurant?: {
    id: string;
    name: string;
    logo_url?: string;
    service_type?: string;
  };
}

export interface UserContext {
  account_type: 'customer' | 'restaurant';
  profile: Record<string, unknown> | null;
  roles: UserContextRole[];
  restaurant_ids: string[];
}

function normalizeUser(user: User | null) {
  if (!user) return null;

  const metadataRoles = Array.isArray(user.app_metadata?.roles) ? user.app_metadata.roles : [];

  return {
    id: user.id,
    email: user.email ?? '',
    full_name: typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : '',
    avatar_url: typeof user.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url : undefined,
    roles: metadataRoles.map((role) => ({ role: String(role).toLowerCase() })),
  };
}

function normalizeSession(session: Session | null, user: User | null = session?.user ?? null) {
  return {
    access_token: session?.access_token,
    refresh_token: session?.refresh_token,
    user: normalizeUser(user) ?? undefined,
  };
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

async function getAuthenticatedUserId(userId?: string) {
  if (userId) return userId;

  const { data, error } = await getSupabaseClient().auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error('No authenticated Supabase user');
  return data.user.id;
}

function normalizeRoleRow(row: any): UserContextRole | null {
  if (!row?.restaurant_id || !row?.role) return null;

  const restaurant = Array.isArray(row.restaurants) ? row.restaurants[0] : row.restaurants;

  return {
    role: String(row.role).toLowerCase() as AppRole,
    restaurant_id: row.restaurant_id,
    restaurant: restaurant
      ? {
          id: restaurant.id,
          name: restaurant.name,
          logo_url: restaurant.logo_url,
          service_type: restaurant.service_type,
        }
      : undefined,
  };
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

  async register(email: string, password: string, fullName: string) {
    const { data, error } = await getSupabaseClient().auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    });
    if (error) throw error;
    if (data.session && data.user) {
      await upsertProfile(data.user, { full_name: fullName });
    }

    return normalizeSession(data.session, data.user);
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
      ...normalizeSession(data.session, data.user),
      success: true,
      authenticated: Boolean(data.session?.access_token),
    };
  },

  async socialOAuthLogin(provider: SocialProvider, redirectTo?: string) {
    const { data, error } = await getSupabaseClient().auth.signInWithOAuth({
      provider,
      options: redirectTo ? { redirectTo } : undefined,
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
    const sessionData = normalizeSession(data.session, data.user);

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
    const { data: userData, error: userError } = await getSupabaseClient().auth.getUser();
    if (userError) throw userError;
    if (!userData.user) throw new Error('No authenticated Supabase user');

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
      .eq('id', userData.user.id)
      .select()
      .single();
    if (error) throw error;

    return data;
  },

  async sendEmailOtp(email: string) {
    const { error } = await getSupabaseClient().auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
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

  async fetchUserContext(userId?: string): Promise<UserContext> {
    const id = await getAuthenticatedUserId(userId);
    const supabase = getSupabaseClient();

    const [{ data: profile, error: profileError }, { data: roleRows, error: rolesError }] =
      await Promise.all([
        supabase.from('profiles').select('*').eq('id', id).maybeSingle(),
        supabase
          .from('user_roles')
          .select('role, restaurant_id, is_active, restaurants(id, name, logo_url, service_type)')
          .eq('user_id', id)
          .eq('is_active', true),
      ]);

    if (profileError) throw profileError;
    if (rolesError) throw rolesError;

    const roles = (roleRows ?? [])
      .map(normalizeRoleRow)
      .filter((role): role is UserContextRole => Boolean(role));

    return {
      account_type: roles.length > 0 ? 'restaurant' : 'customer',
      profile: profile ?? null,
      roles,
      restaurant_ids: Array.from(new Set(roles.map((role) => role.restaurant_id))),
    };
  },

  async logout() {
    const { error } = await getSupabaseClient().auth.signOut();
    if (error) throw error;
  },

  async getCurrentUser() {
    const { data, error } = await getSupabaseClient().auth.getUser();
    if (error) throw error;
    const user = normalizeUser(data.user);
    if (!user || !data.user) return user;

    try {
      const context = await this.fetchUserContext(data.user.id);
      return {
        ...user,
        account_type: context.account_type,
        roles: context.roles,
        restaurant_ids: context.restaurant_ids,
      };
    } catch {
      return user;
    }
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
};
