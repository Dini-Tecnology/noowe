/**
 * Restaurant / staff data sourced from Supabase (public.restaurants + public.user_roles).
 * Replaces legacy REST endpoints such as /users/staff-profile and GET /restaurants/:id.
 */

import type { Restaurant, StaffMember, StaffRole, UserRestaurantRole } from '../types/restaurant-domain';
import { getSupabaseClient, isSupabaseConfigured } from './supabase';
import { getOptionalSupabaseSessionUser } from './supabase-auth';

const ROLE_PRIORITY: StaffRole[] = [
  'owner',
  'manager',
  'maitre',
  'chef',
  'cook',
  'waiter',
  'barman',
  'cashier',
  'host',
];

function mapRestaurantRow(row: Record<string, unknown>): Restaurant {
  const cuisineRaw = row.cuisine_types;
  let cuisine_type: string[] | undefined;
  if (Array.isArray(cuisineRaw)) {
    cuisine_type = cuisineRaw.filter((c): c is string => typeof c === 'string');
  }

  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string | null) ?? undefined,
    cuisine_type,
    address: (row.address as string | null) ?? undefined,
    city: (row.city as string | null) ?? undefined,
    state: (row.state as string | null) ?? undefined,
    postal_code: (row.zip_code as string | null) ?? undefined,
    phone: (row.phone as string | null) ?? undefined,
    email: (row.email as string | null) ?? undefined,
    logo_url: (row.logo_url as string | null) ?? undefined,
    cover_image_url: (row.banner_url as string | null) ?? undefined,
    is_active: Boolean(row.is_active),
    service_type: (row.service_type as string | null) ?? undefined,
    created_at: (row.created_at as string | null) ?? undefined,
    updated_at: (row.updated_at as string | null) ?? undefined,
  };
}

function normalizeStaffRole(role: string): StaffRole | null {
  if (role === 'customer') return null;
  const allowed = new Set(ROLE_PRIORITY);
  return allowed.has(role as StaffRole) ? (role as StaffRole) : null;
}

function pickPrimaryRole(roles: StaffRole[]): StaffRole {
  for (const p of ROLE_PRIORITY) {
    if (roles.includes(p)) return p;
  }
  return roles[0];
}

type UserRoleRow = {
  id: string;
  role: string;
};

type UserRoleWithRestaurant = {
  restaurant_id: string;
  role: string;
  restaurants: {
    id: string;
    name: string;
    logo_url: string | null;
    service_type: string | null;
  } | Array<{
    id: string;
    name: string;
    logo_url: string | null;
    service_type: string | null;
  }> | null;
};

export async function fetchRestaurantFromSupabase(id: string): Promise<Restaurant | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from('restaurants').select('*').eq('id', id).maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return mapRestaurantRow(data as Record<string, unknown>);
}

export async function fetchStaffMemberForCurrentUser(restaurantId: string): Promise<StaffMember | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = getSupabaseClient();
  const { user } = await getOptionalSupabaseSessionUser();
  if (!user) return null;

  const { data: rows, error } = await supabase
    .from('user_roles')
    .select('id, role')
    .eq('user_id', user.id)
    .eq('restaurant_id', restaurantId)
    .eq('is_active', true);

  if (error) throw error;
  if (!rows?.length) return null;

  const roles = (rows as UserRoleRow[])
    .map((r) => normalizeStaffRole(r.role))
    .filter((r): r is StaffRole => r !== null);

  if (!roles.length) return null;

  return {
    id: (rows[0] as UserRoleRow).id,
    user_id: user.id,
    restaurant_id: restaurantId,
    role: pickPrimaryRole(roles),
    roles,
    status: 'active',
  };
}

export async function fetchMyRestaurantRolesGrouped(): Promise<UserRestaurantRole[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = getSupabaseClient();
  const { user } = await getOptionalSupabaseSessionUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('user_roles')
    .select(
      `
      restaurant_id,
      role,
      restaurants (
        id,
        name,
        logo_url,
        service_type
      )
    `,
    )
    .eq('user_id', user.id)
    .eq('is_active', true);

  if (error) throw error;
  if (!data?.length) return [];

  const grouped = new Map<
    string,
    {
      restaurant: UserRestaurantRole['restaurant'];
      roles: Set<StaffRole>;
    }
  >();

  for (const row of data as UserRoleWithRestaurant[]) {
    const r = Array.isArray(row.restaurants) ? row.restaurants[0] : row.restaurants;
    if (!r?.id) continue;

    const normalized = normalizeStaffRole(row.role);
    if (!normalized) continue;

    const existing = grouped.get(row.restaurant_id);
    if (existing) {
      existing.roles.add(normalized);
    } else {
      grouped.set(row.restaurant_id, {
        restaurant: {
          id: r.id,
          name: r.name,
          logo_url: r.logo_url ?? undefined,
          service_type: r.service_type ?? undefined,
        },
        roles: new Set([normalized]),
      });
    }
  }

  const list: UserRestaurantRole[] = [];
  let i = 0;
  for (const [, g] of grouped) {
    list.push({
      restaurant: g.restaurant,
      roles: Array.from(g.roles),
      is_primary: i === 0,
    });
    i += 1;
  }

  return list;
}

/** First restaurant the signed-in user can access (for cold start without stored id). */
export async function resolveInitialRestaurantId(): Promise<string | null> {
  const grouped = await fetchMyRestaurantRolesGrouped();
  return grouped[0]?.restaurant.id ?? null;
}
