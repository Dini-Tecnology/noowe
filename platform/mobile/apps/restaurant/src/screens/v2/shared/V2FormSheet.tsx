import React, { ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from 'react-native-paper';
import { X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';

interface V2FormSheetProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  saveLabel?: string;
  saving?: boolean;
  saveDisabled?: boolean;
  children: ReactNode;
  onClose: () => void;
  onSave: () => void;
}

export function V2FormSheet({
  visible,
  title,
  subtitle,
  saveLabel = 'Salvar',
  saving = false,
  saveDisabled = false,
  children,
  onClose,
  onSave,
}: V2FormSheetProps) {
  const colors = useColors();
  // Read the insets from the app window before opening the native Modal.
  // On some iOS/Android versions a SafeAreaView mounted inside a full-screen
  // Modal briefly reports zero, placing the header under the status bar.
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent={false}
      navigationBarTranslucent={false}
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.safeArea,
          {
            backgroundColor: colors.background,
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
            paddingLeft: insets.left,
            paddingRight: insets.right,
          },
        ]}
      >
        <KeyboardAvoidingView
          style={styles.keyboard}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <View style={styles.heading}>
              <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
              {subtitle ? (
                <Text style={[styles.subtitle, { color: colors.foregroundSecondary }]}>{subtitle}</Text>
              ) : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Fechar"
              hitSlop={12}
              onPress={onClose}
              style={({ pressed }) => [
                styles.closeButton,
                { backgroundColor: colors.backgroundSecondary },
                pressed && styles.pressed,
              ]}
            >
              <X size={21} color={colors.foreground} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.contentContainer}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>

          <View style={[styles.footer, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
            <Pressable
              disabled={saving}
              onPress={onClose}
              style={({ pressed }) => [
                styles.secondaryButton,
                { borderColor: colors.border },
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.secondaryLabel, { color: colors.foreground }]}>Cancelar</Text>
            </Pressable>
            <Pressable
              disabled={saving || saveDisabled}
              onPress={onSave}
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: colors.primary },
                (saving || saveDisabled) && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              {saving ? <ActivityIndicator size="small" color="#FFF" /> : null}
              <Text style={styles.primaryLabel}>{saving ? 'Salvando…' : saveLabel}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  keyboard: { flex: 1 },
  header: {
    minHeight: 76,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  heading: { flex: 1 },
  title: { fontSize: 20, fontWeight: '800' },
  subtitle: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  closeButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { flex: 1 },
  contentContainer: { padding: 20, paddingBottom: 36 },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 10,
  },
  secondaryButton: {
    minHeight: 48,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryLabel: { fontWeight: '700' },
  primaryButton: {
    flex: 1,
    minHeight: 48,
    paddingHorizontal: 18,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  primaryLabel: { color: '#FFF', fontWeight: '800' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.78 },
});
