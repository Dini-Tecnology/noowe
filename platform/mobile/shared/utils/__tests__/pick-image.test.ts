import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Alert, Linking } from 'react-native';

const mockLaunch = jest.fn();
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: (...args: unknown[]) => mockLaunch(...args),
  requestMediaLibraryPermissionsAsync: jest.fn(),
}));

import { photoSettingsHint, pickImageFromLibrary } from '../pick-image';
import * as ImagePicker from 'expo-image-picker';

describe('pickImageFromLibrary', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    mockLaunch.mockReset();
  });

  it('abre a galeria direto, sem pedir permissão antes', async () => {
    mockLaunch.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file://a.jpg' }] });
    const asset = await pickImageFromLibrary({ aspect: [16, 9], quality: 0.8 });
    expect(asset).toEqual({ uri: 'file://a.jpg' });
    expect(ImagePicker.requestMediaLibraryPermissionsAsync).not.toHaveBeenCalled();
    expect(mockLaunch).toHaveBeenCalledWith(expect.objectContaining({ aspect: [16, 9], quality: 0.8, allowsEditing: true }));
  });

  it('cancelar não é erro e não mostra alerta', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockLaunch.mockResolvedValueOnce({ canceled: true, assets: [] });
    expect(await pickImageFromLibrary()).toBeNull();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('se o sistema recusar abrir a galeria, explica onde liberar e oferece abrir os Ajustes', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    mockLaunch.mockRejectedValueOnce(new Error('permission denied'));

    expect(await pickImageFromLibrary()).toBeNull();

    const [title, message, buttons] = alertSpy.mock.calls[0] as [string, string, { text: string; onPress?: () => void }[]];
    expect(title).toBe('Não foi possível abrir suas fotos');
    expect(message).toMatch(/Ajustes|Configurações/);
    buttons.find((b) => b.text === 'Abrir Ajustes')?.onPress?.();
    expect(openSettings).toHaveBeenCalledTimes(1);
  });

  it('a dica de onde liberar muda por sistema', () => {
    expect(photoSettingsHint('ios')).toContain('Ajustes › NOOWE › Fotos');
    expect(photoSettingsHint('android')).toContain('Configurações › Apps › NOOWE');
  });
});
