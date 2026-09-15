/* Hallmark · pre-emit critique: P5 H5 E4 S5 R4 V5 */
/* Hallmark · macrostructure: Form · tone: warm utilitarian · anchor hue: orange */
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useMutation, useQuery } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import customerBackend from '../../services/customer-backend';
import { rootNavigate } from './shared';

const CATEGORIES = [
  { key: 'food', label: 'Comida', icon: 'restaurant-outline' },
  { key: 'service', label: 'Serviço', icon: 'ribbon-outline' },
  { key: 'ambiance', label: 'Ambiente', icon: 'location-outline' },
] as const;

const QUICK_TAGS = ['Prato delicioso', 'Ótimo pra família', 'Bom preço', 'Rápido'];

function StarRow({
  value,
  onChange,
  color,
  emptyColor,
}: {
  value: number;
  onChange: (next: number) => void;
  color: string;
  emptyColor: string;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <TouchableOpacity
          key={star}
          onPress={() => onChange(star)}
          accessibilityRole="button"
          accessibilityLabel={`${star} estrelas`}
          hitSlop={6}
        >
          <Ionicons name={star <= value ? 'star' : 'star-outline'} size={26} color={star <= value ? color : emptyColor} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function ReviewScreen({ route, navigation }: any) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const restaurantId: string | undefined = route?.params?.restaurantId;
  const restaurantName: string | undefined = route?.params?.restaurantName ?? 'o restaurante';
  const explicitOrderId: string | undefined = route?.params?.orderId ?? undefined;

  const [ratings, setRatings] = useState<Record<'food' | 'service' | 'ambiance', number>>({ food: 0, service: 0, ambiance: 0 });
  const [comment, setComment] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const fallbackOrder = useQuery({
    queryKey: ['reviewable-order', restaurantId],
    queryFn: () => customerBackend.getLatestReviewableOrder(restaurantId!),
    enabled: !explicitOrderId && !!restaurantId,
  });
  const orderId = explicitOrderId ?? fallbackOrder.data ?? null;

  const submit = useMutation({
    mutationFn: () =>
      customerBackend.createReview({
        orderId: orderId!,
        restaurantId: restaurantId!,
        foodRating: ratings.food || undefined,
        serviceRating: ratings.service || undefined,
        ambianceRating: ratings.ambiance || undefined,
        comment: comment.trim() || undefined,
        tags: selectedTags.length ? selectedTags : undefined,
      }),
    onSuccess: () => {
      Alert.alert('Obrigado!', 'Sua avaliação foi enviada.', [
        { text: 'OK', onPress: () => rootNavigate(navigation, 'Home') },
      ]);
    },
    onError: (error: Error) => Alert.alert('Não foi possível enviar', error.message),
  });

  const toggleTag = (tag: string) =>
    setSelectedTags((current) => (current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag]));

  const canSubmit = !!orderId && (ratings.food > 0 || ratings.service > 0 || ratings.ambiance > 0);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        scroll: { flex: 1, backgroundColor: colors.background },
        content: { paddingHorizontal: 16, paddingBottom: 40 },
        header: { flexDirection: 'row', alignItems: 'center', paddingBottom: 12, gap: 12 },
        headerBtn: {
          width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
          backgroundColor: colors.backgroundTertiary,
        },
        headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: colors.foreground, marginRight: 36 },
        heroIcon: {
          alignSelf: 'center', width: 64, height: 64, borderRadius: 20, backgroundColor: colors.backgroundSecondary,
          alignItems: 'center', justifyContent: 'center', marginBottom: 14,
        },
        heroTitle: { fontSize: 19, fontWeight: '800', color: colors.foreground, textAlign: 'center', marginBottom: 24 },
        categoryRow: {
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20,
        },
        categoryLabel: { flexDirection: 'row', alignItems: 'center', gap: 8 },
        categoryLabelText: { fontSize: 14, fontWeight: '700', color: colors.foreground },
        commentInput: {
          minHeight: 52, paddingHorizontal: 14, paddingVertical: 14, borderRadius: 14, fontSize: 14,
          color: colors.foreground, backgroundColor: colors.backgroundTertiary, textAlignVertical: 'top', marginBottom: 16,
        },
        tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 28 },
        tagChip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 16, backgroundColor: colors.backgroundTertiary },
        tagChipActive: { backgroundColor: colors.primary },
        tagChipText: { fontSize: 13, fontWeight: '600', color: colors.foregroundSecondary },
        tagChipTextActive: { color: colors.primaryForeground },
        cta: {
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
          paddingVertical: 17, borderRadius: 18, backgroundColor: colors.primary, marginBottom: 10,
        },
        ctaDisabled: { opacity: 0.6 },
        ctaText: { fontSize: 16, fontWeight: '700', color: colors.primaryForeground },
        secondaryBtn: { paddingVertical: 15, borderRadius: 16, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center' },
        secondaryBtnText: { fontSize: 15, fontWeight: '700', color: colors.foreground },
      }),
    [colors],
  );

  return (
    <ScreenContainer edges={['bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 8 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Voltar">
            <Ionicons name="arrow-back" size={20} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Avaliação</Text>
        </View>

        <View style={styles.heroIcon}>
          <Ionicons name="restaurant" size={28} color={colors.primary} />
        </View>
        <Text style={styles.heroTitle}>Como foi {restaurantName === 'o restaurante' ? 'na sua visita' : `na ${restaurantName}`}?</Text>

        {!explicitOrderId && fallbackOrder.isLoading && (
          <ActivityIndicator color={colors.primary} style={{ marginBottom: 20 }} />
        )}

        {CATEGORIES.map((category) => (
          <View key={category.key} style={styles.categoryRow}>
            <View style={styles.categoryLabel}>
              <Ionicons name={category.icon as any} size={16} color={colors.primary} />
              <Text style={styles.categoryLabelText}>{category.label}</Text>
            </View>
            <StarRow
              value={ratings[category.key]}
              onChange={(next) => setRatings((current) => ({ ...current, [category.key]: next }))}
              color={colors.ratingGold}
              emptyColor={colors.foregroundMuted}
            />
          </View>
        ))}

        <TextInput
          style={styles.commentInput}
          placeholder="Deixe um comentário (opcional)…"
          placeholderTextColor={colors.foregroundMuted}
          value={comment}
          onChangeText={setComment}
          multiline
          maxLength={500}
          accessibilityLabel="Comentário"
        />

        <View style={styles.tagsRow}>
          {QUICK_TAGS.map((tag) => {
            const active = selectedTags.includes(tag);
            return (
              <TouchableOpacity
                key={tag}
                style={[styles.tagChip, active && styles.tagChipActive]}
                onPress={() => toggleTag(tag)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.tagChipText, active && styles.tagChipTextActive]}>{tag}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={[styles.cta, (!canSubmit || submit.isPending) && styles.ctaDisabled]}
          onPress={() => submit.mutate()}
          disabled={!canSubmit || submit.isPending}
          activeOpacity={0.9}
          accessibilityRole="button"
        >
          <Ionicons name="thumbs-up" size={18} color={colors.primaryForeground} />
          <Text style={styles.ctaText}>{submit.isPending ? 'Enviando…' : 'Enviar Avaliação'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => rootNavigate(navigation, 'Wallet')}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryBtnText}>Ver Carteira</Text>
        </TouchableOpacity>
      </ScrollView>
    </ScreenContainer>
  );
}
