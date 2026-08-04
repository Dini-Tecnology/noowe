const mockRpc = jest.fn();
const mockGetUser = jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });

jest.mock('expo-crypto', () => ({ randomUUID: () => 'request-1' }));
jest.mock('@/shared/services/supabase', () => ({
  getSupabaseClient: () => ({ rpc: mockRpc, auth: { getUser: mockGetUser } }),
}));

import customerBackend from '../services/customer-backend';

describe('CustomerBackend production contracts', () => {
  it('places an order with IDs and quantities only and adds idempotency', async () => {
    mockRpc.mockResolvedValueOnce({
      data: { id: 'order-1', restaurant_id: 'restaurant-1', status: 'pending', subtotal: 25, total_amount: 25, order_items: [] },
      error: null,
    });
    await customerBackend.placeOrder({ restaurantId: 'restaurant-1', tableSessionId: 'session-1', items: [{ menuItemId: 'item-1', quantity: 2 }] });
    expect(mockRpc).toHaveBeenCalledWith('customer_place_order', {
      p_restaurant_id: 'restaurant-1', p_table_session_id: 'session-1', p_client_request_id: 'request-1',
      p_items: [{ menu_item_id: 'item-1', quantity: 2, special_instructions: undefined, customizations: [] }],
    });
    expect(JSON.stringify(mockRpc.mock.calls[0][1])).not.toContain('price');
  });

  it('delegates QR validation to the transactional database RPC', async () => {
    mockRpc.mockResolvedValueOnce({ data: { restaurantId: 'r', tableId: 't', tableSessionId: 's', tableNumber: '10' }, error: null });
    await expect(customerBackend.openTableSession('opaque-signed-token')).resolves.toEqual({ restaurantId: 'r', tableId: 't', tableSessionId: 's', tableNumber: '10' });
    expect(mockRpc).toHaveBeenCalledWith('customer_open_table_session', { p_qr_data: 'opaque-signed-token' });
  });

  it('does not hide backend errors behind mock data', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: new Error('unavailable') });
    await expect(customerBackend.openTableSession('invalid')).rejects.toThrow('unavailable');
  });
});
