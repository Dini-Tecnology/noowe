-- Paridade de perfil entre os três modelos de serviço.
--
-- A tela de detalhes do restaurante é a mesma para fine dining, casual dining
-- e quick service e lê sempre as mesmas colunas. Ela parecia "incompleta"
-- fora do casual dining por dois motivos de dado, tratados aqui:
--
--   1. `create_my_restaurant` gravava apenas {primary_type, active_types} em
--      service_config, então todo restaurante criado pelo onboarding nascia
--      sem o esqueleto que as telas leem.
--   2. Só a Cantina Noowe (casual, 20260815220000) tinha perfil semeado. O
--      Atelier Noowe (fine dining) tinha somente o cardápio (20260815150000)
--      e não existia nenhum restaurante quick service de demonstração.
--
-- Nada aqui sobrescreve dado já preenchido: os seeds só completam campos
-- vazios, para não apagar o que um dono tenha cadastrado no painel.

-- ── 1. Esqueleto padrão de service_config ───────────────────────────────────
-- Uma única função nomeada concentra os defaults por modelo. Trocar qualquer
-- um deles depois (ADR PROVISÓRIO) é mudança de uma linha aqui, não uma
-- caçada por literais espalhados pelas RPCs.
create or replace function private.default_service_config(p_service_type text)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
           'primary_type', p_service_type,
           'active_types', jsonb_build_array(p_service_type),
           'amenities', '[]'::jsonb
         )
         || case p_service_type
              when 'casual_dining' then jsonb_build_object(
                'casual_dining', jsonb_build_object(
                  'family_mode', true,
                  'waitlist_enabled', true,
                  'estimated_wait_display', true,
                  'reservations_optional', true,
                  'shared_ordering', true,
                  'call_waiter_button', true,
                  'max_group_size', 12,
                  'group_reservation_required', 8,
                  'average_meal_duration', 75,
                  'price_per_person_min', null,
                  'price_per_person_max', null
                )
              )
              else '{}'::jsonb
            end;
$$;

comment on function private.default_service_config(text) is
  'Esqueleto de restaurants.service_config para um modelo de serviço. Espelha DEFAULT_CASUAL_DINING_CONFIG (platform/mobile/shared/config/casual-dining.ts).';

revoke all on function private.default_service_config(text) from public;

-- ── 2. Onboarding deixa de nascer incompleto ────────────────────────────────
-- Mesma assinatura e mesmo corpo de 20260815103000; muda só o service_config
-- gravado no insert.
create or replace function public.create_my_restaurant(
  p_name text,
  p_phone text,
  p_email text,
  p_city text default 'São Paulo',
  p_state text default 'SP',
  p_address text default 'Endereço a definir',
  p_zip_code text default '00000-000',
  p_service_type text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing uuid;
  v_restaurant public.restaurants%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if nullif(trim(coalesce(p_name, '')), '') is null then
    raise exception 'Restaurant name is required' using errcode = '22023';
  end if;
  if nullif(trim(coalesce(p_phone, '')), '') is null then
    raise exception 'Restaurant phone is required' using errcode = '22023';
  end if;
  if nullif(trim(coalesce(p_email, '')), '') is null then
    raise exception 'Restaurant email is required' using errcode = '22023';
  end if;
  if p_service_type is null or p_service_type not in ('fine_dining', 'casual_dining', 'quick_service') then
    raise exception 'A supported service type is required' using errcode = '22023';
  end if;

  select r.id into v_existing
  from public.restaurants r
  where r.owner_id = v_user_id
  order by r.created_at asc
  limit 1;

  if v_existing is not null then
    insert into public.user_roles (user_id, restaurant_id, role, is_active, created_at, updated_at)
    values (v_user_id, v_existing, 'owner', true, now(), now())
    on conflict (user_id, restaurant_id, role) do update
      set is_active = true, updated_at = now();

    select * into v_restaurant from public.restaurants where id = v_existing;
    return to_jsonb(v_restaurant);
  end if;

  insert into public.restaurants (
    owner_id, name, address, city, state, zip_code, phone, email,
    service_type, service_config
  ) values (
    v_user_id,
    trim(p_name),
    coalesce(nullif(trim(p_address), ''), 'Endereço a definir'),
    coalesce(nullif(trim(p_city), ''), 'São Paulo'),
    coalesce(nullif(trim(p_state), ''), 'SP'),
    coalesce(nullif(trim(p_zip_code), ''), '00000-000'),
    trim(p_phone),
    lower(trim(p_email)),
    p_service_type,
    private.default_service_config(p_service_type)
  )
  returning * into v_restaurant;

  insert into public.restaurant_service_configs (
    restaurant_id, service_type, is_active, config_metadata, created_at, updated_at
  )
  select v_restaurant.id, p_service_type, true, jsonb_build_object('features', '{}'::jsonb), now(), now()
  where not exists (
    select 1 from public.restaurant_service_configs
    where restaurant_id = v_restaurant.id and service_type = p_service_type
  );

  return to_jsonb(v_restaurant);
end;
$$;

revoke all on function public.create_my_restaurant(text, text, text, text, text, text, text, text) from public;
grant execute on function public.create_my_restaurant(text, text, text, text, text, text, text, text) to authenticated;

-- ── 3. Perfil do Atelier Noowe (fine dining) ────────────────────────────────
-- A linha existe só no banco ao vivo (nenhuma migration a criou); aqui ela
-- ganha o mesmo perfil que a Cantina Noowe recebeu no seed casual. Cada campo
-- é preenchido apenas se estiver vazio.
do $seed_fine$
declare
  v_restaurant_id uuid := 'b1000000-0000-4000-8000-000000000001';
  v_amenities constant jsonb := jsonb_build_array(
    'bar', 'Menu degustação', 'Carta de vinhos', 'Manobrista', 'Dress code', 'Wi-Fi', 'Acessível'
  );
  v_hours constant jsonb := '{
    "monday":{"closed":true},
    "tuesday":{"open":"19:00","close":"23:30"},
    "wednesday":{"open":"19:00","close":"23:30"},
    "thursday":{"open":"19:00","close":"23:30"},
    "friday":{"open":"19:00","close":"00:30"},
    "saturday":{"open":"12:30","close":"00:30"},
    "sunday":{"open":"12:30","close":"17:00"}
  }'::jsonb;
begin
  if not exists (select 1 from public.restaurants where id = v_restaurant_id) then
    raise notice 'Restaurant % not found, skipping fine dining profile seed', v_restaurant_id;
    return;
  end if;

  update public.restaurants set
    description = coalesce(nullif(trim(coalesce(description, '')), ''),
      'Alta gastronomia contemporânea, menu degustação autoral e carta de vinhos assinada pelo sommelier.'),
    cuisine_type = coalesce(nullif(trim(coalesce(cuisine_type, '')), ''), 'Contemporânea'),
    cuisine_types = case
      when jsonb_array_length(coalesce(cuisine_types, '[]'::jsonb)) = 0
        then '["Contemporânea", "Autoral"]'::jsonb
      else cuisine_types
    end,
    average_ticket = coalesce(average_ticket, 180),
    price_range = coalesce(nullif(trim(coalesce(price_range, '')), ''), '$$$$'),
    opening_hours = case
      when coalesce(opening_hours, '{}'::jsonb) = '{}'::jsonb then v_hours
      else opening_hours
    end,
    service_config = coalesce(service_config, '{}'::jsonb)
      || jsonb_build_object('primary_type', 'fine_dining', 'active_types', jsonb_build_array('fine_dining'))
      || case
           when jsonb_array_length(coalesce(service_config->'amenities', '[]'::jsonb)) = 0
             then jsonb_build_object('amenities', v_amenities)
           else '{}'::jsonb
         end,
    settings = case
      when coalesce(settings, '{}'::jsonb) ? 'customer_experience' then settings
      else coalesce(settings, '{}'::jsonb) || jsonb_build_object('customer_experience', jsonb_build_object(
        'onlineReservations', true, 'waitlist', true, 'tableService', true, 'qrOrdering', true
      ))
    end,
    updated_at = now()
  where id = v_restaurant_id;

  insert into public.restaurant_service_configs (restaurant_id, service_type, is_active, config_metadata, created_at, updated_at)
  select v_restaurant_id, 'fine_dining', true, jsonb_build_object('features', '{}'::jsonb), now(), now()
  where not exists (
    select 1 from public.restaurant_service_configs
    where restaurant_id = v_restaurant_id and service_type = 'fine_dining'
  );
end $seed_fine$;

-- ── 4. Restaurante de demonstração quick service ────────────────────────────
-- Mesma convenção de dono não-logável dos seeds anteriores (ver
-- private.seed_restaurant_client_simulation, 20260730120000). Quick service é
-- balcão: não recebe mesas, e suas tags de vitrine vivem em cuisine_types.
do $seed_quick$
declare
  v_owner_id uuid := 'd1000000-0000-4000-8000-000000000001';
  v_restaurant_id uuid := 'd1000000-0000-4000-8000-000000000002';
  v_cat_burgers uuid;
  v_cat_acompanhamentos uuid;
  v_cat_bebidas uuid;
begin
  insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
  values (
    v_owner_id, 'dono.expresso@noowe.test',
    '{"full_name":"Noowe Express","simulation":"quick_service_seed"}'::jsonb,
    now(), now()
  )
  on conflict (id) do nothing;

  insert into public.profiles (id, email, full_name, phone, phone_verified, provider, is_active, created_at, updated_at)
  values (v_owner_id, 'dono.expresso@noowe.test', 'Noowe Express', '+5511987650002', true, 'email', true, now(), now())
  on conflict (id) do nothing;

  insert into public.restaurants (
    id, owner_id, name, description, address, city, state, zip_code, phone, email,
    cuisine_type, cuisine_types, service_type, average_ticket, price_range, opening_hours,
    service_config, settings, is_active, created_at, updated_at
  ) values (
    v_restaurant_id, v_owner_id, 'Noowe Express',
    'Burgers na chapa e açaí na tigela, prontos para retirada no balcão em poucos minutos.',
    'Avenida Paulista, 1420', 'São Paulo', 'SP', '01310-100', '+5511987650003', 'contato.express@noowe.test',
    'Hamburgueria', '["burgers", "acai"]'::jsonb, 'quick_service', 38, '$',
    '{"monday":{"open":"10:00","close":"22:00"},"tuesday":{"open":"10:00","close":"22:00"},"wednesday":{"open":"10:00","close":"22:00"},"thursday":{"open":"10:00","close":"22:00"},"friday":{"open":"10:00","close":"23:00"},"saturday":{"open":"11:00","close":"23:00"},"sunday":{"open":"11:00","close":"21:00"}}'::jsonb,
    private.default_service_config('quick_service')
      || jsonb_build_object('amenities', jsonb_build_array(
           'Retirada no balcão', 'Pedido pelo app', 'Wi-Fi', 'Acessível', 'Ar-condicionado'
         )),
    jsonb_build_object('customer_experience', jsonb_build_object(
      'onlineReservations', false, 'waitlist', true, 'tableService', false, 'qrOrdering', true
    )),
    true, now(), now()
  )
  on conflict (id) do update set
    name = excluded.name, description = excluded.description,
    service_config = excluded.service_config, settings = excluded.settings, updated_at = now();

  insert into public.restaurant_service_configs (restaurant_id, service_type, is_active, config_metadata, created_at, updated_at)
  select v_restaurant_id, 'quick_service', true, jsonb_build_object('features', '{}'::jsonb), now(), now()
  where not exists (
    select 1 from public.restaurant_service_configs
    where restaurant_id = v_restaurant_id and service_type = 'quick_service'
  );

  if exists (select 1 from public.menu_categories where restaurant_id = v_restaurant_id) then
    raise notice 'Menu already seeded for restaurant %, skipping', v_restaurant_id;
  else
    insert into public.menu_categories (restaurant_id, name, description, display_order, icon)
    values (v_restaurant_id, 'Burgers', 'Na chapa, pão brioche', 10, 'fast-food-outline')
    returning id into v_cat_burgers;

    insert into public.menu_categories (restaurant_id, name, description, display_order, icon)
    values (v_restaurant_id, 'Acompanhamentos', 'Para completar o combo', 20, 'nutrition-outline')
    returning id into v_cat_acompanhamentos;

    insert into public.menu_categories (restaurant_id, name, description, display_order, icon)
    values (v_restaurant_id, 'Bebidas', 'Geladas e açaí', 30, 'cafe-outline')
    returning id into v_cat_bebidas;

    insert into public.menu_items (
      restaurant_id, category_id, name, description, price, course, preparation_time,
      estimated_prep_minutes, display_order, is_popular, allergens, dietary_info
    ) values
      (v_restaurant_id, v_cat_burgers, 'Express Cheese', 'Hambúrguer 120g, cheddar e molho da casa', 26.00, 'main', 8, 8, 10, true, '["gluten", "lactose"]'::jsonb, null),
      (v_restaurant_id, v_cat_burgers, 'Express Duplo', 'Dois hambúrgueres 120g, cheddar duplo e picles', 34.00, 'main', 10, 10, 20, true, '["gluten", "lactose"]'::jsonb, null),
      (v_restaurant_id, v_cat_burgers, 'Express Veggie', 'Burger de grão-de-bico, alface e maionese vegana', 28.00, 'main', 9, 9, 30, false, '["gluten"]'::jsonb, '{"vegetarian":true,"vegan":true}'::jsonb),

      (v_restaurant_id, v_cat_acompanhamentos, 'Batata Rústica', 'Porção individual com alecrim', 16.00, 'starter', 6, 6, 10, true, null, '{"vegetarian":true}'::jsonb),
      (v_restaurant_id, v_cat_acompanhamentos, 'Onion Rings', 'Anéis de cebola empanados, 8 unidades', 18.00, 'starter', 7, 7, 20, false, '["gluten"]'::jsonb, '{"vegetarian":true}'::jsonb),

      (v_restaurant_id, v_cat_bebidas, 'Açaí 300ml', 'Açaí batido com banana e granola', 22.00, 'drink', 5, 5, 10, true, null, '{"vegetarian":true}'::jsonb),
      (v_restaurant_id, v_cat_bebidas, 'Limonada Suíça', 'Limão batido com leite condensado', 12.00, 'drink', 4, 4, 20, false, '["lactose"]'::jsonb, '{"vegetarian":true}'::jsonb),
      (v_restaurant_id, v_cat_bebidas, 'Refrigerante Lata', 'Cola, guaraná ou laranja', 8.00, 'drink', 1, 1, 30, false, null, null);
  end if;
end $seed_quick$;
