import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ScrollView,
} from 'react-native';
import { Text, Card, Button, Badge, Divider } from 'react-native-paper';
import { useI18n } from '@/shared/hooks/useI18n';
import { useColors, useOkinawaTheme } from '@okinawa/shared/contexts/ThemeContext';
import { spacing, borderRadius } from '@okinawa/shared/theme/spacing';
import { typography } from '@okinawa/shared/theme/typography';
import { colorPalette, darkTheme } from '@okinawa/shared/theme/colors';
import ApiService from '@/shared/services/api';
import socketService from '../../services/socket';

type CourseStatus = 'upcoming' | 'active' | 'served';

interface TastingCourse {
  id: string;
  order: number;
  name: string;
  description: string;
  winePairing?: string;
  status: CourseStatus;
  servedAt?: string;
}

interface ChefTableSession {
  id: string;
  guestCount: number;
  startedAt: string;
  courses: TastingCourse[];
  totalCourses: number;
  currentCourseIndex: number;
}

/**
 * ChefTableScreen
 *
 * Restaurant-side screen for managing chef's table tasting menu progression.
 * Shows courses in sequential order with wine pairings, timing display,
 * and CTA for advancing to the next course.
 * Uses an elegant dark theme variant.
 */
export default function ChefTableScreen() {
  const { t } = useI18n();
  const { isDark } = useOkinawaTheme();
  const colors = useColors();

  // Chef's Table uses a dark-themed palette for elegance
  const elegantBg = isDark ? colors.background : colorPalette.neutral[900];
  const elegantFg = isDark ? colors.foreground : colorPalette.neutral[50];
  const elegantFgSec = isDark ? colors.foregroundSecondary : colorPalette.neutral[300];
  const elegantCard = isDark ? colors.card : colorPalette.neutral[800];
  const elegantBorder = isDark ? colors.border : colorPalette.neutral[700];
  const elegantAccent = colorPalette.accent[400];

  const [session, setSession] = useState<ChefTableSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadSession = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await ApiService.get('/orders?serviceType=chefs-table&status=active');
      const data = res.data;
      if (data && data.length > 0) {
        setSession(data[0]);
      }
    } catch (error) {
      console.error('Failed to load chef table session:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSession();

    socketService.connect();
    socketService.on('cheftable:updated', (updatedSession: unknown) => {
      setSession(updatedSession as ChefTableSession);
    });

    return () => {
      socketService.off('cheftable:updated');
    };
  }, [loadSession]);

  const handleNextCourse = useCallback(async () => {
    if (!session) return;

    try {
      const nextIndex = session.currentCourseIndex + 1;
      if (nextIndex >= session.totalCourses) {
        Alert.alert(t('common.done'), t('chefTable.title'));
        return;
      }

      await ApiService.patch(`/orders/${session.id}/next-course`, {
        courseIndex: nextIndex,
      });

      setSession((prev) => {
        if (!prev) return prev;
        const updatedCourses = prev.courses.map((course, idx) => {
          if (idx === prev.currentCourseIndex) {
            return { ...course, status: 'served' as CourseStatus, servedAt: new Date().toISOString() };
          }
          if (idx === nextIndex) {
            return { ...course, status: 'active' as CourseStatus };
          }
          return course;
        });
        return {
          ...prev,
          currentCourseIndex: nextIndex,
          courses: updatedCourses,
        };
      });
    } catch (error) {
      Alert.alert(t('common.error'), t('errors.generic'));
    }
  }, [session, t]);

  const getElapsedTime = useCallback((startedAt: string): string => {
    const elapsed = Date.now() - new Date(startedAt).getTime();
    const minutes = Math.floor(elapsed / 60000);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) {
      return `${hours}h ${minutes % 60}min`;
    }
    return `${minutes}min`;
  }, []);

  const getCourseStatusColor = useCallback(
    (status: CourseStatus): string => {
      switch (status) {
        case 'active':
          return elegantAccent;
        case 'served':
          return colors.success;
        case 'upcoming':
        default:
          return elegantFgSec;
      }
    },
    [elegantAccent, colors.success, elegantFgSec],
  );

  const renderCourse = useCallback(
    ({ item, index }: { item: TastingCourse; index: number }) => {
      const isActive = item.status === 'active';
      const isServed = item.status === 'served';

      return (
        <View
          style={[
            styles.courseContainer,
            isActive && styles.courseActive,
            isActive && { borderColor: elegantAccent },
          ]}
        >
          {/* Timeline indicator */}
          <View style={styles.timelineColumn}>
            <View
              style={[
                styles.timelineDot,
                {
                  backgroundColor: getCourseStatusColor(item.status),
                  borderColor: isActive ? elegantAccent : 'transparent',
                  borderWidth: isActive ? 2 : 0,
                },
              ]}
            />
            {index < (session?.totalCourses ?? 0) - 1 && (
              <View
                style={[
                  styles.timelineLine,
                  {
                    backgroundColor: isServed ? colors.success : elegantBorder,
                  },
                ]}
              />
            )}
          </View>

          {/* Course content */}
          <Card
            style={[
              styles.courseCard,
              {
                backgroundColor: isActive ? elegantCard : 'transparent',
                borderColor: isActive ? elegantAccent : elegantBorder,
                borderWidth: isActive ? 1 : 0,
              },
            ]}
          >
            <Card.Content>
              <View style={styles.courseHeader}>
                <Text
                  style={[
                    typography.labelSmall,
                    {
                      color: getCourseStatusColor(item.status),
                      textTransform: 'uppercase',
                    },
                  ]}
                >
                  {t('chefTable.course')} {item.order}
                </Text>
                {isServed && item.servedAt && (
                  <Text
                    style={[typography.caption, { color: colors.success }]}
                  >
                    {getElapsedTime(item.servedAt)}
                  </Text>
                )}
              </View>

              <Text
                style={[
                  typography.h3,
                  {
                    color: isActive ? elegantFg : elegantFgSec,
                    opacity: isServed ? 0.6 : 1,
                  },
                ]}
              >
                {item.name}
              </Text>

              {item.description ? (
                <Text
                  style={[
                    typography.bodySmall,
                    {
                      color: elegantFgSec,
                      marginTop: spacing[1],
                      opacity: isServed ? 0.5 : 0.8,
                    },
                  ]}
                >
                  {item.description}
                </Text>
              ) : null}

              {item.winePairing ? (
                <View style={[styles.winePairing, { borderTopColor: elegantBorder }]}>
                  <Text
                    style={[
                      typography.labelSmall,
                      { color: elegantAccent },
                    ]}
                  >
                    {t('chefTable.winePairing')}
                  </Text>
                  <Text
                    style={[
                      typography.bodySmall,
                      { color: elegantFg, opacity: 0.8 },
                    ]}
                  >
                    {item.winePairing}
                  </Text>
                </View>
              ) : null}
            </Card.Content>
          </Card>
        </View>
      );
    },
    [session, elegantAccent, elegantBorder, elegantCard, elegantFg, elegantFgSec, colors.success, getCourseStatusColor, getElapsedTime, t],
  );

  if (!session) {
    return (
      <ScreenContainer>
      <View style={[styles.container, { backgroundColor: elegantBg }]}>
        <View style={styles.emptyContainer}>
          <Text style={[typography.h2, { color: elegantFg }]}>
            {t('chefTable.title')}
          </Text>
          <Text style={[typography.bodyLarge, { color: elegantFgSec, marginTop: spacing[2] }]}>
            {t('empty.orders')}
          </Text>
        </View>
      </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
    <View style={[styles.container, { backgroundColor: elegantBg }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[typography.h1, { color: elegantFg }]}>
          {t('chefTable.title')}
        </Text>
        <View style={styles.sessionInfo}>
          <View style={styles.infoChip}>
            <Text style={[typography.labelMedium, { color: elegantAccent }]}>
              {session.guestCount} {t('common.user')}
            </Text>
          </View>
          <View style={styles.infoChip}>
            <Text style={[typography.labelMedium, { color: elegantFgSec }]}>
              {getElapsedTime(session.startedAt)}
            </Text>
          </View>
          <View style={styles.infoChip}>
            <Text style={[typography.labelMedium, { color: elegantFgSec }]}>
              {session.currentCourseIndex + 1}/{session.totalCourses}
            </Text>
          </View>
        </View>
      </View>

      {/* Courses timeline */}
      <FlatList
        data={session.courses}
        keyExtractor={(item) => item.id}
        renderItem={renderCourse}
        contentContainerStyle={styles.coursesList}
        showsVerticalScrollIndicator={false}
        getItemLayout={(_, index) => ({
          length: 120,
          offset: 120 * index,
          index,
        })}
      />

      {/* Next course CTA */}
      {session.currentCourseIndex < session.totalCourses - 1 && (
        <View style={[styles.ctaContainer, { borderTopColor: elegantBorder }]}>
          <Button
            mode="contained"
            onPress={handleNextCourse}
            style={[styles.nextCourseButton, { backgroundColor: elegantAccent }]}
            labelStyle={[typography.buttonLarge, { color: colorPalette.neutral[900] }]}
            accessibilityRole="button"
            accessibilityLabel="Advance to next course"
          >
            {t('chefTable.nextCourse')}
          </Button>
        </View>
      )}
    </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: spacing.screenHorizontal,
    paddingTop: spacing[6],
    paddingBottom: spacing[4],
  },
  sessionInfo: {
    flexDirection: 'row',
    gap: spacing[3],
    marginTop: spacing[3],
  },
  infoChip: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
  },
  coursesList: {
    paddingHorizontal: spacing.screenHorizontal,
    paddingBottom: spacing[24],
  },
  courseContainer: {
    flexDirection: 'row',
    minHeight: 100,
  },
  courseActive: {
    borderRadius: borderRadius.card,
  },
  timelineColumn: {
    width: 32,
    alignItems: 'center',
    paddingTop: spacing[4],
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    marginTop: spacing[1],
  },
  courseCard: {
    flex: 1,
    marginLeft: spacing[2],
    marginBottom: spacing[2],
    borderRadius: borderRadius.card,
  },
  courseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing[1],
  },
  winePairing: {
    marginTop: spacing[3],
    paddingTop: spacing[2],
    borderTopWidth: 1,
    gap: spacing[0.5],
  },
  ctaContainer: {
    padding: spacing.screenHorizontal,
    paddingBottom: spacing[8],
    borderTopWidth: 1,
  },
  nextCourseButton: {
    borderRadius: borderRadius.button,
    paddingVertical: spacing[1],
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
