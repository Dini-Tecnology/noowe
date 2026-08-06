import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { CameraView, useCameraPermissions } from 'expo-camera';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import { useVisitSession } from '../../contexts/VisitSessionContext';

export default function QrScannerScreen({ navigation }: any) {
  const colors = useColors();
  const [permission, requestPermission] = useCameraPermissions();
  const [locked, setLocked] = useState(false);
  const { openFromQr } = useVisitSession();

  const scan = async ({ data }: { data: string }) => {
    if (locked) return;
    setLocked(true);
    try {
      const visit = await openFromQr(data);
      navigation.replace('Menu', { restaurantId: visit.restaurantId });
    } catch (error) {
      Alert.alert(
        'QR inválido',
        error instanceof Error ? error.message : 'Não foi possível validar este QR.',
        [{ text: 'Tentar novamente', onPress: () => setLocked(false) }],
      );
    }
  };

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
        processing: { position: 'absolute', bottom: 60, alignSelf: 'center' },
      }),
    [colors],
  );

  if (!permission) {
    return (
      <ScreenContainer>
        <View style={styles.permissionContainer}>
          <ActivityIndicator color={colors.primary} />
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
        {locked && <ActivityIndicator size="large" color={colors.primary} style={styles.processing} />}
      </View>
    </View>
  );
}
