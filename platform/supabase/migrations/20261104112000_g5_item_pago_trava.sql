-- G5, critério 3: item pago fica travado. Parcela aberta não trava ninguém, então pode ter sobrado parcela de outra pessoa com
-- um item que acabou de ser pago: ela não pode mais ser paga como está, e a pessoa refaz a divisão.
create or replace function private.share_fits_balance(p_share public.bill_shares)
returns boolean language sql stable security definer set search_path = public, private, pg_temp as $$
  select p_share.base_cents <= private.session_consumption_balance(p_share.table_session_id)
    and not exists (
      select 1 from public.bill_share_lines l
      join private.session_balances(p_share.table_session_id) b on b.order_item_id = l.order_item_id
      where l.bill_share_id = p_share.id and l.base_cents > b.remaining_cents)
$$;
revoke all on function private.share_fits_balance(public.bill_shares) from public, anon, authenticated;

-- Quem já pagou parte só deixa de dever quando o que pagou cobre o que consumiu.
create or replace function private.participant_open_balance_cents(p_session uuid, p_participant uuid)
returns bigint
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare v_base bigint; v_fee bigint := 0; v_open_share bigint;
begin
  select coalesce(sum(b.remaining_cents), 0)::bigint into v_base
  from private.session_balances(p_session, '{}', array['paid']::public.noowe_bill_share_status[]) b
  join public.order_items oi on oi.id = b.order_item_id
  join public.orders o on o.id = oi.order_id
  where coalesce(
    private.responsible_participant(b.owner_participant),
    (select p.id from public.table_session_participants p
      where p.table_session_id = p_session and p.user_id = o.customer_id limit 1)
  ) = p_participant;

  -- O que a pessoa pagou sem marcar item abate da parte dela. Depois disso, ninguém deve mais do que o saldo.
  v_base := greatest(0, v_base - coalesce((select sum(s.base_cents) from public.bill_shares s
    where s.table_session_id = p_session and s.participant_id = p_participant and s.status = 'paid'
      and s.mode in ('fixed_amount', 'equal')), 0));
  v_base := least(v_base, private.session_consumption_balance(p_session));

  begin
    v_fee := private.service_fee_cents(v_base, private.session_fee_bps(p_session));
  exception when others then
    v_fee := 0;
  end;

  select coalesce(sum(s.amount_cents), 0)::bigint into v_open_share
  from public.bill_shares s
  where s.table_session_id = p_session and s.participant_id = p_participant
    and s.status in ('open', 'pending_payment');

  return greatest(v_base + v_fee, v_open_share);
end;
$$;

create or replace function public.customer_set_share_tip(p_share_id uuid, p_tip_cents bigint)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare s public.bill_shares;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select * into s from public.bill_shares where id = p_share_id for update;
  if s.id is null or not private.share_payer_allowed(s, auth.uid()) then
    raise exception 'Parcela não encontrada' using errcode = 'P0002'; end if;
  if s.status <> 'open' then raise exception 'Parcela não está aberta' using errcode = 'P0001'; end if;
  if p_tip_cents is null or p_tip_cents < 0 or p_tip_cents > s.amount_cents then
    raise exception 'Gorjeta inválida' using errcode = '22023'; end if;
  if p_tip_cents > 0 and private.fee_or_tip_mode(s.table_session_id) <> 'tip' then
    raise exception 'Este restaurante usa taxa de serviço: não há gorjeta nesta conta' using errcode = '22023'; end if;
  update public.bill_shares set tip_cents = p_tip_cents, updated_at = now() where id = s.id;
  return jsonb_build_object('shareId', s.id, 'tipCents', p_tip_cents);
end $$;

create or replace function private.reserve_share_payment(
  p_user uuid, p_share_id uuid, p_method text, p_tip_cents bigint, p_key uuid, p_provider text
) returns public.gateway_transactions language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare
  s public.bill_shares; v_tx public.gateway_transactions; v_acct public.restaurant_payment_accounts;
  v_key text; v_tip bigint; v_expires timestamptz; pol public.restaurant_model_policies; v_session uuid;
begin
  if p_user is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_key is null then raise exception 'Idempotency key required' using errcode = '22023'; end if;
  if p_method not in ('pix', 'credit_card') then
    raise exception 'Forma de pagamento inválida' using errcode = '22023'; end if;
  v_key := 'share-payment:' || p_user || ':' || p_key;
  perform pg_advisory_xact_lock(hashtextextended(v_key, 0));
  select * into v_tx from public.gateway_transactions where idempotency_key = v_key and customer_id = p_user;
  if v_tx.id is not null then return v_tx; end if;

  -- Dois pagamentos ao mesmo tempo nunca abatem mais que o saldo: a sessão é a fila.
  select table_session_id into v_session from public.bill_shares where id = p_share_id;
  if v_session is null then raise exception 'Parcela não encontrada' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.table_sessions where id = v_session and status = 'active' for update) then
    raise exception 'Sessão da mesa indisponível' using errcode = 'P0001'; end if;
  select * into s from public.bill_shares where id = p_share_id for update;
  if not private.share_payer_allowed(s, p_user) then
    raise exception 'Parcela não encontrada' using errcode = 'P0002'; end if;

  v_tip := coalesce(p_tip_cents, s.tip_cents);
  if v_tip < 0 or v_tip > s.amount_cents then raise exception 'Gorjeta inválida' using errcode = '22023'; end if;
  if v_tip > 0 and private.fee_or_tip_mode(v_session) <> 'tip' then
    raise exception 'Este restaurante usa taxa de serviço: não há gorjeta nesta conta' using errcode = '22023'; end if;

  if s.status = 'pending_payment' then
    -- Cobrança em andamento, igual à pedida: reaproveita em vez de gerar outra (sem cobrança duplicada).
    select * into v_tx from public.gateway_transactions
      where id = s.payment_id and status in ('creating', 'pending') and (expires_at is null or expires_at > now())
        and payment_method = p_method and tip_cents = v_tip;
    if v_tx.id is not null then return v_tx; end if;
    -- Mudou a forma ou a gorjeta: a anterior não vale mais. Se ainda for paga, o pagamento tardio estorna.
    if s.payment_id is not null then
      perform private.apply_payment_event(s.payment_id, (select provider from public.gateway_transactions where id = s.payment_id),
        'replaced:' || s.payment_id, 'REPLACED', 'failed', null, '{}'::jsonb, 'cancelled');
    end if;
    perform private.release_bill_share_row(s.id);
    select * into s from public.bill_shares where id = p_share_id;
  end if;
  if s.status <> 'open' then raise exception 'Parcela não está aberta' using errcode = 'P0001'; end if;

  -- A conta pode ter mudado desde a divisão. Nunca altera em silêncio um valor que a pessoa confirmou.
  if not private.share_fits_balance(s) then
    raise exception 'A conta mudou. Confira os valores atualizados.' using errcode = 'P0012'; end if;

  if p_provider = 'asaas' then
    select * into v_acct from public.restaurant_payment_accounts
      where restaurant_id = s.restaurant_id and status = 'active';
    if v_acct.id is null then
      raise exception 'Pagamento online indisponível neste restaurante' using errcode = 'P0007'; end if;
  end if;
  select p.* into pol from public.table_sessions t
    join public.restaurant_model_policies p on p.restaurant_id = t.restaurant_id and p.service_model = t.service_model
    where t.id = v_session;
  v_expires := now() + make_interval(mins => case when p_method = 'pix' then pol.pix_expiry_min else pol.card_hold_min end);

  insert into public.gateway_transactions(
    restaurant_id, customer_id, provider, payment_method, amount_cents, tip_cents, refunded_amount_cents,
    status, idempotency_key, purpose, table_session_id, bill_share_id, payment_account_id,
    platform_fee_cents, expires_at, metadata, created_at, updated_at)
  values (
    s.restaurant_id, p_user, p_provider, p_method, s.amount_cents + v_tip, v_tip, 0,
    case when p_provider = 'asaas' then 'creating' else 'pending' end, v_key, 'bill_share',
    s.table_session_id, s.id, v_acct.id,
    case when v_acct.id is not null then div(((s.amount_cents + v_tip)::numeric * v_acct.platform_fee_bps) + 5000, 10000)::bigint end,
    v_expires, jsonb_build_object('split_mode', s.mode), now(), now())
  returning * into v_tx;
  update public.bill_shares set status = 'pending_payment', payment_id = v_tx.id, tip_cents = v_tip,
      payer_user_id = p_user, updated_at = now() where id = s.id;
  return v_tx;
end $$;

create or replace function private.settle_bill_share(p_tx_id uuid)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare tx public.gateway_transactions; s public.bill_shares; v_kind public.noowe_tip_allocation; v_waiter uuid; v_session uuid; v_active boolean;
begin
  select * into tx from public.gateway_transactions where id = p_tx_id;
  select table_session_id into v_session from public.bill_shares where id = tx.bill_share_id;
  if v_session is null then return; end if;
  select status = 'active' into v_active from public.table_sessions where id = v_session for update;
  select * into s from public.bill_shares where id = tx.bill_share_id for update;
  if s.status = 'paid' and s.payment_id is not distinct from tx.id then return; end if;
  if not (s.status = 'pending_payment' and s.payment_id is not distinct from tx.id)
     and not (s.status = 'open' and s.payment_id is null and v_active and tx.amount_cents = s.amount_cents + tx.tip_cents
       and private.share_fits_balance(s)) then
    perform private.enqueue_refund(tx.id, 'pagamento tardio');
    return;
  end if;
  select c.tip_allocation into v_kind from public.restaurant_model_configs c where c.restaurant_id = s.restaurant_id;
  if v_kind = 'table_waiter' then
    select t.assigned_waiter_id into v_waiter from public.tables t
      join public.table_sessions ts on ts.table_id = t.id where ts.id = s.table_session_id;
  end if;
  update public.bill_shares set status = 'paid', paid_at = now(), payment_id = tx.id,
      tip_cents = tx.tip_cents, tip_recipient_kind = v_kind, tip_recipient_user_id = v_waiter,
      payer_user_id = coalesce(payer_user_id, tx.customer_id), updated_at = now()
    where id = s.id;
  begin
    perform private.write_share_receipt(tx.id);
  exception when others then
    perform private.log_system_audit(s.restaurant_id, 'receipt.write_failed', 'payment', tx.id, sqlerrm, null, null);
  end;
  begin
    perform private.close_session_if_settled(s.table_session_id);
  exception when others then
    -- O dinheiro já entrou: o webhook não pode falhar. Fica registrado para o gerente.
    perform private.log_system_audit(s.restaurant_id, 'bill.close_failed', 'table_session', s.table_session_id,
      sqlerrm, null, null);
  end;
end $$;
