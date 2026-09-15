/**
 * Font loading for the Okinawa Design System.
 * Call useFonts(appFonts) from expo-font in each app's root component and gate
 * rendering until it resolves; call applyDefaultFonts() once so screens that
 * never set an explicit fontFamily (most legacy screens) still pick up DM Sans
 * instead of the OS default.
 */
import { Text, TextInput } from 'react-native';
import {
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from '@expo-google-fonts/inter';
import {
  JetBrainsMono_500Medium,
  JetBrainsMono_600SemiBold,
} from '@expo-google-fonts/jetbrains-mono';

export const appFonts = {
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  JetBrainsMono_500Medium,
  JetBrainsMono_600SemiBold,
};

let defaultsApplied = false;

export function applyDefaultFonts() {
  if (defaultsApplied) return;
  defaultsApplied = true;
  const style = { fontFamily: 'DMSans_400Regular' };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const AnyText = Text as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const AnyTextInput = TextInput as any;
  AnyText.defaultProps = AnyText.defaultProps || {};
  AnyText.defaultProps.style = [style, AnyText.defaultProps.style];
  AnyTextInput.defaultProps = AnyTextInput.defaultProps || {};
  AnyTextInput.defaultProps.style = [style, AnyTextInput.defaultProps.style];
}
