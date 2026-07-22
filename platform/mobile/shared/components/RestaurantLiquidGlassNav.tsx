/**
 * Restaurant app — Liquid Glass bottom navigation (role-aware)
 */

import React, { useMemo } from 'react';
import {
  LayoutDashboard,
  ClipboardList,
  ChefHat,
  Users,
  Settings,
  CalendarDays,
  LayoutGrid,
  Shield,
  TrendingUp,
  DollarSign,
  BookOpen,
  Package,
  Wine,
  Beer,
  Flame,
  Bell,
  HandPlatter,
  Star,
  Smartphone,
  UtensilsCrossed,
  Radio,
} from 'lucide-react-native';
import LiquidGlassBottomNav, { type LiquidGlassNavItem } from './LiquidGlassBottomNav';

const defaultNavItems: LiquidGlassNavItem[] = [
  { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { id: 'orders', icon: ClipboardList, label: 'Pedidos' },
  { id: 'kitchen-kds', icon: ChefHat, label: 'Cozinha' },
  { id: 'tables', icon: Users, label: 'Mesas' },
  { id: 'settings', icon: Settings, label: 'Config' },
];

const managerNavItems: LiquidGlassNavItem[] = [
  { id: 'manager-ops', icon: LayoutDashboard, label: 'Operação' },
  { id: 'manager-orders', icon: ClipboardList, label: 'Pedidos' },
  { id: 'manager-approvals', icon: Shield, label: 'Aprovações' },
  { id: 'manager-cash', icon: DollarSign, label: 'Caixa' },
  { id: 'manager-tables', icon: LayoutGrid, label: 'Mesas' },
  { id: 'manager-staff', icon: Users, label: 'Equipe' },
  { id: 'manager-report', icon: TrendingUp, label: 'Relatório' },
  { id: 'manager-stock', icon: Package, label: 'Estoque' },
  { id: 'manager-promotions', icon: Star, label: 'Promoções' },
  { id: 'manager-qr', icon: Smartphone, label: 'QR Codes' },
  { id: 'manager-settings', icon: Settings, label: 'Config' },
];

const maitreNavItems: LiquidGlassNavItem[] = [
  { id: 'maitre-reservations', icon: CalendarDays, label: 'Reservas' },
  { id: 'maitre-flow', icon: Users, label: 'Fluxo' },
  { id: 'maitre-tables', icon: LayoutGrid, label: 'Mesas' },
  { id: 'maitre-management', icon: ClipboardList, label: 'Gestão' },
  { id: 'maitre-settings', icon: Settings, label: 'Config' },
];

const chefNavItems: LiquidGlassNavItem[] = [
  { id: 'chef-kds', icon: ChefHat, label: 'KDS' },
  { id: 'chef-approvals', icon: Shield, label: 'Aprovações' },
  { id: 'chef-analytics', icon: TrendingUp, label: 'Analytics' },
  { id: 'chef-cost', icon: DollarSign, label: 'Custo' },
  { id: 'chef-menu', icon: BookOpen, label: 'Cardápio' },
  { id: 'chef-stock', icon: Package, label: 'Estoque' },
  { id: 'chef-settings', icon: Settings, label: 'Config' },
];

const barmanNavItems: LiquidGlassNavItem[] = [
  { id: 'barman-station', icon: Beer, label: 'Estação' },
  { id: 'bar-kds', icon: Wine, label: 'KDS Bar' },
  { id: 'bar-recipes', icon: BookOpen, label: 'Receitas' },
  { id: 'bar-stock', icon: Package, label: 'Estoque' },
  { id: 'barman-settings', icon: Settings, label: 'Config' },
];

const cookNavItems: LiquidGlassNavItem[] = [
  { id: 'cook-station', icon: Flame, label: 'Minha Estação' },
  { id: 'cook-kds', icon: ChefHat, label: 'KDS Cozinha' },
  { id: 'cook-settings', icon: Settings, label: 'Config' },
];

const waiterNavItems: LiquidGlassNavItem[] = [
  { id: 'waiter', icon: Radio, label: 'Ao Vivo' },
  { id: 'waiter-table-actions', icon: LayoutGrid, label: 'Mesas' },
  { id: 'waiter-order-management', icon: ClipboardList, label: 'Pedidos' },
  { id: 'waiter-kitchen', icon: ChefHat, label: 'Cozinha' },
  { id: 'waiter-assistance', icon: Star, label: 'Assistência' },
  { id: 'waiter-table-charge', icon: DollarSign, label: 'Cobrar' },
  { id: 'waiter-settings', icon: Settings, label: 'Config' },
];

const NAV_BY_VARIANT: Record<string, LiquidGlassNavItem[]> = {
  default: defaultNavItems,
  manager: managerNavItems,
  maitre: maitreNavItems,
  chef: chefNavItems,
  barman: barmanNavItems,
  cook: cookNavItems,
  waiter: waiterNavItems,
};

export type RestaurantNavVariant =
  | 'default'
  | 'manager'
  | 'maitre'
  | 'chef'
  | 'barman'
  | 'cook'
  | 'waiter';

interface RestaurantLiquidGlassNavProps {
  variant?: string;
  activeTab: string;
  onNavigate: (screen: string) => void;
}

const RestaurantLiquidGlassNav: React.FC<RestaurantLiquidGlassNavProps> = ({
  variant = 'default',
  activeTab,
  onNavigate,
}) => {
  const items = useMemo(
    () => NAV_BY_VARIANT[variant] ?? defaultNavItems,
    [variant],
  );

  return (
    <LiquidGlassBottomNav items={items} activeTab={activeTab} onNavigate={onNavigate} />
  );
};

export default RestaurantLiquidGlassNav;
