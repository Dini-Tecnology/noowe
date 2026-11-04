-- Item G do aditivo: o que cada perfil faz e vê. As políticas genéricas por restaurante deixavam qualquer função ler pagamentos, com a
-- taxa NOOWE; deixavam o Gerente resolver aprovação direto na tabela, sem a regra de não aprovar o próprio pedido; e deixavam
-- qualquer pessoa apagar o próprio rastro em audit_logs. Tudo isso agora passa só pelas funções.

-- Pagamento: nenhum app lê a tabela. O que cada perfil vê vem das funções, sem a taxa para quem não pode vê-la.
drop policy authenticated_select_by_restaurant on public.gateway_transactions;
drop policy gateway_transactions_select_staff on public.gateway_transactions;
drop policy gateway_transactions_select_own on public.gateway_transactions;

-- Aprovação: só pelas funções, que aplicam "ninguém aprova o próprio pedido" e auditam.
drop policy authenticated_select_by_restaurant on public.approvals;
drop policy authenticated_insert_by_restaurant_manager on public.approvals;
drop policy authenticated_update_by_restaurant_manager on public.approvals;
drop policy authenticated_delete_by_restaurant_manager on public.approvals;
drop policy approvals_management_update on public.approvals;
drop policy approvals_staff_insert on public.approvals;
create policy approvals_requester_select on public.approvals for select to authenticated using (requester_id = auth.uid());

-- O rastro não se apaga nem se forja pelo app (invariante 8).
drop policy authenticated_delete_own_user_id on public.audit_logs;
drop policy authenticated_update_own_user_id on public.audit_logs;
drop policy authenticated_insert_own_user_id on public.audit_logs;

-- Fiscal: Dono e Gerente, pelas funções.
drop policy authenticated_select_by_restaurant on public.fiscal_documents;
drop policy authenticated_insert_by_restaurant_manager on public.fiscal_documents;
drop policy authenticated_update_by_restaurant_manager on public.fiscal_documents;
drop policy authenticated_delete_by_restaurant_manager on public.fiscal_documents;
drop policy authenticated_select_by_restaurant on public.fiscal_configs;
drop policy authenticated_insert_by_restaurant_manager on public.fiscal_configs;
drop policy authenticated_update_by_restaurant_manager on public.fiscal_configs;
drop policy authenticated_delete_by_restaurant_manager on public.fiscal_configs;

-- Subconta e dados bancários: só o Dono.
drop policy restaurant_payment_accounts_select on public.restaurant_payment_accounts;
create policy restaurant_payment_accounts_select on public.restaurant_payment_accounts for select to authenticated
  using (private.has_restaurant_role(restaurant_id, array['owner']::public.user_roles_role_enum[]));

-- Uma única regra de "mesa dele". Mesa sem responsável é de quem atende (pendência 70).
create or replace function private.user_has_role(p_restaurant uuid, p_user uuid, p_roles public.user_roles_role_enum[]) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.user_roles u where u.restaurant_id = p_restaurant and u.user_id = p_user and u.is_active and u.role = any(p_roles)) $$;

create or replace function private.table_is_with_user(p_table uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select t.assigned_waiter_id is null or t.assigned_waiter_id = p_user from public.tables t where t.id = p_table), true) $$;

create or replace function private.require_table_access(p_session public.table_sessions, p_user uuid) returns void
language plpgsql stable security definer set search_path = public, private, pg_temp as $$
begin
  if private.user_has_role(p_session.restaurant_id, p_user, array['owner','manager','maitre']::public.user_roles_role_enum[]) then return; end if;
  if not private.table_is_with_user(p_session.table_id, p_user) then raise exception 'Esta mesa é de outro garçom' using errcode = '42501'; end if;
end $$;

create or replace function private.waiter_may_see_payment(g public.gateway_transactions, p_user uuid) returns boolean
language sql stable security definer set search_path = public, private, pg_temp as $$
  select private.user_has_role(g.restaurant_id, p_user, array['owner','manager','maitre','cashier']::public.user_roles_role_enum[])
    or private.table_is_with_user(coalesce((select ts.table_id from public.table_sessions ts where ts.id = g.table_session_id), (select o.table_id from public.orders o where o.id = g.order_id)), p_user) $$;

-- bill_shares chega ao Realtime: a mesma regra precisa valer na leitura direta.
create or replace function private.staff_sees_session_bill(p_restaurant uuid, p_session uuid) returns boolean
language sql stable security definer set search_path = public, private, pg_temp as $$
  select private.user_has_role(p_restaurant, auth.uid(), array['owner','manager']::public.user_roles_role_enum[])
    or (private.user_has_role(p_restaurant, auth.uid(), array['waiter']::public.user_roles_role_enum[])
        and private.table_is_with_user((select ts.table_id from public.table_sessions ts where ts.id = p_session), auth.uid())) $$;

drop policy bill_shares_select on public.bill_shares;
create policy bill_shares_select on public.bill_shares for select to authenticated
  using (private.is_table_session_participant(table_session_id) or private.staff_sees_session_bill(restaurant_id, table_session_id));
drop policy bill_share_lines_select on public.bill_share_lines;
create policy bill_share_lines_select on public.bill_share_lines for select to authenticated
  using (exists (select 1 from public.bill_shares s where s.id = bill_share_id
    and (private.is_table_session_participant(s.table_session_id) or private.staff_sees_session_bill(s.restaurant_id, s.table_session_id))));

revoke all on function private.user_has_role(uuid, uuid, public.user_roles_role_enum[]), private.table_is_with_user(uuid, uuid), private.require_table_access(public.table_sessions, uuid),
  private.waiter_may_see_payment(public.gateway_transactions, uuid) from public, anon, authenticated;

-- A regra de pagar pelo app, para o incentivo do garçom. Mesma base do índice: vale fica fora.
create or replace function public.restaurant_my_app_share(p_restaurant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare v_from timestamptz; v_app bigint; v_all bigint;
begin
  perform private.require_restaurant_role(p_restaurant_id, array['waiter']::public.user_roles_role_enum[]);
  select d.started_at into v_from from public.operational_days d where d.restaurant_id = p_restaurant_id and d.status = 'open';
  if v_from is null then return jsonb_build_object('percent', null); end if;
  select coalesce(sum(b.base_cents) filter (where g.provider = 'asaas' or g.provider = 'simulated'), 0)::bigint, coalesce(sum(b.base_cents), 0)::bigint into v_app, v_all
    from public.bill_shares b join public.gateway_transactions g on g.id = b.payment_id
    join public.table_sessions s on s.id = b.table_session_id join public.tables t on t.id = s.table_id
    where b.restaurant_id = p_restaurant_id and b.status = 'paid' and b.paid_at >= v_from and t.assigned_waiter_id = auth.uid() and g.payment_method <> 'voucher';
  -- Só o percentual: sem valores da conta.
  return jsonb_build_object('percent', case when v_all > 0 then round(v_app * 100.0 / v_all)::integer end);
end $$;
revoke all on function public.restaurant_my_app_share(uuid) from public, anon;
grant execute on function public.restaurant_my_app_share(uuid) to authenticated;

create or replace function public.restaurant_get_session_bill(p_table_session_id uuid, p_base_cents bigint default null)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare s public.table_sessions; t record; v_bps integer; v_base bigint;
begin
  select * into s from public.table_sessions where id = p_table_session_id;
  if s.id is null then raise exception 'Table session not found' using errcode = 'P0002'; end if;
  perform private.require_restaurant_role(s.restaurant_id, array['owner','manager','waiter','maitre']::public.user_roles_role_enum[]);
  perform private.require_table_access(s, auth.uid());
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
    -- Quem cobra a mesa vê quem já pagou. Maître vê o status, sem o valor de cada pagamento.
    'payers', coalesce((select jsonb_agg(jsonb_build_object('name', coalesce(p.display_name, 'Pago no salão'),
        'baseCents', case when private.has_restaurant_role(s.restaurant_id, array['owner','manager','waiter']::public.user_roles_role_enum[]) then b.base_cents end,
        'method', g.payment_method, 'paidAt', b.paid_at) order by b.paid_at)
      from public.bill_shares b left join public.table_session_participants p on p.id = b.participant_id
      left join public.gateway_transactions g on g.id = b.payment_id
      where b.table_session_id = p_table_session_id and b.status = 'paid'), '[]'::jsonb));
end $$;

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
  perform private.require_table_access(s, p_user_id);
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
  v_manages boolean := private.has_restaurant_role(p_restaurant_id, array['owner','manager']::public.user_roles_role_enum[]);
  -- Maître acompanha o status de pagamento, sem o valor.
  v_values boolean := private.has_restaurant_role(p_restaurant_id, array['owner','manager','waiter']::public.user_roles_role_enum[]);
begin
  perform private.require_restaurant_role(
    p_restaurant_id,
    array['owner', 'manager', 'waiter', 'maitre']::public.user_roles_role_enum[]
  );

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'order_id', o.id,
      -- Comanda aberta é cobrada pelo saldo da sessão, não pelo pedido.
      'table_session_id', case when exists (select 1 from public.table_sessions ts where ts.id = o.table_session_id and ts.status = 'active') then o.table_session_id end,
      'table_id', o.table_id,
      'table_number', t.table_number,
      'total_amount', case when v_values then o.total_amount end,
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
    and o.created_at > now() - interval '24 hours'
    -- Garçom vê as mesas dele. Quem tem outra função na casa continua vendo a casa toda.
    and (v_manages or private.has_restaurant_role(p_restaurant_id, array['maitre']::public.user_roles_role_enum[]) or t.assigned_waiter_id is null or t.assigned_waiter_id = auth.uid());

  return result;
end;
$$;

create or replace function public.restaurant_list_refundable_payments(p_restaurant_id uuid, p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner','manager','maitre','waiter','cashier']::public.user_roles_role_enum[]);
  return coalesce((select jsonb_agg(x.j order by x.at desc) from (
    select g.created_at at, jsonb_build_object('paymentId', g.id, 'method', g.payment_method, 'provider', g.provider, 'amountCents', g.amount_cents,
        'availableCents', private.refund_available_cents(g.id), 'createdAt', g.created_at, 'tableSessionId', g.table_session_id, 'orderId', g.order_id,
        'tableNumber', coalesce((select t.table_number from public.table_sessions ts join public.tables t on t.id = ts.table_id where ts.id = g.table_session_id),
          (select t.table_number from public.orders o join public.tables t on t.id = o.table_id where o.id = g.order_id)),
        'pendingApproval', exists (select 1 from public.approvals a where a.gateway_transaction_id = g.id and a.status = 'pending')) j
    from public.gateway_transactions g
    where g.restaurant_id = p_restaurant_id and g.status = 'completed' and g.created_at > now() - interval '7 days'
      and private.refund_available_cents(g.id) > 0
      and private.waiter_may_see_payment(g, auth.uid())
    order by g.created_at desc limit greatest(p_limit, 1)) x), '[]'::jsonb);
end $$;

CREATE OR REPLACE FUNCTION public.restaurant_record_payment(p_order_id uuid, p_payment_method text, p_amount numeric, p_tip_amount numeric DEFAULT 0, p_notes text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_order record;
  v_updated_order record;
  v_tx_id uuid;
  v_existing record;
  v_key text;
  v_order_open bigint;
begin
  select * into v_order from public.orders where id = p_order_id;
  if v_order.id is null then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  perform private.require_restaurant_role(
    v_order.restaurant_id,
    array['owner','manager','waiter','maitre','barman']::public.user_roles_role_enum[]
  );
  -- Barman cobra no balcão (pedido sem mesa). Garçom, nas mesas dele.
  if v_order.table_id is not null and not private.has_restaurant_role(v_order.restaurant_id, array['owner','manager','waiter','maitre']::public.user_roles_role_enum[]) then
    raise exception 'Restaurant access denied' using errcode = '42501'; end if;
  if not private.has_restaurant_role(v_order.restaurant_id, array['owner','manager','maitre']::public.user_roles_role_enum[])
     and exists (select 1 from public.tables t where t.id = v_order.table_id and t.assigned_waiter_id <> auth.uid()) then
    raise exception 'Esta mesa é de outro garçom' using errcode = '42501'; end if;

  -- Pedido de comanda aberta abate do saldo único: o valor vem do servidor, não do app (G5). Versões antigas chegam por aqui.
  if v_order.table_session_id is not null and exists (
      select 1 from public.table_sessions ts where ts.id = v_order.table_session_id and ts.status = 'active') then
    select nullif(coalesce(sum(l.open_cents), 0), 0)::bigint into v_order_open from private.session_lines(v_order.table_session_id) l
      join public.order_items oi on oi.id = l.order_item_id where oi.order_id = p_order_id;
    -- Sem isto a base nula significaria "o saldo inteiro da mesa".
    if v_order_open is null then raise exception 'Este pedido não tem consumo em aberto' using errcode = '22023'; end if;
    return public.restaurant_record_bill_payment(v_order.table_session_id, p_payment_method,
      md5(p_order_id::text || ':' || coalesce(p_idempotency_key, gen_random_uuid()::text))::uuid,
      v_order_open, false, round(coalesce(p_tip_amount, 0) * 100)::bigint);
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Invalid payment amount: %', p_amount using errcode = '22023';
  end if;

  if p_payment_method not in ('cash','credit_card','debit_card','pix','wallet','voucher','other') then
    raise exception 'Invalid payment method: %', p_payment_method using errcode = '22023';
  end if;

  -- Idempotent retry: if the client already sent this exact key for this
  -- order, return the transaction that was recorded the first time instead
  -- of creating a duplicate.
  if p_idempotency_key is not null then
    select * into v_existing
    from public.gateway_transactions
    where order_id = p_order_id
      and idempotency_key = p_idempotency_key
    limit 1;

    if v_existing.id is not null then
      return jsonb_build_object(
        'transaction_id', v_existing.id,
        'order_id', p_order_id,
        'payment_method', v_existing.payment_method,
        'amount', v_existing.amount,
        'tip_amount', p_tip_amount,
        'status', v_existing.status,
        'idempotent_replay', true
      );
    end if;
  end if;

  v_key := coalesce(p_idempotency_key, gen_random_uuid()::text);

  insert into public.gateway_transactions(
    restaurant_id, order_id, customer_id, provider, payment_method,
    amount, amount_cents, status, idempotency_key, metadata, created_at, updated_at
  )
  values(
    v_order.restaurant_id, p_order_id, v_order.customer_id,
    'manual', p_payment_method,
    p_amount, (p_amount * 100)::numeric(12,2), 'completed',
    v_key,
    jsonb_build_object('tip_amount', p_tip_amount, 'notes', p_notes),
    now(), now()
  )
  returning id into v_tx_id;
  if p_payment_method = 'cash' then
    perform private.cash_record(v_order.restaurant_id, 'sale', round(p_amount * 100)::bigint, 'Recebido no pedido', v_tx_id, p_order_id);
  end if;

  update public.orders
  set
    payment_method = p_payment_method,
    payment_status = 'confirmed',
    tip_amount     = coalesce(tip_amount, 0) + p_tip_amount,
    completed_at   = case when completed_at is null then now() else completed_at end,
    updated_at     = now()
  where id = p_order_id
  returning * into v_updated_order;

  if v_order.customer_id is not null then
    perform private.loyalty_award_points(
      v_order.customer_id,
      v_order.restaurant_id,
      p_order_id,
      p_amount
    );
  end if;

  return jsonb_build_object(
    'transaction_id', v_tx_id,
    'order_id', p_order_id,
    'payment_method', p_payment_method,
    'amount', p_amount,
    'tip_amount', p_tip_amount,
    'status', 'completed'
  );
end;
$function$;

create or replace function public.restaurant_record_bill_payment(
  p_table_session_id uuid, p_payment_method text, p_idempotency_key uuid,
  p_base_cents bigint default null, p_waive_fee boolean default false, p_tip_cents bigint default 0, p_reason text default null,
  p_voucher_kind text default null, p_coupon_code text default null
) returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  v_session public.table_sessions; v_key text; v_tx public.gateway_transactions; v_balance bigint; v_bps integer; v_base bigint; v_fee bigint;
  v_tip bigint := coalesce(p_tip_cents, 0); v_share uuid; v_kind public.noowe_tip_allocation; v_waiter uuid; v_closed boolean := false;
  v_reason text := coalesce(nullif(btrim(p_reason), ''), 'A pedido do cliente');
  v_coupon public.promotions; v_discount bigint := 0;
begin
  if p_idempotency_key is null then raise exception 'Idempotency key required' using errcode = '22023'; end if;
  if p_payment_method not in ('cash', 'credit_card', 'debit_card', 'pix', 'voucher') then
    raise exception 'Forma de pagamento inválida' using errcode = '22023'; end if;
  select * into v_session from public.table_sessions where id = p_table_session_id for update;
  -- O Dono escolhe quais vales aceita. Vale é sempre externo: maquininha da casa.
  if p_payment_method = 'voucher' and not coalesce((select p_voucher_kind = any(r.accepted_vouchers) from public.restaurants r where r.id = v_session.restaurant_id), false) then
    raise exception 'Este vale não é aceito neste restaurante' using errcode = '22023'; end if;
  if v_session.id is null then raise exception 'Table session not found' using errcode = 'P0002'; end if;
  perform private.require_restaurant_role(v_session.restaurant_id, array['owner','manager','waiter','maitre']::public.user_roles_role_enum[]);
  perform private.require_table_access(v_session, auth.uid());

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
  -- Garçom aplica o cupom a pedido do cliente sem app. O desconto entra antes da taxa.
  if nullif(btrim(coalesce(p_coupon_code, '')), '') is not null then
    v_coupon := private.coupon_for_code(v_session.restaurant_id, p_coupon_code);
    perform private.coupon_assert_valid(v_coupon, v_session.service_model::text, null, v_base);
    v_discount := private.coupon_discount_cents(v_coupon, p_table_session_id, null, v_base);
  end if;
  v_fee := case when coalesce(p_waive_fee, false) then 0 else private.service_fee_cents(v_base - v_discount, v_bps) end;
  if v_tip < 0 or (v_base > 0 and v_tip > v_base + v_fee) then raise exception 'Gorjeta inválida' using errcode = '22023'; end if;
  if v_tip > 0 and private.fee_or_tip_mode(p_table_session_id) <> 'tip' then
    raise exception 'Este restaurante usa taxa de serviço: não há gorjeta nesta conta' using errcode = '22023'; end if;

  select c.tip_allocation into v_kind from public.restaurant_model_configs c where c.restaurant_id = v_session.restaurant_id;
  if v_kind = 'table_waiter' then
    select t.assigned_waiter_id into v_waiter from public.tables t where t.id = v_session.table_id;
  end if;
  insert into public.bill_shares(restaurant_id, table_session_id, participant_id, round_no, mode, base_cents, service_fee_cents, amount_cents, coupon_discount_cents, coupon_id,
      tip_cents, tip_recipient_kind, tip_recipient_user_id, status, committed_by, paid_at, fee_waived_by, fee_waived_at, fee_waived_reason)
    values (v_session.restaurant_id, p_table_session_id, null,
      (select coalesce(max(round_no), 0) + 1 from public.bill_shares where table_session_id = p_table_session_id),
      'fixed_amount', v_base, v_fee, v_base - v_discount + v_fee, v_discount, v_coupon.id, v_tip, v_kind, v_waiter, 'paid', auth.uid(), now(),
      case when p_waive_fee and v_bps > 0 then auth.uid() end, case when p_waive_fee and v_bps > 0 then now() end,
      case when p_waive_fee and v_bps > 0 then v_reason end)
    returning id into v_share;
  insert into public.gateway_transactions(restaurant_id, provider, payment_method, amount_cents, tip_cents, refunded_amount_cents, status,
      idempotency_key, purpose, table_session_id, bill_share_id, confirmed_at, metadata, created_at, updated_at)
    values (v_session.restaurant_id, 'manual', p_payment_method, v_base - v_discount + v_fee + v_tip, v_tip, 0, 'completed', v_key, 'bill_share',
      p_table_session_id, v_share, now(), jsonb_build_object('recorded_by', auth.uid(), 'external', p_payment_method <> 'cash', 'voucher_kind', p_voucher_kind), now(), now())
    returning * into v_tx;
  -- Maquininha da casa é pagamento externo, fora do caixa. Dinheiro entra na gaveta (pendência 36).
  if p_payment_method = 'cash' then
    perform private.cash_record(v_session.restaurant_id, 'sale', v_tx.amount_cents, 'Recebido na comanda', v_tx.id, null);
  end if;
  update public.bill_shares set payment_id = v_tx.id where id = v_share;
  if v_discount > 0 then
    insert into public.promotion_redemptions(promotion_id, user_id, table_session_id, bill_share_id, discount_cents, status)
      values (v_coupon.id, null, p_table_session_id, v_share, v_discount, 'applied');
    update public.promotions set first_used_at = coalesce(first_used_at, now()) where id = v_coupon.id;
  end if;
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

drop function private.coupon_assert_staff_table(public.table_sessions);
