/**
 * ConfigHubScreen — Main entry point for the Config Hub
 *
 * Lists all 10 config areas as navigable cards.
 * RBAC: OWNER sees all 10 cards, MANAGER sees only 4
 * (experience, kitchen, notifications, language).
 *
 * Shows setup completion percentage from GET /config/:id/completion.
 * Full i18n, skeleton loading.
 *
 * @module config/ConfigHubScreen
 */

import React, { useMemo } from 'react';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import {
  View,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useI18n } from '@/shared/hooks/useI18n';
import { useColors } from '@/shared/contexts/ThemeContext';
import { useAuth } from '@/shared/hooks/useAuth';
import { useRestaurantConfig } from './hooks/useRestaurantConfig';
import { spacing, borderRadius } from '@/shared/theme/spacing';
import { typography } from '@/shared/theme/typography';
import type { ConfigSectionCard, UserRole } from './types/config.types';

// ============================================
// CONFIG SECTIONS DEFINITION
// ============================================

const CONFIG_SECTIONS: ConfigSectionCard[] = [
  {
    id: 'profile',
    icon: 'store',
    titleKey: 'config.hub.sections.profile',
    descriptionKey: 'config.hub.sections.profileDesc',
    screen: 'ConfigProfile',
    accessRoles: ['OWNER'],
    domain: 'profile',
  },
  {
    id: 'serviceTypes',
    icon: 'silverware-fork-knife',
    titleKey: 'config.hub.sections.serviceTypes',
    descriptionKey: 'config.hub.sections.serviceTypesDesc',
    screen: 'ConfigServiceTypes',
    accessRoles: ['OWNER'],
    domain: 'service-types',
  },
  {
    id: 'experience',
    icon: 'star-outline',
    titleKey: 'config.hub.sections.experience',
    descriptionKey: 'config.hub.sections.experienceDesc',
    screen: 'ConfigExperience',
    accessRoles: ['OWNER', 'MANAGER'],
    domain: 'experience',
  },
  {
    id: 'floor',
    icon: 'floor-plan',
    titleKey: 'config.hub.sections.floor',
    descriptionKey: 'config.hub.sections.floorDesc',
    screen: 'ConfigFloor',
    accessRoles: ['OWNER'],
    domain: 'floor',
  },
  {
    id: 'kitchen',
    icon: 'chef-hat',
    titleKey: 'config.hub.sections.kitchen',
    descriptionKey: 'config.hub.sections.kitchenDesc',
    screen: 'ConfigKitchen',
    accessRoles: ['OWNER', 'MANAGER'],
    domain: 'kitchen',
  },
  {
    id: 'payments',
    icon: 'credit-card-outline',
    titleKey: 'config.hub.sections.payments',
    descriptionKey: 'config.hub.sections.paymentsDesc',
    screen: 'ConfigPayments',
    accessRoles: ['OWNER'],
    domain: 'payments',
  },
  {
    id: 'features',
    icon: 'puzzle-outline',
    titleKey: 'config.hub.sections.features',
    descriptionKey: 'config.hub.sections.featuresDesc',
    screen: 'ConfigFeatures',
    accessRoles: ['OWNER'],
    domain: 'features',
  },
  {
    id: 'team',
    icon: 'account-group-outline',
    titleKey: 'config.hub.sections.team',
    descriptionKey: 'config.hub.sections.teamDesc',
    screen: 'ConfigTeam',
    accessRoles: ['OWNER'],
    domain: 'team',
  },
  {
    id: 'notifications',
    icon: 'bell-outline',
    titleKey: 'config.hub.sections.notifications',
    descriptionKey: 'config.hub.sections.notificationsDesc',
    screen: 'ConfigNotifications',
    accessRoles: ['OWNER', 'MANAGER'],
    domain: null,
  },
  {
    id: 'language',
    icon: 'translate',
    titleKey: 'config.hub.sections.language',
    descriptionKey: 'config.hub.sections.languageDesc',
    screen: 'ConfigLanguage',
    accessRoles: ['OWNER', 'MANAGER'],
    domain: null,
  },
];

// ============================================
// SKELETON COMPONENT
// ============================================

function SkeletonCard({ colors }: { colors: any }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        marginHorizontal: spacing.screenHorizontal,
        marginBottom: 8,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.card,
      }}
    >
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.premiumCard }} />
      <View style={{ flex: 1, marginLeft: 12, gap: 6 }}>
        <View style={{ width: '60%', height: 14, borderRadius: 6, backgroundColor: colors.premiumCard }} />
        <View style={{ width: '85%', height: 10, borderRadius: 4, backgroundColor: colors.premiumCard }} />
        <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.premiumCard, marginTop: 4 }} />
      </View>
    </View>
  );
}

// ============================================
// STATUS ICON HELPER
// ============================================

function SectionStatusIcon({ section, colors, completion }: { section: ConfigSectionCard; colors: any; completion: any }) {
  // Derive status from completion data per domain
  const domainCompletion = completion?.domains?.[section.domain ?? ''];
  if (domainCompletion === 100) {
    return (
      <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: `${colors.success}26`, alignItems: 'center', justifyContent: 'center' }}>
        <MaterialCommunityIcons name="check" size={10} color={colors.success} />
      </View>
    );
  }
  if (domainCompletion != null && domainCompletion < 50) {
    return (
      <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: `${colors.warning}26`, alignItems: 'center', justifyContent: 'center' }}>
        <MaterialCommunityIcons name="alert" size={10} color={colors.warning} />
      </View>
    );
  }
  return null;
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function ConfigHubScreen() {
  const { t } = useI18n();
  const colors = useColors();
  const navigation = useNavigation<any>();
  const { user } = useAuth();

  // Determine user role for this restaurant
  const userRole: UserRole = useMemo(() => {
    const roles = user?.roles || [];
    const ownerRole = roles.find((r) => r.role === 'OWNER');
    if (ownerRole) return 'OWNER';
    return 'MANAGER';
  }, [user]);

  // Get restaurant ID from user's roles
  const restaurantId = useMemo(() => {
    const roles = user?.roles || [];
    const restaurantRole = roles.find((r) => r.restaurant_id);
    return restaurantRole?.restaurant_id || '';
  }, [user]);

  const { config, completion, isLoading, isCompletionLoading, refetch } = useRestaurantConfig(restaurantId);

  // Filter sections by user role
  const visibleSections = useMemo(() => {
    return CONFIG_SECTIONS.filter((section) =>
      section.accessRoles.includes(userRole),
    );
  }, [userRole]);

  const completionPercentage = completion?.percentage ?? 0;

  const [refreshing, setRefreshing] = React.useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  // Loading skeleton
  if (isLoading) {
    return (
      <ScreenContainer>
      <ScrollView style={{ flex: 1, backgroundColor: colors.backgroundSecondary }}>
        {/* Skeleton header */}
        <View style={{ marginHorizontal: spacing.screenHorizontal, marginTop: spacing[4], marginBottom: spacing[4] }}>
          <View
            style={{
              backgroundColor: colors.premiumCard,
              borderRadius: 20,
              padding: 16,
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            <View style={{ position: 'absolute', right: -32, top: -32, width: 128, height: 128, borderRadius: 64, backgroundColor: `${colors.primary}1A` }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.premiumCardGlassLight }} />
              <View style={{ flex: 1, gap: 6 }}>
                <View style={{ width: '55%', height: 16, borderRadius: 4, backgroundColor: colors.premiumCardGlass }} />
                <View style={{ width: '35%', height: 10, borderRadius: 4, backgroundColor: colors.premiumCardGlassLight }} />
              </View>
            </View>
            <View style={{ height: 6, backgroundColor: colors.premiumCardGlass, borderRadius: 3, marginTop: 14 }} />
          </View>
        </View>
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} colors={colors} />
        ))}
      </ScrollView>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.backgroundSecondary }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={[colors.primary]}
          tintColor={colors.primary}
        />
      }
    >
      {/* ── Dark Premium Header with progress ── */}
      <View
        style={{
          marginHorizontal: spacing.screenHorizontal,
          marginTop: spacing[4],
          marginBottom: spacing[4],
          backgroundColor: colors.premiumCard,
          borderRadius: 20,
          padding: 16,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Accent circle decoration */}
        <View
          style={{
            position: 'absolute',
            right: -32,
            top: -32,
            width: 128,
            height: 128,
            borderRadius: 64,
            backgroundColor: `${colors.primary}1A`,
          }}
        />
        <View style={{ position: 'relative' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                backgroundColor: `${colors.primary}33`,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <MaterialCommunityIcons name="cog" size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.premiumCardForeground, fontSize: 16, fontWeight: '700' }}>
                {t('config.hub.title')}
              </Text>
              <Text style={{ color: colors.premiumCardMuted, fontSize: 12, marginTop: 1 }}>
                {t('config.hub.setupCompletion', {
                  percentage: Math.round(completionPercentage),
                })}
              </Text>
            </View>
          </View>

          {/* Progress bar with gradient fill */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1, height: 6, backgroundColor: colors.premiumCardBorder, borderRadius: 3, overflow: 'hidden' }}>
              <LinearGradient
                colors={[colors.primary, colors.accent]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{
                  height: '100%',
                  width: `${completionPercentage}%`,
                  borderRadius: 3,
                }}
              />
            </View>
            <Text style={{ color: colors.premiumCardForeground, fontSize: 12, fontWeight: '700', minWidth: 36, textAlign: 'right' }}>
              {Math.round(completionPercentage)}%
            </Text>
          </View>
        </View>
      </View>

      {/* ── Module List Items ── */}
      {visibleSections.map((section) => (
        <TouchableOpacity
          key={section.id}
          activeOpacity={0.7}
          onPress={() => navigation.navigate(section.screen)}
          accessibilityRole="button"
          accessibilityLabel={t(section.titleKey)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            padding: 12,
            marginHorizontal: spacing.screenHorizontal,
            marginBottom: 8,
            backgroundColor: colors.card,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          {/* Icon box with muted bg */}
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              backgroundColor: colors.premiumCard,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <MaterialCommunityIcons
              name={section.icon as any}
              size={20}
              color={colors.primary}
            />
          </View>

          {/* Text + micro progress */}
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <Text
                style={{ fontSize: 14, fontWeight: '600', color: colors.foreground }}
                numberOfLines={1}
              >
                {t(section.titleKey)}
              </Text>
              <SectionStatusIcon section={section} colors={colors} completion={completion} />
            </View>
            <Text
              style={{ fontSize: 12, color: colors.foregroundSecondary }}
              numberOfLines={1}
            >
              {t(section.descriptionKey)}
            </Text>
            {/* Micro progress bar per domain */}
            {section.domain && completion?.domains?.[section.domain] != null && (
              <View style={{ marginTop: 6, height: 3, borderRadius: 1.5, backgroundColor: colors.premiumCard, overflow: 'hidden' }}>
                <View
                  style={{
                    height: '100%',
                    borderRadius: 1.5,
                    width: `${completion.domains[section.domain]}%`,
                    backgroundColor:
                      completion.domains[section.domain] === 100
                        ? colors.success
                        : completion.domains[section.domain] >= 70
                          ? colors.primary
                          : colors.warning,
                  }}
                />
              </View>
            )}
          </View>

          {/* Chevron */}
          <MaterialCommunityIcons
            name="chevron-right"
            size={18}
            color={colors.foregroundSecondary}
          />
        </TouchableOpacity>
      ))}

      {/* Bottom spacing */}
      <View style={{ height: spacing[10] }} />
    </ScrollView>
    </ScreenContainer>
  );
}
