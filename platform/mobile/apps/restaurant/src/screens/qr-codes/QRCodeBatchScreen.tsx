import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  Image,
} from 'react-native';
import {
  Text,
  Button,
  Checkbox,
  ActivityIndicator,
  ProgressBar,
} from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { useRestaurant } from '@/shared/contexts/RestaurantContext';
import ApiService from '@/shared/services/api';
import logger from '@okinawa/shared/utils/logger';
import { Card, Badge } from '@okinawa/shared/components';

type QRStyle = 'minimal' | 'premium' | 'bold' | 'elegant';

interface Table {
  id: string;
  table_number: string;
  seats: number;
  section?: string;
  qr_code?: string;
}

interface GeneratedQR {
  table_id: string;
  table_number: string;
  qr_code_image: string;
  qr_code_data: string;
}

const getStyleConfigs = (colors: any) => ([
  { id: 'minimal', name: 'Minimal', color: colors.foreground },
  { id: 'premium', name: 'Premium', color: colors.primary },
  { id: 'bold', name: 'Bold', color: colors.foreground },
  { id: 'elegant', name: 'Elegant', color: colors.foregroundSecondary },
]);

export default function QRCodeBatchScreen() {
  const navigation = useNavigation();
  const colors = useColors();
  const styleConfigs = getStyleConfigs(colors);
  const { restaurantId, restaurant } = useRestaurant();

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [tables, setTables] = useState<Table[]>([]);
  const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set());
  const [selectedStyle, setSelectedStyle] = useState<QRStyle>('premium');
  const [generatedQRs, setGeneratedQRs] = useState<GeneratedQR[]>([]);

  const fetchTables = useCallback(async () => {
    if (!restaurantId) return;

    try {
      const response = await ApiService.getTables();
      const tableList = response.items || response;
      setTables(tableList);

      // Select all tables by default
      setSelectedTables(new Set(tableList.map((t: Table) => t.id)));
    } catch (error) {
      logger.error('Error fetching tables', error);
      Alert.alert('Erro', 'Não foi possível carregar as mesas');
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    fetchTables();
  }, [fetchTables]);

  const toggleTableSelection = (tableId: string) => {
    setSelectedTables((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(tableId)) {
        newSet.delete(tableId);
      } else {
        newSet.add(tableId);
      }
      return newSet;
    });
  };

  const selectAll = () => {
    setSelectedTables(new Set(tables.map((t) => t.id)));
  };

  const deselectAll = () => {
    setSelectedTables(new Set());
  };

  const handleBatchGenerate = async () => {
    if (selectedTables.size === 0) {
      Alert.alert('Atenção', 'Selecione pelo menos uma mesa');
      return;
    }

    setGenerating(true);
    setProgress(0);
    setGeneratedQRs([]);

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const tableIds = Array.from(selectedTables);
      const styleConfig = styleConfigs.find((s) => s.id === selectedStyle);

      const result = await ApiService.batchGenerateTableQRCodes(restaurantId!, {
        table_ids: tableIds,
        style: selectedStyle,
        color_primary: styleConfig?.color,
      });

      setGeneratedQRs(result.qr_codes || []);
      setProgress(1);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        'Sucesso',
        `${result.total_generated || tableIds.length} QR Codes gerados com sucesso!`
      );
    } catch (error) {
      logger.error('Error batch generating QR codes', error);
      Alert.alert('Erro', 'Não foi possível gerar os QR Codes');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setGenerating(false);
    }
  };

  const handleExportAll = async () => {
    if (generatedQRs.length === 0) {
      Alert.alert('Atenção', 'Gere os QR Codes primeiro');
      return;
    }

    try {
      // Create a folder with all QR codes
      const folderName = `qr-codes-${restaurant?.name || 'restaurant'}-${Date.now()}`;
      const folderUri = `${FileSystem.cacheDirectory}${folderName}/`;

      await FileSystem.makeDirectoryAsync(folderUri, { intermediates: true });

      // Save all QR codes
      for (const qr of generatedQRs) {
        const base64Data = qr.qr_code_image.replace('data:image/png;base64,', '');
        const fileName = `${qr.table_number.replace(/[^a-zA-Z0-9]/g, '-')}.png`;
        await FileSystem.writeAsStringAsync(`${folderUri}${fileName}`, base64Data, {
          encoding: FileSystem.EncodingType.Base64,
        });
      }

      // Share the first file (iOS/Android limitation - can't share folders directly)
      if (await Sharing.isAvailableAsync()) {
        const firstFile = `${folderUri}${generatedQRs[0].table_number.replace(/[^a-zA-Z0-9]/g, '-')}.png`;
        await Sharing.shareAsync(firstFile, {
          mimeType: 'image/png',
          dialogTitle: 'Exportar QR Codes',
        });
      }

      Alert.alert('Sucesso', 'QR Codes exportados com sucesso');
    } catch (error) {
      logger.error('Error exporting QR codes', error);
      Alert.alert('Erro', 'Não foi possível exportar os QR Codes');
    }
  };

  const styles = useMemo(() => createStyles(colors), [colors]);

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
      {/* Header Stats */}
      <Card style={styles.statsCard}>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{tables.length}</Text>
            <Text style={styles.statLabel}>Mesas</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{selectedTables.size}</Text>
            <Text style={styles.statLabel}>Selecionadas</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{generatedQRs.length}</Text>
            <Text style={styles.statLabel}>Geradas</Text>
          </View>
        </View>
      </Card>

      {/* Style Selector */}
      <View style={styles.styleSelector}>
        <Text style={styles.sectionTitle}>Estilo</Text>
        <View style={styles.styleChips}>
          {styleConfigs.map((config) => (
            <TouchableOpacity
              key={config.id}
              style={[
                styles.styleChip,
                selectedStyle === config.id && styles.styleChipSelected,
                { borderColor: selectedStyle === config.id ? config.color : colors.border },
              ]}
              onPress={() => setSelectedStyle(config.id as QRStyle)}
              accessibilityRole="button"
              accessibilityLabel={`Select ${config.name} style`}
              accessibilityState={{ selected: selectedStyle === config.id }}
            >
              <View
                style={[styles.styleChipDot, { backgroundColor: config.color }]}
              />
              <Text
                style={[
                  styles.styleChipText,
                  selectedStyle === config.id && styles.styleChipTextSelected,
                ]}
              >
                {config.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Selection Actions */}
      <View style={styles.selectionActions}>
        <Text style={styles.sectionTitle}>Mesas</Text>
        <View style={styles.selectionButtons}>
          <Button mode="text" onPress={selectAll} compact textColor={colors.primary} accessibilityRole="button" accessibilityLabel="Select all tables">
            Selecionar Todas
          </Button>
          <Button mode="text" onPress={deselectAll} compact textColor={colors.foregroundMuted} accessibilityRole="button" accessibilityLabel="Deselect all tables">
            Limpar
          </Button>
        </View>
      </View>

      {/* Tables List */}
      <FlatList
        data={tables}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.tableRow}
        contentContainerStyle={styles.listContent}
        getItemLayout={(_, index) => ({
          length: 64,
          offset: 64 * index,
          index,
        })}
        renderItem={({ item }) => {
          const isSelected = selectedTables.has(item.id);
          const hasQR = generatedQRs.find((qr) => qr.table_id === item.id);

          return (
            <TouchableOpacity
              style={[
                styles.tableCard,
                isSelected && styles.tableCardSelected,
                { borderColor: isSelected ? colors.primary : colors.border },
              ]}
              onPress={() => toggleTableSelection(item.id)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Table ${item.table_number}, ${item.seats} seats`}
              accessibilityState={{ selected: isSelected }}
            >
              <Checkbox
                status={isSelected ? 'checked' : 'unchecked'}
                onPress={() => toggleTableSelection(item.id)}
                color={colors.primary}
              />
              <View style={styles.tableInfo}>
                <Text style={styles.tableNumber}>{item.table_number}</Text>
                <Text style={styles.tableSeats}>{item.seats} lugares</Text>
              </View>
              {hasQR && (
                <Icon name="check-circle" size={20} color={colors.success} />
              )}
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="table-furniture" size={48} color={colors.foregroundMuted} />
            <Text style={styles.emptyText}>Nenhuma mesa cadastrada</Text>
          </View>
        }
      />

      {/* Progress Bar */}
      {generating && (
        <View style={styles.progressContainer}>
          <ProgressBar progress={progress} color={colors.primary} style={styles.progressBar} />
          <Text style={styles.progressText}>Gerando QR Codes...</Text>
        </View>
      )}

      {/* Action Buttons */}
      <View style={styles.actionButtons}>
        {generatedQRs.length > 0 ? (
          <Button
            mode="contained"
            onPress={handleExportAll}
            style={styles.actionButton}
            contentStyle={styles.actionButtonContent}
            buttonColor={colors.primary}
            textColor={colors.primaryForeground}
            icon="download"
            accessibilityRole="button"
            accessibilityLabel={`Export all ${generatedQRs.length} QR codes`}
          >
            Exportar Todos ({generatedQRs.length})
          </Button>
        ) : (
          <Button
            mode="contained"
            onPress={handleBatchGenerate}
            loading={generating}
            disabled={generating || selectedTables.size === 0}
            style={styles.actionButton}
            contentStyle={styles.actionButtonContent}
            buttonColor={colors.primary}
            textColor={colors.primaryForeground}
            icon="qrcode-plus"
            accessibilityRole="button"
            accessibilityLabel={`Generate QR codes for ${selectedTables.size} tables`}
          >
            Gerar {selectedTables.size} QR Codes
          </Button>
        )}
      </View>
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
    statsCard: {
      margin: 16,
      padding: 16,
      borderRadius: 12,
    },
    statsRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      alignItems: 'center',
    },
    statItem: {
      alignItems: 'center',
    },
    statValue: {
      fontSize: 28,
      fontWeight: '700',
      color: colors.foreground,
    },
    statLabel: {
      fontSize: 12,
      color: colors.foregroundMuted,
      marginTop: 2,
    },
    statDivider: {
      width: 1,
      height: 40,
      backgroundColor: colors.border,
    },
    styleSelector: {
      paddingHorizontal: 16,
      marginBottom: 16,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.foregroundMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 8,
    },
    styleChips: {
      flexDirection: 'row',
      gap: 8,
    },
    styleChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 2,
      backgroundColor: colors.card,
    },
    styleChipSelected: {
      backgroundColor: colors.muted,
    },
    styleChipDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
    },
    styleChipText: {
      fontSize: 14,
      color: colors.foreground,
    },
    styleChipTextSelected: {
      fontWeight: '600',
    },
    selectionActions: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      marginBottom: 8,
    },
    selectionButtons: {
      flexDirection: 'row',
    },
    listContent: {
      padding: 16,
      paddingTop: 0,
    },
    tableRow: {
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    tableCard: {
      width: '48%',
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      borderRadius: 12,
      backgroundColor: colors.card,
      borderWidth: 2,
    },
    tableCardSelected: {
      backgroundColor: colors.muted,
    },
    tableInfo: {
      flex: 1,
      marginLeft: 8,
    },
    tableNumber: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.foreground,
    },
    tableSeats: {
      fontSize: 12,
      color: colors.foregroundMuted,
    },
    emptyContainer: {
      alignItems: 'center',
      paddingVertical: 40,
    },
    emptyText: {
      marginTop: 12,
      color: colors.foregroundMuted,
    },
    progressContainer: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: colors.card,
    },
    progressBar: {
      height: 4,
      borderRadius: 2,
    },
    progressText: {
      textAlign: 'center',
      marginTop: 8,
      fontSize: 12,
      color: colors.foregroundMuted,
    },
    actionButtons: {
      padding: 16,
      paddingBottom: 32,
      backgroundColor: colors.background,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    actionButton: {
      borderRadius: 12,
    },
    actionButtonContent: {
      paddingVertical: 8,
    },
  });
