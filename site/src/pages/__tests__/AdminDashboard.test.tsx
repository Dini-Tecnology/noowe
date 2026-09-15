import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import type { ReactElement, ReactNode } from 'react';
import AdminDashboard from '@/pages/AdminDashboard';

const mockSignOut = vi.fn();
const mockFrom = vi.fn();
const mockFetch = vi.fn();

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: {
      id: 'admin-1',
      email: 'admin@okinawa.com',
      name: 'Admin User',
      roles: ['admin'],
      restaurantIds: ['restaurant-1'],
      accessToken: 'supabase-access-token',
    },
    loading: false,
    isAuthenticated: true,
    signIn: vi.fn(),
    signOut: mockSignOut,
    refresh: vi.fn(),
    hasAnyRole: (roles: string[]) => roles.includes('admin'),
  }),
}));

vi.mock('@/components/auth/RequireAuth', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

const renderWithProviders = (ui: ReactElement) => render(<HelmetProvider>{ui}</HelmetProvider>);

function mockSupabaseQueries() {
  mockFrom.mockImplementation((table: string) => ({
    select: vi.fn(() => {
      if (table === 'profiles') {
        return {
          order: vi.fn(() => ({
            limit: vi.fn(() =>
              Promise.resolve({
                data: [
                  {
                    id: 'admin-1',
                    email: 'admin@okinawa.com',
                    full_name: 'Admin User',
                    is_active: true,
                    last_login_at: null,
                    created_at: '2026-06-22T12:00:00.000Z',
                  },
                ],
                error: null,
              })
            ),
          })),
        };
      }

      if (table === 'profile_roles') {
        return {
          in: vi.fn(() => ({
            eq: vi.fn(() =>
              Promise.resolve({
                data: [{ user_id: 'admin-1', role_key: 'admin', is_active: true }],
                error: null,
              })
            ),
          })),
        };
      }

      return {
        in: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
        })),
      };
    }),
  }));
}

describe('AdminDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = mockFetch;
    mockSupabaseQueries();
  });

  it('renders Supabase-protected dashboard metrics for an admin user', async () => {
    renderWithProviders(<AdminDashboard />);

    expect(screen.getByRole('heading', { name: 'Admin Dashboard' })).toBeInTheDocument();
    expect(screen.getByText('Supabase')).toBeInTheDocument();
    expect(screen.getByText('Auto')).toBeInTheDocument();
    expect(screen.getByText('Ativas')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Admin User')).toBeInTheDocument();
    });
  });

  it('loads visible users from Supabase tables instead of a custom auth API', async () => {
    renderWithProviders(<AdminDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Admin User')).toBeInTheDocument();
      expect(screen.getAllByText('admin@okinawa.com')).toHaveLength(2);
      expect(screen.getByText('admin')).toBeInTheDocument();
    });

    expect(mockFrom).toHaveBeenCalledWith('profiles');
    expect(mockFrom).toHaveBeenCalledWith('profile_roles');
    expect(mockFrom).toHaveBeenCalledWith('user_roles');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
