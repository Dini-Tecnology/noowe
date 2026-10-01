import React, { useState, useEffect } from 'react';
import { View, StyleSheet, FlatList, RefreshControl, Alert, TouchableOpacity } from 'react-native';
import { Text, Card, IconButton, ActivityIndicator, FAB, Button, TextInput, Portal, Modal } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { format } from 'date-fns';
import ApiService from '@/shared/services/api';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { t } from '@okinawa/shared/i18n';
import logger from '@okinawa/shared/utils/logger';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';

interface Review {
  id: string;
  restaurant_id: string;
  order_id?: string;
  rating: number;
  comment?: string;
  created_at: string;
  updated_at?: string;
  response?: string;
  restaurant?: {
    id: string;
    name: string;
    image_url?: string;
  };
}

export default function ReviewsScreen() {
  const navigation = useNavigation();
  const colors = useColors();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingReview, setEditingReview] = useState<Review | null>(null);
  const [editRating, setEditRating] = useState(5);
  const [editComment, setEditComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadReviews();
  }, []);

  const loadReviews = async () => {
    try {
      setLoading(true);
      const data = await ApiService.getMyReviews();
      setReviews(data);
    } catch (error) {
      logger.error('Failed to load reviews:', error);
      Alert.alert('Erro', 'Não foi possível carregar as avaliações.');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadReviews();
    setRefreshing(false);
  };

  const handleEditReview = (review: Review) => {
    setEditingReview(review);
    setEditRating(review.rating);
    setEditComment(review.comment || '');
    setEditModalVisible(true);
  };

  const handleSaveEdit = async () => {
    if (!editingReview) return;

    if (editRating < 1 || editRating > 5) {
      Alert.alert('Erro', 'Escolha uma nota de 1 a 5 estrelas.');
      return;
    }

    setSubmitting(true);
    try {
      const updatedReview = await ApiService.updateReview(editingReview.id, {
        rating: editRating,
        comment: editComment
      });

      setReviews(reviews.map(r =>
        r.id === editingReview.id
          ? { ...r, rating: editRating, comment: editComment, updated_at: updatedReview.updated_at || new Date().toISOString() }
          : r
      ));

      Alert.alert('Pronto', 'Avaliação atualizada com sucesso.');
      setEditModalVisible(false);
    } catch (error: any) {
      Alert.alert('Erro', 'Não foi possível atualizar a avaliação. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReportReview = (review: Review) => {
    Alert.alert(
      'Reportar Review',
      'Deseja denunciar esta avaliação por conteúdo impróprio?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Reportar',
          onPress: async () => {
            try {
              await ApiService.post(`/reviews/${review.id}/report`, {
                reason: 'inappropriate_content',
              });
              Alert.alert('Obrigado', 'Sua denúncia foi enviada e será analisada pela nossa equipe.');
            } catch {
              Alert.alert('Erro', 'Não foi possível enviar a denúncia. Tente novamente.');
            }
          },
        },
      ],
    );
  };

  const handleDeleteReview = (review: Review) => {
    Alert.alert(
      'Excluir avaliação',
      'Tem certeza de que deseja excluir esta avaliação?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              await ApiService.deleteReview(review.id);

              setReviews(reviews.filter(r => r.id !== review.id));
              Alert.alert('Pronto', 'Avaliação excluída com sucesso.');
            } catch (error: any) {
              Alert.alert('Erro', 'Não foi possível excluir a avaliação. Tente novamente.');
            }
          },
        },
      ]
    );
  };

  const renderStars = (rating: number, interactive: boolean = false, onPress?: (star: number) => void) => {
    return (
      <View style={styles.starsContainer}>
        {[1, 2, 3, 4, 5].map((star) => (
          <TouchableOpacity
            key={star}
            onPress={() => interactive && onPress && onPress(star)}
            disabled={!interactive}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole={interactive ? 'button' : undefined}
            accessibilityLabel={interactive ? `Rate ${star} star${star !== 1 ? 's' : ''}` : undefined}
            accessibilityState={interactive ? { selected: star <= rating } : undefined}
          >
            <IconButton
              icon={star <= rating ? 'star' : 'star-outline'}
              size={interactive ? 32 : 16}
              iconColor={colors.warning}
              style={styles.starIcon}
            />
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const styles = createStyles(colors);

  if (loading) {
    return (
      <ScreenContainer>
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Carregando avaliações...</Text>
      </View>
    
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer hasKeyboard>
    <View style={styles.container}>
      <FlatList
        data={reviews}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.listContent}
        getItemLayout={(_, index) => ({
          length: 160,
          offset: 160 * index,
          index,
        })}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <IconButton icon="star-outline" size={80} iconColor={colors.foregroundMuted} />
            <Text variant="headlineSmall" style={styles.emptyTitle}>
              No Reviews Yet
            </Text>
            <Text variant="bodyMedium" style={styles.emptyText}>
              Rate your favorite restaurants and help others discover great places!
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Card style={styles.card}>
            <Card.Content>
              <View style={styles.cardHeader}>
                <View style={styles.restaurantInfo}>
                  <Text variant="titleMedium" style={styles.restaurantName}>
                    {item.restaurant?.name || 'Restaurant'}
                  </Text>
                  {renderStars(item.rating)}
                </View>
                <View style={styles.actions}>
                  <IconButton
                    icon="pencil"
                    size={20}
                    onPress={() => handleEditReview(item)}
                    iconColor={colors.primary}
                    accessibilityLabel={`Edit review for ${item.restaurant?.name || 'restaurant'}`}
                  />
                  <IconButton
                    icon="delete"
                    size={20}
                    onPress={() => handleDeleteReview(item)}
                    iconColor={colors.error}
                    accessibilityLabel={`Delete review for ${item.restaurant?.name || 'restaurant'}`}
                  />
                  <IconButton
                    icon="flag"
                    size={20}
                    onPress={() => handleReportReview(item)}
                    iconColor={colors.foregroundMuted}
                    accessibilityLabel={`Report review for ${item.restaurant?.name || 'restaurant'}`}
                  />
                </View>
              </View>

              {item.comment && (
                <Text variant="bodyMedium" style={styles.comment}>
                  {item.comment}
                </Text>
              )}

              <View style={styles.footer}>
                <Text variant="bodySmall" style={styles.date}>
                  {format(new Date(item.created_at), 'MMM d, yyyy')}
                </Text>
                {item.updated_at && item.updated_at !== item.created_at && (
                  <Text variant="bodySmall" style={styles.edited}>
                    (edited)
                  </Text>
                )}
              </View>

              {item.response && (
                <View style={styles.responseContainer}>
                  <Text variant="labelMedium" style={styles.responseTitle}>
                    Restaurant Response:
                  </Text>
                  <Text variant="bodySmall" style={styles.response}>
                    {item.response}
                  </Text>
                </View>
              )}
            </Card.Content>
          </Card>
        )}
      />

      <Portal>
        <Modal
          visible={editModalVisible}
          onDismiss={() => setEditModalVisible(false)}
          contentContainerStyle={styles.modalContainer}
        >
          <Card style={{ backgroundColor: colors.card }}>
            <Card.Title title="Edit Review" titleStyle={{ color: colors.foreground }} />
            <Card.Content>
              <Text variant="titleMedium" style={styles.modalRestaurantName}>
                {editingReview?.restaurant?.name}
              </Text>

              <View style={styles.ratingSection}>
                <Text variant="bodyMedium" style={styles.ratingLabel}>
                  Your Rating
                </Text>
                {renderStars(editRating, true, setEditRating)}
              </View>

              <TextInput
                label={t('formLabels.yourReviewOptional')}
                value={editComment}
                onChangeText={setEditComment}
                mode="outlined"
                multiline
                numberOfLines={4}
                placeholder={t('placeholders.shareExperience')}
                style={styles.commentInput}
                accessibilityLabel="Your review comment"
              />
            </Card.Content>
            <Card.Actions>
              <Button onPress={() => setEditModalVisible(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button
                mode="contained"
                onPress={handleSaveEdit}
                loading={submitting}
                disabled={submitting}
                style={styles.saveButton}
              >
                Save Changes
              </Button>
            </Card.Actions>
          </Card>
        </Modal>
      </Portal>

      <FAB
        icon="plus"
        style={[styles.fab, { backgroundColor: colors.primary }]}
        onPress={() => navigation.navigate('Orders' as never)}
        label={t('formLabels.writeReview')}
      />
    </View>
  
    </ScreenContainer>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  loadingText: {
    marginTop: 15,
    color: colors.foregroundMuted,
  },
  listContent: {
    padding: 16,
  },
  card: {
    marginBottom: 15,
    backgroundColor: colors.card,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  restaurantInfo: {
    flex: 1,
  },
  restaurantName: {
    marginBottom: 5,
    color: colors.foreground,
  },
  actions: {
    flexDirection: 'row',
  },
  starsContainer: {
    flexDirection: 'row',
    marginTop: 4,
  },
  starIcon: {
    margin: 0,
    padding: 0,
  },
  comment: {
    marginBottom: 10,
    color: colors.foreground,
    lineHeight: 20,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  date: {
    color: colors.foregroundMuted,
  },
  edited: {
    color: colors.foregroundMuted,
    marginLeft: 5,
    fontStyle: 'italic',
  },
  responseContainer: {
    marginTop: 15,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.warningBackground,
    padding: 10,
    borderRadius: 5,
  },
  responseTitle: {
    marginBottom: 5,
    color: colors.foregroundMuted,
    fontWeight: '600',
  },
  response: {
    color: colors.foregroundMuted,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 100,
  },
  emptyTitle: {
    marginTop: 20,
    textAlign: 'center',
    color: colors.foreground,
  },
  emptyText: {
    marginTop: 10,
    color: colors.foregroundMuted,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
  },
  modalContainer: {
    margin: 20,
    borderRadius: 8,
  },
  modalRestaurantName: {
    textAlign: 'center',
    marginBottom: 20,
    color: colors.foreground,
  },
  ratingSection: {
    alignItems: 'center',
    marginBottom: 20,
  },
  ratingLabel: {
    marginBottom: 10,
    color: colors.foreground,
  },
  commentInput: {
    minHeight: 100,
    backgroundColor: colors.background,
  },
  saveButton: {
    backgroundColor: colors.primary,
  },
});
