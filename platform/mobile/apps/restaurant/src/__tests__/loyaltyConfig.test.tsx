import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import LoyaltyScreen, { loyaltyDraftToPayload, rowToLoyaltyDraft } from '../screens/v2/LoyaltyScreen';

const mockApi = { getLoyaltyStats: jest.fn(), getLoyaltyConfig: jest.fn(), saveLoyaltyConfig: jest.fn() };
jest.mock('@okinawa/shared/contexts/ThemeContext', () => ({ useColors: () => new Proxy({}, { get: () => '#333333' }) }));
jest.mock('../contexts/RestaurantRoleContext', () => ({ useRestaurantRole: () => ({ restaurantId: 'r1' }) }));
jest.mock('../screens/v2/shared/V2Shell', () => ({ V2Shell: ({ children }: any) => <>{children}</> }));
jest.mock('@okinawa/shared/utils/user-error-message', () => ({ userErrorMessage: (_: unknown, fallback: string) => fallback }));
jest.mock('@okinawa/shared/services/supabase-api', () => ({ get supabaseApiAdapter() { return mockApi; } }));

beforeEach(() => {
  jest.clearAllMocks();
  mockApi.getLoyaltyStats.mockResolvedValue({ active_members: 3 });
  mockApi.getLoyaltyConfig.mockResolvedValue(null);
  mockApi.saveLoyaltyConfig.mockImplementation(async (_r: string, p: any) => p);
});

it('converte vírgula e recusa valor inválido', () => {
  const d = { ...rowToLoyaltyDraft(null), points_enabled: true, points_per_real: '1,5', points_redemption_rate: '0,05', min_points_for_redemption: '100' };
  expect(loyaltyDraftToPayload(d).payload).toMatchObject({ points_per_real: 1.5, points_redemption_rate: 0.05, min_points_for_redemption: 100, cashback_percentage: 0 });
  expect(loyaltyDraftToPayload({ ...d, points_per_real: 'x' }).error).toMatch(/Pontos por R\$ 1/);
  expect(loyaltyDraftToPayload({ ...d, cashback_enabled: true, cashback_percentage: '120' }).error).toMatch(/Cashback/);
});

it('o Dono cria o programa sem configuração prévia', async () => {
  const view = render(<LoyaltyScreen />);
  fireEvent(await view.findByLabelText('Programa de pontos'), 'valueChange', true);
  fireEvent.changeText(view.getByLabelText('Pontos por R$ 1 consumido'), '2');
  fireEvent.changeText(view.getByLabelText('Valor de cada ponto no resgate (R$)'), '0,1');
  fireEvent.changeText(view.getByLabelText('Mínimo de pontos para resgatar'), '50');
  fireEvent.press(view.getByText('Salvar programa'));
  await waitFor(() => expect(mockApi.saveLoyaltyConfig).toHaveBeenCalledWith('r1', expect.objectContaining({ points_enabled: true, points_per_real: 2, points_redemption_rate: 0.1, min_points_for_redemption: 50 })));
  expect(await view.findByText('Programa salvo')).toBeTruthy();
});

it('faixas: reais na tela, centavos no payload, ordem conferida', () => {
  const d = rowToLoyaltyDraft({ points_enabled: true, points_per_real: 1, points_redemption_rate: 0.05, min_points_for_redemption: 100,
    tier_silver_min_cents: 50000, tier_gold_min_cents: 200000, tier_platinum_min_cents: 500000 });
  expect(d).toMatchObject({ tier_silver_min_cents: '500', tier_gold_min_cents: '2000', tier_platinum_min_cents: '5000' });
  expect(loyaltyDraftToPayload({ ...d, tier_gold_min_cents: '1500,5' }).payload).toMatchObject({ tier_silver_min_cents: 50000, tier_gold_min_cents: 150050, tier_platinum_min_cents: 500000 });
  expect(loyaltyDraftToPayload({ ...d, tier_gold_min_cents: '400' }).error).toMatch(/faixas devem crescer/i);
  expect(loyaltyDraftToPayload({ ...d, tier_silver_min_cents: '' }).payload).not.toHaveProperty('tier_silver_min_cents');
});
