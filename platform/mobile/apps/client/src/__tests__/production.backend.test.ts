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
      p_items: [{ menu_item_id: 'item-1', quantity: 2, special_instructions: undefined, customizations: [], diner_id: null }],
    });
    expect(JSON.stringify(mockRpc.mock.calls[0][1])).not.toContain('price');
  });

  it('delegates QR validation to the transactional database RPC', async () => {
    mockRpc.mockResolvedValueOnce({ data: { restaurantId: 'r', tableId: 't', tableSessionId: 's', tableNumber: '10' }, error: null });
    await expect(customerBackend.openTableSession('opaque-signed-token')).resolves.toEqual({ restaurantId: 'r', tableId: 't', tableSessionId: 's', tableNumber: '10' });
    expect(mockRpc).toHaveBeenCalledWith('customer_open_table_session', { p_qr_data: 'opaque-signed-token' });
  });

  it('asks the database for a real table QR when simulating a scan', async () => {
    mockRpc.mockResolvedValueOnce({
      data: { qrCodeData: 'noowe://t/abc', restaurantId: 'r', tableNumber: '4' },
      error: null,
    });
    await expect(customerBackend.devPickTableQr('r')).resolves.toEqual({
      qrCodeData: 'noowe://t/abc', restaurantId: 'r', tableNumber: '4',
    });
    expect(mockRpc).toHaveBeenCalledWith('customer_dev_pick_table_qr', { p_restaurant_id: 'r' });
  });

  it('asks the database to mark the order ready when skipping prep', async () => {
    mockRpc.mockResolvedValueOnce({ data: { orderId: 'order-1', status: 'ready' }, error: null });
    await expect(customerBackend.devSkipPrep('order-1')).resolves.toBeUndefined();
    expect(mockRpc).toHaveBeenCalledWith('customer_dev_skip_prep', { p_order_id: 'order-1' });
  });

  it('does not hide backend errors behind mock data', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: new Error('unavailable') });
    await expect(customerBackend.openTableSession('invalid')).rejects.toThrow('unavailable');
  });

  describe('@username table invites (ADR-011)', () => {
    const card = (username: string) => ({ userId: `u-${username}`, username, displayName: 'Ana T.', avatarUrl: null });
    const invite = {
      id: 'inv1', tableSessionId: 's1', restaurantId: 'r1', restaurantName: 'Noowe', tableId: 't1', tableNumber: '12',
      status: 'pending', closedReason: null, expiresAt: '2026-09-26T20:30:00Z', respondedAt: null,
      createdAt: '2026-09-26T20:00:00Z', capacityRequestId: null, capacityExpiresAt: null,
      inviter: card('ana'), invitee: card('beto'), sentByMe: true, canCancel: true, canRespond: false,
    };

    it('checks and sets the username through the guarded RPCs', async () => {
      mockRpc.mockResolvedValueOnce({ data: { normalized: 'bruno', available: false, reason: 'taken' }, error: null });
      await expect(customerBackend.checkUsernameAvailability('@Bruno')).resolves.toEqual({ normalized: 'bruno', available: false, reason: 'taken' });
      expect(mockRpc).toHaveBeenCalledWith('customer_check_username_availability', { p_username: '@Bruno' });

      mockRpc.mockResolvedValueOnce({ data: { username: 'bruno-2', changed: true }, error: null });
      await expect(customerBackend.setUsername('bruno-2')).resolves.toBe('bruno-2');
      expect(mockRpc).toHaveBeenCalledWith('customer_set_my_username', { p_username: 'bruno-2' });
    });

    it('searches by @ prefix inside the table session and maps invite states', async () => {
      mockRpc.mockResolvedValueOnce({ data: [{ ...card('ana'), inviteState: 'already_at_table' }, { ...card('ana-b'), inviteState: 'bogus' }], error: null });
      const results = await customerBackend.searchUsersForTable('s1', 'ana');
      expect(mockRpc).toHaveBeenCalledWith('customer_search_users_for_table', { p_table_session_id: 's1', p_query: 'ana' });
      expect(results.map((r) => r.inviteState)).toEqual(['already_at_table', 'invitable']);
    });

    it('sends, cancels and lists invites without client-side decisions', async () => {
      mockRpc.mockResolvedValueOnce({ data: invite, error: null });
      await expect(customerBackend.sendTableUserInvite('s1', 'beto')).resolves.toMatchObject({ id: 'inv1', status: 'pending', invitee: { username: 'beto' } });
      expect(mockRpc).toHaveBeenCalledWith('customer_send_table_user_invite', { p_table_session_id: 's1', p_invitee_username: 'beto' });

      mockRpc.mockResolvedValueOnce({ data: { ...invite, status: 'cancelled', canCancel: false }, error: null });
      await expect(customerBackend.cancelTableUserInvite('inv1')).resolves.toMatchObject({ status: 'cancelled', canCancel: false });
      expect(mockRpc).toHaveBeenCalledWith('customer_cancel_table_user_invite', { p_invite_id: 'inv1' });

      mockRpc.mockResolvedValueOnce({ data: [invite], error: null });
      await expect(customerBackend.listIncomingTableInvites()).resolves.toHaveLength(1);
      expect(mockRpc).toHaveBeenCalledWith('customer_list_incoming_table_invites');

      await expect(customerBackend.getTableUserInvites([])).resolves.toEqual([]);
    });

    it('maps accept results: joined, waiting for the host stand, closed', async () => {
      mockRpc.mockResolvedValueOnce({ data: { status: 'accepted', visit: { restaurantId: 'r1', tableId: 't1', tableSessionId: 's1', tableNumber: '12' }, invite }, error: null });
      await expect(customerBackend.acceptTableUserInvite('inv1')).resolves.toMatchObject({
        status: 'accepted', visit: { tableSessionId: 's1' }, idempotentReplay: false,
      });
      expect(mockRpc).toHaveBeenCalledWith('customer_accept_table_user_invite', { p_invite_id: 'inv1' });

      mockRpc.mockResolvedValueOnce({ data: { status: 'awaiting_capacity', capacityRequestId: 'c1', invite }, error: null });
      await expect(customerBackend.acceptTableUserInvite('inv1')).resolves.toMatchObject({ status: 'awaiting_capacity', visit: null, capacityRequestId: 'c1' });

      mockRpc.mockResolvedValueOnce({ data: { status: 'expired', invite: { ...invite, status: 'expired', closedReason: 'ttl' } }, error: null });
      await expect(customerBackend.acceptTableUserInvite('inv1')).resolves.toMatchObject({ status: 'expired', visit: null, invite: { closedReason: 'ttl' } });
    });

    it('surfaces P0004 (unpaid balance at another table) as an error', async () => {
      mockRpc.mockResolvedValueOnce({ data: null, error: Object.assign(new Error('Quite sua conta'), { code: 'P0004' }) });
      await expect(customerBackend.acceptTableUserInvite('inv1')).rejects.toMatchObject({ code: 'P0004' });
    });
  });
});
