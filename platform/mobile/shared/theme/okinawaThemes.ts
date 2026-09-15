/**
 * Okinawa unified light/dark theme objetos — módulo sem dependência de React/context.
 * ThemeContext importa apenas este arquivo para evitar ciclo com shared/theme/index.ts.
 */

import { lightTheme, darkTheme, colorPalette, gradients } from './colors';
import { typography, fontFamily, fontWeight, fontSize, lineHeight, letterSpacing } from './typography';
import { spacing, borderRadius, layout, zIndex } from './spacing';
import { shadows, componentShadows, glowEffects } from './shadows';
import { duration, easing, animationPresets } from './animations';

export const OkinawaLightTheme = {
  colors: lightTheme,
  palette: colorPalette,
  gradients,
  typography,
  fontFamily,
  fontWeight,
  fontSize,
  lineHeight,
  letterSpacing,
  spacing,
  borderRadius,
  layout,
  zIndex,
  shadows,
  componentShadows,
  glowEffects,
  duration,
  easing,
  animations: animationPresets,
  dark: false,
} as const;

export const OkinawaDarkTheme = {
  colors: darkTheme,
  palette: colorPalette,
  gradients,
  typography,
  fontFamily,
  fontWeight,
  fontSize,
  lineHeight,
  letterSpacing,
  spacing,
  borderRadius,
  layout,
  zIndex,
  shadows,
  componentShadows,
  glowEffects,
  duration,
  easing,
  animations: animationPresets,
  dark: true,
} as const;

export type OkinawaTheme = typeof OkinawaLightTheme | typeof OkinawaDarkTheme;

export default OkinawaLightTheme;
