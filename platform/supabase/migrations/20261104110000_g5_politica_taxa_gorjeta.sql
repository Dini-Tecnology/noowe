-- G5 (ADR-032, itens 1 e A do aditivo): cada tipo de serviço usa taxa de serviço OU gorjeta, nunca as duas na mesma conta.
-- Dono e Gerente escolhem por serviço. Restaurantes existentes com taxa continuam com taxa: trocar sozinho mudaria o que
-- recebem. Só restaurante novo nasce com o padrão sugerido.
alter table public.restaurant_model_policies
  add column fee_or_tip_mode text not null default 'service_fee' check (fee_or_tip_mode in ('service_fee', 'tip')),
  add column tip_default_bps integer check (tip_default_bps between 0 and 10000),
  add column card_hold_min integer not null default 15 check (card_hold_min > 0);

-- Quick: gorjeta opcional, sem nada marcado.
update public.restaurant_model_policies p set fee_or_tip_mode = 'tip', tip_default_bps = null,
    tip_presets_bps = (select c.tip_presets_bps from public.restaurant_model_configs c where c.restaurant_id = p.restaurant_id)
  where prepaid_required;
-- A reserva do Pix no salão dura 10 minutos (item A.5). O Quick segue com os 15 do ADR-013.
update public.restaurant_model_policies set pix_expiry_min = 10 where not prepaid_required;

create or replace function private.sync_restaurant_model_policies()
returns trigger language plpgsql security definer set search_path=public,private,pg_temp as $$
declare model public.noowe_service_model;
begin
  foreach model in array new.service_models loop
    insert into public.restaurant_model_policies(
      restaurant_id,service_model,reservation_enabled,reservation_required,queue_enabled,
      queue_as_primary_entry,order_while_waiting,table_check_in_enabled,table_qr_enabled,
      counter_qr_enabled,guest_link_enabled,user_invite_enabled,split_modes,service_fee_bps,
      tip_presets_bps,staff_call_types,combo_discount_bps,prepaid_required,
      pickup_capacity_per_slot,pickup_expiry_min,stamps_per_reward,loyalty_mode,
      fee_or_tip_mode,tip_default_bps,pix_expiry_min
    ) values(
      new.restaurant_id,model,model<>'quick_service' and new.reservation_enabled,
      model='fine_dining',model<>'quick_service' and new.queue_enabled,
      model='casual_dining',model<>'quick_service',model<>'quick_service',model<>'quick_service',
      model='quick_service',model<>'quick_service' and new.guest_link_enabled,
      model<>'quick_service' and new.user_invite_enabled,
      case when model='quick_service' then array[]::public.noowe_split_mode[] else new.split_modes end,
      case when model='quick_service' then 0 else new.service_fee_bps end,
      new.tip_presets_bps,
      case model when 'fine_dining' then array['waiter','sommelier','help','bill']::text[]
        when 'casual_dining' then array['waiter','help','bill']::text[] else array[]::text[] end,
      new.combo_discount_bps,model='quick_service',new.pickup_capacity_per_slot,
      new.pickup_expiry_min,new.stamps_per_reward,
      case when model='quick_service' and new.loyalty_mode not in ('stamps','mixed')
        then 'stamps'::public.noowe_loyalty_mode else new.loyalty_mode end,
      -- Padrão sugerido pelo aditivo (item 1): Fine com taxa, Casual e Quick com gorjeta. O Quick não vem com gorjeta marcada.
      case when model='fine_dining' then 'service_fee' else 'tip' end,
      case when model='casual_dining' then new.tip_presets_bps[1] end,
      case when model='quick_service' then 15 else 10 end
    ) on conflict(restaurant_id,service_model) do update set
      reservation_enabled=excluded.reservation_enabled,
      queue_enabled=excluded.queue_enabled,
      guest_link_enabled=excluded.guest_link_enabled,
      user_invite_enabled=excluded.user_invite_enabled,
      -- Taxa, gorjeta e formas de divisão são por serviço (restaurant_update_charge_policy): mudar outra coisa não as apaga.
      combo_discount_bps=excluded.combo_discount_bps,
      pickup_capacity_per_slot=excluded.pickup_capacity_per_slot,
      pickup_expiry_min=excluded.pickup_expiry_min,stamps_per_reward=excluded.stamps_per_reward,
      updated_at=now();
  end loop;
  delete from public.restaurant_model_policies where restaurant_id=new.restaurant_id
    and not(service_model=any(new.service_models));
  -- Dual-write only for legacy receipt/RPC readers during rollout.
  update public.restaurants set service_config=coalesce(service_config,'{}'::jsonb)
    || jsonb_build_object('service_fee_percent',new.service_fee_bps::numeric/100),updated_at=now()
    where id=new.restaurant_id;
  return new;
end $$;

create or replace function private.fee_or_tip_mode(p_session uuid)
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select p.fee_or_tip_mode from public.table_sessions s
    join public.restaurant_model_policies p on p.restaurant_id = s.restaurant_id and p.service_model = s.service_model
    where s.id = p_session), 'service_fee')
$$;
revoke all on function private.fee_or_tip_mode(uuid) from public, anon, authenticated;

-- Em modo gorjeta, não há taxa: todo o resto do cálculo fica igual.
create or replace function private.session_fee_bps(p_session uuid)
returns integer language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare v integer;
begin
  if private.fee_or_tip_mode(p_session) = 'tip' then return 0; end if;
  select coalesce(
    (select p.service_fee_bps from public.restaurant_model_policies p
      where p.restaurant_id = s.restaurant_id and p.service_model = s.service_model),
    (select c.service_fee_bps from public.restaurant_model_configs c where c.restaurant_id = s.restaurant_id))
  into v from public.table_sessions s where s.id = p_session;
  if v is null then raise exception 'Taxa de serviço não configurada' using errcode = 'P0002'; end if;
  return v;
end $$;

-- Dono e Gerente (item G). Fica registrado com antes e depois.
create or replace function public.restaurant_update_charge_policy(
  p_restaurant_id uuid, p_service_model public.noowe_service_model, p_fee_or_tip_mode text,
  p_service_fee_bps integer default null, p_tip_presets_bps integer[] default null, p_tip_default_bps integer default null,
  p_split_modes public.noowe_split_mode[] default null
) returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_old public.restaurant_model_policies; v_new public.restaurant_model_policies;
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner','manager']::public.user_roles_role_enum[]);
  select * into v_old from public.restaurant_model_policies
    where restaurant_id = p_restaurant_id and service_model = p_service_model for update;
  if v_old.restaurant_id is null then raise exception 'Serviço não habilitado' using errcode = 'P0002'; end if;
  if p_fee_or_tip_mode not in ('service_fee', 'tip') then raise exception 'Escolha taxa ou gorjeta' using errcode = '22023'; end if;
  -- Pedido pago antes do preparo não tem conta para a taxa entrar: só gorjeta.
  if p_fee_or_tip_mode = 'service_fee' and v_old.prepaid_required then
    raise exception 'Este serviço usa só gorjeta' using errcode = '22023'; end if;
  if p_service_fee_bps is not null and p_service_fee_bps not between 0 and 10000 then
    raise exception 'Taxa inválida' using errcode = '22023'; end if;
  if exists (select 1 from unnest(coalesce(p_tip_presets_bps, '{}')) x where x <= 0 or x > 10000) then
    raise exception 'Gorjeta sugerida inválida' using errcode = '22023'; end if;
  if v_old.prepaid_required and p_split_modes is not null and cardinality(p_split_modes) > 0 then
    raise exception 'Este serviço não divide conta' using errcode = '22023'; end if;
  if not v_old.prepaid_required and p_split_modes is not null and cardinality(p_split_modes) = 0 then
    raise exception 'Mantenha ao menos uma forma de divisão' using errcode = '22023'; end if;
  update public.restaurant_model_policies set
      fee_or_tip_mode = p_fee_or_tip_mode,
      service_fee_bps = coalesce(p_service_fee_bps, service_fee_bps),
      tip_presets_bps = coalesce(p_tip_presets_bps, tip_presets_bps),
      -- O Quick nunca vem com gorjeta marcada.
      tip_default_bps = case when prepaid_required then null else p_tip_default_bps end,
      split_modes = coalesce(p_split_modes, split_modes),
      updated_at = now()
    where restaurant_id = p_restaurant_id and service_model = p_service_model
    returning * into v_new;
  perform private.log_audit(p_restaurant_id, 'config.charge_policy_changed', 'restaurant_model_policies', p_restaurant_id,
    'Taxa, gorjeta ou divisão de conta alteradas',
    jsonb_build_object('serviceModel', p_service_model, 'feeOrTipMode', v_old.fee_or_tip_mode, 'serviceFeeBps', v_old.service_fee_bps,
      'tipPresetsBps', v_old.tip_presets_bps, 'tipDefaultBps', v_old.tip_default_bps, 'splitModes', v_old.split_modes),
    jsonb_build_object('serviceModel', p_service_model, 'feeOrTipMode', v_new.fee_or_tip_mode, 'serviceFeeBps', v_new.service_fee_bps,
      'tipPresetsBps', v_new.tip_presets_bps, 'tipDefaultBps', v_new.tip_default_bps, 'splitModes', v_new.split_modes));
  return jsonb_build_object('serviceModel', p_service_model, 'feeOrTipMode', v_new.fee_or_tip_mode, 'serviceFeeBps', v_new.service_fee_bps,
    'tipPresetsBps', v_new.tip_presets_bps, 'tipDefaultBps', v_new.tip_default_bps, 'splitModes', v_new.split_modes);
end $$;
revoke all on function public.restaurant_update_charge_policy(uuid, public.noowe_service_model, text, integer, integer[], integer, public.noowe_split_mode[]) from public, anon;
grant execute on function public.restaurant_update_charge_policy(uuid, public.noowe_service_model, text, integer, integer[], integer, public.noowe_split_mode[]) to authenticated;

create or replace function public.get_restaurant_model_capabilities_v2(
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
      'feeOrTipMode', v_policy.fee_or_tip_mode,
      'tipDefaultBps', v_policy.tip_default_bps,
      'queueCallToleranceMin', case when v_policy.queue_enabled then v_config.queue_call_tolerance_min else null end,
      'reservationNoShowMin', case when v_policy.reservation_enabled then v_config.reservation_no_show_min else null end,
      'guestLinkTtlMin', case when v_policy.guest_link_enabled then v_config.guest_link_ttl_min else null end,
      'userInviteTtlMin', case when v_policy.user_invite_enabled then v_config.user_invite_ttl_min else null end,
      'userSearchMinChars', case when v_policy.user_invite_enabled then v_config.user_search_min_chars else null end,
      'capacityRequestTtlMin', case when p_service_model <> 'quick_service' then v_config.capacity_request_ttl_min else null end,
      'requireGuestAccount', v_config.require_guest_account,
      'enforceTableCapacity', p_service_model <> 'quick_service' and v_config.enforce_table_capacity,
      'capacityOverrideRoles', case when p_service_model <> 'quick_service' then to_jsonb(v_config.capacity_override_roles) else '[]'::jsonb end,
      'splitFixedRemainder', case when p_service_model <> 'quick_service' then to_jsonb(v_config.split_fixed_remainder) else null end,
      'tipAllocation', case when p_service_model <> 'quick_service' then to_jsonb(v_config.tip_allocation) else null end,
      'comboDiscountBps', case when p_service_model = 'quick_service' then v_policy.combo_discount_bps else null end,
      'pickupCapacityPerSlot', case when p_service_model = 'quick_service' then v_policy.pickup_capacity_per_slot else null end,
      'pickupExpiryMin', case when p_service_model = 'quick_service' then v_policy.pickup_expiry_min else null end,
      'stampsPerReward', case when p_service_model = 'quick_service' then v_policy.stamps_per_reward else null end
    )
  );
end $$;
