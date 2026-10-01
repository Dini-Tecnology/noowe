import { secureStorage } from '../secure-storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@react-native-async-storage/async-storage');

describe('SecureStorage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('setAccessToken', () => {
    it('should store access token', async () => {
      await secureStorage.setAccessToken('token123');

      expect(AsyncStorage.setItem).toHaveBeenCalledWith('@access_token', 'token123');
    });
  });

  describe('getAccessToken', () => {
    it('should retrieve access token', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('token123');

      const token = await secureStorage.getAccessToken();

      expect(token).toBe('token123');
      expect(AsyncStorage.getItem).toHaveBeenCalledWith('@access_token');
    });

    it('should return null if no token exists', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);

      const token = await secureStorage.getAccessToken();

      expect(token).toBeNull();
    });
  });

  describe('clearAll', () => {
    it('should clear all storage', async () => {
      await secureStorage.clearAll();

      expect(AsyncStorage.clear).toHaveBeenCalled();
    });
  });
});
