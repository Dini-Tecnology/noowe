/**
 * ConfigFloorScreen — Floor layout & tables
 *
 * Section management: add/edit/delete sections.
 * Table management per section: number, capacity, shape.
 * Simple visual grid representation.
 *
 * API: PATCH /config/:id/floor
 * Access: OWNER only
 *
 * @module config/ConfigFloorScreen
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
import type { FloorSection, FloorTable, FloorLayout } from './types/config.types';

// ============================================
// HELPERS
// ============================================

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

const TABLE_SHAPES = ['round', 'square', 'rectangle'] as const;

// ============================================
// COMPONENT
// ============================================

export default function ConfigFloorScreen() {
  const { t } = useI18n();
  const colors = useColors();
  const { user } = useAuth();

  const restaurantId = useMemo(() => {
    const roles = user?.roles || [];
    return roles.find((r) => r.restaurant_id)?.restaurant_id || '';
  }, [user]);

  const { config, isLoading, updateFloor, isSaving } = useRestaurantConfig(restaurantId);

  const [sections, setSections] = useState<FloorSection[]>([]);
  const [tables, setTables] = useState<FloorTable[]>([]);
  const [isDirty, setIsDirty] = useState(false);

  // Modal state
  const [showSectionModal, setShowSectionModal] = useState(false);
  const [showTableModal, setShowTableModal] = useState(false);
  const [editingSection, setEditingSection] = useState<FloorSection | null>(null);
  const [editingTable, setEditingTable] = useState<FloorTable | null>(null);
  const [activeSectionId, setActiveSectionId] = useState<string>('');

  // Form fields
  const [sectionName, setSectionName] = useState('');
  const [sectionColor, setSectionColor] = useState(colors.primary);
  const [sectionCapacity, setSectionCapacity] = useState('');
  const [tableNumber, setTableNumber] = useState('');
  const [tableSeats, setTableSeats] = useState('4');
  const [tableShape, setTableShape] = useState<string>('square');

  useEffect(() => {
    if (config?.floor_layout) {
      setSections(config.floor_layout.sections || []);
      setTables(config.floor_layout.tables || []);
    }
  }, [config]);

  // ---- Section CRUD ----
  const openAddSection = useCallback(() => {
    setEditingSection(null);
    setSectionName('');
    setSectionColor(colors.primary);
    setSectionCapacity('');
    setShowSectionModal(true);
  }, []);

  const openEditSection = useCallback((section: FloorSection) => {
    setEditingSection(section);
    setSectionName(section.name);
    setSectionColor(section.color || colors.primary);
    setSectionCapacity(section.capacity?.toString() || '');
    setShowSectionModal(true);
  }, []);

  const saveSection = useCallback(() => {
    if (!sectionName.trim()) return;
    const sectionData: FloorSection = {
      id: editingSection?.id || generateId(),
      name: sectionName.trim(),
      color: sectionColor,
      capacity: sectionCapacity ? parseInt(sectionCapacity, 10) : undefined,
    };
    if (editingSection) {
      setSections((prev) => prev.map((s) => (s.id === editingSection.id ? sectionData : s)));
    } else {
      setSections((prev) => [...prev, sectionData]);
    }
    setIsDirty(true);
    setShowSectionModal(false);
  }, [sectionName, sectionColor, sectionCapacity, editingSection]);

  const deleteSection = useCallback(
    (sectionId: string) => {
      Alert.alert(t('config.floor.confirmDeleteSection'), '', [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            setSections((prev) => prev.filter((s) => s.id !== sectionId));
            setTables((prev) => prev.filter((t) => t.sectionId !== sectionId));
            setIsDirty(true);
          },
        },
      ]);
    },
    [t],
  );

  // ---- Table CRUD ----
  const openAddTable = useCallback((sectionId: string) => {
    setActiveSectionId(sectionId);
    setEditingTable(null);
    setTableNumber('');
    setTableSeats('4');
    setTableShape('square');
    setShowTableModal(true);
  }, []);

  const openEditTable = useCallback((table: FloorTable) => {
    setActiveSectionId(table.sectionId);
    setEditingTable(table);
    setTableNumber(table.tableNumber);
    setTableSeats(table.seats.toString());
    setTableShape(table.shape || 'square');
    setShowTableModal(true);
  }, []);

  const saveTable = useCallback(() => {
    if (!tableNumber.trim()) return;
    const tableData: FloorTable = {
      id: editingTable?.id || generateId(),
      tableNumber: tableNumber.trim(),
      sectionId: activeSectionId,
      seats: parseInt(tableSeats, 10) || 4,
      shape: tableShape,
    };
    if (editingTable) {
      setTables((prev) => prev.map((t) => (t.id === editingTable.id ? tableData : t)));
    } else {
      setTables((prev) => [...prev, tableData]);
    }
    setIsDirty(true);
    setShowTableModal(false);
  }, [tableNumber, tableSeats, tableShape, activeSectionId, editingTable]);

  const deleteTable = useCallback(
    (tableId: string) => {
      Alert.alert(t('config.floor.confirmDeleteTable'), '', [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            setTables((prev) => prev.filter((t) => t.id !== tableId));
            setIsDirty(true);
          },
        },
      ]);
    },
    [t],
  );

  // ---- Save ----
  const handleSave = useCallback(async () => {
    try {
      await updateFloor({ sections, tables });
      setIsDirty(false);
      Alert.alert(t('config.saved'));
    } catch {
      Alert.alert(t('errors.generic'));
    }
  }, [sections, tables, updateFloor, t]);

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
        sectionCard: {
          backgroundColor: colors.backgroundTertiary,
          padding: spacing[3],
          borderRadius: borderRadius.sm,
          marginBottom: spacing[2],
        },
        sectionCardHeader: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        },
        sectionCardName: { ...typography.h4, color: colors.foreground },
        sectionCardActions: { flexDirection: 'row', gap: spacing[2] },
        actionText: { ...typography.labelSmall, color: colors.primary },
        deleteText: { ...typography.labelSmall, color: colors.error },
        tableChip: {
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.card,
          paddingHorizontal: spacing[2],
          paddingVertical: spacing[1],
          borderRadius: borderRadius.badge,
          marginRight: spacing[2],
          marginTop: spacing[2],
          borderWidth: 1,
          borderColor: colors.border,
        },
        tableChipText: { ...typography.bodySmall, color: colors.foreground },
        tablesRow: { flexDirection: 'row', flexWrap: 'wrap' },
        emptyText: { ...typography.bodySmall, color: colors.foregroundMuted, marginTop: spacing[2] },
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
        input: {
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
        fieldLabel: { ...typography.labelMedium, color: colors.foregroundSecondary, marginBottom: spacing[1] },
        shapeRow: { flexDirection: 'row', gap: spacing[2], marginBottom: spacing[3] },
        shapeChip: {
          flex: 1,
          paddingVertical: spacing[2],
          borderRadius: borderRadius.pill,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: 'center',
        },
        shapeChipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
        shapeChipText: { ...typography.labelMedium, color: colors.foreground },
        shapeChipTextSelected: { color: colors.primaryForeground },
        modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing[3], marginTop: spacing[3] },
        modalButton: { paddingHorizontal: spacing[4], paddingVertical: spacing[2] },
        modalButtonText: { ...typography.buttonMedium, color: colors.primary },
        modalButtonPrimary: {
          backgroundColor: colors.primary,
          borderRadius: borderRadius.button,
        },
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
        {/* Sections */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('config.floor.sections')}</Text>
            <TouchableOpacity style={styles.addButton} onPress={openAddSection} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('config.floor.addSection')}>
              <Text style={styles.addButtonText}>{t('config.floor.addSection')}</Text>
            </TouchableOpacity>
          </View>

          {sections.length === 0 && (
            <Text style={styles.emptyText}>{t('common.noResults')}</Text>
          )}

          {sections.map((sec) => {
            const sectionTables = tables.filter((t) => t.sectionId === sec.id);
            return (
              <View key={sec.id} style={styles.sectionCard}>
                <View style={styles.sectionCardHeader}>
                  <Text style={styles.sectionCardName}>
                    {sec.name} {sec.capacity ? `(${sec.capacity})` : ''}
                  </Text>
                  <View style={styles.sectionCardActions}>
                    <TouchableOpacity onPress={() => openEditSection(sec)} accessibilityRole="button" accessibilityLabel={t('common.edit')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={styles.actionText}>{t('common.edit')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => deleteSection(sec.id)} accessibilityRole="button" accessibilityLabel={t('common.delete')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={styles.deleteText}>{t('common.delete')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Tables in section */}
                <View style={styles.tablesRow}>
                  {sectionTables.map((tbl) => (
                    <TouchableOpacity
                      key={tbl.id}
                      style={styles.tableChip}
                      onPress={() => openEditTable(tbl)}
                      accessibilityHint="Long press to edit or delete"
              onLongPress={() => deleteTable(tbl.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`${t('config.floor.tableNumber')} ${tbl.tableNumber}, ${tbl.seats} ${t('config.floor.tableSeats')}`}
                    >
                      <Text style={styles.tableChipText}>
                        #{tbl.tableNumber} ({tbl.seats})
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity onPress={() => openAddTable(sec.id)} style={{ marginTop: spacing[2] }} accessibilityRole="button" accessibilityLabel={t('config.floor.addTable')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={styles.actionText}>+ {t('config.floor.addTable')}</Text>
                </TouchableOpacity>
              </View>
            );
          })}
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

      {/* Section Modal */}
      <Modal visible={showSectionModal} transparent animationType="fade" onRequestClose={() => setShowSectionModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {editingSection ? t('config.floor.editSection') : t('config.floor.addSection')}
            </Text>
            <Text style={styles.fieldLabel}>{t('config.floor.sectionName')}</Text>
            <RNTextInput
              style={styles.input}
              value={sectionName}
              onChangeText={setSectionName}
              placeholder={t('config.floor.sectionName')}
              placeholderTextColor={colors.inputPlaceholder}
              accessibilityLabel={t('config.floor.sectionName')}
            />
            <Text style={styles.fieldLabel}>{t('config.floor.sectionCapacity')}</Text>
            <RNTextInput
              style={styles.input}
              value={sectionCapacity}
              onChangeText={setSectionCapacity}
              keyboardType="numeric"
              placeholder={t('placeholders.zero')}
              placeholderTextColor={colors.inputPlaceholder}
              accessibilityLabel={t('config.floor.sectionCapacity')}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalButton} onPress={() => setShowSectionModal(false)} accessibilityRole="button" accessibilityLabel={t('common.cancel')}>
                <Text style={styles.modalButtonText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.modalButtonPrimary]} onPress={saveSection} accessibilityRole="button" accessibilityLabel={t('common.save')}>
                <Text style={styles.modalButtonPrimaryText}>{t('common.save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Table Modal */}
      <Modal visible={showTableModal} transparent animationType="fade" onRequestClose={() => setShowTableModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {editingTable ? t('config.floor.editTable') : t('config.floor.addTable')}
            </Text>
            <Text style={styles.fieldLabel}>{t('config.floor.tableNumber')}</Text>
            <RNTextInput
              style={styles.input}
              value={tableNumber}
              onChangeText={setTableNumber}
              placeholder={t('placeholders.one')}
              placeholderTextColor={colors.inputPlaceholder}
              accessibilityLabel={t('config.floor.tableNumber')}
            />
            <Text style={styles.fieldLabel}>{t('config.floor.tableSeats')}</Text>
            <RNTextInput
              style={styles.input}
              value={tableSeats}
              onChangeText={setTableSeats}
              keyboardType="numeric"
              placeholder={t('placeholders.defaultSeats')}
              placeholderTextColor={colors.inputPlaceholder}
              accessibilityLabel={t('config.floor.tableSeats')}
            />
            <Text style={styles.fieldLabel}>{t('config.floor.tableShape')}</Text>
            <View style={styles.shapeRow}>
              {TABLE_SHAPES.map((shape) => (
                <TouchableOpacity
                  key={shape}
                  style={[styles.shapeChip, tableShape === shape && styles.shapeChipSelected]}
                  onPress={() => setTableShape(shape)}
                  accessibilityRole="button"
                  accessibilityLabel={t(`config.floor.shape${shape.charAt(0).toUpperCase() + shape.slice(1)}`)}
                  accessibilityState={{ selected: tableShape === shape }}
                >
                  <Text style={[styles.shapeChipText, tableShape === shape && styles.shapeChipTextSelected]}>
                    {t(`config.floor.shape${shape.charAt(0).toUpperCase() + shape.slice(1)}`)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalButton} onPress={() => setShowTableModal(false)} accessibilityRole="button" accessibilityLabel={t('common.cancel')}>
                <Text style={styles.modalButtonText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.modalButtonPrimary]} onPress={saveTable} accessibilityRole="button" accessibilityLabel={t('common.save')}>
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
