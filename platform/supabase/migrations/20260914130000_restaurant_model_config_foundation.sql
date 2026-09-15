-- Fundação de configuração canônica para os três modelos de serviço do MVP.
--
-- `restaurant_service_configs` continua existindo como compatibilidade com as
-- telas e RPCs já publicadas. Esta tabela é o contrato 1:1 que os novos fluxos
-- devem consultar. A migração também mantém o contrato sincronizado quando a
-- RPC legada de configuração é usada.

do $$
begin
  if not exists (
    select 1 from pg_type where typnamespace = 'public'::regnamespace
      and typname = 'noowe_service_model'
  ) then
    create type public.noowe_service_model as enum (
      'fine_dining', 'casual_dining', 'quick_service'
    );
  end if;

  if not exists (
    select 1 from pg_type where typnamespace = 'public'::regnamespace
      and typname = 'noowe_split_mode'
  ) then
    create type public.noowe_split_mode as enum (
      'by_owner', 'equal', 'by_item', 'fixed_amount'
    );
  end if;

  if not exists (
    select 1 from pg_type where typnamespace = 'public'::regnamespace
      and typname = 'noowe_split_fixed_remainder'
  ) then
    create type public.noowe_split_fixed_remainder as enum (
      'redistribute_unpaid', 'keep_on_table'
    );
  end if;

  if not exists (
    select 1 from pg_type where typnamespace = 'public'::regnamespace
      and typname = 'noowe_tip_allocation'
  ) then
    create type public.noowe_tip_allocation as enum (
      'table_waiter', 'team_pool'
    );
  end if;

  if not exists (
    select 1 from pg_type where typnamespace = 'public'::regnamespace
      and typname = 'noowe_loyalty_mode'
  ) then
    create type public.noowe_loyalty_mode as enum (
      'points', 'tiers', 'stamps', 'mixed'
    );
  end if;
end;
$$;

create or replace function private.noowe_service_models_are_valid(
  p_models public.noowe_service_model[]
)
returns boolean
language sql
immutable
strict
set search_path = pg_catalog, public
as $$
  select cardinality(p_models) > 0
    and (select count(*) = count(distinct model)
         from unnest(p_models) as model);
$$;

create or replace function private.noowe_bps_presets_are_valid(
  p_values integer[]
)
returns boolean
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select cardinality(p_values) > 0
    and not exists (
      select 1 from unnest(p_values) as preset_bps
      where preset_bps < 0 or preset_bps > 10000
    )
    and (select count(*) = count(distinct preset_bps)
         from unnest(p_values) as preset_bps);
$$;

create table if not exists public.restaurant_model_configs (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  service_models public.noowe_service_model[] not null,

  -- Valores percentuais são inteiros em basis points: 10% = 1000.
  service_fee_bps integer not null default 1000
    check (service_fee_bps between 0 and 10000),
  tip_presets_bps integer[] not null default array[1000, 1500, 2000],
  split_modes public.noowe_split_mode[] not null default array[
    'by_owner', 'equal', 'by_item', 'fixed_amount'
  ]::public.noowe_split_mode[],

  reservation_enabled boolean not null default true,
  queue_enabled boolean not null default true,
  reservation_policy jsonb not null default '[]'::jsonb
    check (jsonb_typeof(reservation_policy) = 'array'),
  queue_as_primary_entry boolean not null default false,
  queue_call_tolerance_min integer not null default 8
    check (queue_call_tolerance_min > 0),
  reservation_no_show_min integer not null default 15
    check (reservation_no_show_min > 0),

  family_mode_enabled boolean not null default false,
  guest_link_enabled boolean not null default false,
  guest_link_ttl_min integer not null default 180
    check (guest_link_ttl_min > 0),
  require_guest_account boolean not null default false,
  enforce_table_capacity boolean not null default true,
  capacity_override_roles public.user_roles_role_enum[] not null default array[
    'maitre', 'manager'
  ]::public.user_roles_role_enum[],
  split_fixed_remainder public.noowe_split_fixed_remainder not null
    default 'redistribute_unpaid',
  tip_allocation public.noowe_tip_allocation not null default 'table_waiter',

  combo_discount_bps integer not null default 2000
    check (combo_discount_bps between 0 and 10000),
  prepaid_required boolean not null default true,
  pickup_capacity_per_slot integer check (pickup_capacity_per_slot is null or pickup_capacity_per_slot > 0),
  pickup_expiry_min integer not null default 30 check (pickup_expiry_min > 0),
  stamps_per_reward integer not null default 10 check (stamps_per_reward > 0),
  loyalty_mode public.noowe_loyalty_mode not null default 'points',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint restaurant_model_configs_service_models_valid
    check (private.noowe_service_models_are_valid(service_models)),
  constraint restaurant_model_configs_tip_presets_valid
    check (private.noowe_bps_presets_are_valid(tip_presets_bps)),
  constraint restaurant_model_configs_split_modes_not_empty
    check (cardinality(split_modes) > 0),
  constraint restaurant_model_configs_room_entry_valid
    check (
      not (service_models && array['fine_dining', 'casual_dining']::public.noowe_service_model[])
      or reservation_enabled
      or queue_enabled
    ),
  constraint restaurant_model_configs_quick_is_prepaid
    check (
      not ('quick_service'::public.noowe_service_model = any(service_models))
      or prepaid_required
    ),
  constraint restaurant_model_configs_queue_primary_is_casual
    check (
      not queue_as_primary_entry
      or (
        queue_enabled
        and 'casual_dining'::public.noowe_service_model = any(service_models)
      )
    )
);

create index if not exists idx_restaurant_model_configs_service_models
  on public.restaurant_model_configs using gin (service_models);

alter table public.restaurant_model_configs enable row level security;

drop policy if exists restaurant_model_configs_staff_read on public.restaurant_model_configs;
create policy restaurant_model_configs_staff_read
  on public.restaurant_model_configs
  for select to authenticated
  using (private.has_restaurant_role(restaurant_id));

drop policy if exists restaurant_model_configs_managers_write on public.restaurant_model_configs;
create policy restaurant_model_configs_managers_write
  on public.restaurant_model_configs
  for all to authenticated
  using (
    private.has_restaurant_role(
      restaurant_id,
      array['owner', 'manager']::public.user_roles_role_enum[]
    )
  )
  with check (
    private.has_restaurant_role(
      restaurant_id,
      array['owner', 'manager']::public.user_roles_role_enum[]
    )
  );

create or replace function private.set_restaurant_model_config_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists restaurant_model_configs_set_updated_at on public.restaurant_model_configs;
create trigger restaurant_model_configs_set_updated_at
before update on public.restaurant_model_configs
for each row execute function private.set_restaurant_model_config_updated_at();

-- Lê os modelos suportados do formato transitório em restaurants.service_config
-- e ignora, de propósito, os tipos fora do escopo deste MVP.
create or replace function private.noowe_models_from_restaurant(
  p_service_type text,
  p_service_config jsonb
)
returns public.noowe_service_model[]
language sql
immutable
set search_path = pg_catalog, public
as $$
  with active_models as (
    select distinct item.value as service_model
    from jsonb_array_elements_text(
      coalesce(p_service_config -> 'active_types', '[]'::jsonb)
    ) as item(value)
    where item.value in ('fine_dining', 'casual_dining', 'quick_service')
  )
  select coalesce(
    (select array_agg(service_model::public.noowe_service_model order by service_model) from active_models),
    case when p_service_type in ('fine_dining', 'casual_dining', 'quick_service')
      then array[p_service_type::public.noowe_service_model]
      else null
    end
  );
$$;

-- A função é usada pelo backfill, pelo trigger de criação de restaurante e pela
-- compatibilidade do editor de configurações publicado anteriormente.
create or replace function private.ensure_restaurant_model_config(
  p_restaurant_id uuid
)
returns public.restaurant_model_configs
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_models public.noowe_service_model[];
  v_config public.restaurant_model_configs;
begin
  select private.noowe_models_from_restaurant(r.service_type, r.service_config)
  into v_models
  from public.restaurants r
  where r.id = p_restaurant_id;

  if v_models is null then
    raise exception 'Restaurant % has no supported service model for the MVP', p_restaurant_id
      using errcode = '22023';
  end if;

  insert into public.restaurant_model_configs (
    restaurant_id,
    service_models,
    queue_as_primary_entry,
    family_mode_enabled,
    guest_link_enabled,
    split_fixed_remainder,
    tip_allocation,
    loyalty_mode
  ) values (
    p_restaurant_id,
    v_models,
    'casual_dining'::public.noowe_service_model = any(v_models),
    'casual_dining'::public.noowe_service_model = any(v_models),
    v_models && array['fine_dining', 'casual_dining']::public.noowe_service_model[],
    case when 'casual_dining'::public.noowe_service_model = any(v_models)
      then 'keep_on_table'::public.noowe_split_fixed_remainder
      else 'redistribute_unpaid'::public.noowe_split_fixed_remainder
    end,
    case when 'casual_dining'::public.noowe_service_model = any(v_models)
      then 'team_pool'::public.noowe_tip_allocation
      else 'table_waiter'::public.noowe_tip_allocation
    end,
    case
      when 'quick_service'::public.noowe_service_model = any(v_models)
        and v_models && array['fine_dining', 'casual_dining']::public.noowe_service_model[]
        then 'mixed'::public.noowe_loyalty_mode
      when 'quick_service'::public.noowe_service_model = any(v_models)
        then 'stamps'::public.noowe_loyalty_mode
      when 'fine_dining'::public.noowe_service_model = any(v_models)
        then 'tiers'::public.noowe_loyalty_mode
      else 'points'::public.noowe_loyalty_mode
    end
  )
  on conflict (restaurant_id) do update
    set service_models = excluded.service_models,
        -- Os SETs abaixo leem a linha antiga.  Ao ganhar um modelo de sala, uma unidade
        -- que vinha só de Quick (reserva e fila desligadas) precisaria de porta de
        -- entrada; sem este reparo o check `room_entry_valid` abortaria a troca.
        reservation_enabled = public.restaurant_model_configs.reservation_enabled
          or (excluded.service_models && array['fine_dining', 'casual_dining']::public.noowe_service_model[]
              and not public.restaurant_model_configs.queue_enabled),
        queue_enabled = public.restaurant_model_configs.queue_enabled
          or (excluded.service_models && array['fine_dining', 'casual_dining']::public.noowe_service_model[]
              and not public.restaurant_model_configs.reservation_enabled),
        -- Fila como porta principal só existe em Casual: cai junto quando Casual sai
        -- (check `queue_primary_is_casual`) e liga quando Casual entra.
        queue_as_primary_entry = 'casual_dining'::public.noowe_service_model = any(excluded.service_models)
          and (
            public.restaurant_model_configs.queue_as_primary_entry
            or not ('casual_dining'::public.noowe_service_model = any(public.restaurant_model_configs.service_models))
          )
          and (
            public.restaurant_model_configs.queue_enabled
            or not public.restaurant_model_configs.reservation_enabled
          )
  returning * into v_config;

  return v_config;
end;
$$;

revoke all on function private.ensure_restaurant_model_config(uuid) from public;
grant execute on function private.ensure_restaurant_model_config(uuid) to service_role;

-- Todo restaurante existente em um dos três modelos recebe o contrato canônico.
insert into public.restaurant_model_configs (
  restaurant_id,
  service_models,
  queue_as_primary_entry,
  family_mode_enabled,
  guest_link_enabled,
  split_fixed_remainder,
  tip_allocation,
  loyalty_mode
)
select
  r.id,
  models.service_models,
  'casual_dining'::public.noowe_service_model = any(models.service_models),
  'casual_dining'::public.noowe_service_model = any(models.service_models),
  models.service_models && array['fine_dining', 'casual_dining']::public.noowe_service_model[],
  case when 'casual_dining'::public.noowe_service_model = any(models.service_models)
    then 'keep_on_table'::public.noowe_split_fixed_remainder
    else 'redistribute_unpaid'::public.noowe_split_fixed_remainder
  end,
  case when 'casual_dining'::public.noowe_service_model = any(models.service_models)
    then 'team_pool'::public.noowe_tip_allocation
    else 'table_waiter'::public.noowe_tip_allocation
  end,
  case
    when 'quick_service'::public.noowe_service_model = any(models.service_models)
      and models.service_models && array['fine_dining', 'casual_dining']::public.noowe_service_model[]
      then 'mixed'::public.noowe_loyalty_mode
    when 'quick_service'::public.noowe_service_model = any(models.service_models)
      then 'stamps'::public.noowe_loyalty_mode
    when 'fine_dining'::public.noowe_service_model = any(models.service_models)
      then 'tiers'::public.noowe_loyalty_mode
    else 'points'::public.noowe_loyalty_mode
  end
from public.restaurants r
cross join lateral (
  select private.noowe_models_from_restaurant(r.service_type, r.service_config) as service_models
) models
where models.service_models is not null
on conflict (restaurant_id) do nothing;

create or replace function private.create_restaurant_model_config()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if private.noowe_models_from_restaurant(new.service_type, new.service_config) is not null then
    perform private.ensure_restaurant_model_config(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists restaurants_create_model_config on public.restaurants;
create trigger restaurants_create_model_config
after insert on public.restaurants
for each row execute function private.create_restaurant_model_config();

-- Cinco RPCs escrevem `service_type` ou `service_config` (perfil, configuração
-- específica de Fine, Casual e Quick, e o editor legado). Qualquer uma que mude o
-- modelo primário ou a lista de modelos ativos precisa manter o contrato canônico
-- alinhado; sem isso o app pediria capabilities de um modelo que a configuração
-- não conhece e ficaria sem módulos habilitados.
create or replace function private.sync_restaurant_model_config()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_new_models public.noowe_service_model[] :=
    private.noowe_models_from_restaurant(new.service_type, new.service_config);
begin
  if v_new_models is not null
     and v_new_models is distinct from private.noowe_models_from_restaurant(old.service_type, old.service_config) then
    perform private.ensure_restaurant_model_config(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists restaurants_sync_model_config on public.restaurants;
create trigger restaurants_sync_model_config
after update of service_type, service_config on public.restaurants
for each row execute function private.sync_restaurant_model_config();

-- Esta é a única função que conhece os nomes dos três modelos. Aplicações e
-- regras de domínio consomem o objeto capabilities, nunca um if por modelo.
create or replace function public.get_restaurant_model_capabilities(
  p_restaurant_id uuid,
  p_service_model public.noowe_service_model
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_config public.restaurant_model_configs;
  v_is_room_model boolean := p_service_model in (
    'fine_dining'::public.noowe_service_model,
    'casual_dining'::public.noowe_service_model
  );
begin
  select c.* into v_config
  from public.restaurant_model_configs c
  join public.restaurants r on r.id = c.restaurant_id
  where c.restaurant_id = p_restaurant_id
    and r.is_active;

  if not found then
    raise exception 'Active restaurant configuration not found' using errcode = 'P0002';
  end if;

  if not (p_service_model = any(v_config.service_models)) then
    raise exception 'Service model is not enabled for this restaurant' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'serviceModel', p_service_model,
    'capabilities', jsonb_build_object(
      'reservations', v_is_room_model and v_config.reservation_enabled,
      'virtualQueue', v_is_room_model and v_config.queue_enabled,
      'queueIsPrimaryEntry',
        p_service_model = 'casual_dining'::public.noowe_service_model
        and v_config.queue_enabled
        and v_config.queue_as_primary_entry,
      'tableSession', v_is_room_model,
      'guestLink', v_is_room_model and v_config.guest_link_enabled,
      'splitBill', v_is_room_model and cardinality(v_config.split_modes) > 0,
      'splitModes', case when v_is_room_model then to_jsonb(v_config.split_modes) else '[]'::jsonb end,
      'serviceFee', v_is_room_model and v_config.service_fee_bps > 0,
      'staffCalls', v_is_room_model,
      'familyMode',
        p_service_model = 'casual_dining'::public.noowe_service_model
        and v_config.family_mode_enabled,
      'parties', p_service_model = 'casual_dining'::public.noowe_service_model,
      'comboBuilder', p_service_model = 'quick_service'::public.noowe_service_model,
      'prepaidRequired',
        p_service_model = 'quick_service'::public.noowe_service_model
        and v_config.prepaid_required,
      'pickupCode', p_service_model = 'quick_service'::public.noowe_service_model,
      'loyaltyMode', v_config.loyalty_mode,
      -- §6 "Unidade de consumo" e "Acompanhamento": o que difere entre os modelos na
      -- jornada do cliente, exposto como dado para as telas não compararem nomes.
      'consumptionUnit', case p_service_model
        when 'fine_dining'::public.noowe_service_model then 'table_with_guests'
        when 'casual_dining'::public.noowe_service_model then 'per_person'
        else 'individual_cart'
      end,
      'orderTracking', case p_service_model
        when 'fine_dining'::public.noowe_service_model then 'item_with_preparer'
        when 'casual_dining'::public.noowe_service_model then 'table_order'
        else 'pickup_steps'
      end
    ),
    'policies', jsonb_build_object(
      'serviceFeeBps', case when v_is_room_model then v_config.service_fee_bps else null end,
      'tipPresetsBps', case when v_is_room_model then to_jsonb(v_config.tip_presets_bps) else '[]'::jsonb end,
      'queueCallToleranceMin', case when v_is_room_model then v_config.queue_call_tolerance_min else null end,
      'reservationNoShowMin', case when v_is_room_model then v_config.reservation_no_show_min else null end,
      'guestLinkTtlMin', case when v_is_room_model and v_config.guest_link_enabled then v_config.guest_link_ttl_min else null end,
      'requireGuestAccount', v_is_room_model and v_config.require_guest_account,
      'enforceTableCapacity', v_is_room_model and v_config.enforce_table_capacity,
      'capacityOverrideRoles', case when v_is_room_model then to_jsonb(v_config.capacity_override_roles) else '[]'::jsonb end,
      'splitFixedRemainder', case when v_is_room_model then to_jsonb(v_config.split_fixed_remainder) else null end,
      'tipAllocation', case when v_is_room_model then to_jsonb(v_config.tip_allocation) else null end,
      'comboDiscountBps', case when p_service_model = 'quick_service'::public.noowe_service_model then v_config.combo_discount_bps else null end,
      'pickupCapacityPerSlot', case when p_service_model = 'quick_service'::public.noowe_service_model then v_config.pickup_capacity_per_slot else null end,
      'pickupExpiryMin', case when p_service_model = 'quick_service'::public.noowe_service_model then v_config.pickup_expiry_min else null end,
      'stampsPerReward', case when p_service_model = 'quick_service'::public.noowe_service_model then v_config.stamps_per_reward else null end
    )
  );
end;
$$;

revoke all on function public.get_restaurant_model_capabilities(uuid, public.noowe_service_model) from public;
grant execute on function public.get_restaurant_model_capabilities(uuid, public.noowe_service_model)
  to anon, authenticated, service_role;

-- Mantém o contrato canônico sincronizado quando a tela legada salva a lista de
-- modelos. Os detalhes legados permanecem somente como ponte de migração.
create or replace function public.restaurant_upsert_service_configs(
  p_restaurant_id uuid,
  p_configs jsonb,
  p_primary_service_type text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_config jsonb;
  v_type text;
  v_active boolean;
  v_active_count integer;
  v_primary_features jsonb := '{}'::jsonb;
  v_models public.noowe_service_model[];
  v_result jsonb;
begin
  perform private.require_restaurant_role(
    p_restaurant_id,
    array['owner','manager']::public.user_roles_role_enum[]
  );

  if jsonb_typeof(p_configs) <> 'array' or jsonb_array_length(p_configs) = 0 then
    raise exception 'At least one service configuration is required' using errcode = '22023';
  end if;

  if p_primary_service_type not in ('fine_dining', 'casual_dining', 'quick_service') then
    raise exception 'Primary service type is not supported by the customer app' using errcode = '22023';
  end if;

  if (
    select count(*) from jsonb_array_elements(p_configs)
  ) <> (
    select count(distinct value->>'service_type') from jsonb_array_elements(p_configs)
  ) then
    raise exception 'Duplicate service type configuration' using errcode = '22023';
  end if;

  select count(*) into v_active_count
  from jsonb_array_elements(p_configs) item
  where coalesce((item->>'is_active')::boolean, false);

  if v_active_count = 0 then
    raise exception 'At least one service type must remain active' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_configs) item
    where coalesce((item->>'is_active')::boolean, false)
      and item->>'service_type' not in ('fine_dining', 'casual_dining', 'quick_service')
  ) then
    raise exception 'Only customer-app supported service types can be active' using errcode = '22023';
  end if;

  if not exists (
    select 1 from jsonb_array_elements(p_configs) item
    where item->>'service_type' = p_primary_service_type
      and coalesce((item->>'is_active')::boolean, false)
  ) then
    raise exception 'Primary service type must be active' using errcode = '22023';
  end if;

  for v_config in select value from jsonb_array_elements(p_configs)
  loop
    v_type := v_config->>'service_type';
    v_active := coalesce((v_config->>'is_active')::boolean, false);

    if v_type not in (
      'fine_dining', 'casual_dining', 'quick_service', 'fast_casual',
      'cafe_bakery', 'buffet', 'pub_bar', 'drive_thru', 'food_truck',
      'chefs_table', 'club'
    ) then
      raise exception 'Invalid service type: %', v_type using errcode = '22023';
    end if;

    update public.restaurant_service_configs
    set is_active = v_active,
        config_metadata = coalesce(v_config->'config_metadata', '{}'::jsonb),
        updated_at = now()
    where restaurant_id = p_restaurant_id and service_type = v_type;

    if not found then
      insert into public.restaurant_service_configs (
        restaurant_id, service_type, is_active, config_metadata, created_at, updated_at
      ) values (
        p_restaurant_id, v_type, v_active,
        coalesce(v_config->'config_metadata', '{}'::jsonb), now(), now()
      );
    end if;
  end loop;

  update public.restaurant_service_configs c
  set is_active = false, updated_at = now()
  where c.restaurant_id = p_restaurant_id
    and not exists (
      select 1 from jsonb_array_elements(p_configs) item
      where item->>'service_type' = c.service_type
    );

  select coalesce(item->'config_metadata'->'features', '{}'::jsonb)
  into v_primary_features
  from jsonb_array_elements(p_configs) item
  where item->>'service_type' = p_primary_service_type
  limit 1;

  select array_agg((item->>'service_type')::public.noowe_service_model order by item->>'service_type')
  into v_models
  from jsonb_array_elements(p_configs) item
  where coalesce((item->>'is_active')::boolean, false);

  update public.restaurants
  set service_type = p_primary_service_type,
      service_config = coalesce(service_config, '{}'::jsonb) || jsonb_build_object(
        'primary_type', p_primary_service_type,
        'active_types', (
          select coalesce(jsonb_agg(item->>'service_type'), '[]'::jsonb)
          from jsonb_array_elements(p_configs) item
          where coalesce((item->>'is_active')::boolean, false)
        ),
        'feature_overrides', coalesce(v_primary_features, '{}'::jsonb)
      ),
      updated_at = now()
  where id = p_restaurant_id;

  if v_models && array['fine_dining', 'casual_dining']::public.noowe_service_model[]
     and not coalesce((v_primary_features->>'reservations')::boolean, true)
     and not coalesce((v_primary_features->>'virtualQueue')::boolean, true) then
    raise exception 'Room service models need reservations or the virtual queue enabled'
      using errcode = '22023';
  end if;

  insert into public.restaurant_model_configs (
    restaurant_id,
    service_models,
    reservation_enabled,
    queue_enabled,
    guest_link_enabled,
    queue_as_primary_entry,
    family_mode_enabled,
    split_fixed_remainder,
    tip_allocation,
    loyalty_mode
  ) values (
    p_restaurant_id,
    v_models,
    coalesce((v_primary_features->>'reservations')::boolean, true),
    coalesce((v_primary_features->>'virtualQueue')::boolean, true),
    v_models && array['fine_dining', 'casual_dining']::public.noowe_service_model[],
    'casual_dining'::public.noowe_service_model = any(v_models)
      and coalesce((v_primary_features->>'virtualQueue')::boolean, true),
    'casual_dining'::public.noowe_service_model = any(v_models),
    case when 'casual_dining'::public.noowe_service_model = any(v_models)
      then 'keep_on_table'::public.noowe_split_fixed_remainder
      else 'redistribute_unpaid'::public.noowe_split_fixed_remainder
    end,
    case when 'casual_dining'::public.noowe_service_model = any(v_models)
      then 'team_pool'::public.noowe_tip_allocation
      else 'table_waiter'::public.noowe_tip_allocation
    end,
    case
      when 'quick_service'::public.noowe_service_model = any(v_models)
        and v_models && array['fine_dining', 'casual_dining']::public.noowe_service_model[]
        then 'mixed'::public.noowe_loyalty_mode
      when 'quick_service'::public.noowe_service_model = any(v_models)
        then 'stamps'::public.noowe_loyalty_mode
      when 'fine_dining'::public.noowe_service_model = any(v_models)
        then 'tiers'::public.noowe_loyalty_mode
      else 'points'::public.noowe_loyalty_mode
    end
  )
  on conflict (restaurant_id) do update
    set service_models = excluded.service_models,
        reservation_enabled = excluded.reservation_enabled,
        queue_enabled = excluded.queue_enabled,
        queue_as_primary_entry = excluded.queue_as_primary_entry;

  select coalesce(jsonb_agg(to_jsonb(c) order by c.service_type), '[]'::jsonb)
  into v_result
  from public.restaurant_service_configs c
  where c.restaurant_id = p_restaurant_id;

  return v_result;
end;
$$;

revoke all on function public.restaurant_upsert_service_configs(uuid, jsonb, text) from public;
grant execute on function public.restaurant_upsert_service_configs(uuid, jsonb, text)
  to authenticated, service_role;
