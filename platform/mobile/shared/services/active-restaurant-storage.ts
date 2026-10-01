import AsyncStorage from '@react-native-async-storage/async-storage';

const storageKey = (userId: string) => `@noowe/restaurant/active-restaurant/${userId}`;

/** Última escolha da pessoa neste aparelho (por usuário, para contas diferentes não se misturarem). */
export async function loadStoredActiveRestaurantId(userId: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(storageKey(userId));
  } catch {
    return null;
  }
}

export async function saveStoredActiveRestaurantId(userId: string, restaurantId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(storageKey(userId), restaurantId);
  } catch {
    // Sem persistência a escolha vale só nesta sessão — não é motivo para falhar a troca.
  }
}
