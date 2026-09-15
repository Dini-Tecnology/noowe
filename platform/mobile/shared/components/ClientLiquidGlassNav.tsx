/**
 * Client app — Liquid Glass bottom navigation
 */

import React from 'react';
import { Home, ClipboardList, Wallet, User } from 'lucide-react-native';
import LiquidGlassBottomNav, { type LiquidGlassNavItem } from './LiquidGlassBottomNav';

const navItems: LiquidGlassNavItem[] = [
  { id: 'home', icon: Home, label: 'Início' },
  { id: 'orders', icon: ClipboardList, label: 'Pedidos' },
  { id: 'wallet', icon: Wallet, label: 'Carteira' },
  { id: 'profile', icon: User, label: 'Perfil' },
];

interface ClientLiquidGlassNavProps {
  activeTab: string;
  onNavigate: (tabId: string) => void;
}

const ClientLiquidGlassNav: React.FC<ClientLiquidGlassNavProps> = ({ activeTab, onNavigate }) => (
  <LiquidGlassBottomNav items={navItems} activeTab={activeTab} onNavigate={onNavigate} />
);

export default ClientLiquidGlassNav;
