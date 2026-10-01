import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import EditProfileScreen from '../screens/production/EditProfileScreen';
import { isUsernameFormatValid, normalizeUsernameInput } from '../utils/username';

jest.mock('@expo/vector-icons/Ionicons', () => 'Icon');
jest.mock('expo-image-picker', () => ({}));
jest.mock('@okinawa/shared/contexts/ThemeContext', () => ({ useColors: () => new Proxy({}, { get: () => '#333333' }) }));
jest.mock('@okinawa/shared/components/ScreenContainer', () => ({ ScreenContainer: ({ children }: React.PropsWithChildren) => <>{children}</> }));

const profile = {
  id: 'u1', email: 'bruno@noowe.test', fullName: 'Bruno de Castro', username: 'bruno-de-castro',
  phone: null, avatarUrl: null, favoriteCuisines: [], dietaryRestrictions: [], preferences: {},
};
const mockGetProfile = jest.fn();
const mockUpdateProfile = jest.fn();
const mockSetUsername = jest.fn();
const mockCheck = jest.fn();
jest.mock('../services/customer-backend', () => ({ __esModule: true, default: {
  getProfile: () => mockGetProfile(),
  updateProfile: (patch: unknown) => mockUpdateProfile(patch),
  setUsername: (value: string) => mockSetUsername(value),
  checkUsernameAvailability: (value: string) => mockCheck(value),
  uploadProfileAvatar: jest.fn(),
} }));

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(
    <QueryClientProvider client={client}>
      <EditProfileScreen navigation={{ goBack: jest.fn() }} />
    </QueryClientProvider>,
  );
  return { view, client };
}

beforeEach(() => {
  mockGetProfile.mockResolvedValue(profile);
  mockUpdateProfile.mockImplementation(async () => profile);
  mockSetUsername.mockImplementation(async (value: string) => value);
  mockCheck.mockReset();
});

describe('username normalization (UX mirror of the server)', () => {
  it.each([
    ['@Bruno de Castro', 'bruno-de-castro'],
    ['João Ávila', 'joao-avila'],
    ['bruno ', 'bruno-'],
    ['a__b..c', 'a-b-c'],
    ['bru$no!', 'bruno'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeUsernameInput(input)).toBe(expected);
  });

  it('accepts only the stored format', () => {
    expect(isUsernameFormatValid('bruno-de-castro')).toBe(true);
    expect(isUsernameFormatValid('ab')).toBe(false);
    expect(isUsernameFormatValid('-bruno')).toBe(false);
    expect(isUsernameFormatValid('bruno-')).toBe(false);
    expect(isUsernameFormatValid('a'.repeat(31))).toBe(false);
  });
});

describe('Editar Perfil · @', () => {
  it('shows the current @ and saves the name without touching it', async () => {
    const { view, client } = renderScreen();
    const input = await view.findByTestId('username-input');
    expect(input.props.value).toBe('bruno-de-castro');
    fireEvent.changeText(view.getByLabelText('Nome'), 'Bruno Castro');
    fireEvent.press(view.getByText('Salvar alterações'));
    await waitFor(() => expect(mockUpdateProfile).toHaveBeenCalled());
    expect(mockSetUsername).not.toHaveBeenCalled();
    expect(mockCheck).not.toHaveBeenCalled();
    client.clear();
  });

  it('normalizes while typing, checks availability and saves through the RPC', async () => {
    mockCheck.mockResolvedValue({ normalized: 'bruno-castro', available: true, reason: null });
    const { view, client } = renderScreen();
    const input = await view.findByTestId('username-input');
    fireEvent.changeText(input, '@Bruno.Castro');
    expect(view.getByTestId('username-input').props.value).toBe('bruno-castro');
    await waitFor(() => expect(view.getByTestId('username-hint').props.children).toBe('@bruno-castro está disponível.'));
    expect(mockCheck).toHaveBeenCalledWith('bruno-castro');

    fireEvent.press(view.getByText('Salvar alterações'));
    await waitFor(() => expect(mockUpdateProfile).toHaveBeenCalled());
    expect(mockSetUsername).toHaveBeenCalledWith('bruno-castro');
    expect(mockSetUsername.mock.invocationCallOrder[0]).toBeLessThan(mockUpdateProfile.mock.invocationCallOrder[0]);
    client.clear();
  });

  it('blocks saving an @ that is taken', async () => {
    mockCheck.mockResolvedValue({ normalized: 'ana', available: false, reason: 'taken' });
    const { view, client } = renderScreen();
    fireEvent.changeText(await view.findByTestId('username-input'), 'ana');
    await waitFor(() => expect(view.getByTestId('username-hint').props.children).toBe('Esse @ já está em uso.'));
    fireEvent.press(view.getByText('Salvar alterações'));
    expect(mockSetUsername).not.toHaveBeenCalled();
    expect(mockUpdateProfile).not.toHaveBeenCalled();
    client.clear();
  });

  it('flags an invalid format without asking the server', async () => {
    const { view, client } = renderScreen();
    fireEvent.changeText(await view.findByTestId('username-input'), 'ab');
    expect(view.getByTestId('username-hint').props.children).toBe('Use de 3 a 30 caracteres: letras minúsculas, números e hífen.');
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 500)); });
    expect(mockCheck).not.toHaveBeenCalled();
    client.clear();
  });

  it('shows the server error when the @ is taken between the check and the save', async () => {
    mockCheck.mockResolvedValue({ normalized: 'bruno-x', available: true, reason: null });
    mockSetUsername.mockRejectedValue(Object.assign(new Error('Esse @ já está em uso'), { code: '23505' }));
    const { view, client } = renderScreen();
    fireEvent.changeText(await view.findByTestId('username-input'), 'bruno-x');
    await waitFor(() => expect(view.getByTestId('username-hint').props.children).toBe('@bruno-x está disponível.'));
    fireEvent.press(view.getByText('Salvar alterações'));
    await waitFor(() => expect(view.getByText('Esse @ já está em uso')).toBeTruthy());
    expect(mockUpdateProfile).not.toHaveBeenCalled();
    client.clear();
  });
});
