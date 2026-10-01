import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import IncomingTableInviteBanner from '../components/table/IncomingTableInviteBanner';
import NotificationsScreen from '../screens/production/NotificationsScreen';

jest.mock('@expo/vector-icons/Ionicons', () => 'Icon');
jest.mock('@okinawa/shared/contexts/ThemeContext', () => ({ useColors: () => new Proxy({}, { get: () => '#333333' }) }));
jest.mock('@okinawa/shared/components/ScreenContainer', () => ({ ScreenContainer: ({ children }: React.PropsWithChildren) => <>{children}</> }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const mockListIncoming = jest.fn();
const mockDecline = jest.fn();
const mockGetInvites = jest.fn();
const mockListNotifications = jest.fn();
let mockRealtimeCallback: ((change: unknown) => void) | null = null;
jest.mock('../services/customer-backend', () => ({ __esModule: true, default: {
  listIncomingTableInvites: () => mockListIncoming(),
  declineTableUserInvite: (id: string) => mockDecline(id),
  getTableUserInvites: (ids: string[]) => mockGetInvites(ids),
  listNotifications: () => mockListNotifications(),
  markAllNotificationsRead: jest.fn().mockResolvedValue(undefined),
  markNotificationRead: jest.fn().mockResolvedValue(undefined),
  clearNotifications: jest.fn(),
  acceptReservationInvite: jest.fn(),
  subscribeToTableInvites: (_sessionId: string | null, callback: (change: unknown) => void) => {
    mockRealtimeCallback = callback;
    return Promise.resolve({ unsubscribe: jest.fn() });
  },
} }));

type Visit = { restaurantId: string; tableId: string; tableSessionId: string; tableNumber: string };
const mockJoin = jest.fn();
const mockRefresh = jest.fn();
let mockSession: Visit | null = null;
jest.mock('../contexts/VisitSessionContext', () => ({ useVisitSession: () => ({
  session: mockSession, joinFromUserInvite: (id: string) => mockJoin(id), refreshSession: () => mockRefresh(),
}) }));
const mockClearCart = jest.fn();
let mockCart = { items: [] as unknown[], restaurantId: null as string | null, clearCart: mockClearCart };
jest.mock('@/shared/contexts/CartContext', () => ({ useCart: () => mockCart }));

const card = (username: string) => ({ userId: `u-${username}`, username, displayName: 'Ana T.', avatarUrl: null });
const invite = (overrides: Record<string, unknown> = {}) => ({
  id: 'inv1', tableSessionId: 's9', restaurantId: 'r9', restaurantName: 'Cantina', tableId: 't9', tableNumber: '12',
  status: 'pending', closedReason: null, expiresAt: new Date(Date.now() + 25 * 60_000).toISOString(), respondedAt: null,
  createdAt: new Date().toISOString(), capacityRequestId: null, capacityExpiresAt: null,
  inviter: card('ana'), invitee: card('eu'), sentByMe: false, canCancel: false, canRespond: true,
  ...overrides,
});
const visit9: Visit = { restaurantId: 'r9', tableId: 't9', tableSessionId: 's9', tableNumber: '12' };

let alertSpy: jest.SpyInstance;
/** Answers the next Alert by pressing the button with this label. */
function answerAlertWith(label: string | null) {
  alertSpy.mockImplementation((_title, _message, buttons) => {
    const button = label ? (buttons as { text: string; onPress?: () => void }[] | undefined)?.find((b) => b.text === label) : undefined;
    button?.onPress?.();
  });
}

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return { view: render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>), client };
}

beforeEach(() => {
  mockSession = null;
  mockCart = { items: [], restaurantId: null, clearCart: mockClearCart };
  mockListIncoming.mockReset().mockResolvedValue([invite()]);
  mockJoin.mockReset();
  mockDecline.mockReset().mockResolvedValue(invite({ status: 'declined', canRespond: false }));
  mockRefresh.mockReset();
  mockGetInvites.mockReset();
  mockListNotifications.mockReset();
  mockRealtimeCallback = null;
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});
afterEach(() => alertSpy.mockRestore());

describe('Convite recebido · banner na Home', () => {
  it('shows who invited me, where, and when it expires', async () => {
    const { view, client } = renderWithClient(<IncomingTableInviteBanner onJoined={jest.fn()} />);
    expect(await view.findByText('@ana te chamou para a mesa')).toBeTruthy();
    expect(view.getByText('Cantina · Mesa 12')).toBeTruthy();
    expect(view.getByText('Expira em 25 min.')).toBeTruthy();
    client.clear();
  });

  it('renders nothing without invites', async () => {
    mockListIncoming.mockResolvedValue([]);
    const { view, client } = renderWithClient(<IncomingTableInviteBanner onJoined={jest.fn()} />);
    await waitFor(() => expect(mockListIncoming).toHaveBeenCalled());
    expect(view.queryByText(/te chamou/)).toBeNull();
    client.clear();
  });

  it('accepting joins the same table session and opens its menu', async () => {
    mockJoin.mockResolvedValue({ status: 'accepted', visit: visit9, capacityRequestId: null, invite: null, idempotentReplay: false });
    const onJoined = jest.fn();
    const { view, client } = renderWithClient(<IncomingTableInviteBanner onJoined={onJoined} />);
    fireEvent.press(await view.findByLabelText('Aceitar convite de @ana'));
    await waitFor(() => expect(onJoined).toHaveBeenCalledWith(visit9));
    expect(mockJoin).toHaveBeenCalledWith('inv1');
    expect(alertSpy).not.toHaveBeenCalled();
    client.clear();
  });

  it('asks before leaving the table I am at, and does nothing if I cancel', async () => {
    mockSession = { restaurantId: 'r1', tableId: 't1', tableSessionId: 's1', tableNumber: '3' };
    answerAlertWith('Cancelar');
    const { view, client } = renderWithClient(<IncomingTableInviteBanner onJoined={jest.fn()} />);
    fireEvent.press(await view.findByLabelText('Aceitar convite de @ana'));
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Trocar de mesa?', expect.stringContaining('você sai da mesa 3'), expect.any(Array), expect.any(Object)));
    expect(mockJoin).not.toHaveBeenCalled();
    client.clear();
  });

  it('switches tables once I confirm', async () => {
    mockSession = { restaurantId: 'r1', tableId: 't1', tableSessionId: 's1', tableNumber: '3' };
    answerAlertWith('Aceitar');
    mockJoin.mockResolvedValue({ status: 'accepted', visit: visit9, capacityRequestId: null, invite: null, idempotentReplay: false });
    const onJoined = jest.fn();
    const { view, client } = renderWithClient(<IncomingTableInviteBanner onJoined={onJoined} />);
    fireEvent.press(await view.findByLabelText('Aceitar convite de @ana'));
    await waitFor(() => expect(onJoined).toHaveBeenCalledWith(visit9));
    client.clear();
  });

  it('offers to clear a cart from another restaurant after joining', async () => {
    mockCart = { items: [{ id: 'x' }], restaurantId: 'r1', clearCart: mockClearCart };
    answerAlertWith('Limpar carrinho');
    mockJoin.mockResolvedValue({ status: 'accepted', visit: visit9, capacityRequestId: null, invite: null, idempotentReplay: false });
    const { view, client } = renderWithClient(<IncomingTableInviteBanner onJoined={jest.fn()} />);
    fireEvent.press(await view.findByLabelText('Aceitar convite de @ana'));
    await waitFor(() => expect(mockClearCart).toHaveBeenCalled());
    expect(alertSpy).toHaveBeenCalledWith('Carrinho de outro restaurante', expect.any(String), expect.any(Array));
    client.clear();
  });

  it('a full table waits for the host stand instead of refusing silently', async () => {
    mockJoin.mockResolvedValue({ status: 'awaiting_capacity', visit: null, capacityRequestId: 'c1', invite: null, idempotentReplay: false });
    const onJoined = jest.fn();
    const { view, client } = renderWithClient(<IncomingTableInviteBanner onJoined={onJoined} />);
    fireEvent.press(await view.findByLabelText('Aceitar convite de @ana'));
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Mesa cheia', 'Avisamos a recepção. Você entra assim que liberarem um lugar.'));
    expect(onJoined).not.toHaveBeenCalled();
    client.clear();
  });

  it('shows the waiting state, lets me give up, and points to the host stand after the TTL', async () => {
    mockListIncoming.mockResolvedValue([
      invite({ id: 'inv1', status: 'awaiting_capacity', canRespond: false, capacityExpiresAt: new Date(Date.now() + 10 * 60_000).toISOString() }),
      invite({ id: 'inv2', status: 'awaiting_capacity', canRespond: false, capacityExpiresAt: new Date(Date.now() - 60_000).toISOString(), inviter: card('bia') }),
    ]);
    const { view, client } = renderWithClient(<IncomingTableInviteBanner onJoined={jest.fn()} />);
    expect(await view.findByText('Mesa cheia: aguardando a recepção liberar um lugar para você.')).toBeTruthy();
    expect(view.getByText('A recepção ainda não respondeu. Fale com a recepção do restaurante.')).toBeTruthy();
    expect(view.queryByLabelText('Aceitar convite de @ana')).toBeNull();
    fireEvent.press(view.getAllByLabelText('Desistir de entrar na mesa')[0]);
    await waitFor(() => expect(mockDecline).toHaveBeenCalledWith('inv1'));
    client.clear();
  });

  it('when the host stand approves, Realtime brings me to the table', async () => {
    mockRefresh.mockResolvedValue(visit9);
    const onJoined = jest.fn();
    const { view, client } = renderWithClient(<IncomingTableInviteBanner onJoined={onJoined} />);
    await view.findByText('@ana te chamou para a mesa');
    await waitFor(() => expect(mockRealtimeCallback).not.toBeNull());
    await act(async () => { mockRealtimeCallback?.({ inviteId: 'inv1', status: 'accepted', inviteeId: 'u-eu', tableSessionId: 's9' }); });
    await waitFor(() => expect(onJoined).toHaveBeenCalledWith(visit9));
    expect(mockRefresh).toHaveBeenCalled();
    client.clear();
  });

  it.each([
    [{ status: 'expired', closedReason: 'ttl' }, 'O convite expirou.'],
    [{ status: 'cancelled', closedReason: 'inviter_cancelled' }, 'Quem te convidou cancelou o convite.'],
    [{ status: 'cancelled', closedReason: 'inviter_left' }, 'Quem te convidou já saiu da mesa.'],
    [{ status: 'expired', closedReason: 'session_closed' }, 'Essa mesa já foi encerrada.'],
    [{ status: 'cancelled', closedReason: 'feature_disabled' }, 'O restaurante desativou convites por @.'],
    [{ status: 'capacity_rejected', closedReason: null }, 'A recepção não liberou sua entrada: a mesa está lotada.'],
  ])('explains an invite that can no longer be accepted (%o)', async (state, message) => {
    mockJoin.mockResolvedValue({ status: state.status, visit: null, capacityRequestId: null, invite: invite(state), idempotentReplay: false });
    const { view, client } = renderWithClient(<IncomingTableInviteBanner onJoined={jest.fn()} />);
    fireEvent.press(await view.findByLabelText('Aceitar convite de @ana'));
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Convite indisponível', message));
    client.clear();
  });

  it('tells me to settle my current table when the server refuses (P0004)', async () => {
    mockJoin.mockRejectedValue(Object.assign(new Error('x'), { code: 'P0004' }));
    const { view, client } = renderWithClient(<IncomingTableInviteBanner onJoined={jest.fn()} />);
    fireEvent.press(await view.findByLabelText('Aceitar convite de @ana'));
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Não foi possível entrar', 'Quite sua conta na mesa atual antes de entrar em outra.'));
    client.clear();
  });

  it('declining calls the server', async () => {
    const { view, client } = renderWithClient(<IncomingTableInviteBanner onJoined={jest.fn()} />);
    fireEvent.press(await view.findByLabelText('Recusar convite de @ana'));
    await waitFor(() => expect(mockDecline).toHaveBeenCalledWith('inv1'));
    expect(mockJoin).not.toHaveBeenCalled();
    client.clear();
  });
});

describe('Convite recebido · Notificações', () => {
  const notification = (id: string, inviteId: string) => ({
    id, title: 'Convite para mesa', message: '@ana te chamou para a mesa 12 no Cantina', type: 'table_invite',
    relatedId: 's9', relatedType: 'table_session', isRead: true, createdAt: new Date().toISOString(),
    metadata: { kind: 'table_user_invite', invite_id: inviteId },
  });

  it('shows Aceitar/Recusar only while the invite is still answerable', async () => {
    mockListNotifications.mockResolvedValue({ data: [notification('n1', 'inv1'), notification('n2', 'inv2')], nextCursor: null });
    mockGetInvites.mockResolvedValue([
      invite({ id: 'inv1' }),
      invite({ id: 'inv2', status: 'expired', closedReason: 'ttl', canRespond: false }),
    ]);
    const { view, client } = renderWithClient(<NotificationsScreen navigation={{ goBack: jest.fn(), navigate: jest.fn(), getParent: () => undefined }} />);
    expect(await view.findByTestId('notification-accept-inv1')).toBeTruthy();
    expect(view.queryByTestId('notification-accept-inv2')).toBeNull();
    expect(view.getByTestId('notification-invite-state-inv2').props.children).toBe('O convite expirou.');
    expect(mockGetInvites).toHaveBeenCalledWith(['inv1', 'inv2']);
    client.clear();
  });

  it('accepting from the notification opens the table menu', async () => {
    mockListNotifications.mockResolvedValue({ data: [notification('n1', 'inv1')], nextCursor: null });
    mockGetInvites.mockResolvedValue([invite({ id: 'inv1' })]);
    mockJoin.mockResolvedValue({ status: 'accepted', visit: visit9, capacityRequestId: null, invite: null, idempotentReplay: false });
    const navigate = jest.fn();
    const { view, client } = renderWithClient(<NotificationsScreen navigation={{ goBack: jest.fn(), navigate, getParent: () => undefined }} />);
    fireEvent.press(await view.findByTestId('notification-accept-inv1'));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('Menu', { restaurantId: 'r9' }));
    client.clear();
  });
});
