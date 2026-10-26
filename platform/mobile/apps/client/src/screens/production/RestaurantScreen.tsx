/* Hallmark · pre-emit critique: P5 H5 E4 S5 R5 V5 */
/* Hallmark · macrostructure: Long Document · tone: luxury utilitarian · anchor hue: orange */
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Dimensions, Image, Linking, Modal, Platform, ScrollView, TouchableOpacity, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import customerBackend, { type CustomerRestaurant } from '../../services/customer-backend';
import { useServiceTypeFor } from '../../hooks/useServiceTypeFeatures';
import { useJourneyModel } from '../../hooks/useJourneyModel';
import { restaurantExperiences } from './home-restaurant-ui';
import { closedCaption, hasNoFreeTable, restaurantEntryState } from './casual-dining-ui';
import { goToComanda, openInComanda } from '../../navigation/comanda';
import { useLeaveTable } from '../../hooks/useLeaveTable';
import { useQuickReorder } from '../../hooks/useQuickReorder';
import { useCart } from '@/shared/contexts/CartContext';
import { isActiveQuickOrder, quickJourneyKeys } from './quick-service-ui';
import { useVisitSession } from '../../contexts/VisitSessionContext';
import { FloatingCartBar } from '../../components/cart/FloatingCartBar';
import { StateView, useQueryRefreshControl, tableLabel } from './shared';
import RestaurantDetailView, { type RestaurantComandaCard, type RestaurantEntryNotice, type RestaurantJourneyAction } from './RestaurantDetailView';

const FULL_TITLE = 'Restaurante lotado';
const FULL_MESSAGE = 'Todas as mesas estão ocupadas, então não dá para abrir mesa pelo QR Code agora.';
const FULL_QUEUE_HINT = ' Entre na fila virtual e avisamos quando sua mesa estiver pronta.';

/** Full-bleed viewer for the photos a restaurant actually published. */
function PhotoGalleryModal({
  visible,
  photos,
  onClose,
}: {
  visible: boolean;
  photos: string[];
  onClose: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width } = Dimensions.get('window');

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + 8 }}>
        <TouchableOpacity
          onPress={onClose}
          style={{ alignSelf: 'flex-end', margin: 16, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.backgroundTertiary }}
          accessibilityRole="button"
          accessibilityLabel="Fechar"
        >
          <Ionicons name="close" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          {photos.map((uri) => (
            <Image
              key={uri}
              source={{ uri }}
              style={{ width: width - 32, height: (width - 32) * 0.62, borderRadius: 16, backgroundColor: colors.backgroundTertiary }}
              resizeMode="cover"
            />
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

/**
 * The restaurant page. Every service model lands here: the page itself is the
 * same for fine dining, casual dining and quick service, and only the journey
 * actions differ — and those come from capability flags, never from the
 * service model name (CLAUDE.md, "um núcleo com três configurações").
 */
export default function RestaurantScreen({ route, navigation }: any) {
  const colors = useColors();
  const { restaurantId, serviceModel: routeModel } = route.params;
  const queryClient = useQueryClient();

  const [galleryOpen, setGalleryOpen] = useState(false);

  const query = useQuery({ queryKey: ['restaurant', restaurantId], queryFn: () => customerBackend.getRestaurant(restaurantId) });
  const { session, selectRestaurant } = useVisitSession();
  // A experiência vem da mesa aberta, do chip da descoberta ou do seletor desta página (ADR-017).
  const journeyModel = useJourneyModel(restaurantId, routeModel);
  const serviceTypeFor = useServiceTypeFor(restaurantId, journeyModel);
  const liveStatus = useQuery({
    queryKey: ['restaurant-live-status', restaurantId],
    queryFn: () => customerBackend.getRestaurantLiveStatus(restaurantId),
    staleTime: 60 * 1000,
  });
  const orderAhead = serviceTypeFor.capabilities?.orderAhead === true;
  const pickupSlots = serviceTypeFor.capabilities?.pickupSlots === true;
  // Quick Service (ADR-013): estado de pedidos, tempo de preparo, local de retirada e histórico aqui.
  const quickStatus = useQuery({
    queryKey: ['quick-status', restaurantId],
    queryFn: async () => (await customerBackend.getQuickServiceStatus([restaurantId]))[restaurantId] ?? null,
    enabled: orderAhead,
    staleTime: 30 * 1000,
  });
  const myOrders = useQuery({
    queryKey: ['orders', 'restaurant', restaurantId],
    queryFn: () => customerBackend.listOrders(20),
    enabled: orderAhead,
    select: (page) => page.data.filter((order) => order.restaurantId === restaurantId && order.serviceModel === 'quick_service'),
    staleTime: 15 * 1000,
  });
  const refreshControl = useQueryRefreshControl([query, liveStatus, ...(orderAhead ? [quickStatus, myOrders] : [])]);
  const favoritesQuery = useQuery({ queryKey: ['favorites'], queryFn: () => customerBackend.listFavorites() });
  const isFavorite = favoritesQuery.data?.some((item) => item.id === restaurantId) ?? false;
  // Optimistic toggle: the heart flips instantly so a double-tap doesn't cause
  // a phantom second write while the round-trip is in flight. Rolls back on
  // error, and reconciles with the server on settle.
  const favorite = useMutation({
    mutationFn: (next: boolean) => customerBackend.setFavorite(restaurantId, next),
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: ['favorites'] });
      const previous = queryClient.getQueryData<CustomerRestaurant[]>(['favorites']);
      queryClient.setQueryData<CustomerRestaurant[]>(['favorites'], (current) => {
        const list = current ?? [];
        if (next) {
          if (list.some((item) => item.id === restaurantId)) return list;
          const seed = query.data ?? list.find((item) => item.id === restaurantId);
          return seed ? [seed, ...list] : list;
        }
        return list.filter((item) => item.id !== restaurantId);
      });
      return { previous };
    },
    onError: (_error, _next, context) => {
      if (context?.previous) queryClient.setQueryData(['favorites'], context.previous);
      Alert.alert('Favoritos', 'Não foi possível atualizar os favoritos. Tente novamente.');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['favorites'] }),
  });
  const toggleFavorite = useCallback(() => favorite.mutate(!isFavorite), [favorite, isFavorite]);
  const cart = useCart();
  const { reorder } = useQuickReorder(navigation);

  const openReserve = useCallback(
    () =>
      navigation.navigate('CreateReservation', {
        restaurantId,
        restaurantName: query.data?.name,
        restaurantPhoto: query.data?.bannerUrl || query.data?.logoUrl || null,
      }),
    [navigation, restaurantId, query.data],
  );
  const openWaitlist = useCallback(() => navigation.navigate('Waitlist', { restaurantId }), [navigation, restaurantId]);
  const openScanner = useCallback(
    () => navigation.navigate('QrScanner', { contextRestaurantId: restaurantId, contextRestaurantName: query.data?.name }),
    [navigation, restaurantId, query.data?.name],
  );

  const startQuickOrder = useCallback((intent: 'now' | 'scheduled') => {
    const state = quickStatus.data;
    if (state && !state.acceptingOrders) {
      const reason = state.state === 'paused' ? 'O restaurante pausou os pedidos por enquanto.'
        : state.state === 'closing' ? 'O restaurante já encerrou os pedidos de hoje.'
        : 'O restaurante não está aceitando pedidos agora.';
      Alert.alert('Pedidos indisponíveis', `${reason} Você ainda pode ver o cardápio.`);
      return;
    }
    cart.setPickupIntent?.(intent);
    navigation.navigate('Menu', { restaurantId });
  }, [quickStatus.data, cart, navigation, restaurantId]);

  const orders = myOrders.data ?? [];
  const activeQuickOrder = orders.find(isActiveQuickOrder);
  const lastQuickOrder = orders[0];

  const openMenu = useCallback(() => {
    // Com comanda aqui o cardápio é filho dela: o "voltar" cai na comanda, não nesta página.
    if (session?.restaurantId === restaurantId && session?.tableSessionId) openInComanda(navigation, 'Menu', { restaurantId });
    else navigation.navigate('Menu', { restaurantId });
  }, [navigation, restaurantId, session?.restaurantId, session?.tableSessionId]);
  const activeSessionHere = session?.restaurantId === restaurantId && !!session?.tableSessionId;
  const activeElsewhere = !!session?.tableSessionId && session.restaurantId !== restaurantId;
  // ADR-021: comanda aqui ou noutro restaurante vence o horário, e o horário vence a lotação.
  // Sem mesa livre, o QR não abre mesa: o "Escanear QR" fica apagado e a saída é a fila virtual.
  const entryState = restaurantEntryState({ activeHere: activeSessionHere, activeElsewhere, status: liveStatus.data });
  const noFreeTable = entryState === 'full';
  const closedLabel = closedCaption(liveStatus.data);
  const { run: leaveTable, label: leaveLabel } = useLeaveTable(navigation);
  const queueEnabled = serviceTypeFor.features.virtualQueue;
  const fullMessage = FULL_MESSAGE + (queueEnabled ? FULL_QUEUE_HINT : '');

  // O status ao vivo pode ter até um minuto: confirma no servidor antes de explicar o bloqueio.
  const explainNoFreeTable = useCallback(async () => {
    const fresh = await liveStatus.refetch();
    if (!hasNoFreeTable(fresh.data)) {
      openScanner();
      return;
    }
    Alert.alert(
      FULL_TITLE,
      fullMessage,
      queueEnabled
        ? [{ text: 'Agora não', style: 'cancel' }, { text: 'Entrar na fila', onPress: openWaitlist }]
        : [{ text: 'OK' }],
    );
  }, [liveStatus, openScanner, openWaitlist, fullMessage, queueEnabled]);

  const entryNotice = useMemo<RestaurantEntryNotice | undefined>(() => {
    if (!noFreeTable || !serviceTypeFor.features.qrOrdering) return undefined;
    return queueEnabled
      ? { title: FULL_TITLE, message: fullMessage, actionLabel: 'Entrar na fila virtual', onAction: openWaitlist }
      : { title: FULL_TITLE, message: fullMessage };
  }, [noFreeTable, serviceTypeFor.features.qrOrdering, queueEnabled, fullMessage, openWaitlist]);

  // Escanear QR · Reservar · Fila Virtual — each one appears only where the
  // restaurant's capabilities enable that entry point. Chamar garçom não entra
  // aqui: é ação de quem já está sentado, não de quem está decidindo entrar.
  const explainClosed = useCallback(() => {
    Alert.alert('Restaurante fechado', `${closedLabel}.${serviceTypeFor.features.reservations ? ' Você ainda pode reservar uma mesa.' : ''}`);
  }, [closedLabel, serviceTypeFor.features.reservations]);
  const explainActiveComanda = useCallback(() => {
    const where = session?.restaurantName ? ` da ${session.restaurantName}` : '';
    Alert.alert(
      'Você já está em uma comanda',
      `Você já está na ${tableLabel(session?.tableNumber)}${where}. Encerre a comanda para continuar.`,
      [{ text: 'Agora não', style: 'cancel' }, { text: 'Ver minha comanda', onPress: () => goToComanda(navigation) }],
    );
  }, [session?.restaurantName, session?.tableNumber, navigation]);

  const journeyActions = useMemo(() => {
    const actions: RestaurantJourneyAction[] = [];
    // ADR-021: com comanda aqui as três portas somem (o card "Ver minha comanda" ocupa o lugar).
    const doors = entryState !== 'in_comanda_here';
    if (doors && serviceTypeFor.features.qrOrdering) {
      if (entryState === 'closed') {
        actions.push({ key: 'scan', icon: 'qr-code-outline', label: 'Escanear QR', caption: closedLabel, disabled: true, onPress: explainClosed });
      } else if (entryState === 'in_comanda_elsewhere') {
        actions.push({ key: 'scan', icon: 'qr-code-outline', label: 'Escanear QR', caption: 'Comanda ativa', disabled: true, onPress: explainActiveComanda });
      } else if (noFreeTable) {
        actions.push({ key: 'scan', icon: 'qr-code-outline', label: 'Escanear QR', caption: 'Lotado', disabled: true, onPress: () => { void explainNoFreeTable(); } });
      } else {
        actions.push({ key: 'scan', icon: 'qr-code-outline', label: 'Escanear QR', highlighted: true, onPress: openScanner });
      }
    }
    if (doors && serviceTypeFor.features.reservations) {
      // Reservar continua valendo fechado ou com comanda em outro lugar: é um compromisso futuro.
      actions.push({ key: 'reserve', icon: 'calendar-outline', label: 'Reservar', highlighted: entryState === 'closed', onPress: openReserve });
    }
    if (doors && serviceTypeFor.features.virtualQueue) {
      if (entryState === 'closed') {
        actions.push({ key: 'waitlist', icon: 'timer-outline', label: 'Fila Virtual', caption: closedLabel, disabled: true, onPress: explainClosed });
      } else if (entryState === 'in_comanda_elsewhere') {
        actions.push({ key: 'waitlist', icon: 'timer-outline', label: 'Fila Virtual', caption: 'Comanda ativa', disabled: true, onPress: explainActiveComanda });
      } else {
        actions.push({ key: 'waitlist', icon: 'timer-outline', label: 'Fila Virtual', highlighted: noFreeTable, onPress: openWaitlist });
      }
    }
    // Quick Service (ADR-013): as ações do "totem no app" vêm das capabilities orderAhead /
    // pickupSlots, nunca do nome do modelo.
    for (const key of quickJourneyKeys({
      orderAhead, pickupSlots, hasActiveOrder: !!activeQuickOrder, hasPastOrder: !!lastQuickOrder,
    })) {
      if (key === 'order') {
        actions.unshift({ key, variant: 'primary', icon: 'restaurant-outline', label: 'Fazer pedido', onPress: () => startQuickOrder('now') });
      } else if (key === 'schedule') {
        actions.push({ key, icon: 'time-outline', label: 'Agendar retirada', onPress: () => startQuickOrder('scheduled') });
      } else if (key === 'my_orders' && activeQuickOrder) {
        actions.push({ key, icon: 'receipt-outline', label: 'Meus pedidos', onPress: () => navigation.navigate('OrderDetail', { orderId: activeQuickOrder.id }) });
      } else if (key === 'reorder' && lastQuickOrder) {
        actions.push({ key, icon: 'refresh-outline', label: 'Pedir novamente', onPress: () => { void reorder(lastQuickOrder); } });
      }
    }
    return actions;
  }, [serviceTypeFor.features, entryState, closedLabel, explainClosed, explainActiveComanda, noFreeTable, explainNoFreeTable, openScanner, openReserve, openWaitlist, orderAhead, pickupSlots, activeQuickOrder, lastQuickOrder, startQuickOrder, navigation, reorder]);

  const comandaCard = useMemo<RestaurantComandaCard | undefined>(() => {
    if (!activeSessionHere) return undefined;
    return {
      title: `Você está na ${tableLabel(session?.tableNumber)}`,
      actionLabel: 'Ver minha comanda',
      onPress: () => goToComanda(navigation),
    };
  }, [activeSessionHere, session?.tableNumber, navigation]);

  // Seletor "Na mesa" | "Retirada": só em restaurante com mais de uma experiência e sem mesa aberta.
  const experiences = useMemo(() => {
    const options = restaurantExperiences(query.data?.serviceModels ?? []);
    if (options.length < 2 || activeSessionHere) return undefined;
    const current = journeyModel ?? query.data?.serviceType;
    return options.map((option) => ({
      key: option.key,
      label: option.label,
      selected: option.model === current || (option.key === 'table' && current !== 'quick_service'),
      onPress: () => {
        navigation.setParams({ serviceModel: option.model });
        void selectRestaurant(restaurantId, option.model);
      },
    }));
  }, [query.data, journeyModel, activeSessionHere, navigation, selectRestaurant, restaurantId]);

  const openDirections = useCallback(() => {
    const restaurant = query.data;
    if (!restaurant) return;
    const destination = restaurant.lat != null && restaurant.lng != null
      ? `${restaurant.lat},${restaurant.lng}`
      : [restaurant.address, restaurant.city, restaurant.state].filter(Boolean).join(', ');
    if (!destination) {
      Alert.alert('Como ir', 'Este restaurante ainda não informou o endereço.');
      return;
    }
    const url = Platform.OS === 'ios'
      ? `http://maps.apple.com/?daddr=${encodeURIComponent(destination)}`
      : `geo:0,0?q=${encodeURIComponent(destination)}`;
    Linking.openURL(url).catch(() => {
      void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}`);
    });
  }, [query.data]);

  const openReviews = useCallback(
    () => navigation.navigate('Reviews', { restaurantId }),
    [navigation, restaurantId],
  );

  const handlePageAction = useCallback(
    (key: string) => {
      if (key === 'menu') return openMenu();
      if (key === 'reviews') return openReviews();
      if (key === 'directions') return openDirections();
      if (key === 'photos') {
        if (!query.data?.photos.length) {
          Alert.alert('Fotos', 'Este restaurante ainda não publicou fotos.');
          return;
        }
        setGalleryOpen(true);
      }
    },
    [openMenu, openReviews, openDirections, query.data],
  );

  const resolvingJourney = serviceTypeFor.status === 'loading';
  if (query.isLoading || query.isError || !query.data || resolvingJourney) {
    const error = query.error ?? serviceTypeFor.error;
    const retry = () => {
      if (query.isError || !query.data) void query.refetch();
      if (serviceTypeFor.error) void serviceTypeFor.retry?.();
    };
    return (
      <ScreenContainer edges={['top', 'bottom']}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={{ width: 44, height: 44, marginHorizontal: 12, alignItems: 'center', justifyContent: 'center' }}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <StateView
          loading={!error && (query.isLoading || resolvingJourney)}
          error={error}
          onRetry={retry}
        />
      </ScreenContainer>
    );
  }

  const restaurant = query.data;

  return (
    <ScreenContainer edges={['bottom']}>
      <RestaurantDetailView
        restaurant={restaurant}
        status={liveStatus.data}
        isFavorite={isFavorite}
        favoritePending={favorite.isPending}
        journeyActions={journeyActions}
        entryNotice={entryNotice}
        comandaCard={comandaCard}
        leaveLabel={leaveLabel}
        experiences={experiences}
        quickStatus={quickStatus.data}
        showQuickInfo={orderAhead}
        showOccupancy={serviceTypeFor.capabilities?.tableSession !== false && liveStatus.data?.isOpen !== false}
        activeSessionHere={activeSessionHere}
        tableNumber={session?.tableNumber}
        refreshControl={refreshControl}
        onBack={() => navigation.goBack()}
        onToggleFavorite={toggleFavorite}
        onAction={handlePageAction}
        onLeaveTable={leaveTable}
      />
      <PhotoGalleryModal
        visible={galleryOpen}
        photos={restaurant.photos}
        onClose={() => setGalleryOpen(false)}
      />
      <FloatingCartBar />
    </ScreenContainer>
  );
}
