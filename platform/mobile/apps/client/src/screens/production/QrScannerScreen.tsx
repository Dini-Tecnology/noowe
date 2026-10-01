import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { CameraView, useCameraPermissions } from 'expo-camera';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import { DevTableScanButton } from '../../components/dev/DevTableScanButton';
import { useVisitSession } from '../../contexts/VisitSessionContext';
import { showTableQrOutcome } from '../../hooks/qr-scan-outcome';
import { useTableQrHandler } from '../../hooks/useTableQrHandler';

/**
 * Depois de recusar um QR, a câmera continua apontada para ele e o expo-camera
 * dispara a leitura de novo a cada quadro. Sem esta trava, "Tentar novamente"
 * reabria o mesmo alerta em loop. O mesmo código só volta a valer se a câmera
 * ler outro antes, ou depois de um intervalo.
 */
const REJECTED_QR_COOLDOWN_MS = 8_000;

export default function QrScannerScreen({ navigation, route }: any) {
  const colors = useColors();
  const [permission, requestPermission] = useCameraPermissions();
  const [locked, setLocked] = useState(false);
  const scanning = useRef(false);
  const lastRejected = useRef<{ data: string; at: number } | null>(null);
  const { refreshSession } = useVisitSession();
  const unlock = () => { scanning.current = false; setLocked(false); };
  const { handleQrScanned } = useTableQrHandler();
  // Aberto de dentro de um restaurante: o QR de outro restaurante pergunta antes de trocar.
  const contextRestaurantId: string | undefined = route?.params?.contextRestaurantId;
  const contextRestaurantName: string | undefined = route?.params?.contextRestaurantName;

  const scan = async ({ data }: { data: string }) => {
    if (scanning.current) return;
    const rejected = lastRejected.current;
    if (rejected && rejected.data === data && Date.now() - rejected.at < REJECTED_QR_COOLDOWN_MS) return;
    scanning.current = true;
    setLocked(true);
    const outcome = await handleQrScanned(data, {
      contextRestaurant: contextRestaurantId ? { id: contextRestaurantId, name: contextRestaurantName } : undefined,
    });
    // Falha de rede se resolve tentando o mesmo código de novo; o resto não.
    lastRejected.current = !outcome.ok && outcome.reason !== 'network' ? { data, at: Date.now() } : null;
    showTableQrOutcome(outcome, {
      onOpened: (restaurantId, { switched }) => {
        if (switched) {
          // Saiu do restaurante anterior: recomeça a pilha no novo, sem "voltar" para o antigo.
          navigation.reset({
            index: 2,
            routes: [
              { name: 'Main' },
              { name: 'Restaurant', params: { restaurantId } },
              { name: 'Menu', params: { restaurantId } },
            ],
          });
          return;
        }
        navigation.replace('Menu', { restaurantId });
      },
      onRetry: unlock,
      onOpenAccount: () => {
        void (async () => {
          try {
            const active = await refreshSession();
            if (active) navigation.replace('FecharConta', { tableSessionId: active.tableSessionId });
            else unlock();
          } catch {
            unlock();
            Alert.alert('Não foi possível abrir a conta', 'Verifique a conexão e tente novamente.');
          }
        })();
      },
    });
  };

  const testTableButton = (
    <DevTableScanButton
      variant={permission?.granted ? 'dark' : 'light'}
      restaurantId={contextRestaurantId}
      onOpened={(restaurantId) => navigation.replace('Menu', { restaurantId })}
      onOpenAccount={(tableSessionId) => navigation.replace('FecharConta', { tableSessionId })}
    />
  );

  const styles = useMemo(
    () =>
      StyleSheet.create({
        page: { flex: 1, backgroundColor: '#000' },
        permissionContainer: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
        permissionTitle: { fontSize: 18, fontWeight: '700', color: colors.foreground, textAlign: 'center' },
        permissionText: { fontSize: 14, color: colors.foregroundSecondary, textAlign: 'center', lineHeight: 20 },
        permissionBtn: { backgroundColor: colors.primary, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 16 },
        permissionBtnText: { color: colors.primaryForeground, fontSize: 15, fontWeight: '700' },
        header: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 50, paddingHorizontal: 16, zIndex: 2 },
        backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
        viewfinderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
        viewfinder: { width: 260, height: 260, position: 'relative' },
        corner: { position: 'absolute', width: 36, height: 36, borderColor: colors.primary },
        cornerTL: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 8 },
        cornerTR: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 8 },
        cornerBL: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 8 },
        cornerBR: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 8 },
        instruction: { color: '#FFFFFF', fontSize: 15, marginTop: 24, textAlign: 'center' },
        processing: { marginTop: 16 },
      }),
    [colors],
  );

  if (!permission) {
    return (
      <ScreenContainer>
        <View style={styles.permissionContainer}>
          <ActivityIndicator color={colors.primary} />
          {testTableButton}
        </View>
      </ScreenContainer>
    );
  }

  if (!permission.granted) {
    return (
      <ScreenContainer>
        <View style={styles.permissionContainer}>
          <Ionicons name="camera-outline" size={56} color={colors.foregroundMuted} />
          <Text style={styles.permissionTitle}>Câmera necessária</Text>
          <Text style={styles.permissionText}>Precisamos da câmera para validar o QR Code da mesa.</Text>
          <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission} accessibilityRole="button">
            <Text style={styles.permissionBtnText}>Permitir câmera</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => Linking.openSettings()} accessibilityRole="button">
            <Text style={{ color: colors.primary, fontWeight: '600' }}>Abrir configurações</Text>
          </TouchableOpacity>
          {testTableButton}
        </View>
      </ScreenContainer>
    );
  }

  return (
    <View style={styles.page}>
      <CameraView style={StyleSheet.absoluteFill} barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={locked ? undefined : scan} />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Fechar">
          <Ionicons name="close" size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
      <View style={styles.viewfinderWrap}>
        <View style={styles.viewfinder}>
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />
        </View>
        <Text style={styles.instruction}>Aponte para o QR Code da mesa</Text>
        {testTableButton}
        {locked && <ActivityIndicator size="large" color={colors.primary} style={styles.processing} />}
      </View>
    </View>
  );
}
