import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@noowe/client/pending-table-qr/v1';

/**
 * Stashes a table QR payload opened outside the in-app scanner (OS camera,
 * another app, cold app launch via deep link) so it can be processed once
 * the authenticated app tree — and its providers — are actually mounted.
 * See app/t/[code].tsx and HomeScreen's consumption of this on mount.
 */
export async function stashPendingTableQr(qrData: string): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, qrData);
}

/** Reads and clears the pending QR, if any. Safe to call unconditionally. */
export async function takePendingTableQr(): Promise<string | null> {
  const value = await AsyncStorage.getItem(STORAGE_KEY);
  if (value) await AsyncStorage.removeItem(STORAGE_KEY);
  return value;
}
