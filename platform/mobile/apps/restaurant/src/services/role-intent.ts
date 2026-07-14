import AsyncStorage from '@react-native-async-storage/async-storage';

export type RoleIntent = 'owner' | 'staff';

const STORAGE_PREFIX = 'restaurant_role_intent:';

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}${userId}`;
}

export async function getRoleIntent(userId: string): Promise<RoleIntent | null> {
  const value = await AsyncStorage.getItem(storageKey(userId));
  if (value === 'owner' || value === 'staff') return value;
  return null;
}

export async function setRoleIntent(userId: string, intent: RoleIntent): Promise<void> {
  await AsyncStorage.setItem(storageKey(userId), intent);
}

export async function clearRoleIntent(userId: string): Promise<void> {
  await AsyncStorage.removeItem(storageKey(userId));
}
