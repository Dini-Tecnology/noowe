-- Correção: 20261104110000 substituiu get_restaurant_model_capabilities_v2 pelo corpo da função base e perdeu o que a camada
-- do Quick acrescenta (20261001161000). Volta a camada, agora com taxa ou gorjeta para todos os serviços.
create or replace function public.get_restaurant_model_capabilities_v2(
  p_restaurant_id uuid, p_service_model public.noowe_service_model
) returns jsonb language plpgsql stable security definer
set search_path = public, private, pg_temp as $$
declare v_result jsonb; v_policy public.restaurant_model_policies;
begin
  v_result := public.get_restaurant_model_capabilities_v2_base(p_restaurant_id, p_service_model);
  select * into v_policy from public.restaurant_model_policies
    where restaurant_id = p_restaurant_id and service_model = p_service_model;
  v_result := jsonb_set(v_result, '{policies}', (v_result->'policies') || jsonb_build_object(
    'feeOrTipMode', v_policy.fee_or_tip_mode,
    'tipDefaultBps', v_policy.tip_default_bps
  ), true);
  if p_service_model = 'quick_service' then
    v_result := jsonb_set(v_result, '{capabilities,orderAhead}', to_jsonb(v_policy.prepaid_required), true);
    v_result := jsonb_set(v_result, '{policies}', (v_result->'policies') || jsonb_build_object(
      'noPickupPolicy', v_policy.no_pickup_policy,
      'acceptMode', v_policy.accept_mode,
      'acceptTimeoutMin', v_policy.accept_timeout_min,
      'ordersPaused', v_policy.orders_paused,
      'defaultPrepMin', v_policy.default_prep_min,
      'closeOrdersBeforeMin', v_policy.close_orders_before_min,
      'pixExpiryMin', v_policy.pix_expiry_min,
      'distanceWarningKm', v_policy.distance_warning_km,
      'pickupLocation', v_policy.pickup_location
    ), true);
  else
    v_result := jsonb_set(v_result, '{capabilities,orderAhead}', 'false'::jsonb, true);
  end if;
  return v_result;
end $$;
revoke all on function public.get_restaurant_model_capabilities_v2(uuid, public.noowe_service_model) from public;
grant execute on function public.get_restaurant_model_capabilities_v2(uuid, public.noowe_service_model)
  to anon, authenticated, service_role;
