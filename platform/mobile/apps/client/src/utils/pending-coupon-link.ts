import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@noowe/client/pending-coupon-link/v1';

export type PendingCouponLink = { restaurantId: string; code: string };

/** Link de cupom aberto fora do app: espera o app montar e a pessoa entrar, como o convite de mesa. */
export async function stashPendingCouponLink(link: PendingCouponLink): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(link));
}

export async function takePendingCouponLink(): Promise<PendingCouponLink | null> {
  const value = await AsyncStorage.getItem(STORAGE_KEY);
  if (!value) return null;
  await AsyncStorage.removeItem(STORAGE_KEY);
  try {
    return JSON.parse(value) as PendingCouponLink;
  } catch {
    return null;
  }
}
