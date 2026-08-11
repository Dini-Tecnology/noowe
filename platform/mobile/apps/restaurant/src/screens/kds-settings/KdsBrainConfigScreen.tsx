/**
 * KdsBrainConfigScreen -- KDS Brain global settings
 *
 * Allows OWNER/MANAGER to configure KDS Brain behaviour:
 * - Course gap fire mode (on_ready vs fixed interval)
 * - Course gap interval (minutes slider, visible when mode = timed)
 * - Delivery buffer (minutes slider)
 * - Auto-accept delivery toggle
 * - Alert sound toggle + volume slider
 *
 * @module restaurant/screens/kds-settings/KdsBrainConfigScreen
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
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
  SegmentedButtons,
  Switch,
} from 'react-native-paper';
import Slider from '@react-native-community/slider';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ApiService from '@/shared/services/api';
import { useI18n } from '@/shared/hooks/useI18n';
import { useAuth } from '@/shared/hooks/useAuth';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { SkeletonBlock } from '@okinawa/shared/components/ui/SkeletonBlock';

// ============================================
// TYPES
// ============================================

interface KdsBrainConfig {
  restaurant_id: string;
  course_gap_mode: 'on_ready' | 'timed';
  course_gap_minutes: number;
  delivery_buffer_minutes: number;
  auto_accept_delivery: boolean;
  sound_enabled: boolean;
  sound_volume: number;
}

// ============================================
// COMPONENT
// ============================================

export default function KdsBrainConfigScreen() {
  const { t } = useI18n();
  const colors = useColors();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const restaurantId = useMemo(() => {
    return user?.roles?.[0]?.restaurant_id ?? '';
  }, [user]);

  // ── Local form state ─────────────────────────────────────────────

  const [courseGapMode, setCourseGapMode] = useState<'on_ready' | 'timed'>('on_ready');
  const [courseGapMinutes, setCourseGapMinutes] = useState(5);
  const [deliveryBuffer, setDeliveryBuffer] = useState(3);
  const [autoAccept, setAutoAccept] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundVolume, setSoundVolume] = useState(0.7);

  // ── Data fetching ────────────────────────────────────────────────

  const {
    data: config,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery<KdsBrainConfig>({
    queryKey: ['kds-brain-config', restaurantId],
    queryFn: () => ApiService.getKdsBrainConfig(restaurantId),
    enabled: !!restaurantId,
  });

  // Sync fetched config into local state
  useEffect(() => {
    if (config) {
      setCourseGapMode(config.course_gap_mode ?? 'on_ready');
      setCourseGapMinutes(config.course_gap_minutes ?? 5);
      setDeliveryBuffer(config.delivery_buffer_minutes ?? 3);
      setAutoAccept(config.auto_accept_delivery ?? false);
      setSoundEnabled(config.sound_enabled ?? true);
      setSoundVolume(config.sound_volume ?? 0.7);
    }
  }, [config]);

  // ── Save mutation ────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: () =>
      ApiService.updateKdsBrainConfig({
        restaurant_id: restaurantId,
        course_gap_mode: courseGapMode,
        course_gap_minutes: courseGapMinutes,
        delivery_buffer_minutes: deliveryBuffer,
        auto_accept_delivery: autoAccept,
        sound_enabled: soundEnabled,
        sound_volume: soundVolume,
      }),
    onSuccess: () => {
      Alert.alert(t('kds.config.saved'));
      queryClient.invalidateQueries({ queryKey: ['kds-brain-config'] });
    },
  });

  // ── SegmentedButtons config ──────────────────────────────────────

  const gapModeButtons = useMemo(
    () => [
      { value: 'on_ready', label: t('kds.config.on_ready') },
      { value: 'timed', label: t('kds.config.timed') },
    ],
    [t],
  );

  // ── Styles ──────────────────────────────────────────────────────

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.backgroundSecondary,
        },
        header: {
          backgroundColor: colors.card,
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: 12,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        },
        headerTitle: {
          fontSize: 24,
          fontWeight: 'bold',
          color: colors.foreground,
        },
        scrollContent: {
          padding: 16,
          paddingBottom: 32,
        },
        card: {
          backgroundColor: colors.card,
          borderRadius: 12,
          padding: 16,
          marginBottom: 16,
          elevation: 1,
        },
        cardTitle: {
          fontSize: 16,
          fontWeight: '600',
          color: colors.foreground,
          marginBottom: 12,
        },
        switchRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingVertical: 8,
        },
        switchLabel: {
          fontSize: 16,
          color: colors.foreground,
          flex: 1,
        },
        sliderRow: {
          marginTop: 8,
        },
        sliderLabel: {
          fontSize: 14,
          color: colors.foregroundSecondary,
          marginBottom: 4,
        },
        sliderValue: {
          fontSize: 14,
          fontWeight: '700',
          color: colors.primary,
          textAlign: 'right',
        },
        sliderValueRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        },
        saveButton: {
          marginTop: 8,
        },
        skeletonContainer: {
          padding: 16,
          gap: 16,
        },
      }),
    [colors],
  );

  // ── Skeleton loading ────────────────────────────────────────────

  if (isLoading) {
    return (
      <ScreenContainer>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('kds.config.title')}</Text>
        </View>
        <View style={styles.skeletonContainer}>
          {[1, 2, 3, 4].map((i) => (
            <SkeletonBlock key={i} width="100%" height={70} borderRadius={12} />
          ))}
        </View>
      </View>
      </ScreenContainer>
    );
  }

  // ── Render ──────────────────────────────────────────────────────

  return (
    <ScreenContainer>
    <View style={styles.container} accessibilityLabel="KDS Brain configuration">
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('kds.config.title')}</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => refetch()}
            tintColor={colors.primary}
          />
        }
      >
        {/* Course Gap Mode */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('kds.config.course_gap_mode')}</Text>
          <SegmentedButtons
            value={courseGapMode}
            onValueChange={(v) => setCourseGapMode(v as 'on_ready' | 'timed')}
            buttons={gapModeButtons}
          />

          {courseGapMode === 'timed' && (
            <View style={styles.sliderRow}>
              <View style={styles.sliderValueRow}>
                <Text style={styles.sliderLabel}>{t('kds.config.course_gap_minutes')}</Text>
                <Text style={styles.sliderValue}>{courseGapMinutes} min</Text>
              </View>
              <Slider
                minimumValue={1}
                maximumValue={20}
                step={1}
                value={courseGapMinutes}
                onValueChange={setCourseGapMinutes}
                minimumTrackTintColor={colors.primary}
                maximumTrackTintColor={colors.border}
                thumbTintColor={colors.primary}
              />
            </View>
          )}
        </View>

        {/* Delivery Buffer */}
        <View style={styles.card}>
          <View style={styles.sliderValueRow}>
            <Text style={styles.cardTitle}>{t('kds.config.delivery_buffer')}</Text>
            <Text style={styles.sliderValue}>{deliveryBuffer} min</Text>
          </View>
          <Slider
            minimumValue={1}
            maximumValue={10}
            step={1}
            value={deliveryBuffer}
            onValueChange={setDeliveryBuffer}
            minimumTrackTintColor={colors.primary}
            maximumTrackTintColor={colors.border}
            thumbTintColor={colors.primary}
          />
        </View>

        {/* Auto-accept delivery */}
        <View style={styles.card}>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>{t('kds.config.auto_accept')}</Text>
            <Switch
              value={autoAccept}
              onValueChange={setAutoAccept}
              color={colors.primary}
            />
          </View>
        </View>

        {/* Sound settings */}
        <View style={styles.card}>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>{t('kds.config.sound')}</Text>
            <Switch
              value={soundEnabled}
              onValueChange={setSoundEnabled}
              color={colors.primary}
            />
          </View>

          {soundEnabled && (
            <View style={styles.sliderRow}>
              <View style={styles.sliderValueRow}>
                <Text style={styles.sliderLabel}>{t('kds.config.sound_volume')}</Text>
                <Text style={styles.sliderValue}>{Math.round(soundVolume * 100)}%</Text>
              </View>
              <Slider
                minimumValue={0}
                maximumValue={1}
                step={0.1}
                value={soundVolume}
                onValueChange={setSoundVolume}
                minimumTrackTintColor={colors.primary}
                maximumTrackTintColor={colors.border}
                thumbTintColor={colors.primary}
              />
            </View>
          )}
        </View>

        {/* Save Button */}
        <Button
          mode="contained"
          onPress={() => saveMutation.mutate()}
          loading={saveMutation.isPending}
          style={styles.saveButton}
          buttonColor={colors.primary}
          textColor={colors.premiumCardForeground}
          icon="content-save"
        >
          {t('common.save')}
        </Button>
      </ScrollView>
    </View>
    </ScreenContainer>
  );
}
