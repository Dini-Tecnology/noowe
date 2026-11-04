import { act, renderHook } from '@testing-library/react-native';
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

const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
const { openInComanda } = jest.requireMock('../navigation/comanda');

beforeEach(() => jest.clearAllMocks());

test('o titular com saldo vai para a conta: ele responde pela comanda', () => {
  mockBalance.mockReturnValue({ owedCents: 1000, hasConsumption: true, isHost: true });
  const { result } = renderHook(() => useLeaveTable({}));
  act(() => result.current.run());
  expect(alert).not.toHaveBeenCalled();
  expect(openInComanda).toHaveBeenCalled();
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
