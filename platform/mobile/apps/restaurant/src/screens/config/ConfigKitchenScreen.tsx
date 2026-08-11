/**
 * ConfigKitchenScreen — Kitchen stations configuration
 *
 * Stations list: add/edit station (name, keywords, displayName).
 * Routing config: kitchen categories and bar categories.
 *
 * API: PATCH /config/:id/kitchen
 * Access: OWNER + MANAGER
 *
 * @module config/ConfigKitchenScreen
 */

import React, { useMemo, useEffect, useCallback, useState } from 'react';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import {
  View,
  ScrollView,
  StyleSheet,
  Alert,
  TouchableOpacity,
  TextInput as RNTextInput,
  Modal,
} from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { useI18n } from '@/shared/hooks/useI18n';
import { useColors } from '@/shared/contexts/ThemeContext';
import { useAuth } from '@/shared/hooks/useAuth';
import { useRestaurantConfig } from './hooks/useRestaurantConfig';
import { spacing, borderRadius } from '@/shared/theme/spacing';
import { typography } from '@/shared/theme/typography';
import type { KitchenStation, KitchenStationsConfig } from './types/config.types';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

export default function ConfigKitchenScreen() {
  const { t } = useI18n();
  const colors = useColors();
  const { user } = useAuth();

  const restaurantId = useMemo(() => {
    const roles = user?.roles || [];
    return roles.find((r) => r.restaurant_id)?.restaurant_id || '';
  }, [user]);

  const { config, isLoading, updateKitchen, isSaving } = useRestaurantConfig(restaurantId);

  const [stations, setStations] = useState<KitchenStation[]>([]);
  const [routingKitchen, setRoutingKitchen] = useState<string[]>([]);
  const [routingBar, setRoutingBar] = useState<string[]>([]);
  const [isDirty, setIsDirty] = useState(false);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingStation, setEditingStation] = useState<KitchenStation | null>(null);
  const [stationName, setStationName] = useState('');
  const [stationDisplayName, setStationDisplayName] = useState('');
  const [stationKeywords, setStationKeywords] = useState('');
  const [routingKitchenInput, setRoutingKitchenInput] = useState('');
  const [routingBarInput, setRoutingBarInput] = useState('');

  useEffect(() => {
    if (config?.kitchen_stations) {
      setStations(config.kitchen_stations.stations || []);
      setRoutingKitchen(config.kitchen_stations.routing?.kitchen || []);
      setRoutingBar(config.kitchen_stations.routing?.bar || []);
      setRoutingKitchenInput((config.kitchen_stations.routing?.kitchen || []).join(', '));
      setRoutingBarInput((config.kitchen_stations.routing?.bar || []).join(', '));
    }
  }, [config]);

  const openAddStation = useCallback(() => {
    setEditingStation(null);
    setStationName('');
    setStationDisplayName('');
    setStationKeywords('');
    setShowModal(true);
  }, []);

  const openEditStation = useCallback((station: KitchenStation) => {
    setEditingStation(station);
    setStationName(station.name);
    setStationDisplayName(station.displayName);
    setStationKeywords(station.keywords.join(', '));
    setShowModal(true);
  }, []);

  const saveStation = useCallback(() => {
    if (!stationName.trim()) return;
    const data: KitchenStation = {
      id: editingStation?.id || generateId(),
      name: stationName.trim(),
      displayName: stationDisplayName.trim() || stationName.trim(),
      keywords: stationKeywords
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean),
    };
    if (editingStation) {
      setStations((prev) => prev.map((s) => (s.id === editingStation.id ? data : s)));
    } else {
      setStations((prev) => [...prev, data]);
    }
    setIsDirty(true);
    setShowModal(false);
  }, [stationName, stationDisplayName, stationKeywords, editingStation]);

  const deleteStation = useCallback(
    (stationId: string) => {
      Alert.alert(t('config.kitchen.confirmDelete'), '', [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            setStations((prev) => prev.filter((s) => s.id !== stationId));
            setIsDirty(true);
          },
        },
      ]);
    },
    [t],
  );

  const handleSave = useCallback(async () => {
    try {
      const kitchenCategories = routingKitchenInput
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean);
      const barCategories = routingBarInput
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean);
      await updateKitchen({
        stations,
        routing: { kitchen: kitchenCategories, bar: barCategories },
      });
      setIsDirty(false);
      Alert.alert(t('config.saved'));
    } catch {
      Alert.alert(t('errors.generic'));
    }
  }, [stations, routingKitchenInput, routingBarInput, updateKitchen, t]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.backgroundSecondary },
        section: {
          backgroundColor: colors.card,
          marginHorizontal: spacing.screenHorizontal,
          marginTop: spacing[4],
          padding: spacing[4],
          borderRadius: borderRadius.card,
          borderWidth: 1,
          borderColor: colors.cardBorder,
        },
        sectionHeader: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: spacing[3],
        },
        sectionTitle: { ...typography.h3, color: colors.foreground },
        addButton: {
          backgroundColor: colors.primary,
          paddingHorizontal: spacing[3],
          paddingVertical: spacing[1.5],
          borderRadius: borderRadius.pill,
        },
        addButtonText: { ...typography.labelMedium, color: colors.primaryForeground },
        stationCard: {
          backgroundColor: colors.backgroundTertiary,
          padding: spacing[3],
          borderRadius: borderRadius.sm,
          marginBottom: spacing[2],
        },
        stationHeader: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        },
        stationName: { ...typography.h4, color: colors.foreground },
        stationKeywords: { ...typography.bodySmall, color: colors.foregroundSecondary, marginTop: spacing[1] },
        actionsRow: { flexDirection: 'row', gap: spacing[2] },
        actionText: { ...typography.labelSmall, color: colors.primary },
        deleteText: { ...typography.labelSmall, color: colors.error },
        emptyText: { ...typography.bodySmall, color: colors.foregroundMuted },
        fieldLabel: { ...typography.labelMedium, color: colors.foregroundSecondary, marginBottom: spacing[1], marginTop: spacing[3] },
        input: {
          backgroundColor: colors.input,
          borderWidth: 1,
          borderColor: colors.inputBorder,
          borderRadius: borderRadius.input,
          paddingHorizontal: spacing[3],
          paddingVertical: spacing[2],
          color: colors.foreground,
          ...typography.bodyMedium,
        },
        // Modal
        modalOverlay: {
          flex: 1,
          backgroundColor: colors.overlay,
          justifyContent: 'center',
          padding: spacing.screenHorizontal,
        },
        modalContent: {
          backgroundColor: colors.card,
          borderRadius: borderRadius.cardLarge,
          padding: spacing[5],
        },
        modalTitle: { ...typography.h3, color: colors.foreground, marginBottom: spacing[4] },
        modalInput: {
          backgroundColor: colors.input,
          borderWidth: 1,
          borderColor: colors.inputBorder,
          borderRadius: borderRadius.input,
          paddingHorizontal: spacing[3],
          paddingVertical: spacing[2],
          color: colors.foreground,
          ...typography.bodyMedium,
          marginBottom: spacing[3],
        },
        modalFieldLabel: { ...typography.labelMedium, color: colors.foregroundSecondary, marginBottom: spacing[1] },
        modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing[3], marginTop: spacing[3] },
        modalButton: { paddingHorizontal: spacing[4], paddingVertical: spacing[2] },
        modalButtonText: { ...typography.buttonMedium, color: colors.primary },
        modalButtonPrimary: { backgroundColor: colors.primary, borderRadius: borderRadius.button },
        modalButtonPrimaryText: { ...typography.buttonMedium, color: colors.primaryForeground },
        saveButton: {
          backgroundColor: colors.primary,
          marginHorizontal: spacing.screenHorizontal,
          marginTop: spacing[5],
          marginBottom: spacing[10],
          paddingVertical: spacing[3],
          borderRadius: borderRadius.button,
          alignItems: 'center',
        },
        saveButtonDisabled: { opacity: 0.5 },
        saveButtonText: { ...typography.buttonLarge, color: colors.primaryForeground },
      }),
    [colors],
  );

  if (isLoading) {
    return (
      <ScreenContainer hasKeyboard>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer hasKeyboard>
    <>
      <ScrollView style={styles.container}>
        {/* Stations */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('config.kitchen.stations')}</Text>
            <TouchableOpacity style={styles.addButton} onPress={openAddStation} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('config.kitchen.addStation')}>
              <Text style={styles.addButtonText}>{t('config.kitchen.addStation')}</Text>
            </TouchableOpacity>
          </View>

          {stations.length === 0 && <Text style={styles.emptyText}>{t('common.noResults')}</Text>}

          {stations.map((station) => (
            <View key={station.id} style={styles.stationCard}>
              <View style={styles.stationHeader}>
                <View>
                  <Text style={styles.stationName}>{station.displayName || station.name}</Text>
                  <Text style={styles.stationKeywords}>
                    {station.keywords.length > 0 ? station.keywords.join(', ') : '-'}
                  </Text>
                </View>
                <View style={styles.actionsRow}>
                  <TouchableOpacity onPress={() => openEditStation(station)} accessibilityRole="button" accessibilityLabel={t('common.edit')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={styles.actionText}>{t('common.edit')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => deleteStation(station.id)} accessibilityRole="button" accessibilityLabel={t('common.delete')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={styles.deleteText}>{t('common.delete')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))}
        </View>

        {/* Routing */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('config.kitchen.routing')}</Text>
          <Text style={styles.fieldLabel}>{t('config.kitchen.routingKitchen')}</Text>
          <RNTextInput
            style={styles.input}
            value={routingKitchenInput}
            onChangeText={(val) => { setRoutingKitchenInput(val); setIsDirty(true); }}
            placeholder={t('config.kitchen.routingKitchen')}
            placeholderTextColor={colors.inputPlaceholder}
            accessibilityLabel={t('config.kitchen.routingKitchen')}
          />
          <Text style={styles.fieldLabel}>{t('config.kitchen.routingBar')}</Text>
          <RNTextInput
            style={styles.input}
            value={routingBarInput}
            onChangeText={(val) => { setRoutingBarInput(val); setIsDirty(true); }}
            placeholder={t('config.kitchen.routingBar')}
            placeholderTextColor={colors.inputPlaceholder}
            accessibilityLabel={t('config.kitchen.routingBar')}
          />
        </View>

        {/* Save */}
        <TouchableOpacity
          style={[styles.saveButton, (!isDirty || isSaving) && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={!isDirty || isSaving}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('config.save')}
        >
          <Text style={styles.saveButtonText}>
            {isSaving ? t('config.saving') : t('config.save')}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Station Modal */}
      <Modal visible={showModal} transparent animationType="fade" onRequestClose={() => setShowModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {editingStation ? t('config.kitchen.editStation') : t('config.kitchen.addStation')}
            </Text>
            <Text style={styles.modalFieldLabel}>{t('config.kitchen.stationName')}</Text>
            <RNTextInput
              style={styles.modalInput}
              value={stationName}
              onChangeText={setStationName}
              placeholder={t('config.kitchen.stationName')}
              placeholderTextColor={colors.inputPlaceholder}
              accessibilityLabel={t('config.kitchen.stationName')}
            />
            <Text style={styles.modalFieldLabel}>{t('config.kitchen.displayName')}</Text>
            <RNTextInput
              style={styles.modalInput}
              value={stationDisplayName}
              onChangeText={setStationDisplayName}
              placeholder={t('config.kitchen.displayName')}
              placeholderTextColor={colors.inputPlaceholder}
              accessibilityLabel={t('config.kitchen.displayName')}
            />
            <Text style={styles.modalFieldLabel}>{t('config.kitchen.keywords')}</Text>
            <RNTextInput
              style={styles.modalInput}
              value={stationKeywords}
              onChangeText={setStationKeywords}
              placeholder={t('config.kitchen.keywords')}
              placeholderTextColor={colors.inputPlaceholder}
              accessibilityLabel={t('config.kitchen.keywords')}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalButton} onPress={() => setShowModal(false)} accessibilityRole="button" accessibilityLabel={t('common.cancel')}>
                <Text style={styles.modalButtonText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.modalButtonPrimary]} onPress={saveStation} accessibilityRole="button" accessibilityLabel={t('common.save')}>
                <Text style={styles.modalButtonPrimaryText}>{t('common.save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
    </ScreenContainer>
  );
}
