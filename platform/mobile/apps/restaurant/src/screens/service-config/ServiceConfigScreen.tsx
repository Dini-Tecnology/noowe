/**
 * ServiceConfigScreen
 * 
 * Configuration screen for restaurant service settings.
 * Allows management of service charges, tips, reservations,
 * orders, and notification preferences.
 * 
 * Migrated to semantic tokens using useColors() + useMemo pattern.
 * 
 * @module screens/service-config
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, ScrollView, StyleSheet, Alert, Switch, ActivityIndicator } from 'react-native';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import {
  Text,
  Card,
  Button,
  TextInput,
  Chip,
  Divider,
  List,
  SegmentedButtons,
  RadioButton,
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import ApiService from '@/shared/services/api';
import { useI18n } from '@/shared/hooks/useI18n';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { useRestaurant } from '@/shared/contexts/RestaurantContext';

interface ServiceConfig {
  serviceCharge: {
    enabled: boolean;
    percentage: number;
    type: 'optional' | 'mandatory';
  };
  tips: {
    enabled: boolean;
    defaultPercentages: number[];
    allowCustom: boolean;
    distribution: 'equal' | 'weighted' | 'manual';
  };
  reservations: {
    enabled: boolean;
    advanceBookingDays: number;
    minPartySize: number;
    maxPartySize: number;
    requireDeposit: boolean;
    depositAmount: number;
    cancellationHours: number;
  };
  orders: {
    enableTableOrdering: boolean;
    enableDelivery: boolean;
    enablePickup: boolean;
    preparationTime: number;
    autoAcceptOrders: boolean;
  };
  notifications: {
    newOrder: boolean;
    newReservation: boolean;
    cancelledReservation: boolean;
    payment: boolean;
    review: boolean;
  };
}

const defaultConfig: ServiceConfig = {
  serviceCharge: {
    enabled: true,
    percentage: 10,
    type: 'optional',
  },
  tips: {
    enabled: true,
    defaultPercentages: [10, 15, 20],
    allowCustom: true,
    distribution: 'equal',
  },
  reservations: {
    enabled: true,
    advanceBookingDays: 30,
    minPartySize: 1,
    maxPartySize: 20,
    requireDeposit: false,
    depositAmount: 50,
    cancellationHours: 2,
  },
  orders: {
    enableTableOrdering: true,
    enableDelivery: false,
    enablePickup: true,
    preparationTime: 30,
    autoAcceptOrders: false,
  },
  notifications: {
    newOrder: true,
    newReservation: true,
    cancelledReservation: true,
    payment: true,
    review: false,
  },
};

export default function ServiceConfigScreen() {
  const { t } = useI18n();
  const colors = useColors();
  
  // Get restaurant ID from context instead of hardcoded value
  const { restaurantId, isLoading: contextLoading } = useRestaurant();
  
  const [config, setConfig] = useState<ServiceConfig>(defaultConfig);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Memoized styles based on theme colors
  const styles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.backgroundSecondary,
    },
    scrollContent: {
      padding: 16,
      paddingBottom: 100,
    },
    section: {
      marginBottom: 15,
      elevation: 2,
      backgroundColor: colors.card,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 15,
      gap: 10,
    },
    sectionTitle: {
      fontWeight: 'bold',
      color: colors.foreground,
    },
    input: {
      marginBottom: 15,
      backgroundColor: colors.background,
    },
    inputRow: {
      flexDirection: 'row',
      gap: 10,
    },
    halfInput: {
      flex: 1,
    },
    label: {
      marginTop: 10,
      marginBottom: 10,
      color: colors.mutedForeground,
    },
    radioLabel: {
      marginTop: 15,
      marginBottom: 10,
      color: colors.mutedForeground,
    },
    chipsContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 15,
    },
    chip: {
      backgroundColor: colors.backgroundSecondary,
    },
    divider: {
      marginVertical: 15,
    },
    footer: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      padding: 16,
      backgroundColor: colors.card,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      elevation: 8,
    },
    saveButton: {
      backgroundColor: colors.success,
    },
    saveButtonContent: {
      paddingVertical: 8,
    },
  }), [colors]);

  // Load config when restaurant ID is available
  useEffect(() => {
    if (restaurantId) {
      loadConfig();
    }
  }, [restaurantId]);

  const loadConfig = async () => {
    try {
      const response = await ApiService.getServiceConfig(restaurantId!);
      if (response.service_config) {
        setConfig(response.service_config);
      }
    } catch (error) {
      console.error('Error loading config:', error);
      Alert.alert(t('common.error'), t('serviceConfig.configLoadError'));
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    try {
      setSaving(true);
      await ApiService.updateServiceConfig(restaurantId!, config as any);
      Alert.alert(t('common.success'), t('serviceConfig.configSaved'));
    } catch (error) {
      console.error('Error saving config:', error);
      Alert.alert(t('common.error'), t('serviceConfig.configSaveError'));
    } finally {
      setSaving(false);
    }
  };

  const updateServiceCharge = (key: string, value: any) => {
    setConfig({
      ...config,
      serviceCharge: { ...config.serviceCharge, [key]: value },
    });
  };

  const updateTips = (key: string, value: any) => {
    setConfig({
      ...config,
      tips: { ...config.tips, [key]: value },
    });
  };

  const updateReservations = (key: string, value: any) => {
    setConfig({
      ...config,
      reservations: { ...config.reservations, [key]: value },
    });
  };

  const updateOrders = (key: string, value: any) => {
    setConfig({
      ...config,
      orders: { ...config.orders, [key]: value },
    });
  };

  const updateNotifications = (key: string, value: any) => {
    setConfig({
      ...config,
      notifications: { ...config.notifications, [key]: value },
    });
  };

  return (
    <ScreenContainer hasKeyboard>
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Service Charge Section */}
        <Card style={styles.section}>
          <Card.Content>
            <View style={styles.sectionHeader}>
              <Icon name="percent" size={24} color={colors.primary} />
              <Text variant="titleLarge" style={styles.sectionTitle}>
                {t('serviceConfig.serviceCharge')}
              </Text>
            </View>

            <List.Item
              title={t('serviceConfig.enableServiceCharge')}
              description={t('serviceConfig.serviceChargeDesc')}
              left={() => <List.Icon icon="toggle-switch" />}
              right={() => (
                <Switch
                  value={config.serviceCharge.enabled}
                  onValueChange={(value) => updateServiceCharge('enabled', value)}
                />
              )}
            />

            {config.serviceCharge.enabled && (
              <>
                <TextInput
                  label={t('serviceConfig.chargePercentage')}
                  value={config.serviceCharge.percentage.toString()}
                  onChangeText={(text) =>
                    updateServiceCharge('percentage', parseFloat(text) || 0)
                  }
                  keyboardType="numeric"
                  right={<TextInput.Affix text="%" />}
                  style={styles.input}
                  mode="outlined"
                />

                <Text variant="labelLarge" style={styles.radioLabel}>
                  {t('serviceConfig.chargeType')}
                </Text>
                <RadioButton.Group
                  onValueChange={(value) => updateServiceCharge('type', value)}
                  value={config.serviceCharge.type}
                >
                  <RadioButton.Item label={t('serviceConfig.chargeOptional')} value="optional" />
                  <RadioButton.Item label={t('serviceConfig.chargeMandatory')} value="mandatory" />
                </RadioButton.Group>
              </>
            )}
          </Card.Content>
        </Card>

        {/* Tips Section */}
        <Card style={styles.section}>
          <Card.Content>
            <View style={styles.sectionHeader}>
              <Icon name="cash-multiple" size={24} color={colors.success} />
              <Text variant="titleLarge" style={styles.sectionTitle}>
                {t('tips.title')}
              </Text>
            </View>

            <List.Item
              title={t('serviceConfig.acceptTips')}
              description={t('serviceConfig.acceptTipsDesc')}
              left={() => <List.Icon icon="toggle-switch" />}
              right={() => (
                <Switch
                  value={config.tips.enabled}
                  onValueChange={(value) => updateTips('enabled', value)}
                />
              )}
            />

            {config.tips.enabled && (
              <>
                <Text variant="labelLarge" style={styles.label}>
                  {t('tips.suggestedPercentages')}
                </Text>
                <View style={styles.chipsContainer}>
                  {config.tips.defaultPercentages.map((percentage, index) => (
                    <Chip key={index} style={styles.chip}>
                      {percentage}%
                    </Chip>
                  ))}
                  <Chip
                    icon="pencil"
                    onPress={() =>
                      Alert.alert(t('common.comingSoon'), t('common.featureInDevelopment'))
                    }
                    accessibilityRole="button"
                    accessibilityLabel={t('common.edit')}
                  >
                    {t('common.edit')}
                  </Chip>
                </View>

                <List.Item
                  title={t('serviceConfig.allowCustomValue')}
                  description={t('serviceConfig.allowCustomValueDesc')}
                  left={() => <List.Icon icon="pencil" />}
                  right={() => (
                    <Switch
                      value={config.tips.allowCustom}
                      onValueChange={(value) => updateTips('allowCustom', value)}
                    />
                  )}
                />

                <Divider style={styles.divider} />

                <Text variant="labelLarge" style={styles.radioLabel}>
                  {t('serviceConfig.tipsDistribution')}
                </Text>
                <RadioButton.Group
                  onValueChange={(value) => updateTips('distribution', value)}
                  value={config.tips.distribution}
                >
                  <RadioButton.Item
                    label={t('serviceConfig.equalForAll')}
                    value="equal"
                    labelVariant="bodyMedium"
                  />
                  <RadioButton.Item
                    label={t('serviceConfig.byWeight')}
                    value="weighted"
                    labelVariant="bodyMedium"
                  />
                  <RadioButton.Item
                    label={t('serviceConfig.manualDistribution')}
                    value="manual"
                    labelVariant="bodyMedium"
                  />
                </RadioButton.Group>
              </>
            )}
          </Card.Content>
        </Card>

        {/* Reservations Section */}
        <Card style={styles.section}>
          <Card.Content>
            <View style={styles.sectionHeader}>
              <Icon name="calendar-check" size={24} color={colors.info} />
              <Text variant="titleLarge" style={styles.sectionTitle}>
                {t('reservations.title')}
              </Text>
            </View>

            <List.Item
              title={t('serviceConfig.acceptReservations')}
              description={t('serviceConfig.acceptReservationsDesc')}
              left={() => <List.Icon icon="toggle-switch" />}
              right={() => (
                <Switch
                  value={config.reservations.enabled}
                  onValueChange={(value) => updateReservations('enabled', value)}
                />
              )}
            />

            {config.reservations.enabled && (
              <>
                <TextInput
                  label={t('serviceConfig.advanceBookingDays')}
                  value={config.reservations.advanceBookingDays.toString()}
                  onChangeText={(text) =>
                    updateReservations('advanceBookingDays', parseInt(text) || 0)
                  }
                  keyboardType="numeric"
                  style={styles.input}
                  mode="outlined"
                />

                <View style={styles.inputRow}>
                  <TextInput
                    label={t('serviceConfig.minPartySize')}
                    value={config.reservations.minPartySize.toString()}
                    onChangeText={(text) =>
                      updateReservations('minPartySize', parseInt(text) || 1)
                    }
                    keyboardType="numeric"
                    style={[styles.input, styles.halfInput]}
                    mode="outlined"
                  />

                  <TextInput
                    label={t('serviceConfig.maxPartySize')}
                    value={config.reservations.maxPartySize.toString()}
                    onChangeText={(text) =>
                      updateReservations('maxPartySize', parseInt(text) || 1)
                    }
                    keyboardType="numeric"
                    style={[styles.input, styles.halfInput]}
                    mode="outlined"
                  />
                </View>

                <TextInput
                  label={t('serviceConfig.cancellationHours')}
                  value={config.reservations.cancellationHours.toString()}
                  onChangeText={(text) =>
                    updateReservations('cancellationHours', parseInt(text) || 0)
                  }
                  keyboardType="numeric"
                  style={styles.input}
                  mode="outlined"
                />

                <List.Item
                  title={t('serviceConfig.requireDeposit')}
                  description={t('serviceConfig.requireDepositDesc')}
                  left={() => <List.Icon icon="cash-lock" />}
                  right={() => (
                    <Switch
                      value={config.reservations.requireDeposit}
                      onValueChange={(value) => updateReservations('requireDeposit', value)}
                    />
                  )}
                />

                {config.reservations.requireDeposit && (
                  <TextInput
                    label={t('serviceConfig.depositAmount')}
                    value={config.reservations.depositAmount.toString()}
                    onChangeText={(text) =>
                      updateReservations('depositAmount', parseFloat(text) || 0)
                    }
                    keyboardType="numeric"
                    left={<TextInput.Affix text="R$" />}
                    style={styles.input}
                    mode="outlined"
                  />
                )}
              </>
            )}
          </Card.Content>
        </Card>

        {/* Orders Section */}
        <Card style={styles.section}>
          <Card.Content>
            <View style={styles.sectionHeader}>
              <Icon name="receipt" size={24} color={colors.warning} />
              <Text variant="titleLarge" style={styles.sectionTitle}>
                {t('orders.title')}
              </Text>
            </View>

            <List.Item
              title={t('serviceConfig.tableOrdering')}
              description={t('serviceConfig.tableOrderingDesc')}
              left={() => <List.Icon icon="qrcode" />}
              right={() => (
                <Switch
                  value={config.orders.enableTableOrdering}
                  onValueChange={(value) => updateOrders('enableTableOrdering', value)}
                />
              )}
            />

            <List.Item
              title={t('serviceConfig.enableDelivery')}
              description={t('serviceConfig.enableDeliveryDesc')}
              left={() => <List.Icon icon="bike-fast" />}
              right={() => (
                <Switch
                  value={config.orders.enableDelivery}
                  onValueChange={(value) => updateOrders('enableDelivery', value)}
                />
              )}
            />

            <List.Item
              title={t('serviceConfig.enablePickup')}
              description={t('serviceConfig.enablePickupDesc')}
              left={() => <List.Icon icon="store" />}
              right={() => (
                <Switch
                  value={config.orders.enablePickup}
                  onValueChange={(value) => updateOrders('enablePickup', value)}
                />
              )}
            />

            <TextInput
              label={t('serviceConfig.preparationTimeEst')}
              value={config.orders.preparationTime.toString()}
              onChangeText={(text) =>
                updateOrders('preparationTime', parseInt(text) || 0)
              }
              keyboardType="numeric"
              style={styles.input}
              mode="outlined"
            />

            <List.Item
              title={t('serviceConfig.autoAcceptOrders')}
              description={t('serviceConfig.autoAcceptOrdersDesc')}
              left={() => <List.Icon icon="check-circle-outline" />}
              right={() => (
                <Switch
                  value={config.orders.autoAcceptOrders}
                  onValueChange={(value) => updateOrders('autoAcceptOrders', value)}
                />
              )}
            />
          </Card.Content>
        </Card>

        {/* Notifications Section */}
        <Card style={styles.section}>
          <Card.Content>
            <View style={styles.sectionHeader}>
              <Icon name="bell" size={24} color={colors.secondary} />
              <Text variant="titleLarge" style={styles.sectionTitle}>
                {t('notifications.title')}
              </Text>
            </View>

            <List.Item
              title={t('serviceConfig.notificationNewOrder')}
              left={() => <List.Icon icon="receipt" />}
              right={() => (
                <Switch
                  value={config.notifications.newOrder}
                  onValueChange={(value) => updateNotifications('newOrder', value)}
                />
              )}
            />

            <List.Item
              title={t('serviceConfig.notificationNewReservation')}
              left={() => <List.Icon icon="calendar-plus" />}
              right={() => (
                <Switch
                  value={config.notifications.newReservation}
                  onValueChange={(value) => updateNotifications('newReservation', value)}
                />
              )}
            />

            <List.Item
              title={t('serviceConfig.notificationCancelledReservation')}
              left={() => <List.Icon icon="calendar-remove" />}
              right={() => (
                <Switch
                  value={config.notifications.cancelledReservation}
                  onValueChange={(value) =>
                    updateNotifications('cancelledReservation', value)
                  }
                />
              )}
            />

            <List.Item
              title={t('serviceConfig.notificationPayment')}
              left={() => <List.Icon icon="cash-check" />}
              right={() => (
                <Switch
                  value={config.notifications.payment}
                  onValueChange={(value) => updateNotifications('payment', value)}
                />
              )}
            />

            <List.Item
              title={t('serviceConfig.notificationReview')}
              left={() => <List.Icon icon="star" />}
              right={() => (
                <Switch
                  value={config.notifications.review}
                  onValueChange={(value) => updateNotifications('review', value)}
                />
              )}
            />
          </Card.Content>
        </Card>
      </ScrollView>

      {/* Save Button */}
      <View style={styles.footer}>
        <Button
          mode="contained"
          onPress={saveConfig}
          loading={saving}
          disabled={saving}
          style={styles.saveButton}
          contentStyle={styles.saveButtonContent}
          icon="content-save"
          accessibilityRole="button"
          accessibilityLabel={t('serviceConfig.saveConfig')}
        >
          {t('serviceConfig.saveConfig')}
        </Button>
      </View>
    </View>
    </ScreenContainer>
  );
}
