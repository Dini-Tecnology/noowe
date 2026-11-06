import { act, renderHook, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { useLeaveTable } from '../hooks/useLeaveTable';

const mockLeave = jest.fn().mockResolvedValue(undefined);
const mockBalance = jest.fn();
jest.mock('../contexts/VisitSessionContext', () => ({
  useVisitSession: () => ({ session: { tableSessionId: 's1', tableNumber: '4' }, leaveTable: mockLeave }),
}));
jest.mock('../hooks/useMyTableBalance', () => ({ useMyTableBalance: () => ({ data: mockBalance() }) }));
jest.mock('../navigation/comanda', () => ({ openInComanda: jest.fn() }));
jest.mock('../screens/production/shared', () => ({ tableLabel: (n: string) => `Mesa ${n}` }));
const mockCandidates = jest.fn();
const mockOffer = jest.fn();
jest.mock('../services/host-transfer', () => ({ hostTransfer: { candidates: (...a: unknown[]) => mockCandidates(...a), offer: (...a: unknown[]) => mockOffer(...a) } }));

const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
const { openInComanda } = jest.requireMock('../navigation/comanda');

beforeEach(() => jest.clearAllMocks());

test('o titular com saldo paga a parte dele ou passa a titularidade; não sai deixando a comanda (resposta 49)', () => {
  mockBalance.mockReturnValue({ owedCents: 1000, hasConsumption: true, isHost: true });
  const { result } = renderHook(() => useLeaveTable({}));
  act(() => result.current.run());
  const [title, , buttons] = alert.mock.calls[0];
  expect(title).toBe('Você é o titular desta mesa');
  expect(buttons!.map((b) => b.text)).toEqual(['Agora não', 'Passar a titularidade', 'Pagar minha parte']);
  expect(buttons!.some((b) => /Sair/.test(b.text ?? ''))).toBe(false);
  buttons!.find((b) => b.text === 'Pagar minha parte')!.onPress!();
  expect(openInComanda).toHaveBeenCalled();
  expect(mockLeave).not.toHaveBeenCalled();
});

test('passar a titularidade: escolhe quem está na mesa, e a pessoa precisa aceitar', async () => {
  mockBalance.mockReturnValue({ owedCents: 1000, hasConsumption: true, isHost: true });
  mockCandidates.mockResolvedValue([{ participantId: 'p2', name: 'Bia' }]);
  mockOffer.mockResolvedValue({ toName: 'Bia' });
  const { result } = renderHook(() => useLeaveTable({}));
  act(() => result.current.run());
  alert.mock.calls[0][2]!.find((b) => b.text === 'Passar a titularidade')!.onPress!();
  await waitFor(() => expect(alert).toHaveBeenCalledTimes(2));
  alert.mock.calls[1][2]!.find((b) => b.text === 'Bia')!.onPress!();
  await waitFor(() => expect(mockOffer).toHaveBeenCalledWith('s1', 'p2'));
  await waitFor(() => expect(alert).toHaveBeenCalledWith('Pedido enviado', expect.stringContaining('Bia')));
  expect(mockLeave).not.toHaveBeenCalled();
});

test('convidado com saldo pode sair confirmando, e a parte fica com o titular (G5, 9)', () => {
  mockBalance.mockReturnValue({ owedCents: 1000, hasConsumption: true, isHost: false });
  const { result } = renderHook(() => useLeaveTable({}));
  act(() => result.current.run());
  const [, message, buttons] = alert.mock.calls[0];
  expect(message).toMatch(/fica com quem abriu a comanda/);
  expect(mockLeave).not.toHaveBeenCalled();
  buttons!.find((button) => button.text === 'Sair sem pagar')!.onPress!();
  expect(mockLeave).toHaveBeenCalledWith(true);
});

test('sem saldo, sair não pede confirmação de saldo', () => {
  mockBalance.mockReturnValue({ owedCents: 0, hasConsumption: false, isHost: false });
  const { result } = renderHook(() => useLeaveTable({}));
  act(() => result.current.run());
  const buttons = alert.mock.calls[0][2]!;
  buttons.find((button) => button.text === 'Sair')!.onPress!();
  expect(mockLeave).toHaveBeenCalledWith();
});
