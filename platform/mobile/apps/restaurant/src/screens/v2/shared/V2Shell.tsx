import React, { ReactNode } from 'react';
import { RefreshControl, View, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { ChevronLeft } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';

interface V2ShellProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  headerRight?: ReactNode;
  children: ReactNode;
  scroll?: boolean;
  bottomPadding?: number;
  onRefresh?: () => void | Promise<void>;
  refreshing?: boolean;
}

export function V2Shell({
  title,
  subtitle,
  showBack = false,
  onBack,
  headerRight,
  children,
  scroll = true,
  bottomPadding = 100,
  onRefresh,
  refreshing: controlledRefreshing,
}: V2ShellProps) {
  const colors = useColors();
  const navigation = useNavigation();
  const [internalRefreshing, setInternalRefreshing] = React.useState(false);
  const refreshing = controlledRefreshing ?? internalRefreshing;

  const handleRefresh = React.useCallback(async () => {
    if (!onRefresh || refreshing) return;
    if (controlledRefreshing === undefined) setInternalRefreshing(true);
    try {
      await onRefresh();
    } finally {
      if (controlledRefreshing === undefined) setInternalRefreshing(false);
    }
  }, [controlledRefreshing, onRefresh, refreshing]);

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    navigation.goBack();
  };

  const header = (
    <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          {showBack && (
            <TouchableOpacity
              onPress={handleBack}
              style={styles.backBtn}
              accessibilityLabel="Voltar"
            >
              <ChevronLeft size={22} color={colors.foregroundSecondary} />
            </TouchableOpacity>
          )}
          <View style={styles.headerText}>
            <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
            {subtitle ? (
              <Text style={[styles.subtitle, { color: colors.foregroundSecondary }]}>{subtitle}</Text>
            ) : null}
          </View>
        </View>
        {headerRight}
      </View>
    </View>
  );

  if (!scroll) {
    return (
      <ScreenContainer>
        {header}
        <View style={[styles.body, { paddingBottom: bottomPadding }]}>{children}</View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      {header}
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: bottomPadding }]}
        showsVerticalScrollIndicator={false}
        alwaysBounceVertical={Boolean(onRefresh)}
        refreshControl={onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { void handleRefresh(); }}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        ) : undefined}
      >
        {children}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 4,
  },
  backBtn: {
    padding: 8,
    marginLeft: -8,
    borderRadius: 999,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  body: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
});
