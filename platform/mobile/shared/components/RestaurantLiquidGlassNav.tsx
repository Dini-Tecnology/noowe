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
  Star,
  Smartphone,
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

/**
 * Itens em hold (aditivo de perfis §8): ficam fora da barra, sem "em breve", até a fase em que forem
 * construídos. Para religar um item, tirar o id desta lista; as telas continuam no código.
 */
export const HOLD_NAV_IDS: readonly string[] = [
  'manager-stock', // Estoque
  'chef-stock',
  'bar-stock',
  'chef-cost', // CMV, margem e custo por prato
  'bar-recipes', // fichas técnicas de drinks
  'chef-approvals', // aprovações de Chef's Table
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

/** Itens da barra de um perfil, sem os escondidos por capability nem os em hold. */
export function visibleNavItems(variant: string, hiddenItemIds: readonly string[] = []): LiquidGlassNavItem[] {
  return (NAV_BY_VARIANT[variant] ?? defaultNavItems).filter(
    (item) => !hiddenItemIds.includes(item.id) && !HOLD_NAV_IDS.includes(item.id),
  );
}

/** Abas que são a mesma coisa em perfis diferentes: quem acumula funções vê uma só (ADR-025). */
const NAV_KEY_BY_ITEM: Record<string, string> = {
  settings: 'config', 'manager-settings': 'config', 'maitre-settings': 'config', 'chef-settings': 'config',
  'barman-settings': 'config', 'cook-settings': 'config', 'waiter-settings': 'config',
  tables: 'tables', 'manager-tables': 'tables', 'maitre-tables': 'tables', 'waiter-table-actions': 'tables',
  orders: 'orders', 'manager-orders': 'orders', 'waiter-order-management': 'orders',
  'kitchen-kds': 'kds', 'chef-kds': 'kds', 'cook-kds': 'kds', 'waiter-kitchen': 'kds',
};

export type MergedNavItem = LiquidGlassNavItem & { ownerVariant: string };

/** A barra de quem tem várias funções, com a principal primeiro e sem abas repetidas. */
export function mergedNavItems(variants: readonly string[], hiddenItemIds: readonly string[] = []): MergedNavItem[] {
  const seen = new Set<string>();
  const merged: MergedNavItem[] = [];
  for (const variant of variants) {
    for (const item of visibleNavItems(variant, hiddenItemIds)) {
      const key = NAV_KEY_BY_ITEM[item.id] ?? item.id;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push({ ...item, ownerVariant: variant });
    }
  }
  return merged;
}

/** A aba acesa: a tela aberta pode ser de uma aba que a junção deixou de fora. */
export function mergedActiveTab(activeTab: string, items: readonly LiquidGlassNavItem[]): string {
  if (items.some((item) => item.id === activeTab)) return activeTab;
  const key = NAV_KEY_BY_ITEM[activeTab];
  return items.find((item) => key !== undefined && NAV_KEY_BY_ITEM[item.id] === key)?.id ?? activeTab;
}

interface RestaurantLiquidGlassNavProps {
  variant?: string;
  /** Duas ou mais: junta as barras desses perfis. */
  mergedVariants?: readonly string[];
  activeTab: string;
  onNavigate: (screen: string) => void;
  hiddenItemIds?: string[];
}

const RestaurantLiquidGlassNav: React.FC<RestaurantLiquidGlassNavProps> = ({
  variant = 'default',
  mergedVariants,
  activeTab,
  onNavigate,
  hiddenItemIds = [],
}) => {
  const items = useMemo<LiquidGlassNavItem[]>(
    () => (mergedVariants && mergedVariants.length > 1
      ? mergedNavItems(mergedVariants, hiddenItemIds)
      : visibleNavItems(variant, hiddenItemIds)),
    [hiddenItemIds, mergedVariants, variant],
  );

  return (
    <LiquidGlassBottomNav items={items} activeTab={mergedActiveTab(activeTab, items)} onNavigate={onNavigate} />
  );
};

export default RestaurantLiquidGlassNav;
