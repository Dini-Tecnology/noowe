import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReConsentScreen } from '@okinawa/shared/screens/legal/ReConsentScreen';
import { LEGAL_VERSIONS } from '@okinawa/shared/config/legal';

jest.mock('@okinawa/shared/contexts/ThemeContext', () => ({ useColors: () => new Proxy({}, { get: () => '#333333' }) }));
jest.mock('@okinawa/shared/components/ScreenContainer', () => ({ ScreenContainer: ({ children }: React.PropsWithChildren) => <>{children}</> }));
const mockAccept = jest.fn(async () => undefined);
jest.mock('@okinawa/shared/services/supabase-auth', () => ({ supabaseAuthAdapter: { acceptLegalTerms: (...a: unknown[]) => mockAccept(...(a as [])), logout: jest.fn() } }));
jest.mock('@okinawa/shared/services/supabase-api', () => ({ supabaseApiAdapter: { requestAccountDeletion: jest.fn() } }));

// QA 26/11: a tela travava (botão só depois de rolar, sem nada para rolar), estava em inglês e buscava os textos no backend antigo.
test('aceite em português: só libera com o "Li e aceito" e grava as versões vigentes', async () => {
  const onAccepted = jest.fn();
  const view = render(<QueryClientProvider client={new QueryClient()}><ReConsentScreen onConsentAccepted={onAccepted} /></QueryClientProvider>);
  expect(view.getByText('Termos atualizados')).toBeTruthy();
  expect(view.queryByText(/Updated Terms|I Accept/)).toBeNull();
  fireEvent.press(view.getByTestId('reconsent-accept'));
  expect(mockAccept).not.toHaveBeenCalled();
  fireEvent.press(view.getByTestId('reconsent-agree'));
  fireEvent.press(view.getByTestId('reconsent-accept'));
  await waitFor(() => expect(onAccepted).toHaveBeenCalled());
  expect(mockAccept).toHaveBeenCalledWith(LEGAL_VERSIONS.terms, LEGAL_VERSIONS.privacy);
});
