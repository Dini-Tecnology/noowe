/**
 * StationSettingsScreen — Kitchen Station Configuration
 *
 * Allows OWNER/MANAGER to configure kitchen stations used by KDS Brain.
 * Supports creating, editing, and deactivating stations.
 *
 * Features:
 * - List of configured stations with emoji, name, type, late threshold
 * - FAB to create new stations
 * - Edit modal with form fields
 * - Deactivate/activate toggle per station
 * - Full i18n + theme support
 *
 * @module kds-settings/StationSettingsScreen
 */

import React, { useState, useMemo, useCallback } from 'react';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  Alert,
} from 'react-native';
import {
  Text,
  Card,
  TextInput,
  Button,
  FAB,
  Modal,
  Portal,
  SegmentedButtons,
  IconButton,
  Chip,
} from 'react-native-paper';
import Slider from '@react-native-community/slider';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ApiService from '@/shared/services/api';
import { useI18n } from '@/shared/hooks/useI18n';
import { useAuth } from '@/shared/hooks/useAuth';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';

// ============================================
// TYPES
// ============================================

interface KdsStation {
  id: string;
  name: string;
  type: 'kitchen' | 'bar';
  emoji: string;
  late_threshold_minutes: number;
  is_active: boolean;
  restaurant_id: string;
}

interface StationFormData {
  name: string;
  type: 'kitchen' | 'bar';
  emoji: string;
  late_threshold_minutes: number;
}

const DEFAULT_FORM: StationFormData = {
  name: '',
  type: 'kitchen',
  emoji: '\uD83D\uDD25',
  late_threshold_minutes: 15,
};

// ============================================
// COMPONENT
// ============================================

export default function StationSettingsScreen() {
  const { t } = useI18n();
  const colors = useColors();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const restaurantId = useMemo(() => {
    return user?.roles?.[0]?.restaurant_id ?? '';
  }, [user]);

  // State
  const [modalVisible, setModalVisible] = useState(false);
  const [editingStation, setEditingStation] = useState<KdsStation | null>(null);
  const [form, setForm] = useState<StationFormData>(DEFAULT_FORM);

  // ============================================
  // QUERIES
  // ============================================

  const {
    data: stations = [],
    isLoading,
    refetch,
    isRefetching,
  } = useQuery<KdsStation[]>({
    queryKey: ['kds-stations', restaurantId],
    queryFn: () => ApiService.getStations(restaurantId),
    enabled: !!restaurantId,
  });

  // ============================================
  // MUTATIONS
  // ============================================

  const createMutation = useMutation({
    mutationFn: (data: StationFormData) =>
      ApiService.createStation({ ...data, restaurant_id: restaurantId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kds-stations', restaurantId] });
      closeModal();
    },
    onError: () => {
      Alert.alert(t('common.error'), t('errors.generic'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<StationFormData> }) =>
      ApiService.updateStation(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kds-stations', restaurantId] });
      closeModal();
    },
    onError: () => {
      Alert.alert(t('common.error'), t('errors.generic'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => ApiService.deleteStation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kds-stations', restaurantId] });
    },
    onError: () => {
      Alert.alert(t('common.error'), t('errors.generic'));
    },
  });

  // ============================================
  // HANDLERS
  // ============================================

  const openCreateModal = useCallback(() => {
    setEditingStation(null);
    setForm(DEFAULT_FORM);
    setModalVisible(true);
  }, []);

  const openEditModal = useCallback((station: KdsStation) => {
    setEditingStation(station);
    setForm({
      name: station.name,
      type: station.type,
      emoji: station.emoji,
      late_threshold_minutes: station.late_threshold_minutes,
    });
    setModalVisible(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalVisible(false);
    setEditingStation(null);
    setForm(DEFAULT_FORM);
  }, []);

  const handleSave = useCallback(() => {
    if (!form.name.trim()) return;

    if (editingStation) {
      updateMutation.mutate({ id: editingStation.id, data: form });
    } else {
      createMutation.mutate(form);
    }
  }, [form, editingStation, createMutation, updateMutation]);

  const handleToggleActive = useCallback(
    (station: KdsStation) => {
      updateMutation.mutate({
        id: station.id,
        data: { ...station, is_active: !station.is_active } as any,
      });
    },
    [updateMutation],
  );

  const handleDelete = useCallback(
    (station: KdsStation) => {
      Alert.alert(
        t('common.confirm'),
        t('common.confirmDelete'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('common.delete'),
            style: 'destructive',
            onPress: () => deleteMutation.mutate(station.id),
          },
        ],
      );
    },
    [t, deleteMutation],
  );

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
          padding: 16,
          backgroundColor: colors.card,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        },
        headerTitle: {
          fontSize: 24,
          fontWeight: 'bold',
          color: colors.foreground,
        },
        headerSubtitle: {
          fontSize: 14,
          color: colors.foregroundMuted,
          marginTop: 4,
        },
        listContent: {
          padding: 12,
          paddingBottom: 80,
        },
        stationCard: {
          marginBottom: 12,
          backgroundColor: colors.card,
          borderRadius: 16,
          elevation: 2,
        },
        inactiveCard: {
          opacity: 0.5,
        },
        cardHeader: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        },
        cardLeft: {
          flexDirection: 'row',
          alignItems: 'center',
          flex: 1,
          gap: 12,
        },
        emojiCircle: {
          width: 48,
          height: 48,
          borderRadius: 24,
          backgroundColor: colors.backgroundTertiary,
          alignItems: 'center',
          justifyContent: 'center',
        },
        emojiText: {
          fontSize: 24,
        },
        stationName: {
          fontSize: 18,
          fontWeight: '600',
          color: colors.foreground,
        },
        stationMeta: {
          fontSize: 14,
          color: colors.foregroundMuted,
          marginTop: 2,
        },
        cardActions: {
          flexDirection: 'row',
          alignItems: 'center',
        },
        chipRow: {
          flexDirection: 'row',
          gap: 8,
          marginTop: 12,
        },
        fab: {
          position: 'absolute',
          right: 16,
          bottom: 16,
          backgroundColor: colors.primary,
        },
        // Modal styles
        modalContainer: {
          backgroundColor: colors.card,
          margin: 20,
          borderRadius: 16,
          padding: 24,
        },
        modalTitle: {
          fontSize: 20,
          fontWeight: 'bold',
          color: colors.foreground,
          marginBottom: 20,
        },
        formField: {
          marginBottom: 16,
        },
        sliderRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 4,
        },
        sliderLabel: {
          fontSize: 14,
          color: colors.foreground,
        },
        sliderValue: {
          fontSize: 14,
          fontWeight: 'bold',
          color: colors.primary,
        },
        modalActions: {
          flexDirection: 'row',
          justifyContent: 'flex-end',
          gap: 12,
          marginTop: 16,
        },
        // Empty state
        emptyContainer: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: 64,
        },
        emptyTitle: {
          color: colors.foreground,
          marginTop: 16,
          fontWeight: '600',
          fontSize: 18,
        },
        emptySubtitle: {
          color: colors.foregroundMuted,
          marginTop: 8,
          textAlign: 'center',
          paddingHorizontal: 32,
          fontSize: 14,
        },
      }),
    [colors],
  );

  // ============================================
  // RENDERERS
  // ============================================

  const renderStationCard = useCallback(
    ({ item }: { item: KdsStation }) => (
      <Card style={[styles.stationCard, !item.is_active && styles.inactiveCard]}>
        <Card.Content>
          <View style={styles.cardHeader}>
            <View style={styles.cardLeft}>
              <View style={styles.emojiCircle}>
                <Text style={styles.emojiText}>{item.emoji}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.stationName}>{item.name}</Text>
                <Text style={styles.stationMeta}>
                  {item.type === 'kitchen' ? t('kds.screen_title') : t('kds.bar_title')} — {t('kds.settings.late_threshold')}: {item.late_threshold_minutes} min
                </Text>
              </View>
            </View>
            <View style={styles.cardActions}>
              <IconButton
                icon="pencil"
                size={20}
                iconColor={colors.primary}
                onPress={() => openEditModal(item)}
                accessibilityLabel={`Edit ${item.name}`}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              />
              <IconButton
                icon={item.is_active ? 'eye-off' : 'eye'}
                size={20}
                iconColor={item.is_active ? colors.warning : colors.success}
                onPress={() => handleToggleActive(item)}
                accessibilityLabel={item.is_active ? `Deactivate ${item.name}` : `Activate ${item.name}`}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              />
            </View>
          </View>
          <View style={styles.chipRow}>
            <Chip
              icon={item.type === 'kitchen' ? 'chef-hat' : 'glass-cocktail'}
              compact
            >
              {item.type === 'kitchen' ? t('kds.screen_title') : t('kds.bar_title')}
            </Chip>
            {!item.is_active && (
              <Chip icon="eye-off" compact textStyle={{ color: colors.error }}>
                {t('kds.settings.deactivate')}
              </Chip>
            )}
          </View>
        </Card.Content>
      </Card>
    ),
    [styles, colors, t, openEditModal, handleToggleActive],
  );

  // ============================================
  // RENDER
  // ============================================

  return (
    <ScreenContainer hasKeyboard>
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('kds.settings.title')}</Text>
        <Text style={styles.headerSubtitle}>
          {stations.length} {stations.length === 1 ? 'station' : 'stations'}
        </Text>
      </View>

      {/* Station List */}
      <FlatList
        data={stations}
        keyExtractor={(item) => item.id}
        renderItem={renderStationCard}
        contentContainerStyle={styles.listContent}
        getItemLayout={(_, index) => ({
          length: 120,
          offset: 120 * index,
          index,
        })}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => refetch()}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.emptyContainer}>
              <Icon name="stove" size={64} color={colors.foregroundMuted} />
              <Text style={styles.emptyTitle}>{t('kds.empty_state.station')}</Text>
              <Text style={styles.emptySubtitle}>
                {t('kds.settings.add_station')}
              </Text>
            </View>
          ) : null
        }
      />

      {/* FAB */}
      <FAB
        icon="plus"
        style={styles.fab}
        color={colors.primaryForeground}
        onPress={openCreateModal}
        label={t('kds.settings.add_station')}
        testID="add-station-fab"
      />

      {/* Create/Edit Modal */}
      <Portal>
        <Modal
          visible={modalVisible}
          onDismiss={closeModal}
          contentContainerStyle={styles.modalContainer}
        >
          <Text style={styles.modalTitle}>
            {editingStation ? t('kds.settings.edit_station') : t('kds.settings.add_station')}
          </Text>

          {/* Name */}
          <TextInput
            label={t('kds.settings.station_name')}
            value={form.name}
            onChangeText={(text) => setForm((prev) => ({ ...prev, name: text }))}
            mode="outlined"
            style={styles.formField}
            testID="station-name-input"
          />

          {/* Emoji */}
          <TextInput
            label={t('kds.settings.station_emoji')}
            value={form.emoji}
            onChangeText={(text) => setForm((prev) => ({ ...prev, emoji: text }))}
            mode="outlined"
            style={styles.formField}
            testID="station-emoji-input"
          />

          {/* Type (kitchen/bar) */}
          <Text style={[styles.sliderLabel, { marginBottom: 8 }]}>
            {t('kds.settings.station_type')}
          </Text>
          <SegmentedButtons
            value={form.type}
            onValueChange={(value) =>
              setForm((prev) => ({ ...prev, type: value as 'kitchen' | 'bar' }))
            }
            buttons={[
              { value: 'kitchen', label: t('kds.screen_title'), icon: 'chef-hat' },
              { value: 'bar', label: t('kds.bar_title'), icon: 'glass-cocktail' },
            ]}
            style={styles.formField}
          />

          {/* Late Threshold Slider */}
          <View style={styles.sliderRow}>
            <Text style={styles.sliderLabel}>{t('kds.settings.late_threshold')}</Text>
            <Text style={styles.sliderValue}>{form.late_threshold_minutes} min</Text>
          </View>
          <Slider
            minimumValue={1}
            maximumValue={120}
            step={1}
            value={form.late_threshold_minutes}
            onValueChange={(value) =>
              setForm((prev) => ({ ...prev, late_threshold_minutes: value }))
            }
            minimumTrackTintColor={colors.primary}
            maximumTrackTintColor={colors.border}
            thumbTintColor={colors.primary}
            style={styles.formField}
            testID="late-threshold-slider"
          />

          {/* Actions */}
          <View style={styles.modalActions}>
            <Button mode="outlined" onPress={closeModal}>
              {t('common.cancel')}
            </Button>
            <Button
              mode="contained"
              onPress={handleSave}
              loading={createMutation.isPending || updateMutation.isPending}
              disabled={!form.name.trim()}
            >
              {t('common.save')}
            </Button>
          </View>
        </Modal>
      </Portal>
    </View>
    </ScreenContainer>
  );
}
