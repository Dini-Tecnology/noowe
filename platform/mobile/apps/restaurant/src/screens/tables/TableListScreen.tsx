import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from 'react-native';
import {
  Text,
  FAB,
  Searchbar,
  Chip,
  IconButton,
  ActivityIndicator,
  Portal,
  Dialog,
  Button,
} from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { t } from '@okinawa/shared/i18n';
import { useRestaurant } from '@/shared/contexts/RestaurantContext';
import ApiService from '@/shared/services/api';
import { Card, Badge } from '@okinawa/shared/components';

interface Table {
  id: string;
  table_number: string;
  seats: number;
  status: 'available' | 'occupied' | 'reserved' | 'cleaning' | 'maintenance' | 'blocked';
  section?: string;
  qr_code?: string;
  notes?: string;
}

const statusConfig = {
  available: { label: 'Disponível', color: 'success', icon: 'check-circle' },
  occupied: { label: 'Ocupada', color: 'error', icon: 'account-group' },
  reserved: { label: 'Reservada', color: 'warning', icon: 'calendar-clock' },
  cleaning: { label: 'Limpeza', color: 'info', icon: 'broom' },
  maintenance: { label: 'Manutenção', color: 'default', icon: 'wrench' },
  blocked: { label: 'Bloqueada', color: 'default', icon: 'block-helper' },
};

export default function TableListScreen() {
  const navigation = useNavigation();
  const colors = useColors();
  const { restaurantId } = useRestaurant();

  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [tableToDelete, setTableToDelete] = useState<Table | null>(null);

  const fetchTables = useCallback(async () => {
    if (!restaurantId) return;
    
    try {
      const response = await ApiService.getTables();
      setTables(response.items || response);
    } catch (error) {
      console.error('Error fetching tables:', error);
      Alert.alert('Erro', 'Não foi possível carregar as mesas');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    fetchTables();
  }, [fetchTables]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchTables();
  }, [fetchTables]);

  const filteredTables = useMemo(() => {
    let filtered = tables;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (table) =>
          table.table_number.toLowerCase().includes(query) ||
          table.section?.toLowerCase().includes(query)
      );
    }

    if (statusFilter) {
      filtered = filtered.filter((table) => table.status === statusFilter);
    }

    return filtered.sort((a, b) => a.table_number.localeCompare(b.table_number));
  }, [tables, searchQuery, statusFilter]);

  const handleDeleteTable = async () => {
    if (!tableToDelete) return;

    try {
      await ApiService.deleteTable(tableToDelete.id);
      setTables((prev) => prev.filter((t) => t.id !== tableToDelete.id));
      setDeleteDialogVisible(false);
      setTableToDelete(null);
    } catch (error) {
      console.error('Error deleting table:', error);
      Alert.alert('Erro', 'Não foi possível excluir a mesa');
    }
  };

  const confirmDelete = (table: Table) => {
    if (table.status === 'occupied') {
      Alert.alert('Atenção', 'Não é possível excluir uma mesa ocupada');
      return;
    }
    setTableToDelete(table);
    setDeleteDialogVisible(true);
  };

  const styles = useMemo(() => createStyles(colors), [colors]);

  const renderTableCard = ({ item }: { item: Table }) => {
    const config = statusConfig[item.status];

    return (
      <TouchableOpacity
        onPress={() => (navigation as any).navigate('TableDetail', { tableId: item.id })}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Mesa ${item.table_number}, ${item.seats} lugares, ${config.label}`}
      >
        <Card style={styles.tableCard}>
          <View style={styles.cardContent}>
            <View style={styles.tableInfo}>
              <View style={styles.tableHeader}>
                <Text style={styles.tableNumber}>{item.table_number}</Text>
                <Chip compact style={{ height: 24 }} textStyle={{ fontSize: 12 }}>
                  {config.label}
                </Chip>
              </View>

              <View style={styles.tableDetails}>
                <View style={styles.detailRow}>
                  <Icon name="seat" size={16} color={colors.foregroundMuted} />
                  <Text style={styles.detailText}>{item.seats} lugares</Text>
                </View>
                {item.section && (
                  <View style={styles.detailRow}>
                    <Icon name="map-marker" size={16} color={colors.foregroundMuted} />
                    <Text style={styles.detailText}>{item.section}</Text>
                  </View>
                )}
              </View>

              {item.qr_code && (
                <View style={styles.qrBadge}>
                  <Icon name="qrcode" size={14} color={colors.success} />
                  <Text style={styles.qrText}>QR Ativo</Text>
                </View>
              )}
            </View>

            <View style={styles.cardActions}>
              <IconButton
                icon="qrcode-plus"
                size={20}
                onPress={() =>
                  (navigation as any).navigate('QRCodeGenerator', { tableId: item.id })
                }
                iconColor={colors.primary}
                accessibilityRole="button"
                accessibilityLabel={`Gerar QR Code para mesa ${item.table_number}`}
              />
              <IconButton
                icon="pencil"
                size={20}
                onPress={() =>
                  (navigation as any).navigate('TableForm', { tableId: item.id })
                }
                iconColor={colors.foregroundMuted}
                accessibilityRole="button"
                accessibilityLabel={`Editar mesa ${item.table_number}`}
              />
              <IconButton
                icon="delete"
                size={20}
                onPress={() => confirmDelete(item)}
                iconColor={colors.destructive}
                accessibilityRole="button"
                accessibilityLabel={`Excluir mesa ${item.table_number}`}
              />
            </View>
          </View>
        </Card>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <ScreenContainer>
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Carregando mesas...</Text>
      </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Searchbar
          placeholder={t('placeholders.searchTables')}
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={styles.searchbar}
          inputStyle={styles.searchInput}
          iconColor={colors.foregroundMuted}
          accessibilityLabel="Buscar mesas"
        />
      </View>

      {/* Status Filters */}
      <View style={styles.filtersContainer}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={[
            { key: null, label: 'Todas' },
            ...Object.entries(statusConfig).map(([key, config]) => ({
              key,
              label: config.label,
            })),
          ]}
          keyExtractor={(item) => item.key || 'all'}
          renderItem={({ item }) => (
            <Chip
              selected={statusFilter === item.key}
              onPress={() => setStatusFilter(item.key)}
              style={[
                styles.filterChip,
                statusFilter === item.key && styles.filterChipSelected,
              ]}
              textStyle={[
                styles.filterChipText,
                statusFilter === item.key && styles.filterChipTextSelected,
              ]}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: statusFilter === item.key }}
            >
              {item.label}
            </Chip>
          )}
          contentContainerStyle={styles.filtersContent}
        />
      </View>

      {/* Tables List */}
      <FlatList
        data={filteredTables}
        keyExtractor={(item) => item.id}
        renderItem={renderTableCard}
        contentContainerStyle={styles.listContent}
        getItemLayout={(_, index) => ({
          length: 112,
          offset: 112 * index,
          index,
        })}
        windowSize={10}
        initialNumToRender={15}
        maxToRenderPerBatch={10}
        removeClippedSubviews={true}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="table-furniture" size={64} color={colors.foregroundMuted} />
            <Text style={styles.emptyTitle}>Nenhuma mesa encontrada</Text>
            <Text style={styles.emptySubtitle}>
              {searchQuery || statusFilter
                ? 'Tente ajustar os filtros'
                : 'Adicione sua primeira mesa'}
            </Text>
          </View>
        }
      />

      {/* FAB to add new table */}
      <FAB
        icon="plus"
        style={[styles.fab, { backgroundColor: colors.primary }]}
        color={colors.primaryForeground}
        onPress={() => (navigation as any).navigate('TableForm')}
        accessibilityRole="button"
        accessibilityLabel="Adicionar nova mesa"
      />

      {/* Delete Confirmation Dialog */}
      <Portal>
        <Dialog visible={deleteDialogVisible} onDismiss={() => setDeleteDialogVisible(false)}>
          <Dialog.Title>Excluir Mesa</Dialog.Title>
          <Dialog.Content>
            <Text>
              Tem certeza que deseja excluir a mesa {tableToDelete?.table_number}? Esta ação
              não pode ser desfeita.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button
              onPress={() => setDeleteDialogVisible(false)}
              accessibilityRole="button"
              accessibilityLabel="Cancelar exclusão"
            >
              Cancelar
            </Button>
            <Button
              onPress={handleDeleteTable}
              textColor={colors.destructive}
              accessibilityRole="button"
              accessibilityLabel={`Confirmar exclusão da mesa ${tableToDelete?.table_number}`}
            >
              Excluir
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
    </ScreenContainer>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    centerContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background,
    },
    loadingText: {
      marginTop: 12,
      color: colors.foregroundMuted,
    },
    searchContainer: {
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 8,
    },
    searchbar: {
      backgroundColor: colors.card,
      elevation: 0,
      borderRadius: 12,
    },
    searchInput: {
      color: colors.foreground,
    },
    filtersContainer: {
      paddingVertical: 8,
    },
    filtersContent: {
      paddingHorizontal: 16,
      gap: 8,
    },
    filterChip: {
      backgroundColor: colors.card,
      marginRight: 8,
    },
    filterChipSelected: {
      backgroundColor: colors.primary,
    },
    filterChipText: {
      color: colors.foreground,
    },
    filterChipTextSelected: {
      color: colors.primaryForeground,
    },
    listContent: {
      padding: 16,
      paddingBottom: 100,
    },
    tableCard: {
      marginBottom: 12,
      borderRadius: 12,
    },
    cardContent: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
    },
    tableInfo: {
      flex: 1,
    },
    tableHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 8,
    },
    tableNumber: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.foreground,
    },
    tableDetails: {
      flexDirection: 'row',
      gap: 16,
    },
    detailRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    detailText: {
      fontSize: 14,
      color: colors.foregroundMuted,
    },
    qrBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 8,
    },
    qrText: {
      fontSize: 12,
      color: colors.success,
      fontWeight: '500',
    },
    cardActions: {
      flexDirection: 'row',
    },
    emptyContainer: {
      alignItems: 'center',
      paddingVertical: 60,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.foreground,
      marginTop: 16,
    },
    emptySubtitle: {
      fontSize: 14,
      color: colors.foregroundMuted,
      marginTop: 4,
    },
    fab: {
      position: 'absolute',
      right: 16,
      bottom: 24,
    },
  });
