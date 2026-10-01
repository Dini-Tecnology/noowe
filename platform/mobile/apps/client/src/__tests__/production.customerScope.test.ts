/**
 * RLS lets restaurant staff read every row of their restaurant, so a staff
 * member signed into the customer app would see other customers' orders,
 * reservations, queue entries, favorites and loyalty points as their own
 * unless each "my …" list filters by the signed-in user explicitly.
 */
const mockGetUser = jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
const mockFromCalls: { table: string; calls: [string, unknown[]][] }[] = [];
const mockRpc = jest.fn().mockResolvedValue({ data: [], error: null });

function mockQueryBuilder(table: string) {
  const record = { table, calls: [] as [string, unknown[]][] };
  mockFromCalls.push(record);
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'order', 'limit', 'lt', 'is', 'lte', 'gte']) {
    builder[method] = (...args: unknown[]) => {
      record.calls.push([method, args]);
      return builder;
    };
  }
  builder.then = (resolve: (value: unknown) => unknown) => resolve({ data: [], error: null });
  return builder;
}

jest.mock('expo-crypto', () => ({ randomUUID: () => 'request-1' }));
jest.mock('@/shared/services/supabase', () => ({
  getSupabaseClient: () => ({
    rpc: mockRpc,
    auth: { getUser: mockGetUser },
    from: (table: string) => mockQueryBuilder(table),
  }),
}));

import customerBackend from '../services/customer-backend';

function eqFilters(table: string) {
  const record = mockFromCalls.find((entry) => entry.table === table);
  if (!record) throw new Error(`no query on ${table}`);
  return record.calls.filter(([method]) => method === 'eq').map(([, args]) => args);
}

describe('customer lists are scoped to the signed-in user', () => {
  beforeEach(() => {
    mockFromCalls.length = 0;
  });

  it.each([
    ['orders', () => customerBackend.listOrders(), ['customer_id', 'user-1']],
    ['reservations', () => customerBackend.listReservations(), ['customer_id', 'user-1']],
    ['favorites', () => customerBackend.listFavorites(), ['user_id', 'user-1']],
    ['loyalty_programs', () => customerBackend.listLoyalty(), ['user_id', 'user-1']],
  ] as const)('%s', async (table, load, expectedFilter) => {
    await load();
    expect(eqFilters(table)).toContainEqual(expectedFilter);
  });

  // The queue list goes through an RPC scoped to auth.uid() server-side (it also
  // computes the live position), never through a staff-visible table select.
  it('waitlist_entries', async () => {
    await customerBackend.listMyWaitlist();
    expect(mockRpc).toHaveBeenCalledWith('customer_my_waitlist');
    expect(mockFromCalls.find((entry) => entry.table === 'waitlist_entries')).toBeUndefined();
  });
});
