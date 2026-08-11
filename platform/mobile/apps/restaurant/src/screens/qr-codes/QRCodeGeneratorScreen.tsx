import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Image,
  Dimensions,
} from 'react-native';
import {
  Text,
  Button,
  ActivityIndicator,
  IconButton,
  Switch,
} from 'react-native-paper';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { useRestaurant } from '@/shared/contexts/RestaurantContext';
import ApiService from '@/shared/services/api';
import logger from '@okinawa/shared/utils/logger';
import { Card } from '@okinawa/shared/components';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type RouteParams = {
  QRCodeGenerator: {
    tableId?: string;
  };
};

type QRStyle = 'minimal' | 'premium' | 'bold' | 'elegant';

interface StyleConfig {
  id: QRStyle;
  name: string;
  description: string;
  icon: string;
  primaryColor: string;
  secondaryColor: string;
}

const getStyleConfigs = (colors: any): StyleConfig[] => ([
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Clean e moderno',
    icon: 'minus-circle-outline',
    primaryColor: colors.foreground,
    secondaryColor: colors.premiumCardForeground,
  },
  {
    id: 'premium',
    name: 'Premium',
    description: 'Sofisticado com gradiente',
    icon: 'diamond-stone',
    primaryColor: colors.primary,
    secondaryColor: colors.primaryLight,
  },
  {
    id: 'bold',
    name: 'Bold',
    description: 'Impactante e direto',
    icon: 'lightning-bolt',
    primaryColor: colors.foreground,
    secondaryColor: colors.primary,
  },
  {
    id: 'elegant',
    name: 'Elegant',
    description: 'Refinado com detalhes',
    icon: 'crown',
    primaryColor: colors.foregroundSecondary,
    secondaryColor: colors.backgroundSecondary,
  },
]);

export default function QRCodeGeneratorScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RouteParams, 'QRCodeGenerator'>>();
  const colors = useColors();
  const styleConfigs = getStyleConfigs(colors);
  const { restaurantId, restaurant } = useRestaurant();

  const tableId = route.params?.tableId;

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [table, setTable] = useState<any>(null);
  const [selectedStyle, setSelectedStyle] = useState<QRStyle>('premium');
  const [includeLogo, setIncludeLogo] = useState(false);
  const [qrCodeImage, setQrCodeImage] = useState<string | null>(null);
  const [qrCodeData, setQrCodeData] = useState<string | null>(null);

  const fetchTable = useCallback(async () => {
    if (!tableId) {
      setLoading(false);
      return;
    }

    try {
      const tableData = await ApiService.getTable(tableId);
      setTable(tableData);

      // Check if table already has QR code
      try {
        const qrData = await ApiService.getTableQRCode(tableId);
        if (qrData?.qr_code_image) {
          setQrCodeImage(qrData.qr_code_image);
          setQrCodeData(qrData.qr_code_data);
        }
      } catch {
        // No existing QR code
      }
    } catch (error) {
      logger.error('Error fetching table', error);
      Alert.alert('Erro', 'Não foi possível carregar os dados da mesa');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [tableId, navigation]);

  useEffect(() => {
    fetchTable();
  }, [fetchTable]);

  const handleGenerateQR = async () => {
    if (!tableId || !restaurantId) return;

    setGenerating(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const styleConfig = styleConfigs.find((s) => s.id === selectedStyle);
      const result = await ApiService.generateTableQRCode(tableId, {
        style: selectedStyle,
        color_primary: styleConfig?.primaryColor,
        color_secondary: styleConfig?.secondaryColor,
        include_logo: includeLogo,
      });

      setQrCodeImage(result.qr_code_image);
      setQrCodeData(result.qr_code_data);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Sucesso', 'QR Code gerado com sucesso!');
    } catch (error) {
      logger.error('Error generating QR code', error);
      Alert.alert('Erro', 'Não foi possível gerar o QR Code');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setGenerating(false);
    }
  };

  const handleShare = async () => {
    if (!qrCodeImage) return;

    try {
      const base64Data = qrCodeImage.replace('data:image/png;base64,', '');
      const fileName = `qr-${table?.table_number || 'mesa'}-${Date.now()}.png`;
      const fileUri = `${FileSystem.cacheDirectory}${fileName}`;

      await FileSystem.writeAsStringAsync(fileUri, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'image/png',
          dialogTitle: `QR Code - ${table?.table_number}`,
        });
      } else {
        Alert.alert('Erro', 'Compartilhamento não disponível neste dispositivo');
      }
    } catch (error) {
      logger.error('Error sharing QR code', error);
      Alert.alert('Erro', 'Não foi possível compartilhar o QR Code');
    }
  };

  const handleDownload = async () => {
    if (!qrCodeImage) return;

    try {
      const base64Data = qrCodeImage.replace('data:image/png;base64,', '');
      const fileName = `qr-${table?.table_number || 'mesa'}-${Date.now()}.png`;
      const fileUri = `${FileSystem.documentDirectory}${fileName}`;

      await FileSystem.writeAsStringAsync(fileUri, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });

      Alert.alert('Sucesso', `QR Code salvo como ${fileName}`);
    } catch (error) {
      logger.error('Error downloading QR code', error);
      Alert.alert('Erro', 'Não foi possível salvar o QR Code');
    }
  };

  const styles = useMemo(() => createStyles(colors), [colors]);

  if (loading) {
    return (
      <ScreenContainer>
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Carregando...</Text>
      </View>
      </ScreenContainer>
    );
  }

  const selectedConfig = styleConfigs.find((s) => s.id === selectedStyle);

  return (
    <ScreenContainer>
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Table Info */}
      {table && (
        <Card style={styles.tableInfoCard}>
          <View style={styles.tableInfoContent}>
            <Icon name="table-furniture" size={32} color={colors.primary} />
            <View style={styles.tableInfoText}>
              <Text style={styles.tableNumber}>{table.table_number}</Text>
              <Text style={styles.tableDetails}>
                {table.seats} lugares • {table.section || 'Área Interna'}
              </Text>
            </View>
          </View>
        </Card>
      )}

      {/* QR Preview */}
      <Card style={[styles.previewCard, { borderColor: selectedConfig?.primaryColor }] as any}>
        <View style={styles.previewContainer}>
          {qrCodeImage ? (
            <>
              <Image
                source={{ uri: qrCodeImage }}
                style={styles.qrImage}
                resizeMode="contain"
                accessibilityLabel={`QR code for table ${table?.table_number || ''}`}
              />
              <View style={styles.qrActions}>
                <IconButton
                  icon="share-variant"
                  size={24}
                  onPress={handleShare}
                  iconColor={colors.primary}
                  style={styles.qrActionButton}
                  accessibilityRole="button"
                  accessibilityLabel="Share QR code"
                />
                <IconButton
                  icon="download"
                  size={24}
                  onPress={handleDownload}
                  iconColor={colors.primary}
                  style={styles.qrActionButton}
                  accessibilityRole="button"
                  accessibilityLabel="Download QR code"
                />
              </View>
            </>
          ) : (
            <View style={styles.placeholderContainer}>
              <Icon name="qrcode" size={100} color={colors.foregroundMuted} />
              <Text style={styles.placeholderText}>
                Selecione um estilo e gere o QR Code
              </Text>
            </View>
          )}
        </View>

        {/* Style Badge */}
        <View style={[styles.styleBadge, { backgroundColor: selectedConfig?.primaryColor }]}>
          <Icon name={selectedConfig?.icon || 'qrcode'} size={14} color={colors.primaryForeground} />
          <Text style={styles.styleBadgeText}>{selectedConfig?.name}</Text>
        </View>
      </Card>

      {/* Style Selector */}
      <Text style={styles.sectionTitle}>Escolha o Estilo</Text>
      <View style={styles.stylesGrid}>
        {styleConfigs.map((config) => (
          <TouchableOpacity
            key={config.id}
            style={[
              styles.styleCard,
              selectedStyle === config.id && styles.styleCardSelected,
              { borderColor: selectedStyle === config.id ? config.primaryColor : colors.border },
            ]}
            onPress={() => {
              setSelectedStyle(config.id);
              Haptics.selectionAsync();
            }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Select ${config.name} style: ${config.description}`}
            accessibilityState={{ selected: selectedStyle === config.id }}
          >
            <View
              style={[
                styles.styleIconContainer,
                { backgroundColor: config.primaryColor },
              ]}
            >
              <Icon name={config.icon} size={24} color={colors.primaryForeground} />
            </View>
            <Text style={styles.styleName}>{config.name}</Text>
            <Text style={styles.styleDescription}>{config.description}</Text>
            {selectedStyle === config.id && (
              <View style={[styles.selectedIndicator, { backgroundColor: config.primaryColor }]}>
                <Icon name="check" size={14} color={colors.primaryForeground} />
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Options */}
      <Card style={styles.optionsCard}>
        <View style={styles.optionRow}>
          <View style={styles.optionInfo}>
            <Icon name="image" size={24} color={colors.foreground} />
            <View>
              <Text style={styles.optionTitle}>Incluir Logo</Text>
              <Text style={styles.optionDescription}>
                Adiciona o logo do restaurante ao centro do QR
              </Text>
            </View>
          </View>
          <Switch
            value={includeLogo}
            onValueChange={setIncludeLogo}
            color={colors.primary}
          />
        </View>
      </Card>

      {/* Generate Button */}
      <Button
        mode="contained"
        onPress={handleGenerateQR}
        loading={generating}
        disabled={generating || !tableId}
        style={styles.generateButton}
        contentStyle={styles.generateButtonContent}
        buttonColor={colors.primary}
        textColor={colors.primaryForeground}
        icon="qrcode-plus"
        accessibilityRole="button"
        accessibilityLabel={qrCodeImage ? 'Regenerate QR code' : 'Generate QR code'}
      >
        {qrCodeImage ? 'Regenerar QR Code' : 'Gerar QR Code'}
      </Button>

      {/* Batch Generate Link */}
      <Button
        mode="text"
        onPress={() => navigation.navigate('QRCodeBatch' as never)}
        style={styles.batchButton}
        textColor={colors.primary}
        icon="layers"
        accessibilityRole="button"
        accessibilityLabel="Generate QR codes in batch for all tables"
      >
        Gerar em Lote para Todas as Mesas
      </Button>
    </ScrollView>
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
    scrollContent: {
      padding: 16,
      paddingBottom: 40,
    },
    tableInfoCard: {
      padding: 16,
      marginBottom: 16,
      borderRadius: 12,
    },
    tableInfoContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
    },
    tableInfoText: {
      flex: 1,
    },
    tableNumber: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.foreground,
    },
    tableDetails: {
      fontSize: 14,
      color: colors.foregroundMuted,
      marginTop: 2,
    },
    previewCard: {
      padding: 20,
      marginBottom: 24,
      borderRadius: 16,
      borderWidth: 2,
      alignItems: 'center',
      position: 'relative',
      overflow: 'hidden',
    },
    previewContainer: {
      alignItems: 'center',
    },
    qrImage: {
      width: SCREEN_WIDTH - 100,
      height: SCREEN_WIDTH - 100,
      maxWidth: 280,
      maxHeight: 280,
    },
    qrActions: {
      flexDirection: 'row',
      marginTop: 16,
      gap: 8,
    },
    qrActionButton: {
      backgroundColor: colors.muted,
    },
    placeholderContainer: {
      alignItems: 'center',
      paddingVertical: 40,
    },
    placeholderText: {
      marginTop: 16,
      fontSize: 14,
      color: colors.foregroundMuted,
      textAlign: 'center',
    },
    styleBadge: {
      position: 'absolute',
      top: 12,
      right: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
    },
    styleBadgeText: {
      color: colors.primaryForeground,
      fontSize: 12,
      fontWeight: '600',
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.foreground,
      marginBottom: 12,
    },
    stylesGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      marginBottom: 24,
    },
    styleCard: {
      width: (SCREEN_WIDTH - 44) / 2,
      padding: 16,
      borderRadius: 12,
      backgroundColor: colors.card,
      borderWidth: 2,
      position: 'relative',
    },
    styleCardSelected: {
      borderWidth: 2,
    },
    styleIconContainer: {
      width: 48,
      height: 48,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    styleName: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.foreground,
    },
    styleDescription: {
      fontSize: 12,
      color: colors.foregroundMuted,
      marginTop: 2,
    },
    selectedIndicator: {
      position: 'absolute',
      top: 8,
      right: 8,
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    optionsCard: {
      padding: 16,
      marginBottom: 24,
      borderRadius: 12,
    },
    optionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    optionInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      flex: 1,
    },
    optionTitle: {
      fontSize: 16,
      fontWeight: '500',
      color: colors.foreground,
    },
    optionDescription: {
      fontSize: 12,
      color: colors.foregroundMuted,
      marginTop: 2,
    },
    generateButton: {
      borderRadius: 12,
      marginBottom: 12,
    },
    generateButtonContent: {
      paddingVertical: 8,
    },
    batchButton: {
      marginBottom: 20,
    },
  });
