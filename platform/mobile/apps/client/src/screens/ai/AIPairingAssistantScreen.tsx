import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { fontSize, fontWeight } from '@okinawa/shared/theme/typography';
import { spacing } from '@okinawa/shared/theme/spacing';
import { BetaBadge } from '@okinawa/shared/components/BetaBadge';
import ApiService from '@okinawa/shared/services/api';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import { usePullToRefresh } from '@okinawa/shared/hooks/usePullToRefresh';

interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  image: string;
  category: string;
}

interface Pairing {
  id: string;
  item: MenuItem;
  reason: string;
  matchScore: number;
  type: 'beverage' | 'side' | 'dessert';
}

interface AIPairingAssistantScreenProps {
  navigation: any;
  route: {
    params: {
      selectedItems: MenuItem[];
      restaurantId?: string;
    };
  };
}

export const AIPairingAssistantScreen: React.FC<AIPairingAssistantScreenProps> = ({
  navigation,
  route,
}) => {
  const colors = useColors();
  const { selectedItems, restaurantId } = route.params;

  const [pairings, setPairings] = useState<Pairing[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPairings, setSelectedPairings] = useState<string[]>([]);

  // Mock pairings used as fallback when API is unavailable
  const mockPairings: Pairing[] = useMemo(() => [
    {
      id: '1',
      item: {
        id: 'w1',
        name: 'Vinho Tinto Reserva',
        description: 'Cabernet Sauvignon chileno, notas de frutas vermelhas',
        price: 89.90,
        image: 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=200',
        category: 'Vinhos',
      },
      reason: 'Harmoniza perfeitamente com carnes vermelhas, realçando os sabores.',
      matchScore: 95,
      type: 'beverage',
    },
    {
      id: '2',
      item: {
        id: 'b1',
        name: 'Cerveja Artesanal IPA',
        description: 'IPA com notas cítricas e amargor equilibrado',
        price: 24.90,
        image: 'https://images.unsplash.com/photo-1566633806327-68e152aaf26d?w=200',
        category: 'Cervejas',
      },
      reason: 'O amargor complementa pratos condimentados e gordurosos.',
      matchScore: 88,
      type: 'beverage',
    },
    {
      id: '3',
      item: {
        id: 's1',
        name: 'Batatas Rústicas',
        description: 'Batatas assadas com ervas finas e alho',
        price: 18.90,
        image: 'https://images.unsplash.com/photo-1518013431117-eb1465fa5752?w=200',
        category: 'Acompanhamentos',
      },
      reason: 'Acompanhamento clássico que equilibra texturas do prato principal.',
      matchScore: 92,
      type: 'side',
    },
    {
      id: '4',
      item: {
        id: 'd1',
        name: 'Petit Gâteau',
        description: 'Bolo de chocolate com centro cremoso e sorvete',
        price: 32.90,
        image: 'https://images.unsplash.com/photo-1624353365286-3f8d62daad51?w=200',
        category: 'Sobremesas',
      },
      reason: 'Finalização perfeita após refeição salgada, contraste de temperaturas.',
      matchScore: 90,
      type: 'dessert',
    },
  ], []);

  useEffect(() => {
    generatePairings();
  }, []);

  const generatePairings = async () => {
    setLoading(true);
    try {
      if (restaurantId) {
        const recommendations = await ApiService.getMenuRecommendations(restaurantId);

        if (recommendations && Array.isArray(recommendations) && recommendations.length > 0) {
          // Map API MenuRecommendation[] to Pairing[] format
          const apiPairings: Pairing[] = recommendations.map((rec: any, index: number) => ({
            id: rec.item_id || String(index + 1),
            item: {
              id: rec.item_id,
              name: rec.item_name,
              description: rec.reason,
              price: rec.price || 0,
              image: rec.image_url || `https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=200`,
              category: rec.category || '',
            },
            reason: rec.reason,
            matchScore: rec.confidence || 80,
            type: (rec.pairing_type as Pairing['type']) || 'side',
          }));
          setPairings(apiPairings);
          setLoading(false);
          return;
        }
      }
      // Fallback to mock data if no restaurantId or API returned empty
      setPairings(mockPairings);
    } catch (error) {
      console.warn('AI recommendations API failed, using mock data:', error);
      setPairings(mockPairings);
    } finally {
      setLoading(false);
    }
  };

  const pullToRefresh = usePullToRefresh(generatePairings);

  const togglePairing = (id: string) => {
    setSelectedPairings(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const addSelectedToOrder = () => {
    const itemsToAdd = pairings
      .filter(p => selectedPairings.includes(p.id))
      .map(p => p.item);
    navigation.navigate('SharedOrder', { addItems: itemsToAdd });
  };

  const getTypeLabel = (type: Pairing['type']) => {
    switch (type) {
      case 'beverage': return 'Bebida';
      case 'side': return 'Acompanhamento';
      case 'dessert': return 'Sobremesa';
    }
  };

  const getTypeIcon = (type: Pairing['type']) => {
    switch (type) {
      case 'beverage': return 'wine';
      case 'side': return 'restaurant';
      case 'dessert': return 'ice-cream';
    }
  };

  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ position: 'relative' }}>
          <BetaBadge visible={true} />
          <Text style={styles.title}>
            Assistente de Harmonização
          </Text>
        </View>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.selectedSummary}>
        <Text style={styles.summaryLabel}>
          Baseado nos seus itens:
        </Text>
        <Text style={styles.summaryItems}>
          {selectedItems.map(i => i.name).join(', ')}
        </Text>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>
            Analisando combinações perfeitas...
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={pullToRefresh.refreshing} onRefresh={() => { void pullToRefresh.onRefresh(); }} tintColor={colors.primary} colors={[colors.primary]} />}
        >
          <Text style={styles.sectionTitle}>
            Sugestões da IA
          </Text>

          {pairings.map(pairing => (
            <TouchableOpacity
              key={pairing.id}
              style={[
                styles.pairingCard,
                selectedPairings.includes(pairing.id) && styles.pairingCardSelected,
              ]}
              onPress={() => togglePairing(pairing.id)}
              accessibilityRole="button"
              accessibilityLabel={`${pairing.item.name}: ${getTypeLabel(pairing.type)}, ${pairing.matchScore}% match, R$ ${pairing.item.price.toFixed(2)}`}
              accessibilityState={{ selected: selectedPairings.includes(pairing.id) }}
            >
              <Image
                source={{ uri: pairing.item.image }}
                style={styles.itemImage}
                accessibilityLabel={pairing.item.name}
              />
              
              <View style={styles.pairingContent}>
                <View style={styles.pairingHeader}>
                  <View style={styles.typeTag}>
                    <Ionicons
                      name={getTypeIcon(pairing.type) as any}
                      size={12}
                      color={colors.primary}
                    />
                    <Text style={styles.typeText}>
                      {getTypeLabel(pairing.type)}
                    </Text>
                  </View>
                  <View style={styles.matchBadge}>
                    <Text style={styles.matchText}>{pairing.matchScore}%</Text>
                  </View>
                </View>

                <Text style={styles.itemName}>
                  {pairing.item.name}
                </Text>
                <Text style={styles.itemDescription}>
                  {pairing.item.description}
                </Text>
                
                <View style={styles.reasonBox}>
                  <Ionicons name="sparkles" size={14} color={colors.primary} />
                  <Text style={styles.reasonText}>
                    {pairing.reason}
                  </Text>
                </View>

                <Text style={styles.price}>
                  R$ {pairing.item.price.toFixed(2)}
                </Text>
              </View>

              <View style={styles.checkbox}>
                <Ionicons
                  name={selectedPairings.includes(pairing.id) ? 'checkbox' : 'square-outline'}
                  size={24}
                  color={selectedPairings.includes(pairing.id) ? colors.primary : colors.foregroundMuted}
                />
              </View>
            </TouchableOpacity>
          ))}

          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      {selectedPairings.length > 0 && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.addButton}
            onPress={addSelectedToOrder}
            accessibilityRole="button"
            accessibilityLabel={`Add ${selectedPairings.length} item${selectedPairings.length !== 1 ? 's' : ''} to order`}
          >
            <Text style={styles.addButtonText}>
              Adicionar {selectedPairings.length} item(s) ao pedido
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </ScreenContainer>
  );
};

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold as any,
    color: colors.foreground,
  },
  selectedSummary: {
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    borderRadius: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: colors.card,
  },
  summaryLabel: {
    fontSize: fontSize.xs,
    marginBottom: spacing.xs,
    color: colors.foregroundMuted,
  },
  summaryItems: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
    color: colors.foreground,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  loadingText: {
    fontSize: fontSize.md,
    color: colors.foregroundMuted,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold as any,
    marginBottom: spacing.md,
    color: colors.foreground,
  },
  pairingCard: {
    flexDirection: 'row',
    borderRadius: spacing.lg,
    borderWidth: 2,
    marginBottom: spacing.md,
    overflow: 'hidden',
    backgroundColor: colors.card,
    borderColor: colors.border,
  },
  pairingCardSelected: {
    borderColor: colors.primary,
    backgroundColor: `${colors.primary}10`,
  },
  itemImage: {
    width: 100,
    height: '100%',
    minHeight: 150,
  },
  pairingContent: {
    flex: 1,
    padding: spacing.md,
  },
  pairingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  typeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: spacing.sm,
    backgroundColor: `${colors.primary}20`,
  },
  typeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium as any,
    color: colors.primary,
  },
  matchBadge: {
    backgroundColor: colors.success,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: spacing.sm,
  },
  matchText: {
    color: colors.premiumCardForeground,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold as any,
  },
  itemName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold as any,
    marginBottom: 2,
    color: colors.foreground,
  },
  itemDescription: {
    fontSize: fontSize.xs,
    marginBottom: spacing.sm,
    color: colors.foregroundMuted,
  },
  reasonBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: spacing.sm,
    marginBottom: spacing.sm,
    backgroundColor: colors.backgroundTertiary,
  },
  reasonText: {
    flex: 1,
    fontSize: fontSize.xs,
    lineHeight: 16,
    color: colors.foreground,
  },
  price: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold as any,
    color: colors.primary,
  },
  checkbox: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    backgroundColor: colors.background,
  },
  addButton: {
    paddingVertical: spacing.md,
    borderRadius: spacing.lg,
    alignItems: 'center',
    backgroundColor: colors.primary,
  },
  addButtonText: {
    color: colors.primaryForeground,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold as any,
  },
});

export default AIPairingAssistantScreen;
