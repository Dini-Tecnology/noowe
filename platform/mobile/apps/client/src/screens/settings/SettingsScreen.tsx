import React, { useState, useEffect, useMemo } from 'react';
import { View, ScrollView, StyleSheet, Alert, Switch, Linking } from 'react-native';
import {
  Text,
  List,
  Divider,
  Button,
  Dialog,
  Portal,
  RadioButton,
} from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ApiService from '@/shared/services/api';
import { authService } from '@/shared/services/auth';
import { useI18n, SupportedLanguage } from '@/shared/hooks/useI18n';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import logger from '@okinawa/shared/utils/logger';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';

interface Settings {
  notifications: {
    orders: boolean;
    reservations: boolean;
    promotions: boolean;
    reviews: boolean;
  };
  theme: 'light' | 'dark' | 'auto';
}

const defaultSettings: Settings = {
  notifications: {
    orders: true,
    reservations: true,
    promotions: false,
    reviews: true,
  },
  theme: 'auto',
};

export default function SettingsScreen() {
  const navigation = useNavigation();
  const colors = useColors();
  const { t, language, changeLanguage, languageOptions } = useI18n();
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [languageDialogVisible, setLanguageDialogVisible] = useState(false);
  const [themeDialogVisible, setThemeDialogVisible] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const savedSettings = await AsyncStorage.getItem('appSettings');
      if (savedSettings) {
        setSettings(JSON.parse(savedSettings));
      }
    } catch (error) {
      logger.error('Error loading settings:', error);
    }
  };

  const saveSettings = async (newSettings: Settings) => {
    try {
      await AsyncStorage.setItem('appSettings', JSON.stringify(newSettings));
      setSettings(newSettings);
    } catch (error) {
      logger.error('Error saving settings:', error);
      Alert.alert(t('common.error'), t('errors.generic'));
    }
  };

  const toggleNotification = (key: keyof Settings['notifications']) => {
    const newSettings = {
      ...settings,
      notifications: {
        ...settings.notifications,
        [key]: !settings.notifications[key],
      },
    };
    saveSettings(newSettings);
  };

  const updateLanguage = async (lang: SupportedLanguage) => {
    await changeLanguage(lang);
    setLanguageDialogVisible(false);
    Alert.alert(
      t('success.updated'),
      t('settings.language') + ' - ' + getLanguageLabel(lang)
    );
  };

  const updateTheme = (theme: 'light' | 'dark' | 'auto') => {
    saveSettings({ ...settings, theme });
    setThemeDialogVisible(false);
  };

  const handleLogout = () => {
    Alert.alert(
      t('auth.logout') || 'Sair da conta',
      t('auth.logoutConfirm') || 'Deseja encerrar sua sessão neste dispositivo?',
      [
        { text: t('common.cancel') || 'Cancelar', style: 'cancel' },
        {
          text: t('common.confirm') || 'Sair',
          style: 'destructive',
          onPress: () => {
            void authService.logout();
          },
        },
      ]
    );
  };

  const handleClearCache = () => {
    Alert.alert(
      t('settings.clearCache') || 'Limpar Cache',
      t('settings.clearCacheConfirm') || 'Deseja limpar o cache do aplicativo?',
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.clear'),
          style: 'destructive',
          onPress: async () => {
            try {
              await AsyncStorage.removeItem('cachedRestaurants');
              await AsyncStorage.removeItem('cachedOrders');
              Alert.alert(t('common.success'), t('success.deleted'));
            } catch (error) {
              Alert.alert(t('common.error'), t('errors.generic'));
            }
          },
        },
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      t('profile.deleteAccount'),
      t('profile.deleteAccountWarning'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              t('common.confirm'),
              t('profile.deleteAccountWarning'),
              [
                { text: t('common.cancel'), style: 'cancel' },
                {
                  text: t('common.confirm'),
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await ApiService.deleteAccount();
                      Alert.alert(
                        t('common.success'),
                        t('success.deleted')
                      );
                      await authService.logout();
                    } catch (error) {
                      Alert.alert(t('common.error'), t('errors.generic'));
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  const getLanguageLabel = (lang: string) => {
    const option = languageOptions.find((l) => l.code === lang);
    return option ? `${option.flag} ${option.name}` : lang;
  };

  const getThemeLabel = (theme: string) => {
    switch (theme) {
      case 'light':
        return t('settings.themeLight') || 'Claro';
      case 'dark':
        return t('settings.themeDark') || 'Escuro';
      case 'auto':
        return t('settings.themeAuto') || 'Automático';
      default:
        return t('settings.themeAuto') || 'Automático';
    }
  };

  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <ScreenContainer>
    <ScrollView style={styles.container} accessibilityLabel="Settings">
      <List.Section>
        <List.Subheader style={{ color: colors.foregroundMuted }}>{t('notifications.title')}</List.Subheader>
        <List.Item
          title={t('orders.title')}
          description={t('notifications.settings.orderUpdates') || 'Receba atualizações sobre seus pedidos'}
          titleStyle={{ color: colors.foreground }}
          descriptionStyle={{ color: colors.foregroundMuted }}
          left={(props) => <List.Icon {...props} icon="bell-outline" color={colors.foregroundMuted} />}
          right={() => (
            <Switch
              value={settings.notifications.orders}
              onValueChange={() => toggleNotification('orders')}
            />
          )}
        />
        <Divider />
        <List.Item
          title={t('reservations.title')}
          description={t('notifications.settings.reservationReminders') || 'Lembretes e confirmações de reservas'}
          titleStyle={{ color: colors.foreground }}
          descriptionStyle={{ color: colors.foregroundMuted }}
          left={(props) => <List.Icon {...props} icon="calendar" color={colors.foregroundMuted} />}
          right={() => (
            <Switch
              value={settings.notifications.reservations}
              onValueChange={() => toggleNotification('reservations')}
            />
          )}
        />
        <Divider />
        <List.Item
          title={t('notifications.promotion')}
          description={t('notifications.settings.promotions') || 'Ofertas especiais e descontos'}
          titleStyle={{ color: colors.foreground }}
          descriptionStyle={{ color: colors.foregroundMuted }}
          left={(props) => <List.Icon {...props} icon="tag" color={colors.foregroundMuted} />}
          right={() => (
            <Switch
              value={settings.notifications.promotions}
              onValueChange={() => toggleNotification('promotions')}
            />
          )}
        />
        <Divider />
        <List.Item
          title={t('reviews.title')}
          description={t('notifications.settings.reviewsResponses') || 'Pedidos para avaliar restaurantes'}
          titleStyle={{ color: colors.foreground }}
          descriptionStyle={{ color: colors.foregroundMuted }}
          left={(props) => <List.Icon {...props} icon="star" color={colors.foregroundMuted} />}
          right={() => (
            <Switch
              value={settings.notifications.reviews}
              onValueChange={() => toggleNotification('reviews')}
            />
          )}
        />
      </List.Section>

      <Divider style={styles.sectionDivider} />

      <List.Section>
        <List.Subheader style={{ color: colors.foregroundMuted }}>{t('settings.appearance') || 'Aparência'}</List.Subheader>
        <List.Item
          title={t('settings.theme')}
          description={getThemeLabel(settings.theme)}
          titleStyle={{ color: colors.foreground }}
          descriptionStyle={{ color: colors.foregroundMuted }}
          left={(props) => <List.Icon {...props} icon="palette" color={colors.foregroundMuted} />}
          right={(props) => <List.Icon {...props} icon="chevron-right" color={colors.foregroundMuted} />}
          onPress={() => setThemeDialogVisible(true)}
        />
        <Divider />
        <List.Item
          title={t('settings.language')}
          description={getLanguageLabel(language)}
          titleStyle={{ color: colors.foreground }}
          descriptionStyle={{ color: colors.foregroundMuted }}
          left={(props) => <List.Icon {...props} icon="translate" color={colors.foregroundMuted} />}
          right={(props) => <List.Icon {...props} icon="chevron-right" color={colors.foregroundMuted} />}
          onPress={() => setLanguageDialogVisible(true)}
        />
      </List.Section>

      <Divider style={styles.sectionDivider} />

      <List.Section>
        <List.Subheader style={{ color: colors.foregroundMuted }}>{t('profile.title')}</List.Subheader>
        <List.Item
          title={t('profile.preferences')}
          description={t('profile.dietaryRestrictions') + ' & ' + t('profile.favoriteCuisines')}
          titleStyle={{ color: colors.foreground }}
          descriptionStyle={{ color: colors.foregroundMuted }}
          left={(props) => <List.Icon {...props} icon="account-cog" color={colors.foregroundMuted} />}
          right={(props) => <List.Icon {...props} icon="chevron-right" color={colors.foregroundMuted} />}
          onPress={() => navigation.navigate('Onboarding' as never)}
        />
        <Divider />
        <List.Item
          title={t('settings.privacy')}
          description={t('settings.security')}
          titleStyle={{ color: colors.foreground }}
          descriptionStyle={{ color: colors.foregroundMuted }}
          left={(props) => <List.Icon {...props} icon="shield-account" color={colors.foregroundMuted} />}
          right={(props) => <List.Icon {...props} icon="chevron-right" color={colors.foregroundMuted} />}
          onPress={() => Linking.openURL('https://noowebr.com/privacidade')}
        />
        <Divider />
        <List.Item
          title={t('profile.paymentMethods')}
          description={t('payment.paymentMethod')}
          titleStyle={{ color: colors.foreground }}
          descriptionStyle={{ color: colors.foregroundMuted }}
          left={(props) => <List.Icon {...props} icon="credit-card" color={colors.foregroundMuted} />}
          right={(props) => <List.Icon {...props} icon="chevron-right" color={colors.foregroundMuted} />}
          onPress={() => navigation.navigate('Wallet' as never)}
        />
      </List.Section>

      <Divider style={styles.sectionDivider} />

      <List.Section>
        <List.Subheader style={{ color: colors.foregroundMuted }}>{t('navigation.help')}</List.Subheader>
        <List.Item
          title={t('settings.contactSupport')}
          description={t('settings.helpCenter') || 'Dúvidas frequentes e tutoriais'}
          titleStyle={{ color: colors.foreground }}
          descriptionStyle={{ color: colors.foregroundMuted }}
          left={(props) => <List.Icon {...props} icon="help-circle" color={colors.foregroundMuted} />}
          right={(props) => <List.Icon {...props} icon="chevron-right" color={colors.foregroundMuted} />}
          onPress={() => navigation.navigate('Support' as never)}
        />
        <Divider />
        <List.Item
          title={t('settings.termsOfService')}
          titleStyle={{ color: colors.foreground }}
          left={(props) => <List.Icon {...props} icon="file-document" color={colors.foregroundMuted} />}
          right={(props) => <List.Icon {...props} icon="chevron-right" color={colors.foregroundMuted} />}
          onPress={() => Linking.openURL('https://noowebr.com/termos')}
        />
        <Divider />
        <List.Item
          title={t('settings.privacyPolicy')}
          titleStyle={{ color: colors.foreground }}
          left={(props) => <List.Icon {...props} icon="shield-check" color={colors.foregroundMuted} />}
          right={(props) => <List.Icon {...props} icon="chevron-right" color={colors.foregroundMuted} />}
          onPress={() => Linking.openURL('https://noowebr.com/privacidade')}
        />
      </List.Section>

      <Divider style={styles.sectionDivider} />

      <List.Section>
        <List.Subheader style={{ color: colors.foregroundMuted }}>{t('settings.account') || 'Conta'}</List.Subheader>
        <List.Item
          title={t('settings.disconnect') || 'Sair da conta'}
          description={t('settings.disconnectDesc') || 'Encerrar sessão neste dispositivo'}
          titleStyle={{ color: colors.foreground }}
          descriptionStyle={{ color: colors.foregroundMuted }}
          left={(props) => <List.Icon {...props} icon="logout" color={colors.foregroundMuted} />}
          right={(props) => <List.Icon {...props} icon="chevron-right" color={colors.foregroundMuted} />}
          onPress={handleLogout}
          accessibilityRole="button"
          accessibilityLabel={t('settings.disconnect') || 'Sair da conta'}
        />
      </List.Section>

      <Divider style={styles.sectionDivider} />

      <List.Section>
        <List.Subheader style={{ color: colors.foregroundMuted }}>{t('settings.advanced') || 'Avançado'}</List.Subheader>
        <List.Item
          title={t('settings.clearCache') || 'Limpar Cache'}
          description={t('settings.clearCacheDesc') || 'Liberar espaço de armazenamento'}
          titleStyle={{ color: colors.foreground }}
          descriptionStyle={{ color: colors.foregroundMuted }}
          left={(props) => <List.Icon {...props} icon="broom" color={colors.foregroundMuted} />}
          right={(props) => <List.Icon {...props} icon="chevron-right" color={colors.foregroundMuted} />}
          onPress={handleClearCache}
        />
        <Divider />
        <List.Item
          title={t('settings.version')}
          description="1.0.0 (Build 1)"
          titleStyle={{ color: colors.foreground }}
          descriptionStyle={{ color: colors.foregroundMuted }}
          left={(props) => <List.Icon {...props} icon="information" color={colors.foregroundMuted} />}
        />
      </List.Section>

      <View style={styles.dangerZone}>
        <Text variant="titleMedium" style={styles.dangerZoneTitle}>
          {t('settings.dangerZone') || 'Zona de Perigo'}
        </Text>
        <Button
          mode="outlined"
          textColor={colors.error}
          style={[styles.deleteButton, { borderColor: colors.error }]}
          onPress={handleDeleteAccount}
        >
          {t('profile.deleteAccount')}
        </Button>
      </View>

      <Portal>
        <Dialog
          visible={languageDialogVisible}
          onDismiss={() => setLanguageDialogVisible(false)}
          style={{ backgroundColor: colors.card }}
        >
          <Dialog.Title style={{ color: colors.foreground }}>{t('settings.selectLanguage') || 'Selecionar Idioma'}</Dialog.Title>
          <Dialog.Content>
            <RadioButton.Group
              onValueChange={(value) =>
                updateLanguage(value as SupportedLanguage)
              }
              value={language}
            >
              {languageOptions.map((option) => (
                <RadioButton.Item
                  key={option.code}
                  label={`${option.flag} ${option.name}`}
                  value={option.code}
                  labelStyle={{ color: colors.foreground }}
                />
              ))}
            </RadioButton.Group>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setLanguageDialogVisible(false)}>
              {t('common.cancel')}
            </Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog
          visible={themeDialogVisible}
          onDismiss={() => setThemeDialogVisible(false)}
          style={{ backgroundColor: colors.card }}
        >
          <Dialog.Title style={{ color: colors.foreground }}>{t('settings.selectTheme') || 'Selecionar Tema'}</Dialog.Title>
          <Dialog.Content>
            <RadioButton.Group
              onValueChange={(value) =>
                updateTheme(value as 'light' | 'dark' | 'auto')
              }
              value={settings.theme}
            >
              <RadioButton.Item label={t('settings.themeLight') || 'Claro'} value="light" labelStyle={{ color: colors.foreground }} />
              <RadioButton.Item label={t('settings.themeDark') || 'Escuro'} value="dark" labelStyle={{ color: colors.foreground }} />
              <RadioButton.Item label={t('settings.themeAuto') || 'Automático'} value="auto" labelStyle={{ color: colors.foreground }} />
            </RadioButton.Group>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setThemeDialogVisible(false)}>
              {t('common.cancel')}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </ScrollView>
  
    </ScreenContainer>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  sectionDivider: {
    height: 8,
    backgroundColor: colors.muted,
  },
  dangerZone: {
    padding: 20,
    marginTop: 20,
    marginBottom: 40,
  },
  dangerZoneTitle: {
    color: colors.error,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  deleteButton: {
    borderColor: colors.error,
  },
});
