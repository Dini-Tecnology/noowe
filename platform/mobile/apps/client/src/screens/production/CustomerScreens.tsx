import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Linking, ScrollView, Share, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { Button, Card, Chip, Divider, IconButton, Text, TextInput } from 'react-native-paper';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCart } from '@/shared/contexts/CartContext';
import customerBackend, { type CustomerOrder, type CustomerRestaurant } from '../../services/customer-backend';
import { useVisitSession } from '../../contexts/VisitSessionContext';

const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const distanceKm = (a: { latitude: number; longitude: number }, b: { lat: number; lng: number }) => {
  const radians = (value: number) => value * Math.PI / 180; const earth = 6371;
  const dLat = radians(b.lat - a.latitude); const dLng = radians(b.lng - a.longitude);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return earth * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
};
const rootNavigate = (navigation: any, name: string, params?: object) => (navigation.getParent?.() ?? navigation).navigate(name, params);

function PageState({ loading, error, empty, onRetry }: { loading?: boolean; error?: unknown; empty?: string; onRetry?: () => void }) {
  if (loading) return <View style={styles.center}><ActivityIndicator /><Text>Carregando…</Text></View>;
  if (error) return <View style={styles.center}><Text>Não foi possível carregar os dados.</Text><Button onPress={onRetry}>Tentar novamente</Button></View>;
  if (empty) return <View style={styles.center}><Text>{empty}</Text></View>;
  return null;
}

export function HomeScreen({ navigation }: any) {
  const [search, setSearch] = useState('');
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const { selectRestaurant } = useVisitSession();
  const restaurants = useQuery({ queryKey: ['restaurants', search], queryFn: () => customerBackend.listRestaurants({ search, limit: 30 }) });
  const unread = useQuery({ queryKey: ['notifications', 'unread'], queryFn: () => customerBackend.getUnreadNotificationCount() });
  const cuisines = useMemo(() => Array.from(new Set(restaurants.data?.data.flatMap((r) => r.cuisineTypes) ?? [])).slice(0, 8), [restaurants.data]);
  const rows = useMemo(() => [...(restaurants.data?.data ?? [])].sort((a, b) => {
    if (!location || a.lat == null || a.lng == null || b.lat == null || b.lng == null) return 0;
    return distanceKm(location, { lat: a.lat, lng: a.lng }) - distanceKm(location, { lat: b.lat, lng: b.lng });
  }), [restaurants.data, location]);
  const locate = async () => { const permission = await Location.requestForegroundPermissionsAsync(); if (permission.status !== 'granted') return Alert.alert('Localização', 'Permissão não concedida.'); const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }); setLocation(current.coords); };

  const open = async (restaurant: CustomerRestaurant) => {
    await selectRestaurant(restaurant.id);
    rootNavigate(navigation, 'Restaurant', { restaurantId: restaurant.id });
  };

  return <View style={styles.page}>
    <View style={styles.row}><Text variant="headlineMedium" style={styles.flex}>Restaurantes</Text><IconButton icon="bell-outline" onPress={() => rootNavigate(navigation, 'Notifications')} /><Text>{unread.data ?? 0}</Text></View>
    <TextInput mode="outlined" value={search} onChangeText={setSearch} placeholder="Buscar restaurante" left={<TextInput.Icon icon="magnify" />} />
    <Button icon="crosshairs-gps" mode={location ? 'contained-tonal' : 'text'} onPress={locate}>{location ? 'Ordenado por proximidade' : 'Restaurantes perto de mim'}</Button>
    {!!cuisines.length && <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips}>{cuisines.map((c) => <Chip key={c} onPress={() => setSearch(c)} style={styles.chip}>{c}</Chip>)}</ScrollView>}
    <PageState loading={restaurants.isLoading} error={restaurants.error} empty={restaurants.data?.data.length === 0 ? 'Nenhum restaurante disponível.' : undefined} onRetry={() => restaurants.refetch()} />
    <FlatList data={rows} keyExtractor={(item) => item.id} contentContainerStyle={styles.list} renderItem={({ item }) =>
      <Card onPress={() => open(item)} style={styles.card}>{item.bannerUrl && <Image source={{ uri: item.bannerUrl }} style={styles.cover} />}<Card.Content><Text variant="titleMedium">{item.name}</Text><Text>{item.cuisineTypes.join(' • ') || 'Casual dining'}</Text><Text>★ {item.rating.toFixed(1)} · {item.city}/{item.state}</Text></Card.Content></Card>} />
  </View>;
}

export function RestaurantScreen({ route, navigation }: any) {
  const { restaurantId } = route.params;
  const query = useQuery({ queryKey: ['restaurant', restaurantId], queryFn: () => customerBackend.getRestaurant(restaurantId) });
  const favorite = useMutation({ mutationFn: () => customerBackend.setFavorite(restaurantId, true), onSuccess: () => Alert.alert('Favorito', 'Restaurante adicionado aos favoritos.') });
  if (!query.data) return <PageState loading={query.isLoading} error={query.error} onRetry={() => query.refetch()} />;
  const restaurant = query.data;
  return <ScrollView contentContainerStyle={styles.scroll}>
    <Text variant="headlineMedium">{restaurant.name}</Text><Text>{restaurant.description || 'Informações do restaurante'}</Text>
    <Text>{restaurant.address}, {restaurant.city}/{restaurant.state}</Text><Text>★ {restaurant.rating.toFixed(1)} ({restaurant.totalReviews} avaliações)</Text>
    <Button mode="contained" onPress={() => navigation.navigate('Menu', { restaurantId })}>Ver cardápio</Button>
    <Button mode="outlined" icon="qrcode-scan" onPress={() => navigation.navigate('QrScanner')}>Ler QR da mesa</Button>
    <View style={styles.row}><Button onPress={() => navigation.navigate('CreateReservation', { restaurantId })}>Reservar</Button><Button onPress={() => navigation.navigate('Waitlist', { restaurantId })}>Fila</Button></View>
    <Button icon="heart-outline" loading={favorite.isPending} onPress={() => favorite.mutate()}>Favoritar</Button>
  </ScrollView>;
}

export function MenuScreen({ route, navigation }: any) {
  const visit = useVisitSession();
  const cart = useCart();
  const restaurantId = route?.params?.restaurantId ?? visit.session?.restaurantId;
  const restaurant = useQuery({ queryKey: ['restaurant', restaurantId], queryFn: () => customerBackend.getRestaurant(restaurantId!), enabled: !!restaurantId });
  const menu = useQuery({ queryKey: ['menu', restaurantId], queryFn: () => customerBackend.getMenu(restaurantId!), enabled: !!restaurantId });
  if (!restaurantId) return <View style={styles.center}><Text>Escolha um restaurante na tela inicial.</Text><Button onPress={() => navigation.navigate('Home')}>Ir para início</Button></View>;
  const add = (item: NonNullable<typeof menu.data>['items'][number]) => {
    cart.setRestaurant(restaurantId, restaurant.data?.name ?? 'Restaurante');
    cart.addItem({ menu_item_id: item.id, name: item.name, price: item.price, quantity: 1, image_url: item.imageUrl ?? undefined });
  };
  return <View style={styles.page}>
    <View style={styles.row}><Text variant="headlineSmall" style={styles.flex}>{restaurant.data?.name ?? 'Cardápio'}</Text><Button icon="cart" onPress={() => rootNavigate(navigation, 'Cart')}>{cart.itemCount}</Button></View>
    <PageState loading={menu.isLoading} error={menu.error} empty={menu.data?.items.length === 0 ? 'Cardápio sem itens disponíveis.' : undefined} onRetry={() => menu.refetch()} />
    <FlatList data={menu.data?.items ?? []} keyExtractor={(item) => item.id} contentContainerStyle={styles.list} renderItem={({ item }) => <Card style={styles.card}>{item.imageUrl && <Image source={{ uri: item.imageUrl }} style={styles.cover} />}<Card.Content><Text variant="titleMedium">{item.name}</Text><Text>{item.description}</Text><View style={styles.row}><Text style={styles.flex}>{money(item.price)}</Text><Button onPress={() => add(item)}>Adicionar</Button></View></Card.Content></Card>} />
  </View>;
}

export function CartScreen({ navigation }: any) {
  const cart = useCart();
  const { session } = useVisitSession();
  const queryClient = useQueryClient();
  const place = useMutation({
    mutationFn: () => customerBackend.placeOrder({ restaurantId: cart.restaurantId!, tableSessionId: session!.tableSessionId, items: cart.items.map((i) => ({ menuItemId: i.menu_item_id, quantity: i.quantity, specialInstructions: i.special_instructions })) }),
    onSuccess: (order) => { cart.clearCart(); queryClient.invalidateQueries({ queryKey: ['orders'] }); navigation.replace('OrderDetail', { orderId: order.id }); },
    onError: (error: Error) => Alert.alert('Pedido não enviado', error.message),
  });
  return <ScrollView contentContainerStyle={styles.scroll}><Text variant="headlineSmall">Seu pedido</Text>
    {cart.items.length === 0 ? <Text>O carrinho está vazio.</Text> : cart.items.map((item) => <View key={item.id}><View style={styles.row}><View style={styles.flex}><Text variant="titleMedium">{item.name}</Text><Text>{money(item.price)} × {item.quantity}</Text></View><IconButton icon="minus" onPress={() => cart.updateQuantity(item.id, item.quantity - 1)} /><IconButton icon="plus" onPress={() => cart.updateQuantity(item.id, item.quantity + 1)} /></View><Divider /></View>)}
    <Text variant="titleLarge">Total estimado: {money(cart.total)}</Text><Text>O preço final é recalculado e validado no servidor.</Text>
    {!session?.tableSessionId && <Button mode="outlined" onPress={() => navigation.navigate('QrScanner')}>Ler QR da mesa para pedir</Button>}
    <Button mode="contained" disabled={!cart.items.length || !session?.tableSessionId || place.isPending} loading={place.isPending} onPress={() => place.mutate()}>Enviar pedido</Button>
  </ScrollView>;
}

export function OrdersScreen({ navigation }: any) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['orders'], queryFn: () => customerBackend.listOrders() });
  React.useEffect(() => { let channel: any; customerBackend.subscribeToUserChanges(() => queryClient.invalidateQueries({ queryKey: ['orders'] })).then((c) => { channel = c; }); return () => { channel?.unsubscribe(); }; }, [queryClient]);
  return <View style={styles.page}><Text variant="headlineMedium">Pedidos</Text><PageState loading={query.isLoading} error={query.error} empty={query.data?.data.length === 0 ? 'Você ainda não fez pedidos.' : undefined} onRetry={() => query.refetch()} /><FlatList data={query.data?.data ?? []} keyExtractor={(o) => o.id} contentContainerStyle={styles.list} renderItem={({ item }) => <Card style={styles.card} onPress={() => rootNavigate(navigation, 'OrderDetail', { orderId: item.id })}><Card.Content><Text variant="titleMedium">{item.restaurantName}</Text><Text>Status: {item.status}</Text><Text>{money(item.total)} · {new Date(item.createdAt).toLocaleString('pt-BR')}</Text></Card.Content></Card>} /></View>;
}

export function OrderDetailScreen({ route }: any) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['orders', route.params.orderId], queryFn: () => customerBackend.getOrder(route.params.orderId) });
  const cancel = useMutation({ mutationFn: () => customerBackend.cancelOrder(route.params.orderId), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orders'] }) });
  if (!query.data) return <PageState loading={query.isLoading} error={query.error} onRetry={() => query.refetch()} />;
  const order: CustomerOrder = query.data;
  return <ScrollView contentContainerStyle={styles.scroll}><Text variant="headlineSmall">Pedido em {order.restaurantName}</Text><Chip>{order.status}</Chip>{order.items.map((item) => <View style={styles.row} key={item.id}><Text style={styles.flex}>{item.quantity}× {item.name}</Text><Text>{money(item.totalPrice)}</Text></View>)}<Divider /><Text variant="titleLarge">Total {money(order.total)}</Text>{['pending', 'confirmed'].includes(order.status) && <Button textColor="#b00020" loading={cancel.isPending} onPress={() => cancel.mutate()}>Cancelar pedido</Button>}</ScrollView>;
}

export function QrScannerScreen({ navigation }: any) {
  const [permission, requestPermission] = useCameraPermissions();
  const [locked, setLocked] = useState(false);
  const { openFromQr } = useVisitSession();
  const scan = async ({ data }: { data: string }) => { if (locked) return; setLocked(true); try { const visit = await openFromQr(data); navigation.replace('Menu', { restaurantId: visit.restaurantId }); } catch (error) { Alert.alert('QR inválido', error instanceof Error ? error.message : 'Não foi possível validar este QR.', [{ text: 'Tentar novamente', onPress: () => setLocked(false) }]); } };
  if (!permission) return <PageState loading />;
  if (!permission.granted) return <View style={styles.center}><Text>A câmera é necessária para validar a mesa.</Text><Button onPress={requestPermission}>Permitir câmera</Button></View>;
  return <View style={styles.cameraPage}><CameraView style={StyleSheet.absoluteFill} barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={locked ? undefined : scan} /><View style={styles.cameraOverlay}><Text variant="titleLarge" style={styles.cameraText}>Aponte para o QR da mesa</Text></View></View>;
}

export function ReservationsScreen({ navigation }: any) {
  const queryClient = useQueryClient(); const query = useQuery({ queryKey: ['reservations'], queryFn: () => customerBackend.listReservations() });
  const cancel = useMutation({ mutationFn: (id: string) => customerBackend.cancelReservation(id), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reservations'] }), onError: (e: Error) => Alert.alert('Reserva', e.message) });
  const invite = useMutation({ mutationFn: (id: string) => customerBackend.createReservationInvite(id), onSuccess: (url) => Share.share({ message: `Participe da minha reserva na NOOWE: ${url}`, url }) });
  return <View style={styles.page}><View style={styles.row}><Text variant="headlineMedium" style={styles.flex}>Reservas</Text><Button onPress={() => rootNavigate(navigation, 'CreateReservation', {})}>Nova</Button></View><PageState loading={query.isLoading} error={query.error} empty={query.data?.length === 0 ? 'Nenhuma reserva.' : undefined} onRetry={() => query.refetch()} /><FlatList data={query.data ?? []} keyExtractor={(r) => r.id} renderItem={({ item }) => <Card style={styles.card}><Card.Content><Text variant="titleMedium">{item.restaurantName}</Text><Text>{new Date(item.reservationTime).toLocaleString('pt-BR')} · {item.partySize} pessoas</Text><Text>Status: {item.status}</Text>{['pending', 'confirmed'].includes(item.status) && <View style={styles.row}><Button onPress={() => invite.mutate(item.id)}>Convidar</Button><Button textColor="#b00020" onPress={() => cancel.mutate(item.id)}>Cancelar</Button></View>}</Card.Content></Card>} /></View>;
}

export function CreateReservationScreen({ route, navigation }: any) {
  const visit = useVisitSession(); const [date, setDate] = useState(''); const [party, setParty] = useState('2'); const [notes, setNotes] = useState('');
  const restaurantId = route.params?.restaurantId ?? visit.session?.restaurantId;
  const mutation = useMutation({ mutationFn: () => customerBackend.createReservation({ restaurantId, reservationTime: new Date(date).toISOString(), partySize: Number(party), specialRequests: notes }), onSuccess: () => { Alert.alert('Reserva solicitada'); navigation.goBack(); }, onError: (e: Error) => Alert.alert('Erro', e.message) });
  return <ScrollView contentContainerStyle={styles.scroll}><Text variant="headlineSmall">Nova reserva</Text>{!restaurantId && <Text>Selecione um restaurante antes de reservar.</Text>}<TextInput label="Data e hora (AAAA-MM-DD HH:mm)" value={date} onChangeText={setDate} /><TextInput label="Número de pessoas" keyboardType="number-pad" value={party} onChangeText={setParty} /><TextInput label="Observações" value={notes} onChangeText={setNotes} multiline /><Button mode="contained" disabled={!restaurantId || !date || mutation.isPending} loading={mutation.isPending} onPress={() => mutation.mutate()}>Solicitar reserva</Button></ScrollView>;
}

export function WaitlistScreen({ route }: any) {
  const visit = useVisitSession(); const queryClient = useQueryClient(); const [party, setParty] = useState('2');
  const restaurantId = route.params?.restaurantId ?? visit.session?.restaurantId;
  const query = useQuery({ queryKey: ['waitlist'], queryFn: () => customerBackend.listMyWaitlist() });
  const join = useMutation({ mutationFn: () => customerBackend.joinWaitlist({ restaurantId, partySize: Number(party) }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['waitlist'] }), onError: (e: Error) => Alert.alert('Fila', e.message) });
  const update = useMutation({ mutationFn: ({ id, action }: { id: string; action: 'cancel' | 'arrive' }) => customerBackend.updateWaitlist(id, action), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['waitlist'] }) });
  return <ScrollView contentContainerStyle={styles.scroll}><Text variant="headlineSmall">Fila de espera</Text><TextInput label="Pessoas" value={party} keyboardType="number-pad" onChangeText={setParty} /><Button mode="contained" disabled={!restaurantId || join.isPending} onPress={() => join.mutate()}>Entrar na fila</Button>{query.data?.map((entry) => <Card key={entry.id} style={styles.card}><Card.Content><Text>Posição {entry.position} · {entry.partySize} pessoas</Text><Text>Status: {entry.status}{entry.estimatedWaitMinutes ? ` · ~${entry.estimatedWaitMinutes} min` : ''}</Text>{entry.status === 'waiting' && <View style={styles.row}><Button onPress={() => update.mutate({ id: entry.id, action: 'arrive' })}>Cheguei</Button><Button textColor="#b00020" onPress={() => update.mutate({ id: entry.id, action: 'cancel' })}>Sair da fila</Button></View>}</Card.Content></Card>)}</ScrollView>;
}

export function CallWaiterScreen() {
  const { session } = useVisitSession(); const [message, setMessage] = useState('');
  const call = useMutation({ mutationFn: () => customerBackend.callWaiter({ restaurantId: session!.restaurantId, tableId: session!.tableId, type: 'help', message }), onSuccess: () => Alert.alert('Chamado enviado', 'A equipe foi avisada.'), onError: (e: Error) => Alert.alert('Erro', e.message) });
  return <View style={styles.scroll}><Text variant="headlineSmall">Chamar atendimento</Text>{session?.tableId ? <><Text>Mesa {session.tableNumber}</Text><TextInput label="Como podemos ajudar?" value={message} onChangeText={setMessage} multiline /><Button mode="contained" loading={call.isPending} onPress={() => call.mutate()}>Enviar chamado</Button></> : <Text>Leia o QR da mesa primeiro.</Text>}</View>;
}

export function FavoritesScreen({ navigation }: any) {
  const query = useQuery({ queryKey: ['favorites'], queryFn: () => customerBackend.listFavorites() });
  return <View style={styles.page}><Text variant="headlineSmall">Favoritos</Text><PageState loading={query.isLoading} error={query.error} empty={query.data?.length === 0 ? 'Nenhum favorito.' : undefined} onRetry={() => query.refetch()} /><FlatList data={query.data ?? []} keyExtractor={(r) => r.id} renderItem={({ item }) => <Card style={styles.card} onPress={() => navigation.navigate('Restaurant', { restaurantId: item.id })}><Card.Content><Text variant="titleMedium">{item.name}</Text><Text>{item.city}/{item.state}</Text></Card.Content></Card>} /></View>;
}

export function NotificationsScreen() {
  const queryClient = useQueryClient(); const query = useQuery({ queryKey: ['notifications'], queryFn: () => customerBackend.listNotifications() });
  const read = useMutation({ mutationFn: (id: string) => customerBackend.markNotificationRead(id), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }) });
  return <View style={styles.page}><Text variant="headlineSmall">Notificações</Text><PageState loading={query.isLoading} error={query.error} empty={query.data?.length === 0 ? 'Nenhuma notificação.' : undefined} onRetry={() => query.refetch()} /><FlatList data={query.data ?? []} keyExtractor={(n) => n.id} renderItem={({ item }) => <Card style={[styles.card, !item.isRead && styles.unread]} onPress={() => !item.isRead && read.mutate(item.id)}><Card.Content><Text variant="titleMedium">{item.title}</Text><Text>{item.message}</Text></Card.Content></Card>} /></View>;
}

export function LoyaltyScreen() {
  const query = useQuery({ queryKey: ['loyalty'], queryFn: () => customerBackend.listLoyalty() });
  return <View style={styles.page}><Text variant="headlineSmall">Fidelidade</Text><PageState loading={query.isLoading} error={query.error} empty={query.data?.length === 0 ? 'Você ainda não acumulou pontos.' : undefined} onRetry={() => query.refetch()} /><FlatList data={query.data ?? []} keyExtractor={(item) => item.id} renderItem={({ item }) => <Card style={styles.card}><Card.Content><Text variant="titleMedium">{item.restaurantName}</Text><Text variant="headlineSmall">{item.points} pontos</Text><Text>{item.totalVisits} visitas · nível {item.tier}</Text></Card.Content></Card>} /></View>;
}

export function PromotionsScreen() {
  const visit = useVisitSession(); const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['promotions', visit.session?.restaurantId], queryFn: () => customerBackend.listPromotions(visit.session?.restaurantId) });
  const redeem = useMutation({ mutationFn: (id: string) => customerBackend.redeemPromotion(id), onSuccess: () => { Alert.alert('Cupom reservado', 'O restaurante validará o benefício no atendimento.'); queryClient.invalidateQueries({ queryKey: ['promotions'] }); }, onError: (e: Error) => Alert.alert('Cupom indisponível', e.message) });
  return <View style={styles.page}><Text variant="headlineSmall">Cupons</Text><PageState loading={query.isLoading} error={query.error} empty={query.data?.length === 0 ? 'Nenhum cupom disponível.' : undefined} onRetry={() => query.refetch()} /><FlatList data={query.data ?? []} keyExtractor={(item) => item.id} renderItem={({ item }) => <Card style={styles.card}><Card.Content><Text variant="titleMedium">{item.title}</Text><Text>{item.description}</Text><Text>Código: {item.code}</Text><Button loading={redeem.isPending} onPress={() => redeem.mutate(item.id)}>Resgatar</Button></Card.Content></Card>} /></View>;
}

export function ReviewsScreen() {
  const queryClient = useQueryClient(); const [rating, setRating] = useState('5'); const [comment, setComment] = useState('');
  const reviews = useQuery({ queryKey: ['reviews'], queryFn: () => customerBackend.listMyReviews() });
  const orders = useQuery({ queryKey: ['orders', 'reviewable'], queryFn: () => customerBackend.listOrders(100) });
  const reviewed = new Set(reviews.data?.map((review) => review.orderId));
  const reviewable = orders.data?.data.find((order) => ['completed', 'delivered'].includes(order.status) && !reviewed.has(order.id));
  const create = useMutation({ mutationFn: () => customerBackend.createReview({ orderId: reviewable!.id, restaurantId: reviewable!.restaurantId, rating: Number(rating), comment }), onSuccess: () => { setComment(''); queryClient.invalidateQueries({ queryKey: ['reviews'] }); }, onError: (e: Error) => Alert.alert('Avaliação', e.message) });
  const remove = useMutation({ mutationFn: (id: string) => customerBackend.deleteReview(id), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reviews'] }) });
  return <ScrollView contentContainerStyle={styles.scroll}><Text variant="headlineSmall">Avaliações</Text>{reviewable && <Card><Card.Content><Text>Avaliar {reviewable.restaurantName}</Text><TextInput label="Nota (1 a 5)" value={rating} onChangeText={setRating} keyboardType="number-pad" /><TextInput label="Comentário" value={comment} onChangeText={setComment} multiline /><Button disabled={Number(rating) < 1 || Number(rating) > 5} loading={create.isPending} onPress={() => create.mutate()}>Publicar</Button></Card.Content></Card>}{reviews.data?.map((review) => <Card key={review.id}><Card.Content><Text>★ {review.rating}</Text><Text>{review.comment}</Text>{review.ownerResponse && <Text>Resposta: {review.ownerResponse}</Text>}<Button textColor="#b00020" onPress={() => remove.mutate(review.id)}>Excluir</Button></Card.Content></Card>)}</ScrollView>;
}

function ProfileForm({ profile }: { profile: Awaited<ReturnType<typeof customerBackend.getProfile>> }) {
  const queryClient = useQueryClient(); const [name, setName] = useState(profile.fullName); const [phone, setPhone] = useState(profile.phone ?? '');
  const save = useMutation({ mutationFn: () => customerBackend.updateProfile({ fullName: name.trim(), phone: phone.trim() || null }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['profile'] }); Alert.alert('Perfil atualizado'); } });
  return <><Text>{profile.email}</Text><TextInput label="Nome" value={name} onChangeText={setName} /><TextInput label="Telefone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" /><Button mode="outlined" loading={save.isPending} disabled={!name.trim()} onPress={() => save.mutate()}>Salvar perfil</Button></>;
}

export function ProfileScreen({ navigation }: any) {
  const query = useQuery({ queryKey: ['profile'], queryFn: () => customerBackend.getProfile() });
  const logout = async () => { await customerBackend.signOut(); };
  return <ScrollView contentContainerStyle={styles.scroll}><Text variant="headlineMedium">Perfil</Text><PageState loading={query.isLoading} error={query.error} onRetry={() => query.refetch()} />{query.data && <ProfileForm key={query.data.id} profile={query.data} />}
    <Button onPress={() => rootNavigate(navigation, 'Reservations')}>Reservas</Button><Button onPress={() => rootNavigate(navigation, 'Favorites')}>Favoritos</Button><Button onPress={() => rootNavigate(navigation, 'Loyalty')}>Fidelidade</Button><Button onPress={() => rootNavigate(navigation, 'Promotions')}>Cupons</Button><Button onPress={() => rootNavigate(navigation, 'Reviews')}>Avaliações</Button><Button onPress={() => rootNavigate(navigation, 'Waitlist', {})}>Fila de espera</Button><Button onPress={() => rootNavigate(navigation, 'CallWaiter')}>Chamar atendimento</Button><Button onPress={() => rootNavigate(navigation, 'Privacy')}>Privacidade e LGPD</Button><Button onPress={() => rootNavigate(navigation, 'Support')}>Suporte</Button><Button textColor="#b00020" onPress={logout}>Sair</Button>
  </ScrollView>;
}

export function PrivacyScreen() {
  const exportData = useMutation({ mutationFn: () => customerBackend.exportUserData(), onSuccess: () => Alert.alert('Exportação solicitada', 'Seus dados foram preparados conforme a política vigente.'), onError: (e: Error) => Alert.alert('Erro', e.message) });
  const remove = useMutation({ mutationFn: () => customerBackend.requestAccountDeletion(), onSuccess: () => Alert.alert('Solicitação registrada') });
  const policy = process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL; const terms = process.env.EXPO_PUBLIC_TERMS_OF_SERVICE_URL;
  return <ScrollView contentContainerStyle={styles.scroll}><Text variant="headlineSmall">Privacidade e LGPD</Text><Text>Consulte, exporte ou solicite a exclusão dos seus dados.</Text><Button disabled={!policy} onPress={() => policy && Linking.openURL(policy)}>Política de privacidade</Button><Button disabled={!terms} onPress={() => terms && Linking.openURL(terms)}>Termos de uso</Button><Button mode="outlined" loading={exportData.isPending} onPress={() => exportData.mutate()}>Exportar meus dados</Button><Button textColor="#b00020" loading={remove.isPending} onPress={() => Alert.alert('Excluir conta?', 'A solicitação seguirá os prazos legais.', [{ text: 'Cancelar' }, { text: 'Solicitar', style: 'destructive', onPress: () => remove.mutate() }])}>Solicitar exclusão</Button></ScrollView>;
}

export function SupportScreen() {
  const phone = process.env.EXPO_PUBLIC_SUPPORT_WHATSAPP;
  return <ScrollView contentContainerStyle={styles.scroll}><Text variant="headlineSmall">Ajuda</Text><Text variant="titleMedium">Como faço um pedido?</Text><Text>Escolha o restaurante, leia o QR da mesa, adicione itens e envie.</Text><Text variant="titleMedium">Como acompanho?</Text><Text>A tela Pedidos atualiza o status operacional em tempo real.</Text><Button disabled={!phone} onPress={() => Linking.openURL(`https://wa.me/${phone?.replace(/\D/g, '')}`)}>Falar pelo WhatsApp</Button>{!phone && <Text>Canal de WhatsApp ainda não configurado para este ambiente.</Text>}</ScrollView>;
}

const styles = StyleSheet.create({ page: { flex: 1, padding: 16, gap: 12, backgroundColor: '#fff' }, scroll: { padding: 20, gap: 16, backgroundColor: '#fff', flexGrow: 1 }, list: { gap: 12, paddingBottom: 32 }, card: { marginVertical: 5 }, cover: { width: '100%', height: 150, backgroundColor: '#eee' }, row: { flexDirection: 'row', alignItems: 'center', gap: 8 }, flex: { flex: 1 }, center: { flex: 1, padding: 28, alignItems: 'center', justifyContent: 'center', gap: 12 }, chips: { flexGrow: 0 }, chip: { marginRight: 8 }, unread: { backgroundColor: '#fff3e8' }, cameraPage: { flex: 1, backgroundColor: '#000' }, cameraOverlay: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 60 }, cameraText: { color: '#fff', backgroundColor: '#0009', padding: 12 } });
