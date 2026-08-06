import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import customerBackend from '../../services/customer-backend';

export default function ReviewsScreen() {
  const colors = useColors();
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');

  const reviews = useQuery({ queryKey: ['reviews'], queryFn: () => customerBackend.listMyReviews() });
  const orders = useQuery({ queryKey: ['orders', 'reviewable'], queryFn: () => customerBackend.listOrders(100) });
  const reviewed = new Set(reviews.data?.map((review) => review.orderId));
  const reviewable = orders.data?.data.find((order) => ['completed', 'delivered'].includes(order.status) && !reviewed.has(order.id));

  const create = useMutation({
    mutationFn: () => customerBackend.createReview({ orderId: reviewable!.id, restaurantId: reviewable!.restaurantId, rating, comment: comment || undefined }),
    onSuccess: () => { setComment(''); setRating(5); queryClient.invalidateQueries({ queryKey: ['reviews'] }); },
    onError: (error: Error) => Alert.alert('Avaliação', error.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => customerBackend.deleteReview(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reviews'] }),
  });

  const styles = useMemo(
    () =>
      StyleSheet.create({
        scroll: { flex: 1, backgroundColor: colors.background },
        content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32, gap: 12 },
        title: { fontSize: 26, fontWeight: '700', color: colors.foreground, marginBottom: 4 },
        card: { padding: 16, borderRadius: 18, backgroundColor: colors.card, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, gap: 10 },
        cardTitle: { fontSize: 15, fontWeight: '700', color: colors.foreground },
        starsRow: { flexDirection: 'row', gap: 6 },
        input: { minHeight: 70, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, fontSize: 14, color: colors.foreground, textAlignVertical: 'top' },
        submitBtn: { alignSelf: 'flex-start', backgroundColor: colors.primary, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12 },
        submitBtnText: { color: colors.primaryForeground, fontSize: 13, fontWeight: '700' },
        comment: { fontSize: 13, color: colors.foregroundSecondary },
        response: { fontSize: 13, color: colors.foregroundSecondary, fontStyle: 'italic' },
        deleteLink: { fontSize: 12, fontWeight: '700', color: '#DC2626', alignSelf: 'flex-start' },
      }),
    [colors],
  );

  return (
    <ScreenContainer edges={['top']} hasKeyboard>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Avaliações</Text>

        {reviewable && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Avaliar {reviewable.restaurantName}</Text>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((n) => (
                <TouchableOpacity key={n} onPress={() => setRating(n)} accessibilityRole="button">
                  <Ionicons name={n <= rating ? 'star' : 'star-outline'} size={26} color="#FBBF24" />
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={styles.input}
              placeholder="Comentário (opcional)"
              placeholderTextColor={colors.foregroundMuted}
              value={comment}
              onChangeText={setComment}
              multiline
            />
            <TouchableOpacity style={styles.submitBtn} onPress={() => create.mutate()} disabled={create.isPending} accessibilityRole="button">
              <Text style={styles.submitBtnText}>{create.isPending ? 'Publicando...' : 'Publicar'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {(reviews.data ?? []).map((review) => (
          <View key={review.id} style={styles.card}>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Ionicons key={n} name={n <= review.rating ? 'star' : 'star-outline'} size={16} color="#FBBF24" />
              ))}
            </View>
            {review.comment ? <Text style={styles.comment}>{review.comment}</Text> : null}
            {review.ownerResponse ? <Text style={styles.response}>Resposta: {review.ownerResponse}</Text> : null}
            <TouchableOpacity onPress={() => remove.mutate(review.id)} accessibilityRole="button">
              <Text style={styles.deleteLink}>Excluir</Text>
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </ScreenContainer>
  );
}
