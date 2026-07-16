/**
 * Shared restaurant/staff domain types (Restaurant app).
 */

export interface Restaurant {
  id: string;
  name: string;
  description?: string;
  cuisine_type?: string[];
  address?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  phone?: string;
  email?: string;
  logo_url?: string;
  cover_image_url?: string;
  is_active: boolean;
  service_type?: string;
  created_at?: string;
  updated_at?: string;
}

export type StaffRole =
  | 'owner'
  | 'manager'
  | 'chef'
  | 'cook'
  | 'waiter'
  | 'barman'
  | 'maitre'
  | 'cashier'
  | 'host';

export interface StaffMember {
  id: string;
  user_id: string;
  restaurant_id: string;
  /** Primary role (highest priority) */
  role: StaffRole;
  /** All roles the user has in this restaurant */
  roles: StaffRole[];
  status: 'active' | 'inactive' | 'on_break';
  permissions?: string[];
}

export interface UserRestaurantRole {
  restaurant: {
    id: string;
    name: string;
    logo_url?: string;
    service_type?: string;
  };
  roles: StaffRole[];
  is_primary: boolean;
  last_accessed?: Date;
}
