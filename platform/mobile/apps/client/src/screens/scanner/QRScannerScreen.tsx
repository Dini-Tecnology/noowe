/**
 * QRScannerScreen
 * 
 * Camera-based QR code scanner for table association, menu access,
 * guest invitations, and payment processing. Supports multiple
 * QR code types with appropriate handling for each.
 * 
 * @module screens/scanner
 */

import React, { useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, Alert, Vibration, Linking } from 'react-native';
import { Text, Button, IconButton, Card, ActivityIndicator } from 'react-native-paper';
import { Camera, CameraView, useCameraPermissions } from 'expo-camera';
import { useNavigation } from '@react-navigation/native';
import ApiService from '@/shared/services/api';
import { useScreenTracking, useAnalytics } from '@/shared/hooks/useAnalytics';
import { useI18n } from '@/shared/hooks/useI18n';
import { useColors } from '@/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';

type QRCodeType = 'table' | 'menu' | 'invite' | 'payment' | 'unknown';

interface ScanResult {
  type: QRCodeType;
  data: any;
  message: string;
}

export default function QRScannerScreen() {
  useScreenTracking('QR Scanner');
  const { t } = useI18n();
  const navigation = useNavigation<any>();
  const analytics = useAnalytics();
  const colors = useColors();

  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [flashOn, setFlashOn] = useState(false);

  // Dynamic styles with semantic tokens
  const styles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    permissionContainer: {
      flex: 1,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 30,
    },
    permissionTitle: {
      marginTop: 16,
      textAlign: 'center',
      color: colors.foreground,
    },
    permissionText: {
      marginTop: 8,
      textAlign: 'center',
      color: colors.foregroundMuted,
    },
    permissionButton: {
      marginTop: 24,
      backgroundColor: colors.primary,
    },
    settingsButton: {
      marginTop: 12,
    },
    camera: {
      flex: 1,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 50,
      paddingHorizontal: 10,
      backgroundColor: colors.overlay,
    },
    headerTitle: {
      color: colors.primaryForeground,
      fontSize: 18,
      fontWeight: '600',
    },
    scannerContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scannerFrame: {
      width: 250,
      height: 250,
      position: 'relative',
    },
    corner: {
      position: 'absolute',
      width: 30,
      height: 30,
      borderColor: colors.primary,
    },
    cornerTL: {
      top: 0,
      left: 0,
      borderTopWidth: 4,
      borderLeftWidth: 4,
    },
    cornerTR: {
      top: 0,
      right: 0,
      borderTopWidth: 4,
      borderRightWidth: 4,
    },
    cornerBL: {
      bottom: 0,
      left: 0,
      borderBottomWidth: 4,
      borderLeftWidth: 4,
    },
    cornerBR: {
      bottom: 0,
      right: 0,
      borderBottomWidth: 4,
      borderRightWidth: 4,
    },
    processingIndicator: {
      position: 'absolute',
      top: '50%',
      left: '50%',
      marginTop: -20,
      marginLeft: -20,
    },
    instruction: {
      color: colors.primaryForeground,
      marginTop: 24,
      fontSize: 16,
    },
    resultContainer: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      padding: 16,
      paddingBottom: 40,
    },
    resultCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
    },
    resultHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 16,
    },
    resultInfo: {
      flex: 1,
      marginLeft: 8,
    },
    resultType: {
      color: colors.primary,
      textTransform: 'uppercase',
    },
    resultMessage: {
      marginTop: 4,
      color: colors.foreground,
    },
    resultActions: {
      gap: 10,
    },
    actionButton: {
      backgroundColor: colors.primary,
    },
    scanAgainButton: {
      borderColor: colors.primary,
    },
    footer: {
      alignItems: 'center',
      paddingBottom: 50,
      backgroundColor: colors.overlay,
      paddingTop: 20,
    },
    footerText: {
      color: colors.primaryForeground,
      fontSize: 14,
      marginBottom: 16,
    },
    supportedTypes: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 24,
    },
    typeItem: {
      alignItems: 'center',
    },
    typeText: {
      color: colors.primaryForeground,
      fontSize: 12,
      marginTop: -8,
    },
  }), [colors]);

  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
  }, []);

  const parseQRCode = (data: string): { type: QRCodeType; payload: any } => {
    try {
      // Noowe-specific QR codes
      if (data.startsWith('okinawa://')) {
        const url = new URL(data);
        const path = url.pathname;
        const params = Object.fromEntries(url.searchParams);

        if (path.includes('/table/')) {
          const tableId = path.split('/table/')[1];
          return { type: 'table', payload: { tableId, ...params } };
        }
        if (path.includes('/menu/')) {
          const restaurantId = path.split('/menu/')[1];
          return { type: 'menu', payload: { restaurantId, ...params } };
        }
        if (path.includes('/invite/')) {
          const inviteToken = path.split('/invite/')[1];
          return { type: 'invite', payload: { inviteToken, ...params } };
        }
        if (path.includes('/payment/')) {
          const paymentId = path.split('/payment/')[1];
          return { type: 'payment', payload: { paymentId, ...params } };
        }
      }

      // HTTP/HTTPS links
      if (data.startsWith('http://') || data.startsWith('https://')) {
        const url = new URL(data);
        if (url.hostname.includes('okinawa')) {
          const path = url.pathname;
          if (path.includes('/t/')) {
            const tableCode = path.split('/t/')[1];
            return { type: 'table', payload: { tableCode } };
          }
          if (path.includes('/i/')) {
            const inviteToken = path.split('/i/')[1];
            return { type: 'invite', payload: { inviteToken } };
          }
          if (path.includes('/r/')) {
            const restaurantId = path.split('/r/')[1];
            return { type: 'menu', payload: { restaurantId } };
          }
        }
      }

      // Plain table codes
      if (data.match(/^[A-Z0-9]{6,12}$/)) {
        return { type: 'table', payload: { tableCode: data } };
      }

      return { type: 'unknown', payload: { raw: data } };
    } catch (error) {
      return { type: 'unknown', payload: { raw: data } };
    }
  };

  const processQRCode = async (type: QRCodeType, payload: any): Promise<ScanResult> => {
    switch (type) {
      case 'table':
        try {
          const tableResponse = await ApiService.post('/tables/associate', {
            tableId: payload.tableId || payload.tableCode,
          });
          const tableData = tableResponse.data;
          return {
            type: 'table',
            data: tableData,
            message: t('scanner.tableAssociated', { table: tableData.table_number }),
          };
        } catch (error) {
          return {
            type: 'table',
            data: null,
            message: t('scanner.tableError'),
          };
        }

      case 'menu':
        return {
          type: 'menu',
          data: payload,
          message: t('scanner.menuFound'),
        };

      case 'invite':
        try {
          const inviteResponse = await ApiService.post('/reservations/guests/accept', {
            inviteToken: payload.inviteToken,
          });
          const inviteData = inviteResponse.data;
          return {
            type: 'invite',
            data: inviteData,
            message: t('scanner.inviteAccepted'),
          };
        } catch (error) {
          return {
            type: 'invite',
            data: null,
            message: t('scanner.inviteError'),
          };
        }

      case 'payment':
        return {
          type: 'payment',
          data: payload,
          message: t('scanner.paymentReady'),
        };

      default:
        return {
          type: 'unknown',
          data: payload,
          message: t('scanner.unknownCode'),
        };
    }
  };

  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    if (scanned || processing) return;

    setScanned(true);
    setProcessing(true);
    Vibration.vibrate(100);

    analytics.logEvent('qr_scanned', { data_length: data.length });

    const { type, payload } = parseQRCode(data);
    const result = await processQRCode(type, payload);

    setScanResult(result);
    setProcessing(false);
  };

  const handleAction = () => {
    if (!scanResult) return;

    switch (scanResult.type) {
      case 'table':
        if (scanResult.data) {
          navigation.navigate('Menu', { tableId: scanResult.data.id });
        }
        break;
      case 'menu':
        navigation.navigate('Restaurant', {
          restaurantId: scanResult.data.restaurantId,
        });
        break;
      case 'invite':
        if (scanResult.data) {
          navigation.navigate('SharedOrder', {
            orderId: scanResult.data.order_id,
          });
        }
        break;
      case 'payment':
        navigation.navigate('Payment', {
          paymentId: scanResult.data.paymentId,
        });
        break;
    }
  };

  const handleScanAgain = () => {
    setScanned(false);
    setScanResult(null);
  };

  // Permission not yet determined
  if (!permission) {
    return (
      <ScreenContainer>
      <View style={styles.permissionContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    
      </ScreenContainer>
    );
  }

  // Permission denied
  if (!permission.granted) {
    return (
      <ScreenContainer>
      <View style={styles.permissionContainer}>
        <IconButton icon="camera-off" size={64} iconColor={colors.foregroundMuted} />
        <Text variant="headlineSmall" style={styles.permissionTitle}>
          {t('scanner.cameraPermission')}
        </Text>
        <Text variant="bodyMedium" style={styles.permissionText}>
          {t('scanner.cameraPermissionMessage')}
        </Text>
        <Button
          mode="contained"
          onPress={requestPermission}
          style={styles.permissionButton}
          icon="camera"
        >
          {t('scanner.allowCamera')}
        </Button>
        <Button
          mode="text"
          onPress={() => Linking.openSettings()}
          style={styles.settingsButton}
        >
          {t('scanner.openSettings')}
        </Button>
      </View>
    
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
    <View style={styles.container}>
      <CameraView
        style={styles.camera}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        barcodeScannerSettings={{
          barcodeTypes: ['qr'],
        }}
      >
        {/* Header */}
        <View style={styles.header}>
          <IconButton
            icon="close"
            iconColor={colors.primaryForeground}
            size={24}
            onPress={() => navigation.goBack()}
            accessibilityLabel="Close scanner"
          />
          <Text style={styles.headerTitle}>{t('scanner.scanQR')}</Text>
          <IconButton
            icon={flashOn ? 'flash' : 'flash-off'}
            iconColor={colors.primaryForeground}
            size={24}
            onPress={() => setFlashOn(!flashOn)}
            accessibilityLabel={flashOn ? 'Turn off flash' : 'Turn on flash'}
          />
        </View>

        {/* Scanner Frame */}
        <View style={styles.scannerContainer}>
          <View style={styles.scannerFrame}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />

            {processing && (
              <ActivityIndicator
                size="large"
                color={colors.primary}
                style={styles.processingIndicator}
              />
            )}
          </View>
          <Text style={styles.instruction}>{t('scanner.pointCamera')}</Text>
        </View>

        {/* Result Card */}
        {scanResult && (
          <View style={styles.resultContainer}>
            <Card style={styles.resultCard}>
              <Card.Content>
                <View style={styles.resultHeader}>
                  <IconButton
                    icon={
                      scanResult.type === 'table'
                        ? 'table-furniture'
                        : scanResult.type === 'menu'
                        ? 'silverware-fork-knife'
                        : scanResult.type === 'invite'
                        ? 'account-plus'
                        : 'credit-card'
                    }
                    size={32}
                    iconColor={colors.primary}
                  />
                  <View style={styles.resultInfo}>
                    <Text variant="labelLarge" style={styles.resultType}>
                      {scanResult.type}
                    </Text>
                    <Text variant="bodyMedium" style={styles.resultMessage}>
                      {scanResult.message}
                    </Text>
                  </View>
                </View>
                <View style={styles.resultActions}>
                  {scanResult.data && (
                    <Button
                      mode="contained"
                      onPress={handleAction}
                      style={styles.actionButton}
                    >
                      {t('scanner.continue')}
                    </Button>
                  )}
                  <Button
                    mode="outlined"
                    onPress={handleScanAgain}
                    style={styles.scanAgainButton}
                  >
                    {t('scanner.scanAgain')}
                  </Button>
                </View>
              </Card.Content>
            </Card>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>{t('scanner.supportedTypes')}</Text>
          <View style={styles.supportedTypes}>
            <View style={styles.typeItem}>
              <IconButton icon="table-furniture" size={20} iconColor={colors.primaryForeground} />
              <Text style={styles.typeText}>Mesas</Text>
            </View>
            <View style={styles.typeItem}>
              <IconButton icon="silverware-fork-knife" size={20} iconColor={colors.primaryForeground} />
              <Text style={styles.typeText}>Cardápios</Text>
            </View>
            <View style={styles.typeItem}>
              <IconButton icon="account-plus" size={20} iconColor={colors.primaryForeground} />
              <Text style={styles.typeText}>Convites</Text>
            </View>
          </View>
        </View>
      </CameraView>
    </View>
  
    </ScreenContainer>
  );
}
