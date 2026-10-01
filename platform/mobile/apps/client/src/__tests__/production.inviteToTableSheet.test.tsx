import React from 'react';
import { Share } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import InviteToTableSheet, { type InviteToTableSheetProps } from '../components/table/InviteToTableSheet';

jest.mock('@expo/vector-icons/Ionicons', () => 'Icon');
jest.mock('@okinawa/shared/contexts/ThemeContext', () => ({ useColors: () => new Proxy({}, { get: () => '#333333' }) }));

const mockSearch = jest.fn();
const mockSend = jest.fn();
const mockCancel = jest.fn();
const mockListSession = jest.fn();
const mockCreateLink = jest.fn();
const mockSubscribe = jest.fn();
let mockRealtimeCallback: ((change: unknown) => void) | null = null;
jest.mock('../services/customer-backend', () => ({ __esModule: true, default: {
  searchUsersForTable: (...args: unknown[]) => mockSearch(...args),
  sendTableUserInvite: (...args: unknown[]) => mockSend(...args),
  cancelTableUserInvite: (...args: unknown[]) => mockCancel(...args),
  listTableSessionUserInvites: (...args: unknown[]) => mockListSession(...args),
  createTableInvite: (...args: unknown[]) => mockCreateLink(...args),
  subscribeToTableInvites: (sessionId: string | null, callback: (change: unknown) => void) => {
    mockRealtimeCallback = callback;
    return mockSubscribe(sessionId);
  },
} }));

const card = (username: string, displayName = 'Pessoa T.') => ({ userId: `u-${username}`, username, displayName, avatarUrl: null });
const invite = (overrides: Record<string, unknown> = {}) => ({
  id: 'inv1', tableSessionId: 's1', restaurantId: 'r1', restaurantName: 'Noowe', tableId: 't1', tableNumber: '12',
  status: 'pending', closedReason: null, expiresAt: '2099-01-01T00:00:00Z', respondedAt: null, createdAt: '2026-09-26T20:00:00Z',
  capacityRequestId: null, capacityExpiresAt: null, inviter: card('eu'), invitee: card('beto'), sentByMe: true, canCancel: true, canRespond: false,
  ...overrides,
});

function renderSheet(props: Partial<InviteToTableSheetProps> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const onClose = jest.fn();
  const view = render(
    <QueryClientProvider client={client}>
      <InviteToTableSheet
        visible
        onClose={onClose}
        tableSessionId="s1"
        restaurantName="Noowe"
        userInviteEnabled
        guestLinkEnabled
        searchMinChars={3}
        {...props}
      />
    </QueryClientProvider>,
  );
  return { view, client, onClose };
}

beforeEach(() => {
  mockSearch.mockReset().mockResolvedValue([]);
  mockSend.mockReset();
  mockCancel.mockReset();
  mockListSession.mockReset().mockResolvedValue([]);
  mockCreateLink.mockReset();
  mockSubscribe.mockReset().mockResolvedValue({ unsubscribe: jest.fn() });
  mockRealtimeCallback = null;
});

async function typeQuery(view: ReturnType<typeof render>, text: string) {
  fireEvent.changeText(view.getByTestId('invite-search-input'), text);
}

describe('Convidar para a mesa · quem convida', () => {
  it('offers both channels when the restaurant enables both', async () => {
    const { view, client } = renderSheet();
    expect(view.getByText('Por @usuário')).toBeTruthy();
    expect(view.getByText('Por link')).toBeTruthy();
    expect(view.getByTestId('invite-search-input')).toBeTruthy();
    await waitFor(() => expect(mockSubscribe).toHaveBeenCalledWith('s1'));
    client.clear();
  });

  it('opens straight on the link when only the link is enabled', () => {
    const { view, client } = renderSheet({ userInviteEnabled: false });
    expect(view.queryByText('Por @usuário')).toBeNull();
    expect(view.queryByTestId('invite-search-input')).toBeNull();
    expect(view.getByText('Compartilhar link')).toBeTruthy();
    client.clear();
  });

  it('shares the link through the existing RPC', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    mockCreateLink.mockResolvedValue('https://noowebr.com/t/invite/abc');
    const { view, client } = renderSheet({ userInviteEnabled: false });
    fireEvent.press(view.getByText('Compartilhar link'));
    await waitFor(() => expect(share).toHaveBeenCalledWith({ message: 'Vem pra minha mesa no Noowe! https://noowebr.com/t/invite/abc' }));
    expect(mockCreateLink).toHaveBeenCalledWith('s1');
    client.clear();
  });

  it('does not search below the configured minimum', async () => {
    const { view, client } = renderSheet({ searchMinChars: 3 });
    await typeQuery(view, '@An');
    expect(view.getByTestId('invite-search-input').props.value).toBe('an');
    expect(view.getByText('Digite ao menos 3 caracteres do @.')).toBeTruthy();
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 450)); });
    expect(mockSearch).not.toHaveBeenCalled();
    client.clear();
  });

  it('searches by @ after the pause and shows each person\'s state', async () => {
    mockSearch.mockResolvedValue([
      { ...card('ana', 'Ana T.'), inviteState: 'invitable' },
      { ...card('ana-b', 'Ana B.'), inviteState: 'already_at_table' },
      { ...card('ana-c', 'Ana C.'), inviteState: 'invite_pending' },
    ]);
    const { view, client } = renderSheet();
    await typeQuery(view, 'ana');
    await waitFor(() => expect(mockSearch).toHaveBeenCalledWith('s1', 'ana'));
    await view.findByTestId('invite-result-ana');
    expect(view.getByLabelText('Convidar @ana')).toBeTruthy();
    expect(view.getByText('Na mesa')).toBeTruthy();
    expect(view.getByText('Convite enviado')).toBeTruthy();
    expect(view.queryByLabelText('Convidar @ana-b')).toBeNull();
    client.clear();
  });

  it('sends the invite and tells the inviter the other person must accept', async () => {
    mockSearch.mockResolvedValue([{ ...card('beto'), inviteState: 'invitable' }]);
    mockSend.mockResolvedValue(invite());
    const { view, client } = renderSheet();
    await typeQuery(view, 'beto');
    fireEvent.press(await view.findByLabelText('Convidar @beto'));
    await waitFor(() => expect(mockSend).toHaveBeenCalledWith('s1', 'beto'));
    expect((await view.findByTestId('invite-feedback')).props.children)
      .toBe('Convite enviado para @beto. A pessoa precisa aceitar para entrar.');
    // Search results and the table's invite list are refreshed.
    await waitFor(() => expect(mockSearch).toHaveBeenCalledTimes(2));
    client.clear();
  });

  it.each([
    [{ code: 'P0008', message: 'Muitos convites, tente em alguns minutos' }, 'Muitos convites, tente em alguns minutos'],
    [{ code: 'P0009', message: 'x' }, 'Este restaurante não aceita convites por @.'],
    [{ code: 'P0002', message: 'Usuário não encontrado' }, 'Não encontramos ninguém com esse @.'],
    [{ code: 'P0001', message: '@beto já está na mesa' }, '@beto já está na mesa'],
  ])('explains send errors (%o)', async (error, expected) => {
    mockSearch.mockResolvedValue([{ ...card('beto'), inviteState: 'invitable' }]);
    mockSend.mockRejectedValue(Object.assign(new Error(error.message), { code: error.code }));
    const { view, client } = renderSheet();
    await typeQuery(view, 'beto');
    fireEvent.press(await view.findByLabelText('Convidar @beto'));
    expect((await view.findByTestId('invite-feedback')).props.children).toBe(expected);
    client.clear();
  });

  it('lists the table\'s invites and lets the inviter cancel their own', async () => {
    mockListSession.mockResolvedValue([
      invite(),
      invite({ id: 'inv2', invitee: card('caio'), inviter: card('ana'), sentByMe: false, canCancel: false, status: 'awaiting_capacity' }),
      invite({ id: 'inv3', invitee: card('dan'), status: 'declined', canCancel: false }),
    ]);
    mockCancel.mockResolvedValue(invite({ status: 'cancelled', canCancel: false }));
    const { view, client } = renderSheet();
    await view.findByTestId('sent-invite-beto');
    expect(view.getByText('Aguardando resposta')).toBeTruthy();
    expect(view.getByText('Aguardando liberação da recepção · por @ana')).toBeTruthy();
    expect(view.getByText('Recusou')).toBeTruthy();
    expect(view.queryByLabelText('Cancelar convite para @caio')).toBeNull();
    fireEvent.press(view.getByLabelText('Cancelar convite para @beto'));
    await waitFor(() => expect(mockCancel).toHaveBeenCalledWith('inv1'));
    client.clear();
  });

  it('refreshes the invite list when Realtime reports a change', async () => {
    mockListSession.mockResolvedValueOnce([invite()]).mockResolvedValue([invite({ status: 'accepted', canCancel: false })]);
    const { view, client } = renderSheet();
    await view.findByText('Aguardando resposta');
    await waitFor(() => expect(mockRealtimeCallback).not.toBeNull());
    await act(async () => { mockRealtimeCallback?.({ inviteId: 'inv1', status: 'accepted', inviteeId: 'u-beto', tableSessionId: 's1' }); });
    await view.findByText('Entrou na mesa');
    client.clear();
  });

  it('resets the search when closed', async () => {
    const { view, client, onClose } = renderSheet();
    await typeQuery(view, 'beto');
    fireEvent.press(view.getAllByLabelText('Fechar')[1]);
    expect(onClose).toHaveBeenCalled();
    expect(view.getByTestId('invite-search-input').props.value).toBe('');
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 400)); });
    client.clear();
  });
});
