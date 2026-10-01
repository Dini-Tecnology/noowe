import { Alert, Linking, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

type PickImageOptions = {
  aspect?: [number, number];
  quality?: number;
};

/** Onde o usuário reativa o acesso às fotos, na linguagem de cada sistema. */
export function photoSettingsHint(os: string = Platform.OS): string {
  return os === 'ios'
    ? 'Abra Ajustes › NOOWE › Fotos e permita o acesso às suas fotos.'
    : 'Abra Configurações › Apps › NOOWE › Permissões › Fotos e mídia e permita o acesso.';
}

/**
 * Abre a galeria e devolve a foto escolhida (ou null se cancelou).
 *
 * O seletor moderno (PHPicker no iOS, Photo Picker no Android 13+) mostra só as
 * fotos que o usuário escolher e não exige permissão nenhuma, então não pedimos
 * antes — pedir "acesso às fotos" à toa era o que gerava o alerta sem saída. Só
 * quando o sistema realmente recusar abrir a galeria (versões antigas com o
 * acesso negado) explicamos onde liberar e oferecemos abrir os Ajustes.
 */
export async function pickImageFromLibrary(options: PickImageOptions = {}): Promise<ImagePicker.ImagePickerAsset | null> {
  try {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: options.aspect ?? [1, 1],
      quality: options.quality ?? 0.85,
    });
    if (result.canceled || !result.assets[0]) return null;
    return result.assets[0];
  } catch {
    Alert.alert(
      'Não foi possível abrir suas fotos',
      `O NOOWE precisa de acesso às suas fotos para escolher a imagem. ${photoSettingsHint()}`,
      [
        { text: 'Agora não', style: 'cancel' },
        { text: 'Abrir Ajustes', onPress: () => { void Linking.openSettings(); } },
      ],
    );
    return null;
  }
}
