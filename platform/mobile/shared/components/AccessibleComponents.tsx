/**
 * Accessible Component Wrappers
 *
 * TypeScript-enforced wrappers around react-native-paper components
 * that REQUIRE accessibilityLabel. This ensures new screens
 * always provide a11y labels by default.
 *
 * @module shared/components/AccessibleComponents
 */

import React from 'react';
import {
  Button as PaperButton,
  IconButton as PaperIconButton,
  TextInput as PaperTextInput,
  FAB as PaperFAB,
} from 'react-native-paper';
import type { ComponentProps } from 'react';

// ============================================
// TYPES — Make accessibilityLabel required
// ============================================

type PaperButtonProps = ComponentProps<typeof PaperButton>;
type PaperIconButtonProps = ComponentProps<typeof PaperIconButton>;
type PaperTextInputProps = ComponentProps<typeof PaperTextInput>;
type PaperFABProps = ComponentProps<typeof PaperFAB>;

type AccessibleButtonProps = PaperButtonProps & {
  accessibilityLabel: string;
};

type AccessibleIconButtonProps = PaperIconButtonProps & {
  accessibilityLabel: string;
};

type AccessibleTextInputProps = PaperTextInputProps & {
  accessibilityLabel: string;
};

type AccessibleFABProps = PaperFABProps & {
  accessibilityLabel: string;
};

// ============================================
// COMPONENTS
// ============================================

/**
 * Button that requires accessibilityLabel.
 * Drop-in replacement for react-native-paper Button.
 */
export const AccessibleButton: React.FC<AccessibleButtonProps> = (props) => {
  return <PaperButton {...props} />;
};

/**
 * IconButton that requires accessibilityLabel.
 * Drop-in replacement for react-native-paper IconButton.
 */
export const AccessibleIconButton: React.FC<AccessibleIconButtonProps> = (props) => {
  return <PaperIconButton {...props} />;
};

/**
 * TextInput that requires accessibilityLabel.
 * Drop-in replacement for react-native-paper TextInput.
 */
export const AccessibleTextInput: React.FC<AccessibleTextInputProps> = (props) => {
  return <PaperTextInput {...props} />;
};

/**
 * FAB that requires accessibilityLabel.
 * Drop-in replacement for react-native-paper FAB.
 */
export const AccessibleFAB: React.FC<AccessibleFABProps> = (props) => {
  return <PaperFAB {...props} />;
};
