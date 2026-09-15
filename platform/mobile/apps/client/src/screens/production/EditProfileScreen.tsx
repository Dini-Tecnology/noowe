/* Hallmark · macrostructure: Form-Led · genre: modern-minimal · theme: Noowe tokens · enrichment: none · designed-as-app · pre-emit critique: P5 H5 E5 S5 R5 V5 */
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from 'react-native-paper';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import { formatBrazilianPhone, validateBrazilianPhone } from '@okinawa/shared/utils/phone-validation';
import customerBackend, { type CustomerProfile } from '../../services/customer-backend';
import { StateView } from './shared';

function EditProfileForm({ profile, navigation }: { profile: CustomerProfile; navigation: any }) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState(profile.fullName);
  const [phone, setPhone] = useState(profile.phone ? formatBrazilianPhone(profile.phone) : '');
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const normalizedInitialPhone = profile.phone ? formatBrazilianPhone(profile.phone) : '';
  const changed = fullName.trim() !== profile.fullName || phone.trim() !== normalizedInitialPhone;

  const save = useMutation({
    mutationFn: () => customerBackend.updateProfile({ fullName: fullName.trim(), phone: phone.trim() || null }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['profile'], updated);
      setSaved(true);
      setFormError(null);
    },
    onError: (error: Error) => setFormError(error.message || 'Não foi possível salvar o perfil.'),
  });

  const upload = useMutation({
    mutationFn: (asset: ImagePicker.ImagePickerAsset) => customerBackend.uploadProfileAvatar(asset.uri, asset.mimeType ?? 'image/jpeg'),
    onSuccess: (updated) => {
      queryClient.setQueryData(['profile'], updated);
      setSaved(true);
    },
    onError: (error: Error) => Alert.alert('Não foi possível alterar a foto', error.message),
  });

  const choosePhoto = async () => {
    if (upload.isPending) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permissão necessária', 'Autorize o acesso às suas fotos para escolher uma imagem de perfil.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) upload.mutate(result.assets[0]);
  };

  const submit = () => {
    if (!fullName.trim()) {
      setFormError('Informe seu nome para continuar.');
      return;
    }
    if (phone.trim() && !validateBrazilianPhone(phone)) {
      setFormError('Informe um telefone brasileiro válido com DDD.');
      return;
    }
    setSaved(false);
    setFormError(null);
    save.mutate();
  };

  const styles = useMemo(() => StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { paddingHorizontal: 20, paddingBottom: 44 },
    header: { height: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    back: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.backgroundTertiary, alignItems: 'center', justifyContent: 'center' },
    title: { color: colors.foreground, fontSize: 17, fontWeight: '800' },
    spacer: { width: 34 },
    avatarSection: { alignItems: 'center', paddingTop: 12, paddingBottom: 27 },
    avatarWrap: { width: 100, height: 100 },
    avatar: { width: 94, height: 94, borderRadius: 47, backgroundColor: colors.backgroundTertiary, borderWidth: 3, borderColor: colors.card, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
    avatarImage: { width: '100%', height: '100%' },
    camera: { position: 'absolute', right: 0, bottom: 2, width: 32, height: 32, borderRadius: 16, borderWidth: 3, borderColor: colors.background, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    photoHint: { marginTop: 10, color: colors.foregroundSecondary, fontSize: 12 },
    sectionTitle: { marginBottom: 11, color: colors.foreground, fontSize: 15, fontWeight: '800' },
    form: { padding: 16, borderRadius: 18, backgroundColor: colors.card, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
    label: { marginBottom: 7, color: colors.foregroundSecondary, fontSize: 11, fontWeight: '700' },
    input: { minHeight: 50, marginBottom: 15, paddingHorizontal: 14, borderRadius: 13, borderWidth: 1, borderColor: colors.inputBorder, backgroundColor: colors.input, color: colors.foreground, fontSize: 14 },
    inputDisabled: { marginBottom: 6, backgroundColor: colors.backgroundTertiary, color: colors.foregroundSecondary },
    emailHint: { color: colors.foregroundMuted, fontSize: 10, lineHeight: 15 },
    message: { minHeight: 38, paddingTop: 10, color: formError ? colors.error : colors.success, fontSize: 12, textAlign: 'center' },
    save: { minHeight: 50, borderRadius: 15, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    saveDisabled: { opacity: 0.48 },
    saveText: { color: colors.primaryForeground, fontSize: 14, fontWeight: '800' },
  }), [colors, formError]);

  const saveDisabled = save.isPending || !fullName.trim() || !changed;

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Voltar">
            <Ionicons name="arrow-back" size={18} color={colors.foregroundSecondary} />
          </TouchableOpacity>
          <Text style={styles.title}>Editar Perfil</Text>
          <View style={styles.spacer} />
        </View>

        <View style={styles.avatarSection}>
          <View style={styles.avatarWrap}>
            <TouchableOpacity style={styles.avatar} onPress={() => void choosePhoto()} disabled={upload.isPending} accessibilityRole="button" accessibilityLabel="Alterar foto do perfil">
              {profile.avatarUrl ? <Image source={{ uri: profile.avatarUrl }} style={styles.avatarImage} resizeMode="cover" /> : <Ionicons name="person-outline" size={38} color={colors.primary} />}
            </TouchableOpacity>
            <TouchableOpacity style={styles.camera} onPress={() => void choosePhoto()} disabled={upload.isPending} accessibilityRole="button" accessibilityLabel="Escolher foto">
              {upload.isPending ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Ionicons name="camera-outline" size={16} color={colors.primaryForeground} />}
            </TouchableOpacity>
          </View>
          <Text style={styles.photoHint}>{upload.isPending ? 'Enviando foto…' : 'Toque para alterar a foto'}</Text>
        </View>

        <Text style={styles.sectionTitle}>Dados pessoais</Text>
        <View style={styles.form}>
          <Text style={styles.label}>Nome</Text>
          <TextInput
            value={fullName}
            onChangeText={(value) => { setFullName(value); setSaved(false); if (formError) setFormError(null); }}
            autoCapitalize="words"
            autoCorrect={false}
            placeholder="Seu nome"
            placeholderTextColor={colors.foregroundMuted}
            style={styles.input}
            accessibilityLabel="Nome"
          />
          <Text style={styles.label}>Telefone</Text>
          <TextInput
            value={phone}
            onChangeText={(value) => { setPhone(formatBrazilianPhone(value)); setSaved(false); if (formError) setFormError(null); }}
            keyboardType="phone-pad"
            placeholder="(11) 99999-9999"
            placeholderTextColor={colors.foregroundMuted}
            style={styles.input}
            accessibilityLabel="Telefone"
          />
          <Text style={styles.label}>E-mail</Text>
          <TextInput value={profile.email ?? ''} editable={false} style={[styles.input, styles.inputDisabled]} accessibilityLabel="E-mail" />
          <Text style={styles.emailHint}>O e-mail pertence à sua conta de acesso e não pode ser alterado aqui.</Text>
        </View>

        <Text accessibilityLiveRegion="polite" style={styles.message}>{formError ?? (saved ? 'Perfil atualizado com sucesso.' : '')}</Text>
        <TouchableOpacity style={[styles.save, saveDisabled && styles.saveDisabled]} onPress={submit} disabled={saveDisabled} accessibilityRole="button" accessibilityState={{ disabled: saveDisabled }}>
          {save.isPending ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={styles.saveText}>Salvar alterações</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export default function EditProfileScreen({ navigation }: any) {
  const query = useQuery({ queryKey: ['profile'], queryFn: () => customerBackend.getProfile() });
  return (
    <ScreenContainer edges={['top']}>
      {query.data ? <EditProfileForm profile={query.data} navigation={navigation} /> : (
        <StateView loading={query.isLoading} error={query.error} onRetry={() => query.refetch()} />
      )}
    </ScreenContainer>
  );
}
