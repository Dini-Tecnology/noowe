/** Decisão 11: cortesia por item pedida na comanda; aparece na Central de Aprovações; ninguém aprova a própria. */
import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockRequest = jest.fn();
const mockRoles: { serverRoles: string[]; serverRole: string } = { serverRoles: ['waiter'], serverRole: 'waiter' };
const mockApprovals: any[] = [];
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => 'Icon' }));
jest.mock('react-native-qrcode-svg', () => 'QRCode');
jest.mock('@okinawa/shared/contexts/ThemeContext', () => ({ useColors: () => new Proxy({}, { get: () => '#333333' }) }));
jest.mock('@okinawa/shared/services/supabase-api', () => ({
  supabaseApiAdapter: {
    requestApproval: (...args: any[]) => mockRequest(...args),
    getTableComanda: () => Promise.resolve({
      diners: [{ dinerId: 'd1', displayName: 'Ana' }], subtotal: 40,
      items: [{ orderItemId: 'item-1', name: 'Risoto', quantity: 1, totalPrice: 40, status: 'delivered', dinerId: 'd1', dinerName: 'Ana' }],
    }),
  },
}));
jest.mock('@okinawa/shared/services/supabase-auth', () => ({
  getOptionalSupabaseSessionUser: () => Promise.resolve({ user: { id: 'me' } }),
}));
jest.mock('../contexts/RestaurantRoleContext', () => ({
  useRestaurantRole: () => ({ restaurantId: 'rest-1', role: mockRoles.serverRole, ...mockRoles, serviceFeatures: {}, capabilities: null }),
}));
jest.mock('../screens/v2/shared/usePlanLocks', () => ({ usePlanLocks: () => [] }));
jest.mock('../screens/v2/shared/useRestaurantOperations', () => new Proxy({}, {
  get: (_t, key: string) => (key === 'useApprovals' ? () => ({ data: mockApprovals, loading: false, error: null, refresh: jest.fn() })
    : key.startsWith('use') ? () => ({ data: [], loading: false, error: null, refresh: jest.fn() }) : key === '__esModule' ? true : () => ''),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { TableComandaDialog, canRequestCourtesy } = require('../screens/v2/shared/TableComandaDialog');

describe('pedir cortesia por item', () => {
  beforeEach(() => mockRequest.mockReset());

  it('garçom e gerente pedem; outros papéis não', () => {
    expect(canRequestCourtesy(['waiter'])).toBe(true);
    expect(canRequestCourtesy(['manager'])).toBe(true);
    expect(canRequestCourtesy(['cook', 'barman'])).toBe(false);
  });

  it('envia o item e o motivo e mostra o item como pendente', async () => {
    mockRequest.mockResolvedValue({ status: 'pending' });
    const ui = render(<TableComandaDialog visible tableId="t1" tableLabel="Mesa 4" onClose={jest.fn()} />);
    fireEvent.press(await ui.findByLabelText('Pedir cortesia de Risoto'));
    fireEvent.changeText(ui.getByTestId('confirm-dialog-reason'), 'Aniversário');
    await act(async () => { fireEvent.press(ui.getByTestId('confirm-dialog-confirm')); });
    expect(mockRequest).toHaveBeenCalledWith(expect.objectContaining({
      restaurantId: 'rest-1', type: 'courtesy', orderItemId: 'item-1', reason: 'Aniversário', tableId: 't1',
    }));
    expect(mockRequest.mock.calls[0][0].amount).toBeUndefined();
    await waitFor(() => expect(ui.getByTestId('comanda-courtesy-pending-item-1')).toBeTruthy());
  });
});

describe('Central de Aprovações mostra a cortesia', () => {
  beforeEach(() => {
    mockRoles.serverRoles = ['manager']; mockRoles.serverRole = 'manager';
    mockApprovals.length = 0;
  });
  const courtesy = (requester: string) => ({
    id: `a-${requester}`, type: 'courtesy', item_name: 'Risoto', amount: 40, reason: 'Aniversário',
    requester_id: requester, requester_name: 'Gil', table_number: '4', status: 'pending',
  });
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const renderView = () => { const { ManagerApprovalsView } = require('../screens/v2/OwnerHubScreen'); return render(<ManagerApprovalsView colors={new Proxy({}, { get: () => '#333' })} />); };

  it('com item, valor e motivo; gerente aprova pedido de outro', async () => {
    mockApprovals.push(courtesy('other'));
    const ui = renderView();
    expect(ui.getByText('Cortesia · Risoto')).toBeTruthy();
    expect(ui.getByText('Aniversário')).toBeTruthy();
    expect(ui.getByText('R$ 40')).toBeTruthy();
    await waitFor(() => expect(ui.getByLabelText('Aprovar Risoto')).toBeTruthy());
  });

  it('esconde Aprovar no pedido do próprio gerente', async () => {
    mockApprovals.push(courtesy('me'));
    const ui = renderView();
    await waitFor(() => expect(ui.queryByLabelText('Aprovar Risoto')).toBeNull());
    expect(ui.getByLabelText('Recusar Risoto')).toBeTruthy();
  });

  // QA 27/11: o Dono não tinha como abrir a Central de Aprovações; agora ela aparece no painel dele quando há pendência.
  const renderOwnerSection = () => { const { ManagerApprovalsView } = require('../screens/v2/OwnerHubScreen'); return render(<ManagerApprovalsView colors={new Proxy({}, { get: () => '#333' })} hideWhenEmpty />); };

  it('no painel do Dono: some sem pendência e aparece com Aprovar quando há', async () => {
    mockRoles.serverRoles = ['owner']; mockRoles.serverRole = 'owner';
    expect(renderOwnerSection().queryByText('Central de Aprovações')).toBeNull();
    mockApprovals.push(courtesy('other'));
    const ui = renderOwnerSection();
    expect(ui.getByText('Central de Aprovações')).toBeTruthy();
    await waitFor(() => expect(ui.getByLabelText('Aprovar Risoto')).toBeTruthy());
  });
});
