import { createClient } from '@supabase/supabase-js';

const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_PUBLISHABLE_KEY'];
for (const name of required) {
  if (!process.env[name]) throw new Error(`${name} is required`);
}
if (process.env.ALLOW_REMOTE_E2E !== 'true') {
  throw new Error('Set ALLOW_REMOTE_E2E=true to create and clean up isolated remote test data');
}

const supabaseUrl = process.env.SUPABASE_URL;
const admin = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const client = createClient(supabaseUrl, process.env.SUPABASE_PUBLISHABLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const suffix = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
const email = `order-tracking-${suffix}@example.invalid`;
const password = `Noowe-E2E-${crypto.randomUUID()}!`;
let userId;
let restaurantId;
let menuItemId;
let orderId;
let channel;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitFor(predicate, message, timeoutMs = 12_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(message);
}

async function waitForAsync(predicate, message, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(message);
}

async function insertOne(table, row) {
  const { data, error } = await admin.from(table).insert(row).select().single();
  if (error) throw error;
  return data;
}

async function run() {
  const { data: created, error: createUserError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: 'Order Tracking E2E' },
  });
  if (createUserError) throw createUserError;
  userId = created.user.id;

  const { error: profileError } = await admin.from('profiles').upsert({
    id: userId,
    email,
    full_name: 'Order Tracking E2E',
    is_active: true,
  });
  if (profileError) throw profileError;

  const restaurant = await insertOne('restaurants', {
    owner_id: userId,
    name: `Order Tracking E2E ${suffix}`,
    address: 'Isolated automated test',
    city: 'São Paulo',
    state: 'SP',
    zip_code: '00000-000',
    phone: '+5500000000000',
    email,
    service_type: 'quick_service',
    cuisine_types: ['test'],
    opening_hours: {},
    is_active: false,
  });
  restaurantId = restaurant.id;

  const { error: roleError } = await admin.from('user_roles').upsert({
    user_id: userId,
    restaurant_id: restaurantId,
    role: 'owner',
    is_active: true,
  }, { onConflict: 'user_id,restaurant_id,role' });
  if (roleError) throw roleError;

  const menuItem = await insertOne('menu_items', {
    restaurant_id: restaurantId,
    name: 'Order Tracking E2E Item',
    price: 10,
    is_available: true,
  });
  menuItemId = menuItem.id;

  const order = await insertOne('orders', {
    restaurant_id: restaurantId,
    customer_id: userId,
    order_type: 'pickup',
    status: 'pending',
    subtotal: 10,
    total_amount: 10,
  });
  orderId = order.id;

  await insertOne('order_items', {
    order_id: orderId,
    menu_item_id: menuItemId,
    quantity: 1,
    unit_price: 10,
    total_price: 10,
    status: 'pending',
  });

  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;

  const events = [];
  channel = client
    .channel(`order-tracking-e2e:${orderId}`)
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}`,
    }, (payload) => events.push({ table: 'orders', status: payload.new.status }))
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'order_items', filter: `order_id=eq.${orderId}`,
    }, (payload) => events.push({ table: 'order_items', status: payload.new.status }))
    .subscribe();

  await waitFor(() => channel.state === 'joined', 'Realtime channel did not subscribe');

  const preparing = await client.rpc('restaurant_update_order_status', {
    p_order_id: orderId,
    p_status: 'preparing',
    p_estimated_time: 12,
  });
  if (preparing.error) throw preparing.error;

  await waitFor(
    () => events.some((event) => event.table === 'orders' && event.status === 'preparing')
      && events.some((event) => event.table === 'order_items' && event.status === 'preparing'),
    'Realtime did not deliver both order and item preparing updates',
  );

  const ready = await client.rpc('restaurant_update_order_status', {
    p_order_id: orderId,
    p_status: 'ready',
  });
  if (ready.error) throw ready.error;

  await waitFor(
    () => events.some((event) => event.table === 'orders' && event.status === 'ready')
      && events.some((event) => event.table === 'order_items' && event.status === 'ready'),
    'Realtime did not deliver both order and item ready updates',
  );

  const regression = await client.rpc('restaurant_update_order_status', {
    p_order_id: orderId,
    p_status: 'preparing',
  });
  assert(regression.error?.code === '23514', 'Invalid ready -> preparing transition was not rejected');

  const snapshot = await client.from('orders')
    .select('status, order_items(status)')
    .eq('id', orderId)
    .single();
  if (snapshot.error) throw snapshot.error;
  assert(snapshot.data.status === 'ready', 'Order did not remain ready');
  assert(snapshot.data.order_items.every((item) => item.status === 'ready'), 'Order items are not synchronized to ready');

  await waitForAsync(async () => {
    const dispatch = await admin.from('notifications')
      .select('id, push_dispatched_at')
      .eq('related_id', orderId)
      .not('push_dispatched_at', 'is', null);
    if (dispatch.error) throw dispatch.error;
    return dispatch.data.length > 0;
  }, 'Database notification trigger did not dispatch the push webhook');

  const pushProbe = await admin.functions.invoke('send-push-notification', {
    body: {
      record: {
        id: crypto.randomUUID(),
        user_id: userId,
        title: 'Order tracking E2E',
        message: 'Push contract probe',
        notification_type: 'system',
        metadata: { order_id: orderId },
      },
    },
  });
  if (pushProbe.error) throw pushProbe.error;
  assert(pushProbe.data?.notifications === 1, 'Push function did not accept the database webhook contract');

  console.log('PASS order tracking E2E: RPC, item sync, Realtime, transition guard, DB push trigger and Edge contract');
}

async function cleanup() {
  if (channel) await client.removeChannel(channel);
  await client.removeAllChannels();
  await client.auth.signOut();
  if (orderId) await admin.from('notifications').delete().eq('related_id', orderId);
  if (orderId) await admin.from('orders').delete().eq('id', orderId);
  if (menuItemId) await admin.from('menu_items').delete().eq('id', menuItemId);
  if (restaurantId) await admin.from('restaurants').delete().eq('id', restaurantId);
  if (userId) await admin.auth.admin.deleteUser(userId);
}

try {
  await run();
} finally {
  await cleanup();
}
