/**
 * ConfigProfileScreen — Restaurant identity configuration
 *
 * Edits: name, logo URL, description, cuisine type, cover image,
 * contact info (phone, email, website), address fields,
 * opening hours by day (Mon-Sun, open/closed toggle + from/to time).
 *
 * API: PATCH /config/:id/profile
 * Access: OWNER only
 *
 * @module config/ConfigProfileScreen
 */

import React, { useMemo, useEffect, useCallback } from 'react';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import {
  View,
  ScrollView,
  StyleSheet,
  Alert,
  TextInput as RNTextInput,
  Switch,
} from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useI18n } from '@/shared/hooks/useI18n';
import { useColors } from '@/shared/contexts/ThemeContext';
import { useAuth } from '@/shared/hooks/useAuth';
import { useRestaurantConfig } from './hooks/useRestaurantConfig';
import { spacing, borderRadius } from '@/shared/theme/spacing';
import { typography } from '@/shared/theme/typography';
import type { ConfigProfile } from './types/config.types';

// ============================================
// DAYS OF WEEK
// ============================================

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const DAY_LABELS: Record<string, Record<string, string>> = {
  'pt-BR': { monday: 'Segunda', tuesday: 'Terça', wednesday: 'Quarta', thursday: 'Quinta', friday: 'Sexta', saturday: 'Sábado', sunday: 'Domingo' },
  'en-US': { monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday' },
  'es-ES': { monday: 'Lunes', tuesday: 'Martes', wednesday: 'Miércoles', thursday: 'Jueves', friday: 'Viernes', saturday: 'Sábado', sunday: 'Domingo' },
};

// ============================================
// SCHEMA
// ============================================

const profileSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  photo: z.string().url().optional().or(z.literal('')),
  website: z.string().url().optional().or(z.literal('')),
  cuisineType: z.string().optional(),
  priceRange: z.string().optional(),
  capacity: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  whatsapp: z.string().optional(),
  street: z.string().optional(),
  number: z.string().optional(),
  complement: z.string().optional(),
  neighborhood: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  country: z.string().optional(),
});

type ProfileFormData = z.infer<typeof profileSchema>;

// ============================================
// COMPONENT
// ============================================

export default function ConfigProfileScreen() {
  const { t, language } = useI18n();
  const colors = useColors();
  const navigation = useNavigation<any>();
  const { user } = useAuth();

  const restaurantId = useMemo(() => {
    const roles = user?.roles || [];
    return roles.find((r) => r.restaurant_id)?.restaurant_id || '';
  }, [user]);

  const { config, isLoading, updateProfile, isSaving } = useRestaurantConfig(restaurantId);

  const profile = config?.profile;

  const {
    control,
    handleSubmit,
    reset,
    formState: { isDirty, errors },
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema as any),
    defaultValues: {
      name: '',
      description: '',
      photo: '',
      website: '',
      cuisineType: '',
      priceRange: '',
      capacity: '',
      phone: '',
      email: '',
      whatsapp: '',
      street: '',
      number: '',
      complement: '',
      neighborhood: '',
      city: '',
      state: '',
      zipCode: '',
      country: '',
    },
  });

  // Hours state (separate from form)
  const [hours, setHours] = React.useState<
    Record<string, { open: string; close: string; closed?: boolean }>
  >({});

  // Initialize form when config loads
  useEffect(() => {
    if (profile) {
      reset({
        name: profile.name || '',
        description: profile.description || '',
        photo: profile.photo || '',
        website: profile.website || '',
        cuisineType: (profile.cuisineType || []).join(', '),
        priceRange: profile.priceRange || '',
        capacity: profile.capacity?.toString() || '',
        phone: profile.contact?.phone || '',
        email: profile.contact?.email || '',
        whatsapp: profile.contact?.whatsapp || '',
        street: profile.address?.street || '',
        number: profile.address?.number || '',
        complement: profile.address?.complement || '',
        neighborhood: profile.address?.neighborhood || '',
        city: profile.address?.city || '',
        state: profile.address?.state || '',
        zipCode: profile.address?.zipCode || '',
        country: profile.address?.country || '',
      });
      setHours(profile.hours || {});
    }
  }, [profile, reset]);

  // Unsaved changes warning
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e: any) => {
      if (!isDirty) return;
      e.preventDefault();
      Alert.alert(
        t('config.unsavedChanges'),
        t('config.unsavedChangesMsg'),
        [
          { text: t('config.keepEditing'), style: 'cancel' },
          {
            text: t('config.discard'),
            style: 'destructive',
            onPress: () => navigation.dispatch(e.data.action),
          },
        ],
      );
    });
    return unsubscribe;
  }, [navigation, isDirty, t]);

  const onSubmit = useCallback(
    async (data: ProfileFormData) => {
      try {
        const payload: Partial<ConfigProfile> = {
          name: data.name,
          description: data.description,
          photo: data.photo || undefined,
          website: data.website || undefined,
          cuisineType: data.cuisineType
            ? data.cuisineType.split(',').map((s) => s.trim())
            : [],
          priceRange: data.priceRange,
          capacity: data.capacity ? parseInt(data.capacity, 10) : undefined,
          contact: {
            phone: data.phone,
            email: data.email,
            whatsapp: data.whatsapp,
          },
          address: {
            street: data.street,
            number: data.number,
            complement: data.complement,
            neighborhood: data.neighborhood,
            city: data.city,
            state: data.state,
            zipCode: data.zipCode,
            country: data.country,
          },
          hours,
        };
        await updateProfile(payload);
        Alert.alert(t('config.saved'));
      } catch {
        Alert.alert(t('errors.generic'));
      }
    },
    [updateProfile, hours, t],
  );

  const updateDayHours = (day: string, field: string, value: string | boolean) => {
    setHours((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        open: prev[day]?.open || '08:00',
        close: prev[day]?.close || '22:00',
        [field]: value,
      },
    }));
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.backgroundSecondary },
        scrollContent: { paddingBottom: spacing[10] },
        section: {
          backgroundColor: colors.card,
          marginHorizontal: spacing.screenHorizontal,
          marginTop: spacing[4],
          padding: spacing[4],
          borderRadius: borderRadius.card,
          borderWidth: 1,
          borderColor: colors.cardBorder,
        },
        sectionTitle: {
          ...typography.h3,
          color: colors.foreground,
          marginBottom: spacing[3],
        },
        fieldLabel: {
          ...typography.labelMedium,
          color: colors.foregroundSecondary,
          marginBottom: spacing[1],
          marginTop: spacing[3],
        },
        input: {
          backgroundColor: colors.input,
          borderWidth: 1,
          borderColor: colors.inputBorder,
          borderRadius: borderRadius.input,
          paddingHorizontal: spacing[3],
          paddingVertical: spacing[2],
          color: colors.foreground,
          ...typography.bodyMedium,
        },
        inputError: { borderColor: colors.error },
        errorText: { ...typography.caption, color: colors.error, marginTop: 2 },
        dayRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: spacing[2],
          borderBottomWidth: 1,
          borderBottomColor: colors.borderLight,
        },
        dayLabel: { ...typography.labelLarge, color: colors.foreground, flex: 1 },
        dayTimeInputs: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
        timeInput: {
          backgroundColor: colors.input,
          borderWidth: 1,
          borderColor: colors.inputBorder,
          borderRadius: borderRadius.xs,
          paddingHorizontal: spacing[2],
          paddingVertical: spacing[1],
          width: 70,
          textAlign: 'center',
          color: colors.foreground,
          ...typography.bodySmall,
        },
        closedText: { ...typography.bodySmall, color: colors.foregroundMuted },
        saveButton: {
          backgroundColor: colors.primary,
          marginHorizontal: spacing.screenHorizontal,
          marginTop: spacing[5],
          paddingVertical: spacing[3],
          borderRadius: borderRadius.button,
          alignItems: 'center',
        },
        saveButtonDisabled: { opacity: 0.5 },
        saveButtonText: { ...typography.buttonLarge, color: colors.primaryForeground },
      }),
    [colors],
  );

  if (isLoading) {
    return (
      <ScreenContainer hasKeyboard>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
      </ScreenContainer>
    );
  }

  const dayLabels = DAY_LABELS[language] || DAY_LABELS['en-US'];

  return (
    <ScreenContainer hasKeyboard>
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      {/* Basic Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('config.profile.title')}</Text>

        {(['name', 'description', 'photo', 'website', 'cuisineType', 'priceRange', 'capacity'] as const).map(
          (field) => (
            <View key={field}>
              <Text style={styles.fieldLabel}>{t(`config.profile.${field}`)}</Text>
              <Controller
                control={control}
                name={field}
                render={({ field: { onChange, onBlur, value } }) => (
                  <RNTextInput
                    style={[styles.input, errors[field] && styles.inputError]}
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    placeholder={t(`config.profile.${field}`)}
                    placeholderTextColor={colors.inputPlaceholder}
                    multiline={field === 'description'}
                    numberOfLines={field === 'description' ? 3 : 1}
                    keyboardType={field === 'capacity' ? 'numeric' : 'default'}
                    accessibilityLabel={t(`config.profile.${field}`)}
                  />
                )}
              />
              {errors[field] && <Text style={styles.errorText}>{errors[field]?.message}</Text>}
            </View>
          ),
        )}
      </View>

      {/* Contact */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('config.profile.address')}</Text>
        {(['phone', 'email', 'whatsapp'] as const).map((field) => (
          <View key={field}>
            <Text style={styles.fieldLabel}>{t(`config.profile.${field}`)}</Text>
            <Controller
              control={control}
              name={field}
              render={({ field: { onChange, onBlur, value } }) => (
                <RNTextInput
                  style={[styles.input, errors[field] && styles.inputError]}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder={t(`config.profile.${field}`)}
                  placeholderTextColor={colors.inputPlaceholder}
                  keyboardType={field === 'email' ? 'email-address' : field === 'phone' ? 'phone-pad' : 'default'}
                  accessibilityLabel={t(`config.profile.${field}`)}
                />
              )}
            />
          </View>
        ))}
      </View>

      {/* Address */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('config.profile.address')}</Text>
        {(['street', 'number', 'complement', 'neighborhood', 'city', 'state', 'zipCode', 'country'] as const).map(
          (field) => (
            <View key={field}>
              <Text style={styles.fieldLabel}>{t(`config.profile.${field}`)}</Text>
              <Controller
                control={control}
                name={field}
                render={({ field: { onChange, onBlur, value } }) => (
                  <RNTextInput
                    style={styles.input}
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    placeholder={t(`config.profile.${field}`)}
                    placeholderTextColor={colors.inputPlaceholder}
                    accessibilityLabel={t(`config.profile.${field}`)}
                  />
                )}
              />
            </View>
          ),
        )}
      </View>

      {/* Opening Hours */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('config.profile.hours')}</Text>
        {DAYS.map((day) => {
          const dayData = hours[day] || { open: '08:00', close: '22:00', closed: false };
          return (
            <View key={day} style={styles.dayRow}>
              <Text style={styles.dayLabel}>{dayLabels[day]}</Text>
              <Switch
                value={!dayData.closed}
                onValueChange={(val) => updateDayHours(day, 'closed', !val)}
                trackColor={{ false: colors.backgroundTertiary, true: colors.primaryLight }}
                thumbColor={!dayData.closed ? colors.primary : colors.foregroundMuted}
                accessibilityLabel={`${dayLabels[day]} open or closed`}
              />
              {!dayData.closed ? (
                <View style={styles.dayTimeInputs}>
                  <RNTextInput
                    style={styles.timeInput}
                    value={dayData.open}
                    onChangeText={(val) => updateDayHours(day, 'open', val)}
                    placeholder={t('placeholders.openTime')}
                    placeholderTextColor={colors.inputPlaceholder}
                    accessibilityLabel={`${dayLabels[day]} ${t('config.profile.openTime') || 'open time'}`}
                  />
                  <Text style={{ color: colors.foregroundSecondary }}>-</Text>
                  <RNTextInput
                    style={styles.timeInput}
                    value={dayData.close}
                    onChangeText={(val) => updateDayHours(day, 'close', val)}
                    placeholder={t('placeholders.closeTime')}
                    placeholderTextColor={colors.inputPlaceholder}
                    accessibilityLabel={`${dayLabels[day]} ${t('config.profile.closeTime') || 'close time'}`}
                  />
                </View>
              ) : (
                <Text style={styles.closedText}>{t('config.profile.closed')}</Text>
              )}
            </View>
          );
        })}
      </View>

      {/* Save Button */}
      <View
        style={[styles.saveButton, (!isDirty || isSaving) && styles.saveButtonDisabled]}
        pointerEvents={!isDirty || isSaving ? 'none' : 'auto'}
      >
        <Text style={styles.saveButtonText} onPress={handleSubmit(onSubmit)}>
          {isSaving ? t('config.saving') : t('config.save')}
        </Text>
      </View>
    </ScrollView>
    </ScreenContainer>
  );
}
