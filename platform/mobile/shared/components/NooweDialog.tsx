import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useColors } from '../contexts/ThemeContext';

export type NooweDialogAction = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
};

interface NooweDialogProps {
  visible: boolean;
  title: string;
  message: string;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  tone?: 'brand' | 'success' | 'error';
  actions: NooweDialogAction[];
  onDismiss?: () => void;
  dismissible?: boolean;
}

export function NooweDialog({
  visible,
  title,
  message,
  icon = 'email-fast-outline',
  tone = 'brand',
  actions,
  onDismiss,
  dismissible = true,
}: NooweDialogProps) {
  const colors = useColors();
  const accent = tone === 'success' ? colors.success : tone === 'error' ? colors.error : colors.primary;
  const accentBackground =
    tone === 'success'
      ? colors.successBackground
      : tone === 'error'
        ? colors.errorBackground
        : '#FFF7ED';

  const requestDismiss = () => {
    if (dismissible) onDismiss?.();
  };

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType="fade"
      onRequestClose={requestDismiss}
      accessibilityViewIsModal
    >
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={requestDismiss}
          accessible={false}
        />

        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.card,
              borderColor: colors.cardBorder,
              shadowColor: colors.shadowColorStrong,
            },
          ]}
        >
          <View style={[styles.brandRail, { backgroundColor: accent }]} />

          <View style={styles.content}>
            <View style={[styles.iconHalo, { backgroundColor: accentBackground }]}>
              <MaterialCommunityIcons name={icon} size={30} color={accent} />
            </View>

            <Text style={[styles.eyebrow, { color: accent }]}>NOOWE</Text>
            <Text style={[styles.title, { color: colors.foreground }]} accessibilityRole="header">
              {title}
            </Text>
            <Text style={[styles.message, { color: colors.foregroundSecondary }]}>{message}</Text>

            <View style={styles.actions}>
              {actions.map((action, index) => {
                const variant = action.variant ?? (index === 0 ? 'primary' : 'secondary');
                const isPrimary = variant === 'primary';
                const isSecondary = variant === 'secondary';
                const disabled = action.disabled || action.loading;

                return (
                  <TouchableOpacity
                    key={`${action.label}-${index}`}
                    style={[
                      styles.button,
                      isPrimary && { backgroundColor: colors.primary },
                      isSecondary && {
                        backgroundColor: colors.backgroundSecondary,
                        borderColor: colors.border,
                        borderWidth: 1,
                      },
                      variant === 'ghost' && styles.ghostButton,
                      disabled && styles.disabled,
                    ]}
                    onPress={action.onPress}
                    disabled={disabled}
                    activeOpacity={0.82}
                    accessibilityRole="button"
                    accessibilityLabel={action.label}
                    accessibilityState={{ disabled, busy: Boolean(action.loading) }}
                  >
                    {action.loading ? (
                      <ActivityIndicator color={colors.primaryForeground} size="small" />
                    ) : (
                      <Text
                        style={[
                          styles.buttonLabel,
                          { color: isPrimary ? colors.primaryForeground : isSecondary ? colors.foreground : colors.foregroundSecondary },
                        ]}
                      >
                        {action.label}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: 'rgba(17, 24, 39, 0.68)',
  },
  card: {
    width: '100%',
    maxWidth: 390,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    elevation: 18,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.28,
    shadowRadius: 28,
  },
  brandRail: {
    height: 5,
    width: '100%',
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 26,
    paddingBottom: 22,
  },
  iconHalo: {
    width: 64,
    height: 64,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    transform: [{ rotate: '-2deg' }],
  },
  eyebrow: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800',
    letterSpacing: 2.2,
    marginBottom: 7,
  },
  title: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
    letterSpacing: -0.35,
    textAlign: 'center',
  },
  message: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 310,
  },
  actions: {
    width: '100%',
    marginTop: 24,
    gap: 10,
  },
  button: {
    minHeight: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 13,
  },
  ghostButton: {
    minHeight: 40,
    paddingVertical: 8,
  },
  buttonLabel: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  disabled: {
    opacity: 0.62,
  },
});

export default NooweDialog;
