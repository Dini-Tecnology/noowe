import React, { useContext, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BottomTabBarHeightCallbackContext } from '@react-navigation/bottom-tabs';
import RestaurantLiquidGlassNav from '@okinawa/shared/components/RestaurantLiquidGlassNav';
import {
  ChefRoleView,
  BarmanRoleView,
  CookRoleView,
  MaitreRoleView,
  ManagerRoleView,
  WaiterRoleView,
  useRestaurantRole,
} from '../../contexts/RestaurantRoleContext';

const ROUTE_TO_TAB: Record<string, string> = {
  Hub: 'dashboard',
  Orders: 'orders',
  Kitchen: 'kitchen-kds',
  Tables: 'tables',
  Settings: 'settings',
};

const TAB_TO_ROUTE: Record<string, string> = {
  dashboard: 'Hub',
  orders: 'Orders',
  'kitchen-kds': 'Kitchen',
  tables: 'Tables',
  settings: 'Settings',
};

export function RestaurantTabBar({ state, navigation }: BottomTabBarProps) {
  const onHeightChange = useContext(BottomTabBarHeightCallbackContext);
  const {
    role,
    managerView,
    setManagerView,
    maitreView,
    setMaitreView,
    chefView,
    setChefView,
    barmanView,
    setBarmanView,
    cookView,
    setCookView,
    waiterView,
    setWaiterView,
    serviceFeatures,
  } = useRestaurantRole();
  const activeRoute = state.routes[state.index]?.name ?? 'Hub';
  const variant =
    role === 'manager'
      ? 'manager'
      : role === 'maitre'
        ? 'maitre'
        : role === 'chef'
          ? 'chef'
          : role === 'barman'
            ? 'barman'
            : role === 'cook'
              ? 'cook'
              : role === 'waiter'
                ? 'waiter'
                : 'default';
  const activeTab =
    variant === 'manager'
      ? managerView
      : variant === 'maitre'
        ? maitreView
        : variant === 'chef'
          ? chefView
          : variant === 'barman'
            ? barmanView
            : variant === 'cook'
              ? cookView
              : variant === 'waiter'
                ? waiterView
            : ROUTE_TO_TAB[activeRoute] ?? 'dashboard';
  const hiddenItemIds = useMemo(() => {
    const hidden: string[] = [];
    if (!serviceFeatures.tableManagement) {
      hidden.push('tables', 'manager-tables', 'maitre-tables', 'waiter-table-actions', 'waiter-table-charge');
    }
    if (!serviceFeatures.reservations) hidden.push('maitre-reservations');
    if (!serviceFeatures.virtualQueue) hidden.push('maitre-flow');
    if (!serviceFeatures.callWaiter && !serviceFeatures.tableManagement) {
      hidden.push('waiter', 'waiter-assistance');
    }
    return hidden;
  }, [serviceFeatures]);

  return (
    <View
      style={styles.wrap}
      pointerEvents="box-none"
      onLayout={(event) => onHeightChange?.(event.nativeEvent.layout.height)}
    >
      <RestaurantLiquidGlassNav
        variant={variant}
        activeTab={activeTab}
        hiddenItemIds={hiddenItemIds}
        onNavigate={(tab) => {
          if (variant === 'manager') {
            setManagerView(tab as ManagerRoleView);
            const routeName = tab === 'manager-tables' ? 'Tables' : 'Hub';
            if (state.routes.some((item) => item.name === routeName)) {
              navigation.navigate(routeName);
            }
            return;
          }
          if (variant === 'maitre') {
            setMaitreView(tab as MaitreRoleView);
            const routeName = tab === 'maitre-tables' ? 'Tables' : 'Hub';
            if (state.routes.some((item) => item.name === routeName)) {
              navigation.navigate(routeName);
            }
            return;
          }
          if (variant === 'chef') {
            setChefView(tab as ChefRoleView);
            if (state.routes.some((item) => item.name === 'Hub')) {
              navigation.navigate('Hub');
            }
            return;
          }
          if (variant === 'barman') {
            setBarmanView(tab as BarmanRoleView);
            if (state.routes.some((item) => item.name === 'Hub')) {
              navigation.navigate('Hub');
            }
            return;
          }
          if (variant === 'cook') {
            setCookView(tab as CookRoleView);
            if (state.routes.some((item) => item.name === 'Hub')) {
              navigation.navigate('Hub');
            }
            return;
          }
          if (variant === 'waiter') {
            setWaiterView(tab as WaiterRoleView);
            const routeName = tab === 'waiter-table-actions' ? 'Tables' : 'Hub';
            if (state.routes.some((item) => item.name === routeName)) {
              navigation.navigate(routeName);
            }
            return;
          }
          const route = TAB_TO_ROUTE[tab];
          if (!route) return;
          if (state.routes.some((item) => item.name === route)) {
            navigation.navigate(route);
            return;
          }
          navigation.getParent()?.navigate(route);
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
