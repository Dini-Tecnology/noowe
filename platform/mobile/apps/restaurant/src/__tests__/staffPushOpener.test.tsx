/**
 * Toque no push da equipe: abre a tela certa com o app aberto ou fechado, e na unidade de que o push fala.
 */
import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';
import { StaffPushOpener } from '../navigation/StaffPushBridge';

const mockNavigate = jest.fn();
const mockNavigation = { navigate: mockNavigate };
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNavigation }));

const mockSwitchRestaurant = jest.fn();
let mockRestaurantId = 'r1';
jest.mock('../contexts/RestaurantRoleContext', () => ({
  useRestaurantRole: () => ({ restaurantId: mockRestaurantId, switchRestaurant: mockSwitchRestaurant }),
}));

let mockTap: ((response: unknown) => void) | null = null;
const mockGetLast = jest.fn();
jest.mock('expo-device', () => ({ __esModule: true, isDevice: true }));
jest.mock('expo-constants', () => ({ __esModule: true, default: {} }));
jest.mock('@/shared/services/supabase', () => ({ getSupabaseClient: jest.fn() }));
jest.mock('expo-notifications', () => ({
  addNotificationResponseReceivedListener: (listener: (response: unknown) => void) => {
    mockTap = listener;
    return { remove: jest.fn() };
  },
  getLastNotificationResponseAsync: () => mockGetLast(),
}));

const tap = (identifier: string, data: Record<string, unknown>) => ({
  notification: { request: { identifier, content: { data } } },
});
const fiscal = { kind: 'fiscal_document_issue', fiscal_document_id: 'd1', status: 'rejected', restaurant_id: 'r1' };
const settle = () => act(async () => { await Promise.resolve(); });

describe('StaffPushOpener', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRestaurantId = 'r1';
    mockGetLast.mockResolvedValue(null);
  });

  it('toque com o app aberto leva às notas fiscais', async () => {
    render(<StaffPushOpener />);
    await settle();
    act(() => mockTap!(tap('warm', fiscal)));
    expect(mockNavigate).toHaveBeenCalledWith('FiscalDocuments');
    expect(mockSwitchRestaurant).not.toHaveBeenCalled();
  });

  it('toque com o app fechado leva às notas quando a pilha monta', async () => {
    mockGetLast.mockResolvedValue(tap('cold', fiscal));
    render(<StaffPushOpener />);
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('FiscalDocuments'));
  });

  it('o mesmo toque não navega de novo quando a pilha remonta', async () => {
    mockGetLast.mockResolvedValue(tap('once', fiscal));
    const first = render(<StaffPushOpener />);
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledTimes(1));
    first.unmount();
    render(<StaffPushOpener />);
    await settle();
    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });

  it('push de outra unidade troca o restaurante e só então abre as notas', async () => {
    mockGetLast.mockResolvedValue(tap('other-unit', { ...fiscal, restaurant_id: 'r2' }));
    const first = render(<StaffPushOpener />);
    await waitFor(() => expect(mockSwitchRestaurant).toHaveBeenCalledWith('r2'));
    expect(mockNavigate).not.toHaveBeenCalled();
    first.unmount();

    // A troca desmonta a pilha; ela volta com a unidade nova e o último toque.
    mockRestaurantId = 'r2';
    render(<StaffPushOpener />);
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('FiscalDocuments'));
    expect(mockSwitchRestaurant).toHaveBeenCalledTimes(1);
  });

  it('sem vínculo com a unidade, a troca não fica em laço', async () => {
    mockGetLast.mockResolvedValue(tap('lost-unit', { ...fiscal, restaurant_id: 'r9' }));
    const first = render(<StaffPushOpener />);
    await waitFor(() => expect(mockSwitchRestaurant).toHaveBeenCalledWith('r9'));
    first.unmount();

    render(<StaffPushOpener />);
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('FiscalDocuments'));
    expect(mockSwitchRestaurant).toHaveBeenCalledTimes(1);
  });

  it('notificação de outro tipo não navega', async () => {
    render(<StaffPushOpener />);
    await settle();
    act(() => mockTap!(tap('other-kind', { kind: 'order_ready' })));
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
