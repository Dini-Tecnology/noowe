-- Casual Dining, part 3: the "Como entrar?" flow, Modo Família activation, a
-- kids-activities catalog, and a real (non-mocked) test restaurant with its
-- own menu so the client app has production-shaped data to exercise.

-- ── 1. Family mode on a seated table session ────────────────────────────────
-- "Ativar Modo Família" once seated: highlights kids dishes, flags the kitchen
-- to plate kids first, etc. (read by the client from this single flag).
alter table public.table_sessions add column if not exists family_mode boolean not null default false;

create or replace function public.customer_get_table_family_mode(p_table_session_id uuid)
returns boolean language sql stable security definer
set search_path = public, private, pg_temp as $$
  select coalesce(s.family_mode, false)
  from public.table_sessions s
  where s.id = p_table_session_id
    and private.is_table_session_participant(p_table_session_id);
$$;

create or replace function public.customer_set_table_family_mode(p_table_session_id uuid, p_enabled boolean)
returns boolean language plpgsql security definer
set search_path = public, private, pg_temp as $$
begin
  if not private.is_table_session_participant(p_table_session_id) then
    raise exception 'Table session not accessible' using errcode = 'P0001';
  end if;
  update public.table_sessions
  set family_mode = coalesce(p_enabled, false), updated_at = now()
  where id = p_table_session_id and status = 'active';
  if not found then raise exception 'This table session has ended' using errcode = 'P0001'; end if;
  return coalesce(p_enabled, false);
end $$;

-- "Ativar" while still in the waitlist — lets the kitchen prep a highchair
-- before the party is even seated. Reuses the has_kids column the waitlist
-- table already carries.
create or replace function public.customer_set_waitlist_has_kids(p_entry_id uuid, p_has_kids boolean)
returns public.waitlist_entries language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare v_entry public.waitlist_entries;
begin
  update public.waitlist_entries
  set has_kids = coalesce(p_has_kids, false), updated_at = now()
  where id = p_entry_id and customer_id = auth.uid() and status = 'waiting'
  returning * into v_entry;
  if v_entry.id is null then raise exception 'Waitlist entry cannot be updated' using errcode = 'P0001'; end if;
  return v_entry;
end $$;

-- ── 2. Kids activities catalog ───────────────────────────────────────────────
-- A platform-wide catalog (not per-restaurant config yet) rendered on the
-- "Atividades Kids" screen — real rows read over the wire, not a client-side
-- fixture array.
create table if not exists public.kid_activities (
  id uuid primary key default gen_random_uuid(),
  activity_key text not null unique,
  title text not null,
  subtitle text not null,
  icon text not null,
  status text not null default 'available' check (status in ('available', 'coming_soon')),
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.kid_activities (activity_key, title, subtitle, icon, status, display_order) values
  ('coloring', 'Colorir na Mesa', 'Kit de lápis e desenhos da casa', 'color-palette-outline', 'available', 10),
  ('quiz', 'Quiz da Casa', 'Jogo interativo no tablet da mesa', 'extension-puzzle-outline', 'available', 20),
  ('treasure_hunt', 'Caça ao Tesouro', 'Encontre 5 itens escondidos no restaurante', 'map-outline', 'coming_soon', 30),
  ('chef_kids', 'Chef Mirim', 'Monte sua própria mini pizza (30 min)', 'restaurant-outline', 'available', 40)
on conflict (activity_key) do nothing;

alter table public.kid_activities enable row level security;
revoke all on public.kid_activities from anon, authenticated;

create or replace function public.customer_list_kid_activities()
returns jsonb language sql stable security definer
set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'key', a.activity_key, 'title', a.title, 'subtitle', a.subtitle,
    'icon', a.icon, 'status', a.status
  ) order by a.display_order), '[]'::jsonb)
  from public.kid_activities a;
$$;

-- ── Grants ────────────────────────────────────────────────────────────────────
revoke all on function public.customer_get_table_family_mode(uuid) from public;
revoke all on function public.customer_set_table_family_mode(uuid, boolean) from public;
revoke all on function public.customer_set_waitlist_has_kids(uuid, boolean) from public;
revoke all on function public.customer_list_kid_activities() from public;
grant execute on function public.customer_get_table_family_mode(uuid) to authenticated;
grant execute on function public.customer_set_table_family_mode(uuid, boolean) to authenticated;
grant execute on function public.customer_set_waitlist_has_kids(uuid, boolean) to authenticated;
grant execute on function public.customer_list_kid_activities() to anon, authenticated;

-- ── 3. Test restaurant: "Cantina Noowe" (casual_dining) ─────────────────────
-- Mirrors the existing fine dining seed's approach: a real row in every table
-- the client reads from, not a client-side mock. The owner account follows
-- the same non-login-capable convention as
-- private.seed_restaurant_client_simulation (20260730120000) — for actual
-- restaurant-app login, create real credentials via the Auth Admin API and
-- attach the 'owner' role to this restaurant_id.
do $seed$
declare
  v_owner_id uuid := 'c1000000-0000-4000-8000-000000000001';
  v_restaurant_id uuid := 'c1000000-0000-4000-8000-000000000002';
  v_cat_massas uuid;
  v_cat_pizzas uuid;
  v_cat_carnes uuid;
  v_cat_saladas uuid;
  v_cat_sobremesas uuid;
  v_table_08 uuid;
begin
  insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
  values (
    v_owner_id, 'dono.cantina@noowe.test',
    '{"full_name":"Cantina Noowe","simulation":"casual_dining_seed"}'::jsonb,
    now(), now()
  )
  on conflict (id) do nothing;

  insert into public.profiles (id, email, full_name, phone, phone_verified, provider, is_active, created_at, updated_at)
  values (v_owner_id, 'dono.cantina@noowe.test', 'Cantina Noowe', '+5511987650000', true, 'email', true, now(), now())
  on conflict (id) do nothing;

  insert into public.restaurants (
    id, owner_id, name, description, address, city, state, zip_code, phone, email,
    cuisine_type, cuisine_types, service_type, average_ticket, price_range, opening_hours,
    service_config, settings, is_active, created_at, updated_at
  ) values (
    v_restaurant_id, v_owner_id, 'Cantina Noowe',
    'Casual dining italiano de família, com salão aconchegante e cardápio kids.',
    'Rua Harmonia, 320', 'São Paulo', 'SP', '05435-000', '+5511987650001', 'contato.cantina@noowe.test',
    'Italiana', '["Italiana", "Pizzaria"]'::jsonb, 'casual_dining', 85, '$$',
    '{"monday":{"open":"11:30","close":"23:00"},"tuesday":{"open":"11:30","close":"23:00"},"wednesday":{"open":"11:30","close":"23:00"},"thursday":{"open":"11:30","close":"23:00"},"friday":{"open":"11:30","close":"23:30"},"saturday":{"open":"12:00","close":"23:30"},"sunday":{"open":"12:00","close":"22:00"}}'::jsonb,
    jsonb_build_object(
      'primary_type', 'casual_dining',
      'active_types', jsonb_build_array('casual_dining'),
      'amenities', jsonb_build_array('kids_friendly', 'table_service', 'optional_reservation', 'high_chair', 'wifi', 'parking'),
      'casual_dining', jsonb_build_object(
        'family_mode', true, 'waitlist_enabled', true, 'estimated_wait_display', true,
        'reservations_optional', true, 'shared_ordering', true, 'call_waiter_button', true,
        'max_group_size', 14, 'group_reservation_required', 8, 'average_meal_duration', 75,
        'price_per_person_min', 60, 'price_per_person_max', 150
      )
    ),
    jsonb_build_object('customer_experience', jsonb_build_object(
      'onlineReservations', true, 'waitlist', true, 'tableService', true, 'qrOrdering', true
    )),
    true, now(), now()
  )
  on conflict (id) do update set
    name = excluded.name, description = excluded.description, service_config = excluded.service_config,
    settings = excluded.settings, updated_at = now();

  insert into public.restaurant_service_configs (restaurant_id, service_type, is_active, config_metadata, created_at, updated_at)
  select v_restaurant_id, 'casual_dining', true, jsonb_build_object('features', '{}'::jsonb), now(), now()
  where not exists (
    select 1 from public.restaurant_service_configs
    where restaurant_id = v_restaurant_id and service_type = 'casual_dining'
  );

  -- ── Tables ────────────────────────────────────────────────────────────────
  v_table_08 := private.client_simulation_uuid(v_restaurant_id, 'table-08');

  insert into public.tables (id, restaurant_id, table_number, seats, status, section, shape, width, height, created_at, updated_at)
  values
    (private.client_simulation_uuid(v_restaurant_id, 'table-01'), v_restaurant_id, '1', 2, 'available', 'Salão', 'round', 72, 72, now(), now()),
    (private.client_simulation_uuid(v_restaurant_id, 'table-04'), v_restaurant_id, '4', 4, 'available', 'Salão', 'rectangle', 110, 72, now(), now()),
    (v_table_08, v_restaurant_id, '8', 4, 'available', 'Salão', 'rectangle', 110, 72, now(), now())
  on conflict (id) do nothing;

  -- ── Menu ──────────────────────────────────────────────────────────────────
  if exists (select 1 from public.menu_categories where restaurant_id = v_restaurant_id) then
    raise notice 'Menu already seeded for restaurant %, skipping', v_restaurant_id;
  else
    insert into public.menu_categories (restaurant_id, name, description, display_order, icon)
    values (v_restaurant_id, 'Massas', 'Massas frescas feitas na casa', 10, 'restaurant-outline')
    returning id into v_cat_massas;

    insert into public.menu_categories (restaurant_id, name, description, display_order, icon)
    values (v_restaurant_id, 'Pizzas', 'Massa artesanal, forno a lenha', 20, 'pizza-outline')
    returning id into v_cat_pizzas;

    insert into public.menu_categories (restaurant_id, name, description, display_order, icon)
    values (v_restaurant_id, 'Carnes', 'Pratos principais à la carte', 30, 'flame-outline')
    returning id into v_cat_carnes;

    insert into public.menu_categories (restaurant_id, name, description, display_order, icon)
    values (v_restaurant_id, 'Saladas', 'Entradas leves e frescas', 40, 'leaf-outline')
    returning id into v_cat_saladas;

    insert into public.menu_categories (restaurant_id, name, description, display_order, icon)
    values (v_restaurant_id, 'Sobremesas', 'Finais doces da casa', 50, 'ice-cream-outline')
    returning id into v_cat_sobremesas;

    insert into public.menu_items (
      restaurant_id, category_id, name, description, price, course, preparation_time,
      estimated_prep_minutes, display_order, is_popular, is_kids_friendly, allergens, dietary_info
    ) values
      (v_restaurant_id, v_cat_massas, 'Lasanha Bolonhesa', 'Camadas de massa fresca com ragu bolonhês e queijo gratinado', 52.00, 'main', 25, 25, 10, true, false, '["gluten", "lactose"]'::jsonb, null),
      (v_restaurant_id, v_cat_massas, 'Nhoque ao Sugo', 'Nhoque de batata artesanal ao molho de tomate fresco e manjericão', 46.00, 'main', 20, 20, 20, false, false, '["gluten"]'::jsonb, '{"vegetarian":true}'::jsonb),
      (v_restaurant_id, v_cat_massas, 'Fettuccine Alfredo', 'Massa fresca ao molho cremoso de queijo parmesão', 48.00, 'main', 18, 18, 30, false, false, '["gluten", "lactose"]'::jsonb, '{"vegetarian":true}'::jsonb),

      (v_restaurant_id, v_cat_pizzas, 'Pizza Pepperoni', 'Massa artesanal, pepperoni importado e molho da casa', 58.00, 'main', 18, 18, 10, true, false, '["gluten", "lactose"]'::jsonb, null),
      (v_restaurant_id, v_cat_pizzas, 'Pizza Margherita', 'Molho de tomate, muçarela de búfala e manjericão fresco', 54.00, 'main', 16, 16, 20, false, false, '["gluten", "lactose"]'::jsonb, '{"vegetarian":true}'::jsonb),
      (v_restaurant_id, v_cat_pizzas, 'Mini Pizza Margherita', 'Tamanho perfeito para os pequenos, molho de tomate e muçarela', 25.00, 'main', 14, 14, 30, false, true, '["gluten", "lactose"]'::jsonb, '{"vegetarian":true}'::jsonb),

      (v_restaurant_id, v_cat_carnes, 'Risoto de Camarão', 'Arroz arbóreo, camarões grelhados e açafrão', 72.00, 'main', 30, 30, 10, false, false, '["crustaceos", "lactose"]'::jsonb, null),
      (v_restaurant_id, v_cat_carnes, 'Filé à Parmegiana', 'Filé empanado com molho pomodoro e queijo gratinado, acompanha arroz e fritas', 65.00, 'main', 22, 22, 20, false, false, '["gluten", "lactose", "ovos"]'::jsonb, null),
      (v_restaurant_id, v_cat_carnes, 'Frango à Milanesa', 'Filé de frango empanado, acompanha arroz e purê', 48.00, 'main', 20, 20, 30, false, false, '["gluten", "ovos"]'::jsonb, null),

      (v_restaurant_id, v_cat_saladas, 'Salada Caesar', 'Alface romana, croutons, parmesão e molho caesar', 38.00, 'starter', 8, 8, 10, false, false, '["gluten", "lactose", "ovos"]'::jsonb, null),
      (v_restaurant_id, v_cat_saladas, 'Salada Caprese', 'Tomate, muçarela de búfala e manjericão com azeite extravirgem', 36.00, 'starter', 6, 6, 20, false, false, '["lactose"]'::jsonb, '{"vegetarian":true}'::jsonb),

      (v_restaurant_id, v_cat_sobremesas, 'Tiramisù', 'Clássico italiano com café e mascarpone', 28.00, 'dessert', 5, 5, 10, false, false, '["gluten", "lactose", "ovos"]'::jsonb, '{"vegetarian":true}'::jsonb),
      (v_restaurant_id, v_cat_sobremesas, 'Panna Cotta', 'Creme italiano com calda de frutas vermelhas', 24.00, 'dessert', 5, 5, 20, false, false, '["lactose"]'::jsonb, '{"vegetarian":true}'::jsonb);
  end if;
end $seed$;

comment on table public.kid_activities is
  'Platform-wide catalog of kids activities shown in casual dining Modo Família ("Atividades Kids").';
