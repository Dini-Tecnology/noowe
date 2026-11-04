-- V1: o Dono escolhe quais vales aceita; passado na maquininha da casa, o vale abate o saldo, sem taxa NOOWE.
-- T1: o Tap fica pronto para o fornecedor entrar por parâmetro. Sem fornecedor ativo, nada abre; recusado não abate nada.

alter table public.restaurants add column accepted_vouchers text[] not null default '{refeicao}';

create or replace function public.restaurant_set_accepted_vouchers(p_restaurant_id uuid, p_kinds text[])
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_old text[];
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner']::public.user_roles_role_enum[]);
  if exists (select 1 from unnest(coalesce(p_kinds, '{}')) k where k not in ('refeicao', 'alimentacao')) then
    raise exception 'Vale inválido' using errcode = '22023'; end if;
  select accepted_vouchers into v_old from public.restaurants where id = p_restaurant_id;
  update public.restaurants set accepted_vouchers = coalesce(p_kinds, '{}') where id = p_restaurant_id;
  perform private.log_audit(p_restaurant_id, 'restaurant.vouchers_changed', 'restaurant', p_restaurant_id, 'Vales aceitos alterados',
    jsonb_build_object('kinds', v_old), jsonb_build_object('kinds', p_kinds));
  return jsonb_build_object('kinds', to_jsonb(coalesce(p_kinds, '{}')));
end $$;
revoke all on function public.restaurant_set_accepted_vouchers(uuid, text[]) from public, anon;
grant execute on function public.restaurant_set_accepted_vouchers(uuid, text[]) to authenticated;

drop function public.restaurant_record_bill_payment(uuid, text, uuid, bigint, boolean, bigint, text);
create function public.restaurant_record_bill_payment(
  p_table_session_id uuid, p_payment_method text, p_idempotency_key uuid,
  p_base_cents bigint default null, p_waive_fee boolean default false, p_tip_cents bigint default 0, p_reason text default null,
  p_voucher_kind text default null
) returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  v_session public.table_sessions; v_key text; v_tx public.gateway_transactions; v_balance bigint; v_bps integer; v_base bigint; v_fee bigint;
  v_tip bigint := coalesce(p_tip_cents, 0); v_share uuid; v_kind public.noowe_tip_allocation; v_waiter uuid; v_closed boolean := false;
  v_reason text := coalesce(nullif(btrim(p_reason), ''), 'A pedido do cliente');
begin
  if p_idempotency_key is null then raise exception 'Idempotency key required' using errcode = '22023'; end if;
  if p_payment_method not in ('cash', 'credit_card', 'debit_card', 'pix', 'voucher') then
    raise exception 'Forma de pagamento inválida' using errcode = '22023'; end if;
  select * into v_session from public.table_sessions where id = p_table_session_id for update;
  -- O Dono escolhe quais vales aceita. Vale é sempre externo: maquininha da casa.
  if p_payment_method = 'voucher' and not coalesce(p_voucher_kind = any((select accepted_vouchers from public.restaurants where id = v_session.restaurant_id)), false) then
    raise exception 'Este vale não é aceito neste restaurante' using errcode = '22023'; end if;
  if v_session.id is null then raise exception 'Table session not found' using errcode = 'P0002'; end if;
  perform private.require_restaurant_role(v_session.restaurant_id, array['owner','manager','waiter','maitre']::public.user_roles_role_enum[]);

  v_key := 'manual-share:' || p_table_session_id || ':' || p_idempotency_key;
  select * into v_tx from public.gateway_transactions where idempotency_key = v_key;
  if v_tx.id is not null then
    return jsonb_build_object('transactionId', v_tx.id, 'shareId', v_tx.bill_share_id, 'amountCents', v_tx.amount_cents, 'idempotentReplay', true);
  end if;
  if v_session.status <> 'active' then raise exception 'Sessão já encerrada' using errcode = 'P0001'; end if;

  v_balance := private.session_consumption_balance(p_table_session_id);
  if v_balance <= 0 and coalesce(p_tip_cents, 0) = 0 then raise exception 'Esta conta já está quitada' using errcode = 'P0011'; end if;
  -- Valor zero com gorjeta: pagamento misto, com vale no consumo e cartão na gorjeta.
  if p_base_cents is not null and (p_base_cents < 0 or (p_base_cents = 0 and coalesce(p_tip_cents, 0) = 0)) then raise exception 'Valor inválido' using errcode = '22023'; end if;
  v_base := private.adjust_to_balance(coalesce(p_base_cents, v_balance), v_balance);
  v_bps := private.session_fee_bps(p_table_session_id);
  v_fee := case when coalesce(p_waive_fee, false) then 0 else private.service_fee_cents(v_base, v_bps) end;
  if v_tip < 0 or v_tip > v_base + v_fee then raise exception 'Gorjeta inválida' using errcode = '22023'; end if;
  if v_tip > 0 and private.fee_or_tip_mode(p_table_session_id) <> 'tip' then
    raise exception 'Este restaurante usa taxa de serviço: não há gorjeta nesta conta' using errcode = '22023'; end if;

  select c.tip_allocation into v_kind from public.restaurant_model_configs c where c.restaurant_id = v_session.restaurant_id;
  if v_kind = 'table_waiter' then
    select t.assigned_waiter_id into v_waiter from public.tables t where t.id = v_session.table_id;
  end if;
  insert into public.bill_shares(restaurant_id, table_session_id, participant_id, round_no, mode, base_cents, service_fee_cents, amount_cents,
      tip_cents, tip_recipient_kind, tip_recipient_user_id, status, committed_by, paid_at, fee_waived_by, fee_waived_at, fee_waived_reason)
    values (v_session.restaurant_id, p_table_session_id, null,
      (select coalesce(max(round_no), 0) + 1 from public.bill_shares where table_session_id = p_table_session_id),
      'fixed_amount', v_base, v_fee, v_base + v_fee, v_tip, v_kind, v_waiter, 'paid', auth.uid(), now(),
      case when p_waive_fee and v_bps > 0 then auth.uid() end, case when p_waive_fee and v_bps > 0 then now() end,
      case when p_waive_fee and v_bps > 0 then v_reason end)
    returning id into v_share;
  insert into public.gateway_transactions(restaurant_id, provider, payment_method, amount_cents, tip_cents, refunded_amount_cents, status,
      idempotency_key, purpose, table_session_id, bill_share_id, confirmed_at, metadata, created_at, updated_at)
    values (v_session.restaurant_id, 'manual', p_payment_method, v_base + v_fee + v_tip, v_tip, 0, 'completed', v_key, 'bill_share',
      p_table_session_id, v_share, now(), jsonb_build_object('recorded_by', auth.uid(), 'external', p_payment_method <> 'cash', 'voucher_kind', p_voucher_kind), now(), now())
    returning * into v_tx;
  -- Maquininha da casa é pagamento externo, fora do caixa. Dinheiro entra na gaveta (pendência 36).
  if p_payment_method = 'cash' then
    perform private.cash_record(v_session.restaurant_id, 'sale', v_tx.amount_cents, 'Recebido na comanda', v_tx.id, null);
  end if;
  update public.bill_shares set payment_id = v_tx.id where id = v_share;
  if p_waive_fee and v_bps > 0 then
    perform private.log_audit(v_session.restaurant_id, 'bill.fee_waived', 'bill_share', v_share, v_reason,
      null, jsonb_build_object('baseCents', v_base));
  end if;
  begin
    v_closed := private.close_session_if_settled(p_table_session_id);
  exception when others then
    perform private.log_system_audit(v_session.restaurant_id, 'bill.close_failed', 'table_session', p_table_session_id, sqlerrm, null, null);
  end;
  return jsonb_build_object('transactionId', v_tx.id, 'shareId', v_share, 'baseCents', v_base, 'feeCents', v_fee, 'tipCents', v_tip,
    'amountCents', v_tx.amount_cents, 'balanceCents', v_balance - v_base, 'requestedCents', p_base_cents,
    'adjusted', p_base_cents is not null and p_base_cents > v_balance, 'closed', v_closed, 'idempotentReplay', false);
end $$;
revoke all on function public.restaurant_record_bill_payment(uuid, text, uuid, bigint, boolean, bigint, text, text) from public, anon;
grant execute on function public.restaurant_record_bill_payment(uuid, text, uuid, bigint, boolean, bigint, text, text) to authenticated;

create or replace function public.restaurant_get_session_bill(p_table_session_id uuid, p_base_cents bigint default null)
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
    'adjusted', p_base_cents is not null and p_base_cents > t.base_rem,
    'acceptedVouchers', to_jsonb((select accepted_vouchers from public.restaurants where id = s.restaurant_id)),
    'tapActive', private.tap_provider_active(),
    -- Quem cobra a mesa vê quem já pagou. Maître não vê caixa nem taxas da plataforma.
    'payers', coalesce((select jsonb_agg(jsonb_build_object('name', coalesce(p.display_name, 'Pago no salão'), 'baseCents', b.base_cents,
        'method', g.payment_method, 'paidAt', b.paid_at) order by b.paid_at)
      from public.bill_shares b left join public.table_session_participants p on p.id = b.participant_id
      left join public.gateway_transactions g on g.id = b.payment_id
      where b.table_session_id = p_table_session_id and b.status = 'paid'), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------------
-- Tap to Pay
-- ---------------------------------------------------------------------------
alter table public.bill_shares drop constraint bill_shares_participant_or_settled;
alter table public.bill_shares add constraint bill_shares_participant_or_settled
  check (participant_id is not null or status in ('paid', 'refunded', 'pending_payment', 'superseded'));

create or replace function private.release_bill_share(p_tx_id uuid)
returns void language sql security definer set search_path = public, pg_temp as $$
  -- Cobrança presencial recusada não vira parcela aberta de ninguém.
  update public.bill_shares set status = case when participant_id is null then 'superseded'::public.noowe_bill_share_status else 'open'::public.noowe_bill_share_status end,
      payment_id = case when participant_id is null then payment_id end, updated_at = now()
  where payment_id = p_tx_id and status = 'pending_payment'
$$;

-- Reserva o valor e abre a cobrança. A confirmação vem do fornecedor, nunca da tela. O valor é o do servidor.
create or replace function public.service_tap_begin(p_user_id uuid, p_table_session_id uuid, p_idempotency_key uuid, p_base_cents bigint default null, p_waive_fee boolean default false, p_tip_cents bigint default 0)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare s public.table_sessions; v_key text; t public.gateway_transactions; v_balance bigint; v_bps integer; v_base bigint; v_fee bigint; v_tip bigint := coalesce(p_tip_cents, 0); v_share uuid; v_expires timestamptz;
begin
  if not private.tap_provider_active() then raise exception 'Pagamento por aproximação indisponível' using errcode = 'P0007'; end if;
  if p_idempotency_key is null then raise exception 'Idempotency key required' using errcode = '22023'; end if;
  select * into s from public.table_sessions where id = p_table_session_id for update;
  if s.id is null then raise exception 'Table session not found' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.user_roles u where u.user_id = p_user_id and u.restaurant_id = s.restaurant_id and u.is_active
      and u.role in ('owner', 'manager', 'waiter', 'maitre')) then
    raise exception 'Restaurant access denied' using errcode = '42501'; end if;
  v_key := 'tap:' || p_table_session_id || ':' || p_idempotency_key;
  select * into t from public.gateway_transactions where idempotency_key = v_key;
  if t.id is not null then return private.payment_json(t) || jsonb_build_object('idempotentReplay', true); end if;
  if s.status <> 'active' then raise exception 'Sessão já encerrada' using errcode = 'P0001'; end if;
  v_balance := private.session_consumption_balance(p_table_session_id);
  if v_balance <= 0 then raise exception 'Esta conta já está quitada' using errcode = 'P0011'; end if;
  if p_base_cents is not null and p_base_cents <= 0 then raise exception 'Valor inválido' using errcode = '22023'; end if;
  v_base := private.adjust_to_balance(coalesce(p_base_cents, v_balance), v_balance);
  v_bps := private.session_fee_bps(p_table_session_id);
  v_fee := case when coalesce(p_waive_fee, false) then 0 else private.service_fee_cents(v_base, v_bps) end;
  if v_tip < 0 or v_tip > v_base + v_fee then raise exception 'Gorjeta inválida' using errcode = '22023'; end if;
  if v_tip > 0 and private.fee_or_tip_mode(p_table_session_id) <> 'tip' then
    raise exception 'Este restaurante usa taxa de serviço: não há gorjeta nesta conta' using errcode = '22023'; end if;
  v_expires := now() + make_interval(mins => coalesce((select p.card_hold_min from public.restaurant_model_policies p where p.restaurant_id = s.restaurant_id and p.service_model = s.service_model), 15));
  insert into public.bill_shares(restaurant_id, table_session_id, participant_id, round_no, mode, base_cents, service_fee_cents, amount_cents, tip_cents, status, committed_by, fee_waived_by, fee_waived_at, fee_waived_reason)
    values (s.restaurant_id, s.id, null, (select coalesce(max(round_no), 0) + 1 from public.bill_shares where table_session_id = s.id), 'fixed_amount', v_base, v_fee, v_base + v_fee, v_tip, 'pending_payment', p_user_id,
      case when p_waive_fee and v_bps > 0 then p_user_id end, case when p_waive_fee and v_bps > 0 then now() end, case when p_waive_fee and v_bps > 0 then 'A pedido do cliente' end)
    returning id into v_share;
  insert into public.gateway_transactions(restaurant_id, provider, payment_method, amount_cents, tip_cents, refunded_amount_cents, status, idempotency_key, purpose, table_session_id, bill_share_id, expires_at, metadata, created_at, updated_at)
    values (s.restaurant_id, 'tap', 'tap_card', v_base + v_fee + v_tip, v_tip, 0, 'pending', v_key, 'bill_share', s.id, v_share, v_expires, jsonb_build_object('recorded_by', p_user_id), now(), now())
    returning * into t;
  perform private.noowe_pay_freeze_fee(t);
  update public.bill_shares set payment_id = t.id where id = v_share;
  return private.payment_json(t);
end $$;
revoke all on function public.service_tap_begin(uuid, uuid, uuid, bigint, boolean, bigint) from public, anon, authenticated;
grant execute on function public.service_tap_begin(uuid, uuid, uuid, bigint, boolean, bigint) to service_role;

create or replace function public.service_tap_provider()
returns text language sql stable security definer set search_path = private, pg_temp as $$
  select case when t.active then t.provider end from private.noowe_tap_settings t
$$;
revoke all on function public.service_tap_provider() from public, anon, authenticated;
grant execute on function public.service_tap_provider() to service_role;

-- Tudo pela mesma fronteira do webhook. Repetir o evento não abate de novo; recusado devolve a reserva.
create or replace function public.service_tap_result(p_payment_id uuid, p_event_id text, p_approved boolean, p_amount_cents bigint default null, p_tariff_cents bigint default null)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  if p_approved and p_tariff_cents is not null then
    update private.noowe_pay_transaction_fees set tariff_cents = p_tariff_cents, split_cents = private.noowe_pay_split_cents(fee_cents, p_tariff_cents), updated_at = now()
      where gateway_transaction_id = p_payment_id;
  end if;
  return private.apply_payment_event(p_payment_id, 'tap', p_event_id, case when p_approved then 'TAP_APPROVED' else 'TAP_DECLINED' end,
    case when p_approved then 'confirmed' else 'failed' end::public.noowe_payment_status, p_amount_cents);
end $$;
revoke all on function public.service_tap_result(uuid, text, boolean, bigint, bigint) from public, anon, authenticated;
grant execute on function public.service_tap_result(uuid, text, boolean, bigint, bigint) to service_role;

create or replace function public.restaurant_get_payment_options(p_restaurant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner','manager','waiter','maitre','cashier']::public.user_roles_role_enum[]);
  return jsonb_build_object('tapActive', private.tap_provider_active(),
    'acceptedVouchers', to_jsonb((select accepted_vouchers from public.restaurants where id = p_restaurant_id)));
end $$;
revoke all on function public.restaurant_get_payment_options(uuid) from public, anon;
grant execute on function public.restaurant_get_payment_options(uuid) to authenticated;
