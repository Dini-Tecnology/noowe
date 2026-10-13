import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import InviteExpiredScreen from '../screens/production/InviteExpiredScreen';
import { classifyInviteError, inviteLinkFailureDestination } from '../hooks/useTableInviteHandler';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@/shared/services/supabase', () => ({ getSupabaseClient: () => ({ rpc: jest.fn(), functions: { invoke: jest.fn() } }) }));
jest.mock('expo-crypto', () => ({}));
jest.mock('@expo/vector-icons/Ionicons', () => 'Icon');
jest.mock('@okinawa/shared/contexts/ThemeContext', () => ({ useColors: () => new Proxy({}, { get: () => '#333333' }) }));
jest.mock('@okinawa/shared/components/ScreenContainer', () => ({ ScreenContainer: ({ children }: React.PropsWithChildren) => <>{children}</> }));

describe('T-G2-07 — convite expirado explica e não abre sessão', () => {
  it('explica o motivo e deixa claro que nenhuma mesa foi aberta', () => {
    const view = render(<InviteExpiredScreen navigation={{ navigate: jest.fn() }} />);
    expect(view.getByText('Este convite não vale mais')).toBeTruthy();
    expect(view.getByText(/Nenhuma mesa foi aberta/)).toBeTruthy();
    expect(view.getByText(/conta da mesa já foi encerrada/)).toBeTruthy();
  });

  it('oferece digitar um código ou voltar ao início, sem chamar nenhum serviço', () => {
    const navigate = jest.fn();
    const view = render(<InviteExpiredScreen navigation={{ navigate }} />);
    fireEvent.press(view.getByTestId('invite-expired-enter-code'));
    expect(navigate).toHaveBeenLastCalledWith('TableCode', undefined);
    fireEvent.press(view.getByTestId('invite-expired-home'));
    expect(navigate).toHaveBeenLastCalledWith('Home', undefined);
  });

  it('só convite inválido/expirado leva à tela; os outros motivos seguem em alerta', () => {
    expect(inviteLinkFailureDestination(classifyInviteError({ code: 'P0001' }))).toBe('InviteExpired');
    expect(inviteLinkFailureDestination('awaiting_capacity')).toBe('alert');
    expect(inviteLinkFailureDestination('too_many')).toBe('alert');
    expect(inviteLinkFailureDestination('bad_format')).toBe('alert');
    expect(inviteLinkFailureDestination('network')).toBe('alert');
  });
});
