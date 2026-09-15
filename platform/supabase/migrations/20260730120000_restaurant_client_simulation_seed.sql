-- Realistic, repeatable client activity for testing the restaurant application.
--
-- This migration only installs private helpers. It does not seed any restaurant
-- automatically. Run it explicitly with:
--
--   select private.seed_restaurant_client_simulation('<restaurant-id>'::uuid);
--
-- Remove only the generated operational data with:
--
--   select private.clear_restaurant_client_simulation('<restaurant-id>'::uuid);

create or replace function private.client_simulation_uuid(
  p_scope uuid,
  p_key text
)
returns uuid
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select md5(p_scope::text || ':noowe-client-simulation:' || p_key)::uuid;
$$;

revoke all on function private.client_simulation_uuid(uuid, text) from public;

create or replace function private.clear_restaurant_client_simulation(
  p_restaurant_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions, auth, pg_temp
as $$
declare
  v_marker constant text := '[SIMULAÇÃO CLIENTE NOOWE]';
  v_deleted_orders integer := 0;
  v_deleted_reservations integer := 0;
  v_deleted_calls integer := 0;
  v_deleted_waitlist integer := 0;
begin
  if not exists (
    select 1
    from public.restaurants
    where id = p_restaurant_id
  ) then
    raise exception 'Restaurant not found: %', p_restaurant_id
      using errcode = 'P0002';
  end if;

  delete from public.notifications
  where metadata @> jsonb_build_object(
    'simulation', 'restaurant_client',
    'restaurant_id', p_restaurant_id::text
  );

  delete from public.reviews
  where restaurant_id = p_restaurant_id
    and id in (
      private.client_simulation_uuid(p_restaurant_id, 'review-ana'),
      private.client_simulation_uuid(p_restaurant_id, 'review-marina'),
      private.client_simulation_uuid(p_restaurant_id, 'review-beatriz'),
      private.client_simulation_uuid(p_restaurant_id, 'review-rafael')
    );

  delete from public.loyalty_programs
  where restaurant_id = p_restaurant_id
    and id in (
      private.client_simulation_uuid(p_restaurant_id, 'loyalty-ana'),
      private.client_simulation_uuid(p_restaurant_id, 'loyalty-lucas'),
      private.client_simulation_uuid(p_restaurant_id, 'loyalty-marina'),
      private.client_simulation_uuid(p_restaurant_id, 'loyalty-rafael'),
      private.client_simulation_uuid(p_restaurant_id, 'loyalty-beatriz')
    );

  delete from public.waiter_calls
  where restaurant_id = p_restaurant_id
    and notes like v_marker || '%';

  delete from public.service_calls
  where restaurant_id = p_restaurant_id
    and message like v_marker || '%';
  get diagnostics v_deleted_calls = row_count;

  delete from public.waitlist_entries
  where restaurant_id = p_restaurant_id
    and notes like v_marker || '%';
  get diagnostics v_deleted_waitlist = row_count;

  delete from public.reservations
  where restaurant_id = p_restaurant_id
    and metadata @> '{"simulation":"restaurant_client"}'::jsonb;
  get diagnostics v_deleted_reservations = row_count;

  delete from public.table_sessions
  where restaurant_id = p_restaurant_id
    and notes like v_marker || '%';

  delete from public.order_items
  where order_id in (
    select id
    from public.orders
    where restaurant_id = p_restaurant_id
      and metadata @> '{"simulation":"restaurant_client"}'::jsonb
  );

  delete from public.gateway_transactions
  where restaurant_id = p_restaurant_id
    and metadata @> '{"simulation":"restaurant_client"}'::jsonb;

  delete from public.orders
  where restaurant_id = p_restaurant_id
    and metadata @> '{"simulation":"restaurant_client"}'::jsonb;
  get diagnostics v_deleted_orders = row_count;

  -- Catalog rows are removed only when no manually created test activity uses
  -- them. This keeps cleanup safe after someone has tested the client app.
  delete from public.menu_items mi
  where mi.restaurant_id = p_restaurant_id
    and mi.customizations @> '{"simulation":"restaurant_client"}'::jsonb
    and not exists (
      select 1 from public.order_items oi where oi.menu_item_id = mi.id
    );

  delete from public.menu_categories mc
  where mc.restaurant_id = p_restaurant_id
    and mc.description like v_marker || '%'
    and not exists (
      select 1 from public.menu_items mi where mi.category_id = mc.id
    );

  delete from public.tables t
  where t.restaurant_id = p_restaurant_id
    and t.notes like v_marker || '%'
    and not exists (
      select 1 from public.orders o where o.table_id = t.id
    )
    and not exists (
      select 1 from public.reservations r where r.table_id = t.id
    )
    and not exists (
      select 1 from public.table_sessions ts where ts.table_id = t.id
    );

  update public.restaurants r
  set
    rating = coalesce((
      select round(avg(rv.rating), 2)
      from public.reviews rv
      where rv.restaurant_id = p_restaurant_id
        and rv.is_visible
    ), 0),
    total_reviews = (
      select count(*)
      from public.reviews rv
      where rv.restaurant_id = p_restaurant_id
        and rv.is_visible
    ),
    updated_at = now()
  where r.id = p_restaurant_id;

  return jsonb_build_object(
    'restaurant_id', p_restaurant_id,
    'deleted', jsonb_build_object(
      'orders', v_deleted_orders,
      'reservations', v_deleted_reservations,
      'service_calls', v_deleted_calls,
      'waitlist_entries', v_deleted_waitlist
    ),
    'test_users_preserved', true
  );
end;
$$;

revoke all on function private.clear_restaurant_client_simulation(uuid) from public;
grant execute on function private.clear_restaurant_client_simulation(uuid) to service_role;

create or replace function private.seed_restaurant_client_simulation(
  p_restaurant_id uuid,
  p_reference_time timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions, auth, pg_temp
as $$
declare
  v_marker constant text := '[SIMULAÇÃO CLIENTE NOOWE]';
  v_today timestamptz := date_trunc('day', p_reference_time);

  v_ana uuid := private.client_simulation_uuid(
    '00000000-0000-0000-0000-000000000000'::uuid, 'client-ana'
  );
  v_lucas uuid := private.client_simulation_uuid(
    '00000000-0000-0000-0000-000000000000'::uuid, 'client-lucas'
  );
  v_marina uuid := private.client_simulation_uuid(
    '00000000-0000-0000-0000-000000000000'::uuid, 'client-marina'
  );
  v_rafael uuid := private.client_simulation_uuid(
    '00000000-0000-0000-0000-000000000000'::uuid, 'client-rafael'
  );
  v_beatriz uuid := private.client_simulation_uuid(
    '00000000-0000-0000-0000-000000000000'::uuid, 'client-beatriz'
  );

  v_cat_starters uuid := private.client_simulation_uuid(p_restaurant_id, 'category-starters');
  v_cat_mains uuid := private.client_simulation_uuid(p_restaurant_id, 'category-mains');
  v_cat_drinks uuid := private.client_simulation_uuid(p_restaurant_id, 'category-drinks');
  v_cat_desserts uuid := private.client_simulation_uuid(p_restaurant_id, 'category-desserts');

  v_tartare uuid := private.client_simulation_uuid(p_restaurant_id, 'item-tuna-tartare');
  v_burrata uuid := private.client_simulation_uuid(p_restaurant_id, 'item-burrata');
  v_filet uuid := private.client_simulation_uuid(p_restaurant_id, 'item-filet');
  v_risotto uuid := private.client_simulation_uuid(p_restaurant_id, 'item-risotto');
  v_salmon uuid := private.client_simulation_uuid(p_restaurant_id, 'item-salmon');
  v_bowl uuid := private.client_simulation_uuid(p_restaurant_id, 'item-vegan-bowl');
  v_water uuid := private.client_simulation_uuid(p_restaurant_id, 'item-sparkling-water');
  v_wine uuid := private.client_simulation_uuid(p_restaurant_id, 'item-malbec');
  v_petit uuid := private.client_simulation_uuid(p_restaurant_id, 'item-petit-gateau');
  v_mousse uuid := private.client_simulation_uuid(p_restaurant_id, 'item-chocolate-mousse');

  v_table_07 uuid := private.client_simulation_uuid(p_restaurant_id, 'table-s07');
  v_table_12 uuid := private.client_simulation_uuid(p_restaurant_id, 'table-s12');
  v_table_04 uuid := private.client_simulation_uuid(p_restaurant_id, 'table-s04');
  v_table_09 uuid := private.client_simulation_uuid(p_restaurant_id, 'table-s09');
  v_table_16 uuid := private.client_simulation_uuid(p_restaurant_id, 'table-s16');

  v_order_pending uuid := private.client_simulation_uuid(p_restaurant_id, 'order-pending');
  v_order_confirmed uuid := private.client_simulation_uuid(p_restaurant_id, 'order-confirmed');
  v_order_preparing uuid := private.client_simulation_uuid(p_restaurant_id, 'order-preparing');
  v_order_ready uuid := private.client_simulation_uuid(p_restaurant_id, 'order-ready');
  v_order_completed uuid := private.client_simulation_uuid(p_restaurant_id, 'order-completed-today');
  v_order_delivered uuid := private.client_simulation_uuid(p_restaurant_id, 'order-delivered-today');
  v_order_history uuid := private.client_simulation_uuid(p_restaurant_id, 'order-completed-history');
  v_order_cancelled uuid := private.client_simulation_uuid(p_restaurant_id, 'order-cancelled');
begin
  if p_restaurant_id is null then
    raise exception 'restaurant_id is required' using errcode = '22004';
  end if;

  if not exists (
    select 1
    from public.restaurants
    where id = p_restaurant_id
  ) then
    raise exception 'Restaurant not found: %', p_restaurant_id
      using errcode = 'P0002';
  end if;

  insert into auth.users (
    id,
    email,
    raw_user_meta_data,
    created_at,
    updated_at
  )
  values
    (
      v_ana, 'cliente.ana@noowe.test',
      '{"full_name":"Ana Souza","simulation":"restaurant_client"}'::jsonb,
      p_reference_time - interval '180 days', p_reference_time
    ),
    (
      v_lucas, 'cliente.lucas@noowe.test',
      '{"full_name":"Lucas Ferreira","simulation":"restaurant_client"}'::jsonb,
      p_reference_time - interval '120 days', p_reference_time
    ),
    (
      v_marina, 'cliente.marina@noowe.test',
      '{"full_name":"Marina Costa","simulation":"restaurant_client"}'::jsonb,
      p_reference_time - interval '75 days', p_reference_time
    ),
    (
      v_rafael, 'cliente.rafael@noowe.test',
      '{"full_name":"Rafael Oliveira","simulation":"restaurant_client"}'::jsonb,
      p_reference_time - interval '45 days', p_reference_time
    ),
    (
      v_beatriz, 'cliente.beatriz@noowe.test',
      '{"full_name":"Beatriz Santos","simulation":"restaurant_client"}'::jsonb,
      p_reference_time - interval '20 days', p_reference_time
    )
  on conflict (id) do update
  set
    raw_user_meta_data = excluded.raw_user_meta_data,
    updated_at = excluded.updated_at;

  insert into public.profiles (
    id,
    email,
    full_name,
    phone,
    phone_verified,
    provider,
    dietary_restrictions,
    favorite_cuisines,
    preferences,
    birth_date,
    marketing_consent,
    is_active,
    created_at,
    updated_at
  )
  values
    (
      v_ana, 'cliente.ana@noowe.test', 'Ana Souza', '+5511987651001', true, 'email',
      array['intolerância à lactose'], array['brasileira', 'contemporânea'],
      '{"simulation":"restaurant_client","preferred_seating":"salão","language":"pt-BR"}'::jsonb,
      '1992-04-18', true, true, p_reference_time - interval '180 days', p_reference_time
    ),
    (
      v_lucas, 'cliente.lucas@noowe.test', 'Lucas Ferreira', '+5511987651002', true, 'email',
      array[]::text[], array['carnes', 'italiana'],
      '{"simulation":"restaurant_client","preferred_seating":"terraço","language":"pt-BR"}'::jsonb,
      '1988-09-02', true, true, p_reference_time - interval '120 days', p_reference_time
    ),
    (
      v_marina, 'cliente.marina@noowe.test', 'Marina Costa', '+5511987651003', true, 'email',
      array['alergia a castanhas'], array['japonesa', 'mediterrânea'],
      '{"simulation":"restaurant_client","accessibility_notes":"Baixa visão","language":"pt-BR"}'::jsonb,
      '1996-12-11', false, true, p_reference_time - interval '75 days', p_reference_time
    ),
    (
      v_rafael, 'cliente.rafael@noowe.test', 'Rafael Oliveira', '+5511987651004', true, 'email',
      array['vegano'], array['vegana', 'asiática'],
      '{"simulation":"restaurant_client","preferred_seating":"qualquer","language":"pt-BR"}'::jsonb,
      '1990-06-25', true, true, p_reference_time - interval '45 days', p_reference_time
    ),
    (
      v_beatriz, 'cliente.beatriz@noowe.test', 'Beatriz Santos', '+5511987651005', true, 'email',
      array['sem glúten'], array['brasileira', 'francesa'],
      '{"simulation":"restaurant_client","has_kids":true,"kids_ages":[5,8],"language":"pt-BR"}'::jsonb,
      '1985-02-07', true, true, p_reference_time - interval '20 days', p_reference_time
    )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = excluded.full_name,
    phone = excluded.phone,
    phone_verified = excluded.phone_verified,
    dietary_restrictions = excluded.dietary_restrictions,
    favorite_cuisines = excluded.favorite_cuisines,
    preferences = excluded.preferences,
    birth_date = excluded.birth_date,
    marketing_consent = excluded.marketing_consent,
    is_active = excluded.is_active,
    updated_at = excluded.updated_at;

  insert into public.menu_categories (
    id, restaurant_id, name, description, display_order, is_active, icon, created_at, updated_at
  )
  values
    (v_cat_starters, p_restaurant_id, 'Entradas', v_marker || ' Entradas para testes.', 10, true, 'restaurant', p_reference_time, p_reference_time),
    (v_cat_mains, p_restaurant_id, 'Pratos principais', v_marker || ' Principais para testes.', 20, true, 'silverware', p_reference_time, p_reference_time),
    (v_cat_drinks, p_restaurant_id, 'Bebidas', v_marker || ' Bebidas para testes.', 30, true, 'wine', p_reference_time, p_reference_time),
    (v_cat_desserts, p_restaurant_id, 'Sobremesas', v_marker || ' Sobremesas para testes.', 40, true, 'cake', p_reference_time, p_reference_time)
  on conflict (id) do update
  set
    name = excluded.name,
    description = excluded.description,
    display_order = excluded.display_order,
    is_active = excluded.is_active,
    icon = excluded.icon,
    updated_at = excluded.updated_at;

  insert into public.menu_items (
    id,
    restaurant_id,
    name,
    description,
    price,
    category_id,
    image_url,
    is_available,
    preparation_time,
    calories,
    allergens,
    dietary_info,
    customizations,
    display_order,
    estimated_prep_minutes,
    course,
    ncm,
    cfop,
    created_at,
    updated_at
  )
  values
    (
      v_tartare, p_restaurant_id, 'Tartare de Atum',
      'Atum fresco, avocado, gergelim negro e ponzu cítrico.', 58, v_cat_starters,
      'https://images.unsplash.com/photo-1579584425555-c3ce17fd4351?auto=format&fit=crop&w=900&q=80',
      true, 8, 290, '["peixe","gergelim","soja"]'::jsonb,
      '{"gluten_free":true}'::jsonb,
      '{"simulation":"restaurant_client","groups":[{"name":"Picância","options":["Sem pimenta","Suave","Média"]}]}'::jsonb,
      10, 8, 'starter', '16041400', '5102', p_reference_time, p_reference_time
    ),
    (
      v_burrata, p_restaurant_id, 'Burrata com Tomates Confitados',
      'Burrata artesanal, tomates confitados, pesto e pão de fermentação natural.', 48, v_cat_starters,
      'https://images.unsplash.com/photo-1625944525533-473f1a3d54e7?auto=format&fit=crop&w=900&q=80',
      true, 10, 420, '["leite","glúten","castanhas"]'::jsonb,
      '{"vegetarian":true}'::jsonb,
      '{"simulation":"restaurant_client"}'::jsonb,
      20, 10, 'starter', '04061090', '5102', p_reference_time, p_reference_time
    ),
    (
      v_filet, p_restaurant_id, 'Filé ao Molho Madeira',
      'Filé mignon 200g, purê trufado e legumes grelhados.', 98, v_cat_mains,
      'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=900&q=80',
      true, 25, 780, '["leite"]'::jsonb,
      '{"high_protein":true}'::jsonb,
      '{"simulation":"restaurant_client","groups":[{"name":"Ponto da carne","required":true,"options":["Malpassado","Ao ponto","Bem-passado"]}]}'::jsonb,
      10, 25, 'main', '16025000', '5102', p_reference_time, p_reference_time
    ),
    (
      v_risotto, p_restaurant_id, 'Risoto de Cogumelos',
      'Arroz arbóreo, cogumelos frescos, parmesão e azeite de ervas.', 72, v_cat_mains,
      'https://images.unsplash.com/photo-1476124369491-e7addf5db371?auto=format&fit=crop&w=900&q=80',
      true, 22, 640, '["leite"]'::jsonb,
      '{"vegetarian":true,"gluten_free":true}'::jsonb,
      '{"simulation":"restaurant_client","groups":[{"name":"Queijo","options":["Com parmesão","Sem parmesão"]}]}'::jsonb,
      20, 22, 'main', '19049000', '5102', p_reference_time, p_reference_time
    ),
    (
      v_salmon, p_restaurant_id, 'Salmão Grelhado',
      'Salmão, quinoa com ervas, aspargos e molho de limão-siciliano.', 86, v_cat_mains,
      'https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=900&q=80',
      true, 20, 610, '["peixe"]'::jsonb,
      '{"gluten_free":true,"high_protein":true}'::jsonb,
      '{"simulation":"restaurant_client"}'::jsonb,
      30, 20, 'main', '16041100', '5102', p_reference_time, p_reference_time
    ),
    (
      v_bowl, p_restaurant_id, 'Bowl Vegano da Estação',
      'Quinoa, grão-de-bico crocante, legumes, avocado e tahine.', 64, v_cat_mains,
      'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=900&q=80',
      true, 14, 520, '["gergelim"]'::jsonb,
      '{"vegan":true,"gluten_free":true}'::jsonb,
      '{"simulation":"restaurant_client","groups":[{"name":"Molho","options":["Tahine","Cítrico","Sem molho"]}]}'::jsonb,
      40, 14, 'main', '21069090', '5102', p_reference_time, p_reference_time
    ),
    (
      v_water, p_restaurant_id, 'Água com Gás 500ml',
      'Água mineral naturalmente gaseificada.', 12, v_cat_drinks, null,
      true, 1, 0, '[]'::jsonb, '{"vegan":true,"gluten_free":true}'::jsonb,
      '{"simulation":"restaurant_client"}'::jsonb,
      10, 1, 'drink', '22011000', '5102', p_reference_time, p_reference_time
    ),
    (
      v_wine, p_restaurant_id, 'Malbec Reserva — Taça',
      'Malbec argentino, frutas negras maduras e final aveludado.', 98, v_cat_drinks,
      'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=900&q=80',
      true, 3, 125, '["sulfitos"]'::jsonb, '{"alcoholic":true}'::jsonb,
      '{"simulation":"restaurant_client"}'::jsonb,
      20, 3, 'drink', '22042100', '5102', p_reference_time, p_reference_time
    ),
    (
      v_petit, p_restaurant_id, 'Petit Gâteau',
      'Bolo quente de chocolate belga, sorvete de baunilha e frutas vermelhas.', 38, v_cat_desserts,
      'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=900&q=80',
      true, 15, 590, '["leite","ovos","glúten"]'::jsonb, '{"vegetarian":true}'::jsonb,
      '{"simulation":"restaurant_client"}'::jsonb,
      10, 15, 'dessert', '19059090', '5102', p_reference_time, p_reference_time
    ),
    (
      v_mousse, p_restaurant_id, 'Mousse de Chocolate 70%',
      'Chocolate 70%, creme fresco e nibs de cacau.', 32, v_cat_desserts,
      'https://images.unsplash.com/photo-1541783245831-57d6fb0926d3?auto=format&fit=crop&w=900&q=80',
      true, 5, 410, '["leite","ovos"]'::jsonb,
      '{"vegetarian":true,"gluten_free":true}'::jsonb,
      '{"simulation":"restaurant_client"}'::jsonb,
      20, 5, 'dessert', '18069000', '5102', p_reference_time, p_reference_time
    )
  on conflict (id) do update
  set
    name = excluded.name,
    description = excluded.description,
    price = excluded.price,
    category_id = excluded.category_id,
    image_url = excluded.image_url,
    is_available = excluded.is_available,
    preparation_time = excluded.preparation_time,
    calories = excluded.calories,
    allergens = excluded.allergens,
    dietary_info = excluded.dietary_info,
    customizations = excluded.customizations,
    display_order = excluded.display_order,
    estimated_prep_minutes = excluded.estimated_prep_minutes,
    course = excluded.course,
    ncm = excluded.ncm,
    cfop = excluded.cfop,
    updated_at = excluded.updated_at;

  insert into public.tables (
    id,
    restaurant_id,
    table_number,
    seats,
    status,
    section,
    position_x,
    position_y,
    qr_code,
    shape,
    width,
    height,
    occupied_since,
    notes,
    created_at,
    updated_at
  )
  values
    (v_table_07, p_restaurant_id, 'S07', 2, 'occupied', 'Salão', 90, 120, 'NOOWE-SIM-S07', 'square', 72, 72, p_reference_time - interval '38 minutes', v_marker || ' Mesa ocupada por Ana.', p_reference_time, p_reference_time),
    (v_table_12, p_restaurant_id, 'S12', 4, 'occupied', 'Salão', 210, 120, 'NOOWE-SIM-S12', 'rectangle', 110, 72, p_reference_time - interval '54 minutes', v_marker || ' Mesa ocupada por Lucas.', p_reference_time, p_reference_time),
    (v_table_04, p_restaurant_id, 'S04', 4, 'reserved', 'Terraço', 90, 250, 'NOOWE-SIM-S04', 'round', 80, 80, null, v_marker || ' Reserva confirmada.', p_reference_time, p_reference_time),
    (v_table_09, p_restaurant_id, 'S09', 2, 'available', 'Terraço', 210, 250, 'NOOWE-SIM-S09', 'round', 72, 72, null, v_marker || ' Mesa disponível.', p_reference_time, p_reference_time),
    (v_table_16, p_restaurant_id, 'S16', 6, 'cleaning', 'Salão', 330, 120, 'NOOWE-SIM-S16', 'rectangle', 140, 72, null, v_marker || ' Mesa em limpeza.', p_reference_time, p_reference_time)
  on conflict (id) do update
  set
    table_number = excluded.table_number,
    seats = excluded.seats,
    status = excluded.status,
    section = excluded.section,
    position_x = excluded.position_x,
    position_y = excluded.position_y,
    qr_code = excluded.qr_code,
    shape = excluded.shape,
    width = excluded.width,
    height = excluded.height,
    occupied_since = excluded.occupied_since,
    notes = excluded.notes,
    updated_at = excluded.updated_at;

  insert into public.table_sessions (
    id,
    restaurant_id,
    table_id,
    customer_id,
    primary_user_id,
    guest_user_ids,
    guest_name,
    guest_count,
    status,
    started_at,
    last_activity,
    total_orders,
    total_spent,
    total_amount,
    notes,
    created_at,
    updated_at
  )
  values
    (
      private.client_simulation_uuid(p_restaurant_id, 'session-s07'),
      p_restaurant_id, v_table_07, v_ana, v_ana, jsonb_build_array(v_ana::text),
      'Ana Souza', 2, 'active', p_reference_time - interval '38 minutes',
      p_reference_time - interval '3 minutes', 2, 226.60, 226.60,
      v_marker || ' Sessão ativa da mesa S07.', p_reference_time - interval '38 minutes', p_reference_time
    ),
    (
      private.client_simulation_uuid(p_restaurant_id, 'session-s12'),
      p_restaurant_id, v_table_12, v_lucas, v_lucas, jsonb_build_array(v_lucas::text, v_beatriz::text),
      'Lucas Ferreira', 4, 'active', p_reference_time - interval '54 minutes',
      p_reference_time - interval '6 minutes', 2, 578.60, 578.60,
      v_marker || ' Sessão ativa da mesa S12.', p_reference_time - interval '54 minutes', p_reference_time
    )
  on conflict (id) do update
  set
    guest_user_ids = excluded.guest_user_ids,
    guest_name = excluded.guest_name,
    guest_count = excluded.guest_count,
    status = excluded.status,
    started_at = excluded.started_at,
    last_activity = excluded.last_activity,
    total_orders = excluded.total_orders,
    total_spent = excluded.total_spent,
    total_amount = excluded.total_amount,
    notes = excluded.notes,
    updated_at = excluded.updated_at;

  insert into public.orders (
    id,
    restaurant_id,
    customer_id,
    order_type,
    table_id,
    status,
    estimated_time,
    metadata,
    party_size,
    subtotal,
    tax_amount,
    tip_amount,
    discount_amount,
    total_amount,
    special_instructions,
    payment_method,
    estimated_ready_at,
    actual_ready_at,
    completed_at,
    source,
    source_order_id,
    created_at,
    updated_at
  )
  values
    (
      v_order_pending, p_restaurant_id, v_ana, 'dine_in', v_table_07, 'pending', 12,
      '{"simulation":"restaurant_client","scenario":"new_order"}'::jsonb,
      2, 70, 0, 0, 0, 77, 'Água sem gelo, por favor.', null,
      p_reference_time + interval '10 minutes', null, null, 'noowe', 'SIM-3001',
      p_reference_time - interval '2 minutes', p_reference_time - interval '2 minutes'
    ),
    (
      v_order_confirmed, p_restaurant_id, v_lucas, 'dine_in', v_table_12, 'confirmed', 28,
      '{"simulation":"restaurant_client","scenario":"kds_queue"}'::jsonb,
      4, 342, 0, 0, 0, 376.20, 'Um filé ao ponto e outro bem-passado.', null,
      p_reference_time + interval '24 minutes', null, null, 'noowe', 'SIM-3002',
      p_reference_time - interval '7 minutes', p_reference_time - interval '5 minutes'
    ),
    (
      v_order_preparing, p_restaurant_id, v_marina, 'dine_in', v_table_07, 'preparing', 18,
      '{"simulation":"restaurant_client","scenario":"kds_preparing"}'::jsonb,
      2, 136, 0, 0, 0, 149.60, 'Alergia severa a castanhas. Confirmar ausência de contaminação cruzada.', null,
      p_reference_time + interval '9 minutes', null, null, 'noowe', 'SIM-3003',
      p_reference_time - interval '16 minutes', p_reference_time - interval '4 minutes'
    ),
    (
      v_order_ready, p_restaurant_id, v_beatriz, 'dine_in', v_table_12, 'ready', 20,
      '{"simulation":"restaurant_client","scenario":"ready_to_serve"}'::jsonb,
      4, 184, 0, 0, 0, 202.40, 'Servir o vinho depois do prato principal.', null,
      p_reference_time - interval '1 minute', p_reference_time - interval '1 minute', null, 'noowe', 'SIM-3004',
      p_reference_time - interval '31 minutes', p_reference_time - interval '1 minute'
    ),
    (
      v_order_completed, p_restaurant_id, v_ana, 'dine_in', v_table_16, 'completed', 25,
      '{"simulation":"restaurant_client","scenario":"paid_today"}'::jsonb,
      2, 160, 0, 16, 0, 176, null, 'pix',
      v_today + interval '13 hours 15 minutes', v_today + interval '13 hours 12 minutes',
      v_today + interval '13 hours 40 minutes', 'noowe', 'SIM-2998',
      v_today + interval '12 hours 45 minutes', v_today + interval '13 hours 40 minutes'
    ),
    (
      v_order_delivered, p_restaurant_id, v_marina, 'pickup', null, 'delivered', 14,
      '{"simulation":"restaurant_client","scenario":"pickup_paid_today"}'::jsonb,
      1, 76, 0, 0, 0, 76, 'Retirada no balcão. Embalar molho separado.', 'credit_card',
      v_today + interval '15 hours 25 minutes', v_today + interval '15 hours 22 minutes',
      v_today + interval '15 hours 24 minutes', 'noowe', 'SIM-2999',
      v_today + interval '15 hours', v_today + interval '15 hours 24 minutes'
    ),
    (
      v_order_history, p_restaurant_id, v_beatriz, 'dine_in', v_table_04, 'completed', 25,
      '{"simulation":"restaurant_client","scenario":"historical_paid"}'::jsonb,
      4, 166, 0, 16.60, 0, 182.60, 'Mesa próxima à janela.', 'debit_card',
      v_today - interval '1 day' + interval '20 hours', v_today - interval '1 day' + interval '19 hours 58 minutes',
      v_today - interval '1 day' + interval '20 hours 35 minutes', 'noowe', 'SIM-2987',
      v_today - interval '1 day' + interval '19 hours 20 minutes',
      v_today - interval '1 day' + interval '20 hours 35 minutes'
    ),
    (
      v_order_cancelled, p_restaurant_id, v_rafael, 'dine_in', v_table_09, 'cancelled', 8,
      '{"simulation":"restaurant_client","scenario":"cancelled"}'::jsonb,
      1, 58, 0, 0, 0, 58, 'Cliente pediu cancelamento antes do preparo.', null,
      null, null, null, 'noowe', 'SIM-2997',
      p_reference_time - interval '42 minutes', p_reference_time - interval '39 minutes'
    )
  on conflict (id) do update
  set
    customer_id = excluded.customer_id,
    order_type = excluded.order_type,
    table_id = excluded.table_id,
    status = excluded.status,
    estimated_time = excluded.estimated_time,
    metadata = excluded.metadata,
    party_size = excluded.party_size,
    subtotal = excluded.subtotal,
    tax_amount = excluded.tax_amount,
    tip_amount = excluded.tip_amount,
    discount_amount = excluded.discount_amount,
    total_amount = excluded.total_amount,
    special_instructions = excluded.special_instructions,
    payment_method = excluded.payment_method,
    estimated_ready_at = excluded.estimated_ready_at,
    actual_ready_at = excluded.actual_ready_at,
    completed_at = excluded.completed_at,
    source = excluded.source,
    source_order_id = excluded.source_order_id,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;

  delete from public.order_items
  where order_id in (
    v_order_pending,
    v_order_confirmed,
    v_order_preparing,
    v_order_ready,
    v_order_completed,
    v_order_delivered,
    v_order_history,
    v_order_cancelled
  );

  insert into public.order_items (
    id,
    order_id,
    menu_item_id,
    quantity,
    unit_price,
    total_price,
    status,
    special_instructions,
    customizations,
    ordered_by,
    ordered_by_name,
    expected_ready_at,
    course,
    created_at,
    updated_at
  )
  values
    (private.client_simulation_uuid(p_restaurant_id, 'oi-3001-1'), v_order_pending, v_tartare, 1, 58, 58, 'pending', 'Picância suave.', '{"spice":"mild"}'::jsonb, v_ana, 'Ana Souza', p_reference_time + interval '8 minutes', 'starter', p_reference_time - interval '2 minutes', p_reference_time - interval '2 minutes'),
    (private.client_simulation_uuid(p_restaurant_id, 'oi-3001-2'), v_order_pending, v_water, 1, 12, 12, 'pending', 'Sem gelo.', '{}'::jsonb, v_ana, 'Ana Souza', p_reference_time + interval '1 minute', 'drink', p_reference_time - interval '2 minutes', p_reference_time - interval '2 minutes'),

    (private.client_simulation_uuid(p_restaurant_id, 'oi-3002-1'), v_order_confirmed, v_burrata, 1, 48, 48, 'pending', null, '{}'::jsonb, v_lucas, 'Lucas Ferreira', p_reference_time + interval '5 minutes', 'starter', p_reference_time - interval '7 minutes', p_reference_time - interval '5 minutes'),
    (private.client_simulation_uuid(p_restaurant_id, 'oi-3002-2'), v_order_confirmed, v_filet, 2, 98, 196, 'pending', 'Um ao ponto e outro bem-passado.', '{"doneness":["medium","well_done"]}'::jsonb, v_lucas, 'Lucas Ferreira', p_reference_time + interval '24 minutes', 'main', p_reference_time - interval '7 minutes', p_reference_time - interval '5 minutes'),
    (private.client_simulation_uuid(p_restaurant_id, 'oi-3002-3'), v_order_confirmed, v_wine, 1, 98, 98, 'pending', null, '{}'::jsonb, v_lucas, 'Lucas Ferreira', p_reference_time + interval '3 minutes', 'drink', p_reference_time - interval '7 minutes', p_reference_time - interval '5 minutes'),

    (private.client_simulation_uuid(p_restaurant_id, 'oi-3003-1'), v_order_preparing, v_risotto, 1, 72, 72, 'preparing', 'Sem castanhas; higienizar bancada.', '{"allergy_alert":true}'::jsonb, v_marina, 'Marina Costa', p_reference_time + interval '9 minutes', 'main', p_reference_time - interval '16 minutes', p_reference_time - interval '4 minutes'),
    (private.client_simulation_uuid(p_restaurant_id, 'oi-3003-2'), v_order_preparing, v_bowl, 1, 64, 64, 'pending', 'Sem tahine por alergia a gergelim.', '{"sauce":"citrus"}'::jsonb, v_marina, 'Marina Costa', p_reference_time + interval '7 minutes', 'main', p_reference_time - interval '16 minutes', p_reference_time - interval '4 minutes'),

    (private.client_simulation_uuid(p_restaurant_id, 'oi-3004-1'), v_order_ready, v_salmon, 1, 86, 86, 'ready', 'Sem glúten.', '{}'::jsonb, v_beatriz, 'Beatriz Santos', p_reference_time - interval '2 minutes', 'main', p_reference_time - interval '31 minutes', p_reference_time - interval '1 minute'),
    (private.client_simulation_uuid(p_restaurant_id, 'oi-3004-2'), v_order_ready, v_wine, 1, 98, 98, 'ready', 'Servir junto ao prato.', '{}'::jsonb, v_beatriz, 'Beatriz Santos', p_reference_time - interval '2 minutes', 'drink', p_reference_time - interval '31 minutes', p_reference_time - interval '1 minute'),

    (private.client_simulation_uuid(p_restaurant_id, 'oi-2998-1'), v_order_completed, v_filet, 1, 98, 98, 'delivered', 'Ao ponto.', '{"doneness":"medium"}'::jsonb, v_ana, 'Ana Souza', v_today + interval '13 hours 10 minutes', 'main', v_today + interval '12 hours 45 minutes', v_today + interval '13 hours 40 minutes'),
    (private.client_simulation_uuid(p_restaurant_id, 'oi-2998-2'), v_order_completed, v_water, 2, 12, 24, 'delivered', null, '{}'::jsonb, v_ana, 'Ana Souza', v_today + interval '12 hours 48 minutes', 'drink', v_today + interval '12 hours 45 minutes', v_today + interval '13 hours 40 minutes'),
    (private.client_simulation_uuid(p_restaurant_id, 'oi-2998-3'), v_order_completed, v_petit, 1, 38, 38, 'delivered', null, '{}'::jsonb, v_ana, 'Ana Souza', v_today + interval '13 hours 30 minutes', 'dessert', v_today + interval '13 hours 15 minutes', v_today + interval '13 hours 40 minutes'),

    (private.client_simulation_uuid(p_restaurant_id, 'oi-2999-1'), v_order_delivered, v_bowl, 1, 64, 64, 'delivered', 'Molho cítrico separado.', '{"sauce":"citrus","separate":true}'::jsonb, v_marina, 'Marina Costa', v_today + interval '15 hours 20 minutes', 'main', v_today + interval '15 hours', v_today + interval '15 hours 24 minutes'),
    (private.client_simulation_uuid(p_restaurant_id, 'oi-2999-2'), v_order_delivered, v_water, 1, 12, 12, 'delivered', null, '{}'::jsonb, v_marina, 'Marina Costa', v_today + interval '15 hours 2 minutes', 'drink', v_today + interval '15 hours', v_today + interval '15 hours 24 minutes'),

    (private.client_simulation_uuid(p_restaurant_id, 'oi-2987-1'), v_order_history, v_burrata, 1, 48, 48, 'delivered', 'Pão sem glúten.', '{"gluten_free_bread":true}'::jsonb, v_beatriz, 'Beatriz Santos', v_today - interval '1 day' + interval '19 hours 30 minutes', 'starter', v_today - interval '1 day' + interval '19 hours 20 minutes', v_today - interval '1 day' + interval '20 hours 35 minutes'),
    (private.client_simulation_uuid(p_restaurant_id, 'oi-2987-2'), v_order_history, v_salmon, 1, 86, 86, 'delivered', null, '{}'::jsonb, v_beatriz, 'Beatriz Santos', v_today - interval '1 day' + interval '19 hours 55 minutes', 'main', v_today - interval '1 day' + interval '19 hours 20 minutes', v_today - interval '1 day' + interval '20 hours 35 minutes'),
    (private.client_simulation_uuid(p_restaurant_id, 'oi-2987-3'), v_order_history, v_mousse, 1, 32, 32, 'delivered', null, '{}'::jsonb, v_beatriz, 'Beatriz Santos', v_today - interval '1 day' + interval '20 hours 20 minutes', 'dessert', v_today - interval '1 day' + interval '19 hours 20 minutes', v_today - interval '1 day' + interval '20 hours 35 minutes'),

    (private.client_simulation_uuid(p_restaurant_id, 'oi-2997-1'), v_order_cancelled, v_tartare, 1, 58, 58, 'cancelled', null, '{}'::jsonb, v_rafael, 'Rafael Oliveira', null, 'starter', p_reference_time - interval '42 minutes', p_reference_time - interval '39 minutes');

  insert into public.reservations (
    id,
    restaurant_id,
    customer_id,
    table_id,
    reservation_time,
    party_size,
    special_requests,
    status,
    metadata,
    created_at,
    updated_at
  )
  values
    (
      private.client_simulation_uuid(p_restaurant_id, 'reservation-pending'),
      p_restaurant_id, v_ana, null, p_reference_time + interval '45 minutes', 2,
      'Preferência por mesa tranquila. Intolerância à lactose.',
      'pending', '{"simulation":"restaurant_client","channel":"client_app"}'::jsonb,
      p_reference_time - interval '18 minutes', p_reference_time - interval '18 minutes'
    ),
    (
      private.client_simulation_uuid(p_restaurant_id, 'reservation-confirmed'),
      p_restaurant_id, v_beatriz, v_table_04, p_reference_time + interval '2 hours', 4,
      'Duas crianças, de 5 e 8 anos. Uma pessoa não consome glúten.',
      'confirmed', '{"simulation":"restaurant_client","channel":"client_app","has_kids":true}'::jsonb,
      p_reference_time - interval '2 days', p_reference_time - interval '1 hour'
    ),
    (
      private.client_simulation_uuid(p_restaurant_id, 'reservation-seated'),
      p_restaurant_id, v_rafael, v_table_09, p_reference_time - interval '1 hour', 2,
      'Menu vegano para os dois convidados.',
      'seated', '{"simulation":"restaurant_client","channel":"client_app"}'::jsonb,
      p_reference_time - interval '4 days', p_reference_time - interval '55 minutes'
    ),
    (
      private.client_simulation_uuid(p_restaurant_id, 'reservation-tomorrow'),
      p_restaurant_id, v_marina, v_table_12, v_today + interval '1 day 20 hours', 3,
      'Alergia severa a castanhas. Entrar em contato em caso de dúvida.',
      'confirmed', '{"simulation":"restaurant_client","channel":"client_app","allergy_alert":true}'::jsonb,
      p_reference_time - interval '1 day', p_reference_time - interval '1 day'
    ),
    (
      private.client_simulation_uuid(p_restaurant_id, 'reservation-history'),
      p_restaurant_id, v_lucas, v_table_16, v_today - interval '2 days' + interval '20 hours', 4,
      'Comemoração de aniversário.',
      'completed', '{"simulation":"restaurant_client","channel":"client_app","occasion":"birthday"}'::jsonb,
      p_reference_time - interval '8 days', p_reference_time - interval '2 days'
    )
  on conflict (id) do update
  set
    customer_id = excluded.customer_id,
    table_id = excluded.table_id,
    reservation_time = excluded.reservation_time,
    party_size = excluded.party_size,
    special_requests = excluded.special_requests,
    status = excluded.status,
    metadata = excluded.metadata,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;

  insert into public.waitlist_entries (
    id,
    restaurant_id,
    customer_id,
    customer_name,
    customer_phone,
    party_size,
    preference,
    has_kids,
    kids_ages,
    kids_allergies,
    waitlist_bar_orders,
    status,
    estimated_wait_minutes,
    position,
    notes,
    created_at,
    updated_at
  )
  values
    (
      private.client_simulation_uuid(p_restaurant_id, 'waitlist-rafael'),
      p_restaurant_id, v_rafael, 'Rafael Oliveira', '+5511987651004', 2, 'qualquer',
      false, null, null, '[]'::jsonb, 'waiting', 12, 1,
      v_marker || ' Entrada pelo app há 8 minutos.', p_reference_time - interval '8 minutes', p_reference_time
    ),
    (
      private.client_simulation_uuid(p_restaurant_id, 'waitlist-beatriz'),
      p_restaurant_id, v_beatriz, 'Beatriz Santos', '+5511987651005', 4, 'salao',
      true, '[5,8]'::jsonb, '["sem glúten"]'::jsonb,
      '[{"item":"Suco de laranja","quantity":2}]'::jsonb, 'waiting', 22, 2,
      v_marker || ' Família com crianças; solicitou cadeirão.', p_reference_time - interval '5 minutes', p_reference_time
    ),
    (
      private.client_simulation_uuid(p_restaurant_id, 'waitlist-walkin'),
      p_restaurant_id, null, 'Camila Almeida', '+5511987651099', 3, 'terraco',
      false, null, null, '[]'::jsonb, 'waiting', 30, 3,
      v_marker || ' Walk-in sem cadastro.', p_reference_time - interval '2 minutes', p_reference_time
    )
  on conflict (id) do update
  set
    customer_id = excluded.customer_id,
    customer_name = excluded.customer_name,
    customer_phone = excluded.customer_phone,
    party_size = excluded.party_size,
    preference = excluded.preference,
    has_kids = excluded.has_kids,
    kids_ages = excluded.kids_ages,
    kids_allergies = excluded.kids_allergies,
    waitlist_bar_orders = excluded.waitlist_bar_orders,
    status = excluded.status,
    estimated_wait_minutes = excluded.estimated_wait_minutes,
    position = excluded.position,
    notes = excluded.notes,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;

  insert into public.service_calls (
    id,
    restaurant_id,
    table_id,
    user_id,
    call_type,
    status,
    message,
    called_at,
    acknowledged_at,
    acknowledged_by,
    resolved_at,
    resolved_by,
    created_at,
    updated_at
  )
  values
    (
      private.client_simulation_uuid(p_restaurant_id, 'service-call-waiter'),
      p_restaurant_id, v_table_07, v_ana, 'waiter', 'pending',
      v_marker || ' Cliente quer tirar uma dúvida sobre o pedido.',
      p_reference_time - interval '3 minutes', null, null, null, null,
      p_reference_time - interval '3 minutes', p_reference_time - interval '3 minutes'
    ),
    (
      private.client_simulation_uuid(p_restaurant_id, 'service-call-help'),
      p_restaurant_id, v_table_12, v_lucas, 'help', 'acknowledged',
      v_marker || ' Cliente solicitou uma cadeira adicional.',
      p_reference_time - interval '9 minutes', p_reference_time - interval '7 minutes',
      'Mariana (Garçonete)', null, null,
      p_reference_time - interval '9 minutes', p_reference_time - interval '7 minutes'
    ),
    (
      private.client_simulation_uuid(p_restaurant_id, 'service-call-resolved'),
      p_restaurant_id, v_table_04, v_beatriz, 'manager', 'resolved',
      v_marker || ' Cliente pediu confirmação sobre protocolo sem glúten.',
      p_reference_time - interval '35 minutes', p_reference_time - interval '32 minutes',
      'Carlos (Gerente)', p_reference_time - interval '25 minutes', 'Carlos (Gerente)',
      p_reference_time - interval '35 minutes', p_reference_time - interval '25 minutes'
    )
  on conflict (id) do update
  set
    table_id = excluded.table_id,
    user_id = excluded.user_id,
    call_type = excluded.call_type,
    status = excluded.status,
    message = excluded.message,
    called_at = excluded.called_at,
    acknowledged_at = excluded.acknowledged_at,
    acknowledged_by = excluded.acknowledged_by,
    resolved_at = excluded.resolved_at,
    resolved_by = excluded.resolved_by,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;

  -- The dashboard snapshot still counts waiter_calls while the service screen
  -- uses service_calls, so both representations are seeded for parity.
  insert into public.waiter_calls (
    id,
    restaurant_id,
    table_id,
    user_id,
    reason,
    notes,
    status,
    acknowledged_by,
    acknowledged_at,
    resolved_at,
    created_at
  )
  values
    (
      private.client_simulation_uuid(p_restaurant_id, 'waiter-call-pending'),
      p_restaurant_id, v_table_07, v_ana, 'waiter',
      v_marker || ' Espelho do chamado pendente.', 'pending',
      null, null, null, p_reference_time - interval '3 minutes'
    ),
    (
      private.client_simulation_uuid(p_restaurant_id, 'waiter-call-acknowledged'),
      p_restaurant_id, v_table_12, v_lucas, 'help',
      v_marker || ' Espelho do chamado reconhecido.', 'acknowledged',
      'Mariana (Garçonete)', p_reference_time - interval '7 minutes', null,
      p_reference_time - interval '9 minutes'
    )
  on conflict (id) do update
  set
    table_id = excluded.table_id,
    user_id = excluded.user_id,
    reason = excluded.reason,
    notes = excluded.notes,
    status = excluded.status,
    acknowledged_by = excluded.acknowledged_by,
    acknowledged_at = excluded.acknowledged_at,
    resolved_at = excluded.resolved_at,
    created_at = excluded.created_at;

  insert into public.loyalty_programs (
    id,
    user_id,
    restaurant_id,
    points,
    total_visits,
    total_spent,
    tier,
    last_visit,
    rewards_claimed,
    available_rewards,
    awarded_order_ids,
    is_active,
    created_at,
    updated_at
  )
  values
    (
      private.client_simulation_uuid(p_restaurant_id, 'loyalty-ana'),
      v_ana, p_restaurant_id, 1280, 14, 2140.80, 'gold', p_reference_time,
      '["welcome_drink"]'::jsonb, '["dessert","priority_booking"]'::jsonb,
      jsonb_build_array(v_order_completed)::text, true,
      p_reference_time - interval '180 days', p_reference_time
    ),
    (
      private.client_simulation_uuid(p_restaurant_id, 'loyalty-lucas'),
      v_lucas, p_restaurant_id, 640, 7, 1188.20, 'silver', p_reference_time - interval '7 minutes',
      '[]'::jsonb, '["welcome_drink"]'::jsonb,
      '[]', true, p_reference_time - interval '120 days', p_reference_time
    ),
    (
      private.client_simulation_uuid(p_restaurant_id, 'loyalty-marina'),
      v_marina, p_restaurant_id, 370, 4, 582.50, 'silver', p_reference_time,
      '[]'::jsonb, '[]'::jsonb,
      jsonb_build_array(v_order_delivered)::text, true,
      p_reference_time - interval '75 days', p_reference_time
    ),
    (
      private.client_simulation_uuid(p_restaurant_id, 'loyalty-rafael'),
      v_rafael, p_restaurant_id, 90, 2, 154.00, 'bronze', p_reference_time - interval '12 days',
      '[]'::jsonb, '[]'::jsonb,
      '[]', true, p_reference_time - interval '45 days', p_reference_time
    ),
    (
      private.client_simulation_uuid(p_restaurant_id, 'loyalty-beatriz'),
      v_beatriz, p_restaurant_id, 920, 9, 1640.40, 'gold', p_reference_time - interval '1 day',
      '["kids_dessert"]'::jsonb, '["priority_booking"]'::jsonb,
      jsonb_build_array(v_order_history)::text, true,
      p_reference_time - interval '20 days', p_reference_time
    )
  on conflict (id) do update
  set
    points = excluded.points,
    total_visits = excluded.total_visits,
    total_spent = excluded.total_spent,
    tier = excluded.tier,
    last_visit = excluded.last_visit,
    rewards_claimed = excluded.rewards_claimed,
    available_rewards = excluded.available_rewards,
    awarded_order_ids = excluded.awarded_order_ids,
    is_active = excluded.is_active,
    updated_at = excluded.updated_at;

  insert into public.reviews (
    id,
    user_id,
    restaurant_id,
    order_id,
    rating,
    food_rating,
    service_rating,
    ambiance_rating,
    value_rating,
    comment,
    images,
    sentiment,
    sentiment_analysis,
    is_verified,
    is_visible,
    helpful_count,
    owner_response,
    owner_responded_at,
    created_at,
    updated_at,
    deleted_at
  )
  values
    (
      private.client_simulation_uuid(p_restaurant_id, 'review-ana'),
      v_ana, p_restaurant_id, v_order_completed, 5, 5, 5, 5, 4,
      'Atendimento muito atencioso e o filé chegou exatamente no ponto pedido.',
      '[]', 'positive', '{"simulation":"restaurant_client","confidence":0.97}'::jsonb,
      true, true, 8, null, null,
      p_reference_time - interval '2 hours', p_reference_time - interval '2 hours', p_reference_time
    ),
    (
      private.client_simulation_uuid(p_restaurant_id, 'review-marina'),
      v_marina, p_restaurant_id, v_order_delivered, 4, 5, 4, 4, 4,
      'O cuidado com minha alergia foi excelente. A retirada atrasou alguns minutos.',
      '[]', 'positive', '{"simulation":"restaurant_client","confidence":0.84}'::jsonb,
      true, true, 3, 'Marina, agradecemos o retorno e já ajustamos o fluxo de retirada.',
      p_reference_time - interval '20 minutes',
      p_reference_time - interval '1 hour', p_reference_time - interval '20 minutes', p_reference_time
    ),
    (
      private.client_simulation_uuid(p_restaurant_id, 'review-beatriz'),
      v_beatriz, p_restaurant_id, v_order_history, 5, 5, 5, 4, 5,
      'Ótima experiência em família. A equipe entendeu a restrição ao glúten.',
      '[]', 'positive', '{"simulation":"restaurant_client","confidence":0.94}'::jsonb,
      true, true, 5, null, null,
      p_reference_time - interval '1 day', p_reference_time - interval '1 day', p_reference_time
    ),
    (
      private.client_simulation_uuid(p_restaurant_id, 'review-rafael'),
      v_rafael, p_restaurant_id, null, 3, 4, 3, 4, 3,
      'Boas opções veganas, mas a fila estava maior do que o tempo informado no app.',
      '[]', 'neutral', '{"simulation":"restaurant_client","confidence":0.89}'::jsonb,
      true, true, 1, null, null,
      p_reference_time - interval '12 days', p_reference_time - interval '12 days', p_reference_time
    )
  on conflict (id) do update
  set
    order_id = excluded.order_id,
    rating = excluded.rating,
    food_rating = excluded.food_rating,
    service_rating = excluded.service_rating,
    ambiance_rating = excluded.ambiance_rating,
    value_rating = excluded.value_rating,
    comment = excluded.comment,
    sentiment = excluded.sentiment,
    sentiment_analysis = excluded.sentiment_analysis,
    is_verified = excluded.is_verified,
    is_visible = excluded.is_visible,
    helpful_count = excluded.helpful_count,
    owner_response = excluded.owner_response,
    owner_responded_at = excluded.owner_responded_at,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at,
    deleted_at = excluded.deleted_at;

  insert into public.notifications (
    id,
    user_id,
    title,
    message,
    notification_type,
    related_id,
    related_type,
    is_read,
    metadata,
    created_at
  )
  values
    (
      private.client_simulation_uuid(p_restaurant_id, 'notification-order-ready'),
      v_beatriz, 'Seu pedido está pronto', 'Os itens do pedido SIM-3004 já podem ser servidos.',
      'order_ready', v_order_ready, 'order', false,
      jsonb_build_object('simulation', 'restaurant_client', 'restaurant_id', p_restaurant_id::text),
      p_reference_time - interval '1 minute'
    ),
    (
      private.client_simulation_uuid(p_restaurant_id, 'notification-reservation'),
      v_beatriz, 'Reserva confirmada', 'Sua mesa para 4 pessoas está confirmada.',
      'reservation_confirmed',
      private.client_simulation_uuid(p_restaurant_id, 'reservation-confirmed'),
      'reservation', false,
      jsonb_build_object('simulation', 'restaurant_client', 'restaurant_id', p_restaurant_id::text),
      p_reference_time - interval '1 hour'
    ),
    (
      private.client_simulation_uuid(p_restaurant_id, 'notification-payment'),
      v_ana, 'Pagamento aprovado', 'Pagamento via PIX de R$ 176,00 aprovado.',
      'payment_received', v_order_completed, 'payment', true,
      jsonb_build_object('simulation', 'restaurant_client', 'restaurant_id', p_restaurant_id::text),
      v_today + interval '13 hours 40 minutes'
    )
  on conflict (id) do update
  set
    title = excluded.title,
    message = excluded.message,
    notification_type = excluded.notification_type,
    related_id = excluded.related_id,
    related_type = excluded.related_type,
    is_read = excluded.is_read,
    metadata = excluded.metadata,
    created_at = excluded.created_at;

  update public.restaurants r
  set
    rating = coalesce((
      select round(avg(rv.rating), 2)
      from public.reviews rv
      where rv.restaurant_id = p_restaurant_id
        and rv.is_visible
    ), 0),
    total_reviews = (
      select count(*)
      from public.reviews rv
      where rv.restaurant_id = p_restaurant_id
        and rv.is_visible
    ),
    updated_at = p_reference_time
  where r.id = p_restaurant_id;

  return jsonb_build_object(
    'restaurant_id', p_restaurant_id,
    'reference_time', p_reference_time,
    'created_or_refreshed', jsonb_build_object(
      'test_clients', 5,
      'menu_categories', 4,
      'menu_items', 10,
      'tables', 5,
      'active_table_sessions', 2,
      'orders', 8,
      'order_items', 18,
      'reservations', 5,
      'waitlist_entries', 3,
      'service_calls', 3,
      'reviews', 4,
      'loyalty_profiles', 5
    ),
    'client_profiles', jsonb_build_object(
      'emails', jsonb_build_array(
        'cliente.ana@noowe.test',
        'cliente.lucas@noowe.test',
        'cliente.marina@noowe.test',
        'cliente.rafael@noowe.test',
        'cliente.beatriz@noowe.test'
      ),
      'login_capable', false,
      'note', 'Reference users for restaurant-side simulation; create login users with the Auth Admin API.'
    ),
    'cleanup_sql', format(
      'select private.clear_restaurant_client_simulation(%L::uuid);',
      p_restaurant_id::text
    )
  );
end;
$$;

revoke all on function private.seed_restaurant_client_simulation(uuid, timestamptz) from public;
grant execute on function private.seed_restaurant_client_simulation(uuid, timestamptz) to service_role;

comment on function private.seed_restaurant_client_simulation(uuid, timestamptz)
  is 'Creates repeatable, realistic client-side activity for one restaurant. Service-role only.';

comment on function private.clear_restaurant_client_simulation(uuid)
  is 'Removes operational data created by seed_restaurant_client_simulation while preserving test auth users.';
