/** Config estática de navegação da Home (não são dados de negócio). */

export const MOCK_QUICK_ACTIONS = [
  {
    id: 'scan',
    label: 'Escanear',
    icon: 'qr-code-outline' as const,
    route: 'QRScanner',
  },
  {
    id: 'reserve',
    label: 'Reservar',
    icon: 'calendar-outline' as const,
    route: 'RestaurantReserve',
    params: {},
  },
  {
    id: 'queue',
    label: 'Fila Virtual',
    icon: 'timer-outline' as const,
    route: 'RestaurantVirtualQueue',
    params: {},
  },
  { id: 'menu', label: 'Cardápio', icon: 'restaurant-outline' as const, route: 'MenuTab' },
] as const;
