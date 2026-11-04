-- G5, telas do restaurante: Dono e Gerente veem a escolha por serviço; o garçom vê o que cobrar, com os valores prontos do servidor.
create or replace function public.restaurant_get_charge_policies(p_restaurant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner','manager']::public.user_roles_role_enum[]);
  return coalesce((select jsonb_agg(jsonb_build_object('serviceModel', p.service_model, 'feeOrTipMode', p.fee_or_tip_mode,
      'serviceFeeBps', p.service_fee_bps, 'tipPresetsBps', to_jsonb(p.tip_presets_bps), 'tipDefaultBps', p.tip_default_bps,
      'splitModes', to_jsonb(p.split_modes), 'prepaid', p.prepaid_required) order by p.service_model)
    from public.restaurant_model_policies p
    join public.restaurant_model_configs c on c.restaurant_id = p.restaurant_id
    where p.restaurant_id = p_restaurant_id and p.service_model = any(c.service_models)), '[]'::jsonb);
end $$;
revoke all on function public.restaurant_get_charge_policies(uuid) from public, anon;
grant execute on function public.restaurant_get_charge_policies(uuid) to authenticated;

-- O garçom digita o consumo a receber; a conta (taxa, ajuste ao saldo) é daqui.
drop function if exists public.restaurant_get_session_bill(uuid);
create function public.restaurant_get_session_bill(p_table_session_id uuid, p_base_cents bigint default null)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare s public.table_sessions; t record; v_bps integer; v_base bigint;
begin
  select * into s from public.table_sessions where id = p_table_session_id;
  if s.id is null then raise exception 'Table session not found' using errcode = 'P0002'; end if;
  perform private.require_restaurant_role(s.restaurant_id, array['owner','manager','waiter','maitre']::public.user_roles_role_enum[]);
  if p_base_cents is not null and p_base_cents <= 0 then raise exception 'Valor inválido' using errcode = '22023'; end if;
  select * into t from private.session_totals(p_table_session_id);
  v_bps := private.session_fee_bps(p_table_session_id);
  v_base := private.adjust_to_balance(coalesce(p_base_cents, t.base_rem), t.base_rem);
  return jsonb_build_object('tableSessionId', s.id, 'consumptionCents', t.base_all, 'paidCents', t.paid_sum, 'balanceCents', t.base_rem,
    'feeOrTipMode', private.fee_or_tip_mode(p_table_session_id), 'feeBps', v_bps,
    'chargeBaseCents', v_base, 'feeCents', private.service_fee_cents(v_base, v_bps),
    'totalWithFeeCents', v_base + private.service_fee_cents(v_base, v_bps),
    'adjusted', p_base_cents is not null and p_base_cents > t.base_rem);
end $$;
revoke all on function public.restaurant_get_session_bill(uuid, bigint) from public, anon;
grant execute on function public.restaurant_get_session_bill(uuid, bigint) to authenticated;

create or replace function public.restaurant_get_table_bills(
  p_restaurant_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare
  result jsonb;
begin
  perform private.require_restaurant_role(
    p_restaurant_id,
    array['owner', 'manager', 'waiter']::public.user_roles_role_enum[]
  );

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'order_id', o.id,
      -- Comanda aberta é cobrada pelo saldo da sessão, não pelo pedido.
      'table_session_id', case when exists (select 1 from public.table_sessions ts where ts.id = o.table_session_id and ts.status = 'active') then o.table_session_id end,
      'table_id', o.table_id,
      'table_number', t.table_number,
      'total_amount', o.total_amount,
      'payment_method', o.payment_method,
      'status', o.status,
      'payment_status', o.payment_status,
      'is_paid', private.order_is_paid(o),
      'created_at', o.created_at
    ) order by o.created_at desc
  ), '[]'::jsonb)
  into result
  from public.orders o
  left join public.tables t on t.id = o.table_id
  where o.restaurant_id = p_restaurant_id
    and o.table_id is not null
    and o.created_at > now() - interval '24 hours';

  return result;
end;
$$;
