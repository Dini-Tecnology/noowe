import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { secureStorage } from '../secure-storage';

// Tokens vivem no SecureStore (cifrado); o AsyncStorage guarda só dado não sensível.
describe('SecureStorage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('grava o access token no SecureStore, nunca no AsyncStorage', async () => {
    await secureStorage.setAccessToken('token123');

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('access_token', 'token123');
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('lê o access token do SecureStore', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce('token123');

    await expect(secureStorage.getAccessToken()).resolves.toBe('token123');
    expect(SecureStore.getItemAsync).toHaveBeenCalledWith('access_token');
  });

  it('devolve null quando não há token', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(null);

    await expect(secureStorage.getAccessToken()).resolves.toBeNull();
  });

  it('clearAll apaga os tokens e as preferências', async () => {
    await secureStorage.clearAll();

    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('access_token');
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('refresh_token');
    expect(AsyncStorage.multiRemove).toHaveBeenCalledWith(['preferences', 'theme']);
  });
});
