/**
 * IntegrationSettingsScreen - Delivery Platform Connections
 *
 * Allows OWNER/MANAGER to configure connections to external delivery
 * platforms (iFood, Rappi, Uber Eats). Each platform card shows
 * connection status and opens a configuration modal on tap.
 *
 * @module restaurant/screens/integrations
 */

import React, { useState, useMemo, useCallback } from 'react';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import {
  View,
  ScrollView,
  StyleSheet,
  Alert,
  RefreshControl,
} from 'react-native';
import {
  Text,
  Card,
  Button,
  TextInput,
  Switch,
  Portal,
  Modal,
  IconButton,
} from 'react-native-paper';
import Slider from '@react-native-community/slider';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ApiService from '@/shared/services/api';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { useI18n } from '@/shared/hooks/useI18n';
import { useAuth } from '@/shared/hooks/useAuth';

// ============================================
// TYPES
// ============================================

interface PlatformConfig {
  key: string;
  name: string;
  icon: string;
  color: string;
}

interface ConnectionData {
  id?: string;
  platform: string;
  restaurant_id: string;
  credentials: {
    merchant_id?: string;
    client_id?: string;
    client_secret?: string;
  };
  auto_accept: boolean;
  max_concurrent_orders: number;
  high_load_threshold: number;
  is_active: boolean;
}

// ============================================
// CONSTANTS
// ============================================

const getPLATFORMS = (colors: any): PlatformConfig[] => ([
  { key: 'ifood', name: 'iFood', icon: 'food', color: colors.error },
  { key: 'rappi', name: 'Rappi', icon: 'moped', color: colors.primary },
  { key: 'ubereats', name: 'Uber Eats', icon: 'car', color: colors.success },
]);

// ============================================
// COMPONENT
// ============================================

export default function IntegrationSettingsScreen() {
  const { t } = useI18n();
  const colors = useColors();
  const PLATFORMS = getPLATFORMS(colors);
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const restaurantId = useMemo(() => {
    return user?.roles?.[0]?.restaurant_id ?? '';
  }, [user]);

  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [editingPlatform, setEditingPlatform] = useState<PlatformConfig | null>(null);
  const [formData, setFormData] = useState<ConnectionData>({
    platform: '',
    restaurant_id: '',
    credentials: {},
    auto_accept: true,
    max_concurrent_orders: 30,
    high_load_threshold: 20,
    is_active: true,
  });

  // ============================================
  // DATA FETCHING
  // ============================================

  const {
    data: connections = [],
    isLoading,
    refetch,
  } = useQuery<ConnectionData[]>({
    queryKey: ['platform-connections', restaurantId],
    queryFn: () => ApiService.getPlatformConnections(restaurantId),
    enabled: !!restaurantId,
  });

  const saveMutation = useMutation({
    mutationFn: async (data: ConnectionData) => {
      if (data.id) {
        return ApiService.updatePlatformConnection(data.id, data);
      }
      return ApiService.createPlatformConnection(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-connections', restaurantId] });
      setModalVisible(false);
      Alert.alert(t('common.success'), t('integrations.saved'));
    },
    onError: () => {
      Alert.alert(t('common.error'), t('integrations.connection_error'));
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: (id: string) => ApiService.deletePlatformConnection(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-connections', restaurantId] });
      setModalVisible(false);
      Alert.alert(t('common.success'), t('integrations.disconnected'));
    },
    onError: () => {
      Alert.alert(t('common.error'), t('integrations.connection_error'));
    },
  });

  // ============================================
  // HANDLERS
  // ============================================

  const getConnectionForPlatform = useCallback(
    (platformKey: string): ConnectionData | undefined => {
      return connections.find((c: ConnectionData) => c.platform === platformKey);
    },
    [connections],
  );

  const handleConfigure = useCallback(
    (platform: PlatformConfig) => {
      const existing = getConnectionForPlatform(platform.key);
      setEditingPlatform(platform);
      setFormData(
        existing
          ? { ...existing }
          : {
              platform: platform.key,
              restaurant_id: restaurantId,
              credentials: {},
              auto_accept: true,
              max_concurrent_orders: 30,
              high_load_threshold: 20,
              is_active: true,
            },
      );
      setModalVisible(true);
    },
    [getConnectionForPlatform, restaurantId],
  );

  const handleSave = useCallback(() => {
    saveMutation.mutate(formData);
  }, [formData, saveMutation]);

  const handleDisconnect = useCallback(() => {
    if (formData.id) {
      Alert.alert(t('integrations.disconnect'), t('common.confirm'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('integrations.disconnect'),
          style: 'destructive',
          onPress: () => disconnectMutation.mutate(formData.id!),
        },
      ]);
    }
  }, [formData, disconnectMutation, t]);

  // ============================================
  // STYLES
  // ============================================

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.backgroundSecondary,
        },
        header: {
          padding: 20,
          backgroundColor: colors.card,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        },
        headerTitle: {
          color: colors.foreground,
          fontWeight: 'bold',
        },
        scrollContent: {
          padding: 16,
          gap: 12,
        },
        platformCard: {
          backgroundColor: colors.card,
          elevation: 2,
        },
        cardHeader: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        },
        platformIcon: {
          width: 48,
          height: 48,
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
        },
        platformInfo: {
          flex: 1,
        },
        platformName: {
          fontWeight: 'bold',
          color: colors.foreground,
        },
        statusRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          marginTop: 4,
        },
        statusDot: {
          width: 8,
          height: 8,
          borderRadius: 4,
        },
        statusText: {
          fontSize: 14,
        },
        configureButton: {
          marginTop: 12,
        },
        // Modal
        modalContainer: {
          backgroundColor: colors.card,
          margin: 20,
          borderRadius: 16,
          maxHeight: '85%',
        },
        modalHeader: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 16,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        },
        modalTitle: {
          fontWeight: 'bold',
          color: colors.foreground,
        },
        modalBody: {
          padding: 16,
        },
        inputGroup: {
          marginBottom: 16,
        },
        input: {
          backgroundColor: colors.backgroundSecondary,
        },
        switchRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingVertical: 12,
        },
        switchLabel: {
          flex: 1,
          color: colors.foreground,
        },
        sliderRow: {
          marginBottom: 16,
        },
        sliderLabel: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          marginBottom: 8,
        },
        sliderLabelText: {
          color: colors.foreground,
        },
        sliderValue: {
          fontWeight: 'bold',
          color: colors.primary,
        },
        modalActions: {
          flexDirection: 'row',
          gap: 12,
          padding: 16,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        },
        saveButton: {
          flex: 1,
        },
        disconnectButton: {
          flex: 1,
        },
        emptyContainer: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: 80,
        },
        emptyText: {
          color: colors.foregroundSecondary,
          marginTop: 16,
        },
      }),
    [colors],
  );

  // ============================================
  // RENDER
  // ============================================

  const renderPlatformCard = (platform: PlatformConfig) => {
    const connection = getConnectionForPlatform(platform.key);
    const isConnected = connection?.is_active === true;

    return (
      <Card key={platform.key} style={styles.platformCard}>
        <Card.Content>
          <View style={styles.cardHeader}>
            <View style={[styles.platformIcon, { backgroundColor: platform.color + '20' }]}>
              <Icon name={platform.icon} size={24} color={platform.color} />
            </View>
            <View style={styles.platformInfo}>
              <Text variant="titleMedium" style={styles.platformName}>
                {platform.name}
              </Text>
              <View style={styles.statusRow}>
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: isConnected ? colors.success : colors.foregroundMuted },
                  ]}
                />
                <Text
                  variant="bodySmall"
                  style={[
                    styles.statusText,
                    { color: isConnected ? colors.success : colors.foregroundMuted },
                  ]}
                >
                  {isConnected
                    ? t('integrations.status_connected')
                    : t('integrations.status_disconnected')}
                </Text>
              </View>
            </View>
          </View>
          <Button
            mode="outlined"
            onPress={() => handleConfigure(platform)}
            style={styles.configureButton}
            icon="cog"
          >
            {t('integrations.configure')}
          </Button>
        </Card.Content>
      </Card>
    );
  };

  return (
    <ScreenContainer hasKeyboard>
    <View style={styles.container}>
      <View style={styles.header}>
        <Text variant="headlineMedium" style={styles.headerTitle}>
          {t('integrations.title')}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={() => refetch()} tintColor={colors.primary} />
        }
      >
        {PLATFORMS.map(renderPlatformCard)}
      </ScrollView>

      {/* Configuration Modal */}
      <Portal>
        <Modal
          visible={modalVisible}
          onDismiss={() => setModalVisible(false)}
          contentContainerStyle={styles.modalContainer}
        >
          <View>
            <View style={styles.modalHeader}>
              <Text variant="titleLarge" style={styles.modalTitle}>
                {editingPlatform?.name}
              </Text>
              <IconButton icon="close" onPress={() => setModalVisible(false)} accessibilityLabel="Close" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} />
            </View>

            <ScrollView style={styles.modalBody}>
              {/* Credentials */}
              <View style={styles.inputGroup}>
                <TextInput
                  label={t('integrations.merchant_id')}
                  value={formData.credentials?.merchant_id || ''}
                  onChangeText={(text) =>
                    setFormData((prev) => ({
                      ...prev,
                      credentials: { ...prev.credentials, merchant_id: text },
                    }))
                  }
                  mode="outlined"
                  style={styles.input}
                />
              </View>

              <View style={styles.inputGroup}>
                <TextInput
                  label={t('integrations.client_id')}
                  value={formData.credentials?.client_id || ''}
                  onChangeText={(text) =>
                    setFormData((prev) => ({
                      ...prev,
                      credentials: { ...prev.credentials, client_id: text },
                    }))
                  }
                  mode="outlined"
                  style={styles.input}
                />
              </View>

              <View style={styles.inputGroup}>
                <TextInput
                  label={t('integrations.client_secret')}
                  value={formData.credentials?.client_secret || ''}
                  onChangeText={(text) =>
                    setFormData((prev) => ({
                      ...prev,
                      credentials: { ...prev.credentials, client_secret: text },
                    }))
                  }
                  mode="outlined"
                  secureTextEntry
                  style={styles.input}
                />
              </View>

              {/* Auto-accept toggle */}
              <View style={styles.switchRow}>
                <Text variant="bodyLarge" style={styles.switchLabel}>
                  {t('integrations.auto_accept')}
                </Text>
                <Switch
                  value={formData.auto_accept}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, auto_accept: value }))
                  }
                  color={colors.primary}
                />
              </View>

              {/* Max concurrent orders slider */}
              <View style={styles.sliderRow}>
                <View style={styles.sliderLabel}>
                  <Text variant="bodyMedium" style={styles.sliderLabelText}>
                    {t('integrations.max_concurrent')}
                  </Text>
                  <Text variant="bodyMedium" style={styles.sliderValue}>
                    {formData.max_concurrent_orders}
                  </Text>
                </View>
                <Slider
                  minimumValue={5}
                  maximumValue={100}
                  step={5}
                  value={formData.max_concurrent_orders}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, max_concurrent_orders: value }))
                  }
                  minimumTrackTintColor={colors.primary}
                  maximumTrackTintColor={colors.border}
                  thumbTintColor={colors.primary}
                />
              </View>

              {/* High load threshold slider */}
              <View style={styles.sliderRow}>
                <View style={styles.sliderLabel}>
                  <Text variant="bodyMedium" style={styles.sliderLabelText}>
                    {t('integrations.high_load')}
                  </Text>
                  <Text variant="bodyMedium" style={styles.sliderValue}>
                    {formData.high_load_threshold}
                  </Text>
                </View>
                <Slider
                  minimumValue={5}
                  maximumValue={50}
                  step={5}
                  value={formData.high_load_threshold}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, high_load_threshold: value }))
                  }
                  minimumTrackTintColor={colors.primary}
                  maximumTrackTintColor={colors.border}
                  thumbTintColor={colors.primary}
                />
              </View>
            </ScrollView>

            {/* Action Buttons */}
            <View style={styles.modalActions}>
              {formData.id && (
                <Button
                  mode="outlined"
                  onPress={handleDisconnect}
                  style={styles.disconnectButton}
                  textColor={colors.error}
                  loading={disconnectMutation.isPending}
                  icon="link-off"
                >
                  {t('integrations.disconnect')}
                </Button>
              )}
              <Button
                mode="contained"
                onPress={handleSave}
                style={styles.saveButton}
                loading={saveMutation.isPending}
                icon="content-save"
              >
                {t('integrations.save')}
              </Button>
            </View>
          </View>
        </Modal>
      </Portal>
    </View>
    </ScreenContainer>
  );
}
