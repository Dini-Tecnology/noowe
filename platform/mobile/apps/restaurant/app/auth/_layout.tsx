import { Slot } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

/** Telas de callback e redefinição de senha não aplicam área segura por conta própria. */
export default function AuthLayout() {
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <Slot />
    </SafeAreaView>
  );
}
