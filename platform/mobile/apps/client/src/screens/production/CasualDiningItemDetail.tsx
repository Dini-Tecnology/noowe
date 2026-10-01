/* Hallmark · pre-emit critique: P5 H5 E4 S5 R5 V5 */
/* Hallmark · macrostructure: Form · tone: warm utilitarian · anchor hue: orange */
import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import customerBackend, {
  type CustomerMenuItem,
  type TableDiner,
} from '../../services/customer-backend';
import { money } from './shared';

const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80';

/** Stable per-diner avatar colours, assigned by position at the table. */
const AVATAR_TONES = ['#EA580C', '#DB2777', '#2563EB', '#9333EA', '#0D9488', '#CA8A04'];

export interface CasualDiningItemDetailProps {
  item: CustomerMenuItem | null;
  diners: TableDiner[];
  tableSessionId: string | null;
  /** Group ordering is off (or there is no table yet) — hide the diner picker. */
  sharedOrdering: boolean;
  onClose: () => void;
  onAdd: (input: {
    item: CustomerMenuItem;
    quantity: number;
    diner: TableDiner | null;
    notes: string;
  }) => void;
}

/**
 * The casual dining dish screen: allergens up front (a family table asks
 * first), who at the table the dish is for, and a free-text note for the
 * kitchen — the three things a shared meal needs before "Adicionar".
 */
export default function CasualDiningItemDetail({
  item,
  diners,
  tableSessionId,
  sharedOrdering,
  onClose,
  onAdd,
}: CasualDiningItemDetailProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [selectedDinerId, setSelectedDinerId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [companionName, setCompanionName] = useState('');
  const [companionFormOpen, setCompanionFormOpen] = useState(false);
  const [companionIsKid, setCompanionIsKid] = useState(false);

  const me = diners.find((diner) => diner.isMe) ?? null;
  const activeDiner =
    diners.find((diner) => diner.dinerId === selectedDinerId) ?? me ?? null;

  const addCompanion = useMutation({
    mutationFn: () =>
      customerBackend.addTableCompanion({
        tableSessionId: tableSessionId!,
        name: companionName,
        isKid: companionIsKid,
      }),
    onSuccess: (diner) => {
      setSelectedDinerId(diner.dinerId);
      setCompanionName('');
      setCompanionIsKid(false);
      setCompanionFormOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['table-diners', tableSessionId] });
      void queryClient.invalidateQueries({ queryKey: ['table-bill', tableSessionId] });
    },
    onError: (error: Error) => Alert.alert('Não foi possível adicionar', error.message),
  });

  const confirm = useCallback(() => {
    if (!item) return;
    onAdd({ item, quantity, diner: sharedOrdering ? activeDiner : null, notes: notes.trim() });
    setQuantity(1);
    setNotes('');
    onClose();
  }, [item, quantity, activeDiner, notes, sharedOrdering, onAdd, onClose]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        screen: { flex: 1, backgroundColor: colors.background },
        header: {
          flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8, gap: 12,
        },
        headerBtn: {
          width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
          backgroundColor: colors.backgroundTertiary,
        },
        headerSpacer: { width: 40, height: 40 },
        headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: colors.foreground },
        content: { paddingHorizontal: 20, paddingBottom: 40 },
        imageWrap: { alignItems: 'center', marginTop: 8, marginBottom: 18 },
        image: { width: 120, height: 120, borderRadius: 24, backgroundColor: colors.backgroundTertiary },
        name: { fontSize: 22, fontWeight: '800', color: colors.foreground, textAlign: 'center' },
        description: {
          marginTop: 6, fontSize: 15, lineHeight: 21, color: colors.foregroundSecondary, textAlign: 'center',
        },
        price: { marginTop: 12, fontSize: 20, fontWeight: '800', color: colors.primary, textAlign: 'center' },
        allergenCard: {
          marginTop: 20, padding: 14, borderRadius: 16,
          backgroundColor: colors.warningBackground, borderWidth: 1, borderColor: colors.warningLight,
        },
        allergenHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
        allergenTitle: { fontSize: 14, fontWeight: '700', color: colors.warning },
        allergenRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
        allergenChip: {
          paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: colors.card,
        },
        allergenText: { fontSize: 12, color: colors.warning },
        sectionTitle: { marginTop: 24, marginBottom: 12, fontSize: 15, fontWeight: '700', color: colors.foreground },
        dinersRow: { flexDirection: 'row', gap: 10, paddingRight: 8 },
        diner: {
          width: 78, alignItems: 'center', gap: 6, paddingVertical: 10, borderRadius: 16,
          borderWidth: 2, borderColor: 'transparent',
        },
        dinerSelected: { borderColor: colors.primary, backgroundColor: colors.backgroundSecondary },
        dinerAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
        dinerAvatarText: { fontSize: 17, fontWeight: '700', color: '#FFFFFF' },
        dinerName: { fontSize: 12, color: colors.foregroundSecondary },
        dinerKidTag: { fontSize: 10, fontWeight: '700', color: colors.primary },
        addDiner: {
          width: 78, alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10,
          borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.border,
        },
        addDinerText: { fontSize: 11, color: colors.foregroundMuted, textAlign: 'center' },
        companionForm: { marginTop: 12, gap: 10 },
        input: {
          height: 48, paddingHorizontal: 14, borderRadius: 14, fontSize: 15,
          color: colors.foreground, backgroundColor: colors.backgroundTertiary,
        },
        companionRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
        kidToggle: {
          flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10,
          borderRadius: 12, backgroundColor: colors.backgroundTertiary,
        },
        kidToggleOn: { backgroundColor: colors.primaryLight },
        kidToggleText: { fontSize: 13, fontWeight: '600', color: colors.foregroundSecondary },
        companionSave: {
          flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: colors.primary,
        },
        companionSaveText: { fontSize: 14, fontWeight: '700', color: colors.primaryForeground },
        notesInput: {
          minHeight: 52, paddingHorizontal: 14, paddingVertical: 14, borderRadius: 14, fontSize: 14,
          color: colors.foreground, backgroundColor: colors.backgroundTertiary, textAlignVertical: 'top',
        },
        quantityRow: {
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24,
        },
        quantityLabel: { fontSize: 15, fontWeight: '600', color: colors.foreground },
        stepper: { flexDirection: 'row', alignItems: 'center', gap: 16 },
        stepperBtn: {
          width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
          borderWidth: 1, borderColor: colors.border,
        },
        stepperBtnFilled: { backgroundColor: colors.primary, borderColor: colors.primary },
        stepperValue: { fontSize: 16, fontWeight: '700', color: colors.foreground, minWidth: 20, textAlign: 'center' },
        cta: {
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
          marginTop: 28, paddingVertical: 18, borderRadius: 20, backgroundColor: colors.primary,
        },
        ctaText: { fontSize: 16, fontWeight: '700', color: colors.primaryForeground },
        hint: { marginTop: 10, fontSize: 12, lineHeight: 17, color: colors.foregroundMuted, textAlign: 'center' },
      }),
    [colors],
  );

  if (!item) return null;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={{ paddingTop: insets.top + 8 }}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.headerBtn} onPress={onClose} accessibilityRole="button" accessibilityLabel="Voltar">
              <Ionicons name="arrow-back" size={22} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={styles.headerTitle} numberOfLines={1}>{item.name}</Text>
            <View style={styles.headerSpacer} />
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.imageWrap}>
            <Image source={{ uri: item.imageUrl || FALLBACK_IMAGE }} style={styles.image} resizeMode="cover" />
          </View>

          <Text style={styles.name}>{item.name}</Text>
          {item.description ? <Text style={styles.description}>{item.description}</Text> : null}
          <Text style={styles.price}>{money(item.price)}</Text>

          {item.allergens.length > 0 && (
            <View style={styles.allergenCard}>
              <View style={styles.allergenHeader}>
                <Ionicons name="warning-outline" size={15} color={colors.warning} />
                <Text style={styles.allergenTitle}>Alérgenos</Text>
              </View>
              <View style={styles.allergenRow}>
                {item.allergens.map((allergen) => (
                  <View key={allergen} style={styles.allergenChip}>
                    <Text style={styles.allergenText}>{allergen}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {sharedOrdering && (
            <>
              <Text style={styles.sectionTitle}>Quem está pedindo?</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dinersRow}>
                {diners.map((diner, index) => {
                  const selected = activeDiner?.dinerId === diner.dinerId;
                  return (
                    <TouchableOpacity
                      key={diner.dinerId}
                      style={[styles.diner, selected && styles.dinerSelected]}
                      onPress={() => setSelectedDinerId(diner.dinerId)}
                      activeOpacity={0.85}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={diner.isMe ? 'Você' : diner.displayName}
                    >
                      <View
                        style={[styles.dinerAvatar, { backgroundColor: AVATAR_TONES[index % AVATAR_TONES.length] }]}
                      >
                        <Text style={styles.dinerAvatarText}>
                          {(diner.isMe ? 'V' : diner.displayName.charAt(0)).toLocaleUpperCase('pt-BR')}
                        </Text>
                      </View>
                      <Text style={styles.dinerName} numberOfLines={1}>
                        {diner.isMe ? 'Você' : diner.displayName}
                      </Text>
                      {diner.isKid && <Text style={styles.dinerKidTag}>Kids</Text>}
                    </TouchableOpacity>
                  );
                })}
                {tableSessionId && (
                  <TouchableOpacity
                    style={styles.addDiner}
                    onPress={() => setCompanionFormOpen((open) => !open)}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel="Adicionar pessoa à mesa"
                  >
                    <Ionicons name="person-add-outline" size={20} color={colors.foregroundMuted} />
                    <Text style={styles.addDinerText}>Adicionar</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>

              {companionFormOpen && tableSessionId && (
                <View style={styles.companionForm}>
                  <TextInput
                    style={styles.input}
                    placeholder="Nome da pessoa"
                    placeholderTextColor={colors.foregroundMuted}
                    value={companionName}
                    onChangeText={setCompanionName}
                    maxLength={40}
                    accessibilityLabel="Nome da pessoa"
                  />
                  <View style={styles.companionRow}>
                    <TouchableOpacity
                      style={[styles.kidToggle, companionIsKid && styles.kidToggleOn]}
                      onPress={() => setCompanionIsKid((value) => !value)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: companionIsKid }}
                    >
                      <Ionicons
                        name={companionIsKid ? 'checkbox-outline' : 'square-outline'}
                        size={16}
                        color={companionIsKid ? colors.primary : colors.foregroundMuted}
                      />
                      <Text style={styles.kidToggleText}>Criança</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.companionSave}
                      onPress={() => addCompanion.mutate()}
                      disabled={!companionName.trim() || addCompanion.isPending}
                      accessibilityRole="button"
                    >
                      <Text style={styles.companionSaveText}>
                        {addCompanion.isPending ? 'Adicionando…' : 'Adicionar à mesa'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </>
          )}

          <Text style={styles.sectionTitle}>Observações</Text>
          <TextInput
            style={styles.notesInput}
            placeholder="Ex: sem cebola, bem passado, extra queijo…"
            placeholderTextColor={colors.foregroundMuted}
            value={notes}
            onChangeText={setNotes}
            multiline
            maxLength={180}
            accessibilityLabel="Observações para a cozinha"
          />

          <View style={styles.quantityRow}>
            <Text style={styles.quantityLabel}>Quantidade</Text>
            <View style={styles.stepper}>
              <TouchableOpacity
                style={styles.stepperBtn}
                onPress={() => setQuantity((value) => Math.max(1, value - 1))}
                accessibilityRole="button"
                accessibilityLabel="Diminuir quantidade"
              >
                <Ionicons name="remove" size={16} color={colors.foreground} />
              </TouchableOpacity>
              <Text style={styles.stepperValue}>{quantity}</Text>
              <TouchableOpacity
                style={[styles.stepperBtn, styles.stepperBtnFilled]}
                onPress={() => setQuantity((value) => value + 1)}
                accessibilityRole="button"
                accessibilityLabel="Aumentar quantidade"
              >
                <Ionicons name="add" size={16} color={colors.primaryForeground} />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity style={styles.cta} onPress={confirm} activeOpacity={0.9} accessibilityRole="button">
            <Ionicons name="add" size={20} color={colors.primaryForeground} />
            <Text style={styles.ctaText}>Adicionar · {money(item.price * quantity)}</Text>
          </TouchableOpacity>

          {sharedOrdering && !tableSessionId && (
            <Text style={styles.hint}>
              Leia o QR da mesa para dividir o pedido entre as pessoas da mesa.
            </Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
