import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@noowe/client/pending-table-invite/v1';

/**
 * Stashes a table-invite token opened outside the running app (a link tapped
 * in Messages/WhatsApp, cold app launch) so it can be processed once the
 * authenticated app tree — and its providers — are actually mounted. See
 * app/t/invite/[token].tsx and HomeScreen's consumption of this on mount.
 */
export async function stashPendingTableInvite(token: string): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, token);
}

/** Reads and clears the pending invite token, if any. Safe to call unconditionally. */
export async function takePendingTableInvite(): Promise<string | null> {
  const value = await AsyncStorage.getItem(STORAGE_KEY);
  if (value) await AsyncStorage.removeItem(STORAGE_KEY);
  return value;
}
