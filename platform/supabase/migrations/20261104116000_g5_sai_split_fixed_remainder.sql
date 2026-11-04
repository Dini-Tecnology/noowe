-- G5: sai split_fixed_remainder. No saldo único, o que falta depois de um valor fixo simplesmente fica no saldo: não há o que redistribuir.
create or replace function public.get_restaurant_model_capabilities_v2_base(
  p_restaurant_id uuid, p_service_model public.noowe_service_model
) returns jsonb language plpgsql stable security definer
set search_path = public, private, pg_temp as $$
declare v_config public.restaurant_model_configs; v_policy public.restaurant_model_policies;
begin
  select * into v_config from public.restaurant_model_configs
    where restaurant_id = p_restaurant_id and p_service_model = any(service_models);
  select * into v_policy from public.restaurant_model_policies
    where restaurant_id = p_restaurant_id and service_model = p_service_model;
  if v_config.restaurant_id is null or v_policy.restaurant_id is null or not exists (
    select 1 from public.restaurants where id = p_restaurant_id and is_active
  ) then raise exception 'Service model is not enabled for this restaurant' using errcode = '22023'; end if;

  return jsonb_build_object(
    'contractVersion', 2,
    'enabledServiceModels', to_jsonb(v_config.service_models),
    'serviceModel', p_service_model,
    'capabilities', jsonb_build_object(
      'contractVersion', 2,
      'reservations', v_policy.reservation_enabled,
      'reservationRequired', v_policy.reservation_required,
      'virtualQueue', v_policy.queue_enabled,
      'queueIsPrimaryEntry', v_policy.queue_as_primary_entry,
      'orderWhileWaiting', v_policy.order_while_waiting,
      'tableSession', p_service_model <> 'quick_service',
      'tableCheckIn', v_policy.table_check_in_enabled,
      'tableQr', v_policy.table_qr_enabled,
      'counterQr', v_policy.counter_qr_enabled,
      'guestLink', v_policy.guest_link_enabled,
      'userInvite', v_policy.user_invite_enabled,
      'splitBill', cardinality(v_policy.split_modes) > 0,
      'splitModes', to_jsonb(v_policy.split_modes),
      'serviceFee', v_policy.service_fee_bps > 0,
      'staffCalls', cardinality(v_policy.staff_call_types) > 0,
      'staffCallTypes', to_jsonb(v_policy.staff_call_types),
      'familyMode', p_service_model = 'casual_dining' and v_config.family_mode_enabled,
      'parties', p_service_model = 'casual_dining',
      'comboBuilder', p_service_model = 'quick_service',
      'prepaidRequired', v_policy.prepaid_required,
      'pickupCode', p_service_model = 'quick_service',
      'pickupSlots', p_service_model = 'quick_service' and v_policy.pickup_capacity_per_slot is not null,
      'qualityCheck', p_service_model = 'quick_service',
      'loyaltyMode', v_policy.loyalty_mode,
      'consumptionUnit', case p_service_model when 'fine_dining' then 'table_with_guests'
        when 'casual_dining' then 'per_person' else 'individual_cart' end,
      'orderTracking', case p_service_model when 'fine_dining' then 'item_with_preparer'
        when 'casual_dining' then 'table_order' else 'pickup_steps' end
    ),
    'policies', jsonb_build_object(
      'serviceFeeBps', case when p_service_model <> 'quick_service' then v_policy.service_fee_bps else null end,
      'tipPresetsBps', to_jsonb(v_policy.tip_presets_bps),
      'queueCallToleranceMin', case when v_policy.queue_enabled then v_config.queue_call_tolerance_min else null end,
      'reservationNoShowMin', case when v_policy.reservation_enabled then v_config.reservation_no_show_min else null end,
      'guestLinkTtlMin', case when v_policy.guest_link_enabled then v_config.guest_link_ttl_min else null end,
      'userInviteTtlMin', case when v_policy.user_invite_enabled then v_config.user_invite_ttl_min else null end,
      'userSearchMinChars', case when v_policy.user_invite_enabled then v_config.user_search_min_chars else null end,
      'capacityRequestTtlMin', case when p_service_model <> 'quick_service' then v_config.capacity_request_ttl_min else null end,
      'requireGuestAccount', v_config.require_guest_account,
      'enforceTableCapacity', p_service_model <> 'quick_service' and v_config.enforce_table_capacity,
      'capacityOverrideRoles', case when p_service_model <> 'quick_service' then to_jsonb(v_config.capacity_override_roles) else '[]'::jsonb end,
      -- Saiu com o saldo único (G5). A chave fica nula porque versões publicadas do app ainda a leem.
      'splitFixedRemainder', null,
      'tipAllocation', case when p_service_model <> 'quick_service' then to_jsonb(v_config.tip_allocation) else null end,
      'comboDiscountBps', case when p_service_model = 'quick_service' then v_policy.combo_discount_bps else null end,
      'pickupCapacityPerSlot', case when p_service_model = 'quick_service' then v_policy.pickup_capacity_per_slot else null end,
      'pickupExpiryMin', case when p_service_model = 'quick_service' then v_policy.pickup_expiry_min else null end,
      'stampsPerReward', case when p_service_model = 'quick_service' then v_policy.stamps_per_reward else null end
    )
  );
end $$;

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
    tip_allocation,
    loyalty_mode
  ) values (
    p_restaurant_id,
    v_models,
    'casual_dining'::public.noowe_service_model = any(v_models),
    'casual_dining'::public.noowe_service_model = any(v_models),
    v_models && array['fine_dining', 'casual_dining']::public.noowe_service_model[],
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

alter table public.restaurant_model_configs drop column split_fixed_remainder;
drop type if exists public.noowe_split_fixed_remainder;
