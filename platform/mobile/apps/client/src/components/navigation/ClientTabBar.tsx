import React, { useContext } from 'react';
import { View, StyleSheet } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BottomTabBarHeightCallbackContext } from '@react-navigation/bottom-tabs';
import ClientLiquidGlassNav from '@okinawa/shared/components/ClientLiquidGlassNav';

const ROUTE_TO_TAB: Record<string, string> = {
  Home: 'home',
  Orders: 'orders',
  WalletTab: 'wallet',
  Wallet: 'wallet',
  Profile: 'profile',
};

const TAB_TO_ROUTE: Record<string, string> = {
  home: 'Home',
  orders: 'Orders',
  wallet: 'WalletTab',
  profile: 'Profile',
};

export function ClientTabBar({ state, navigation }: BottomTabBarProps) {
  const onHeightChange = useContext(BottomTabBarHeightCallbackContext);
  const activeRoute = state.routes[state.index]?.name ?? 'Home';
  const activeTab = ROUTE_TO_TAB[activeRoute] ?? 'home';

  return (
    <View
      style={styles.wrap}
      pointerEvents="box-none"
      onLayout={(event) => onHeightChange?.(event.nativeEvent.layout.height)}
    >
      <ClientLiquidGlassNav
        activeTab={activeTab}
        onNavigate={(tab) => {
          const preferredRoute = TAB_TO_ROUTE[tab];
          const route = state.routes.some((candidate) => candidate.name === preferredRoute)
            ? preferredRoute
            : tab === 'wallet'
              ? 'Wallet'
              : preferredRoute;
          if (route) navigation.navigate(route);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
  },
});
