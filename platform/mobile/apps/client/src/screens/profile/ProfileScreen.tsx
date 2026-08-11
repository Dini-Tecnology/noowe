import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import {
  Text,
  Avatar,
  List,
  Divider,
  Switch,
  IconButton,
  ActivityIndicator,
  Dialog,
  Portal,
  Button,
  TextInput,
  Chip,
} from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';

import ApiService from '@/shared/services/api';
import { authService } from '@/shared/services/auth';
import { useI18n } from '@/shared/hooks/useI18n';
import { useColors, useOkinawaTheme } from '@okinawa/shared/contexts/ThemeContext';
import logger from '@okinawa/shared/utils/logger';
import type { User } from '../../types';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';

const DIETARY_OPTION_KEYS = [
  { key: 'vegetarian', i18nKey: 'profile.dietary.vegetarian' },
  { key: 'vegan', i18nKey: 'profile.dietary.vegan' },
  { key: 'gluten_free', i18nKey: 'profile.dietary.gluten_free' },
  { key: 'lactose_free', i18nKey: 'profile.dietary.lactose_free' },
  { key: 'kosher', i18nKey: 'profile.dietary.kosher' },
  { key: 'halal', i18nKey: 'profile.dietary.halal' },
];

export default function ProfileScreen() {
  const navigation = useNavigation();
  const { t } = useI18n();
  const { theme, isDark } = useOkinawaTheme();
  const colors = useColors();

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [editDialogVisible, setEditDialogVisible] = useState(false);
  const [editField, setEditField] = useState<'full_name' | 'phone'>('full_name');
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [dietaryRestrictions, setDietaryRestrictions] = useState<string[]>([]);
  const [savingDietary, setSavingDietary] = useState(false);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      setLoading(true);
      const userData = await ApiService.getCurrentUser();
      setUser(userData);
      if (userData.avatar_url) setAvatarUri(userData.avatar_url);
      if (userData.dietary_restrictions) setDietaryRestrictions(userData.dietary_restrictions);
    } catch (error) {
      logger.error('Error loading user:', error);
      Alert.alert(t('common.error'), t('errors.loadProfileFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    Alert.alert(t('auth.logout'), t('auth.logoutConfirm'), [
      {
        text: t('common.cancel'),
        style: 'cancel',
      },
      {
        text: t('auth.logout'),
        style: 'destructive',
        onPress: async () => {
          try {
            await authService.logout();
          } catch (error) {
            logger.error('Error logging out:', error);
          }
        },
      },
    ]);
  };

  const handleEditProfile = (field: 'full_name' | 'phone') => {
    setEditField(field);
    setEditValue(field === 'full_name' ? user?.full_name || '' : user?.phone || '');
    setEditDialogVisible(true);
  };

  const handleSaveEdit = async () => {
    if (!editValue.trim()) {
      Alert.alert(t('common.error'), t('errors.fieldRequired'));
      return;
    }

    try {
      setSaving(true);

      const updateData: { full_name?: string; phone?: string } = {};
      if (editField === 'full_name') {
        updateData.full_name = editValue;
      } else {
        updateData.phone = editValue;
      }

      const updatedUser = await ApiService.updateProfile(updateData);
      setUser(updatedUser);

      setEditDialogVisible(false);
      Alert.alert(t('common.success'), t('success.profileUpdated'));
    } catch (error) {
      logger.error('Failed to update profile:', error);
      Alert.alert(t('common.error'), t('errors.updateProfileFailed'));
    } finally {
      setSaving(false);
    }
  };

  // F7: Avatar upload via image picker
  const pickAvatar = async () => {
    try {
      const permResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permResult.granted) {
        Alert.alert(t('common.error'), t('errors.photoPermissionDenied'));
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
      });

      if (!result.canceled && result.assets[0]) {
        setAvatarUri(result.assets[0].uri);
        // TODO: Upload to server when S3 is configured
        // await ApiService.uploadAvatar(result.assets[0].uri);
        logger.log('Avatar selected locally:', result.assets[0].uri);
      }
    } catch (error) {
      logger.error('Error picking avatar:', error);
      Alert.alert(t('common.error'), t('errors.photoPickFailed'));
    }
  };

  // F7: Toggle dietary restriction
  const toggleDietary = async (option: string) => {
    const updated = dietaryRestrictions.includes(option)
      ? dietaryRestrictions.filter((d) => d !== option)
      : [...dietaryRestrictions, option];

    setDietaryRestrictions(updated);

    try {
      setSavingDietary(true);
      await ApiService.updateProfile({ dietary_restrictions: updated } as any);
    } catch (error) {
      logger.error('Failed to save dietary preferences:', error);
      // Revert on failure
      setDietaryRestrictions(dietaryRestrictions);
    } finally {
      setSavingDietary(false);
    }
  };

  const styles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.backgroundSecondary,
    },
    loadingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
    },
    header: {
      alignItems: 'center',
      padding: 24,
      backgroundColor: colors.card,
    },
    avatarContainer: {
      position: 'relative',
      marginBottom: 16,
    },
    avatar: {
      backgroundColor: colors.primary,
    },
    cameraButton: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      backgroundColor: colors.primary,
      margin: 0,
    },
    userName: {
      marginBottom: 4,
      color: colors.foreground,
    },
    userEmail: {
      color: colors.foregroundSecondary,
    },
    divider: {
      marginVertical: 8,
      backgroundColor: colors.border,
    },
    section: {
      backgroundColor: colors.card,
      paddingVertical: 8,
    },
    sectionTitle: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      color: colors.foregroundSecondary,
    },
    logoutButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      paddingVertical: 12,
      paddingHorizontal: 16,
      marginTop: 8,
    },
    logoutText: {
      color: colors.error,
      marginLeft: 8,
    },
    footer: {
      alignItems: 'center',
      padding: 24,
    },
    version: {
      color: colors.foregroundMuted,
    },
    dietaryContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingHorizontal: 16,
      paddingBottom: 12,
      gap: 8,
    },
    dietaryChip: {
      marginBottom: 4,
    },
  }), [colors]);

  if (loading) {
    return (
      <ScreenContainer edges={['top']}>
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={['top']} hasKeyboard>
    <ScrollView style={styles.container}>
      {/* Profile Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.avatarContainer}
          onPress={pickAvatar}
          accessibilityRole="button"
          accessibilityLabel="Change profile photo"
        >
          {avatarUri ? (
            <Avatar.Image
              size={80}
              source={{ uri: avatarUri }}
              style={styles.avatar}
            />
          ) : (
            <Avatar.Text
              size={80}
              label={user?.full_name?.charAt(0) || 'U'}
              style={styles.avatar}
            />
          )}
          <IconButton
            icon="camera"
            size={20}
            style={styles.cameraButton}
            iconColor={colors.primaryForeground}
          />
        </TouchableOpacity>

        <Text variant="headlineSmall" style={styles.userName}>
          {user?.full_name || t('common.user')}
        </Text>
        <Text variant="bodyMedium" style={styles.userEmail}>
          {user?.email}
        </Text>
      </View>

      <Divider style={styles.divider} />

      {/* Account Section */}
      <View style={styles.section}>
        <Text variant="titleMedium" style={styles.sectionTitle}>
          {t('profile.account')}
        </Text>

        <List.Item
          title={t('auth.fullName')}
          description={user?.full_name || t('common.notProvided')}
          left={(props) => <List.Icon {...props} icon="account" color={colors.foregroundSecondary} />}
          right={(props) => <List.Icon {...props} icon="pencil" color={colors.foregroundMuted} />}
          onPress={() => handleEditProfile('full_name')}
          titleStyle={{ color: colors.foreground }}
          descriptionStyle={{ color: colors.foregroundSecondary }}
        />

        <List.Item
          title={t('auth.email')}
          description={user?.email}
          left={(props) => <List.Icon {...props} icon="email" color={colors.foregroundSecondary} />}
          disabled
          titleStyle={{ color: colors.foreground }}
          descriptionStyle={{ color: colors.foregroundSecondary }}
        />

        <List.Item
          title={t('profile.phone')}
          description={user?.phone || t('common.notProvided')}
          left={(props) => <List.Icon {...props} icon="phone" color={colors.foregroundSecondary} />}
          right={(props) => <List.Icon {...props} icon="pencil" color={colors.foregroundMuted} />}
          onPress={() => handleEditProfile('phone')}
          titleStyle={{ color: colors.foreground }}
          descriptionStyle={{ color: colors.foregroundSecondary }}
        />
      </View>

      <Divider style={styles.divider} />

      {/* Dietary Preferences Section */}
      <View style={styles.section}>
        <Text variant="titleMedium" style={styles.sectionTitle}>
          {t('profile.dietaryPreferences') || 'Prefer\u00EAncias Alimentares'}
        </Text>
        <View style={styles.dietaryContainer}>
          {DIETARY_OPTION_KEYS.map((option) => (
            <Chip
              key={option.key}
              selected={dietaryRestrictions.includes(option.key)}
              onPress={() => toggleDietary(option.key)}
              style={styles.dietaryChip}
              showSelectedOverlay
              selectedColor={colors.primary}
              mode={dietaryRestrictions.includes(option.key) ? 'flat' : 'outlined'}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: dietaryRestrictions.includes(option.key) }}
            >
              {t(option.i18nKey)}
            </Chip>
          ))}
          {savingDietary && (
            <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: 8 }} />
          )}
        </View>
      </View>

      <Divider style={styles.divider} />

      {/* Navigation Section */}
      <View style={styles.section}>
        <Text variant="titleMedium" style={styles.sectionTitle}>
          {t('profile.manage')}
        </Text>

        <List.Item
          title={t('profile.paymentMethods')}
          description={t('profile.paymentMethodsDesc')}
          left={(props) => <List.Icon {...props} icon="credit-card" color={colors.foregroundSecondary} />}
          right={(props) => <List.Icon {...props} icon="chevron-right" color={colors.foregroundMuted} />}
          onPress={() => navigation.navigate('PaymentMethods' as never)}
          titleStyle={{ color: colors.foreground }}
          descriptionStyle={{ color: colors.foregroundSecondary }}
        />

        <List.Item
          title={t('profile.wallet')}
          description={t('profile.walletDesc')}
          left={(props) => <List.Icon {...props} icon="wallet" color={colors.foregroundSecondary} />}
          right={(props) => <List.Icon {...props} icon="chevron-right" color={colors.foregroundMuted} />}
          onPress={() => navigation.navigate('Wallet' as never)}
          titleStyle={{ color: colors.foreground }}
          descriptionStyle={{ color: colors.foregroundSecondary }}
        />

        <List.Item
          title={t('profile.addresses')}
          description={t('profile.addressesDesc')}
          left={(props) => <List.Icon {...props} icon="map-marker" color={colors.foregroundSecondary} />}
          right={(props) => <List.Icon {...props} icon="chevron-right" color={colors.foregroundMuted} />}
          onPress={() => navigation.navigate('Addresses' as never)}
          titleStyle={{ color: colors.foreground }}
          descriptionStyle={{ color: colors.foregroundSecondary }}
        />

        <List.Item
          title={t('notifications.title')}
          description={t('notifications.preferences')}
          left={(props) => <List.Icon {...props} icon="bell" color={colors.foregroundSecondary} />}
          right={() => (
            <Switch
              value={notificationsEnabled}
              onValueChange={setNotificationsEnabled}
              color={colors.primary}
            />
          )}
          titleStyle={{ color: colors.foreground }}
          descriptionStyle={{ color: colors.foregroundSecondary }}
        />
      </View>

      <Divider style={styles.divider} />

      {/* Support Section */}
      <View style={styles.section}>
        <Text variant="titleMedium" style={styles.sectionTitle}>
          {t('navigation.help')}
        </Text>

        <List.Item
          title={t('settings.helpCenter')}
          description={t('settings.helpCenterDesc')}
          left={(props) => <List.Icon {...props} icon="help-circle" color={colors.foregroundSecondary} />}
          right={(props) => <List.Icon {...props} icon="chevron-right" color={colors.foregroundMuted} />}
          titleStyle={{ color: colors.foreground }}
          descriptionStyle={{ color: colors.foregroundSecondary }}
        />

        <List.Item
          title={t('settings.contactSupport')}
          description={t('settings.contactSupportDesc')}
          left={(props) => <List.Icon {...props} icon="message" color={colors.foregroundSecondary} />}
          right={(props) => <List.Icon {...props} icon="chevron-right" color={colors.foregroundMuted} />}
          titleStyle={{ color: colors.foreground }}
          descriptionStyle={{ color: colors.foregroundSecondary }}
        />

        <List.Item
          title={t('settings.termsOfService')}
          description={t('settings.termsDesc')}
          left={(props) => <List.Icon {...props} icon="file-document" color={colors.foregroundSecondary} />}
          right={(props) => <List.Icon {...props} icon="chevron-right" color={colors.foregroundMuted} />}
          titleStyle={{ color: colors.foreground }}
          descriptionStyle={{ color: colors.foregroundSecondary }}
        />

        <List.Item
          title={t('settings.privacyPolicy')}
          description={t('settings.privacyDesc')}
          left={(props) => <List.Icon {...props} icon="shield-account" color={colors.foregroundSecondary} />}
          right={(props) => <List.Icon {...props} icon="chevron-right" color={colors.foregroundMuted} />}
          titleStyle={{ color: colors.foreground }}
          descriptionStyle={{ color: colors.foregroundSecondary }}
        />
      </View>

      <Divider style={styles.divider} />

      {/* Logout Button */}
      <TouchableOpacity
        style={styles.logoutButton}
        onPress={handleLogout}
        accessibilityRole="button"
        accessibilityLabel="Log out"
      >
        <IconButton icon="logout" size={24} iconColor={colors.error} />
        <Text variant="titleMedium" style={styles.logoutText}>
          {t('auth.logout')}
        </Text>
      </TouchableOpacity>

      <View style={styles.footer}>
        <Text variant="bodySmall" style={styles.version}>
          {t('settings.version')} 1.0.0
        </Text>
      </View>

      {/* Edit Dialog */}
      <Portal>
        <Dialog 
          visible={editDialogVisible} 
          onDismiss={() => setEditDialogVisible(false)}
          style={{ backgroundColor: colors.card }}
        >
          <Dialog.Title style={{ color: colors.foreground }}>
            {t('common.edit')} {editField === 'full_name' ? t('profile.name') : t('profile.phone')}
          </Dialog.Title>
          <Dialog.Content>
            <TextInput
              label={editField === 'full_name' ? t('auth.fullName') : t('profile.phone')}
              value={editValue}
              onChangeText={setEditValue}
              mode="outlined"
              keyboardType={editField === 'phone' ? 'phone-pad' : 'default'}
              autoFocus
              textColor={colors.foreground}
              outlineColor={colors.border}
              activeOutlineColor={colors.primary}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setEditDialogVisible(false)} textColor={colors.foregroundSecondary}>
              {t('common.cancel')}
            </Button>
            <Button onPress={handleSaveEdit} loading={saving} textColor={colors.primary}>
              {t('common.save')}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </ScrollView>
  
    </ScreenContainer>
  );
}
