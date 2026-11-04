-- Revisão de T1 e V1. Repetir a cobrança não chama o fornecedor de novo; pagamento por aproximação pode ser estornado; retirar a taxa no
-- Tap fica registrado; ligar o Tap respeita o plano e a taxa; a nota diz o vale certo; e os parâmetros comerciais do restaurante só mudam
-- pelas funções, que validam e auditam.

alter table public.restaurants add constraint restaurants_accepted_vouchers_known check (accepted_vouchers <@ array['refeicao', 'alimentacao']::text[]);

-- Sem security definer: é o usuário atual que a regra precisa ver.
create or replace function private.restaurants_guard_commercial()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user in ('authenticated', 'anon') and (
       new.accepted_vouchers is distinct from old.accepted_vouchers
    or new.convenience_absorbed is distinct from old.convenience_absorbed
    or new.noowe_category is distinct from old.noowe_category
    or new.billing_hidden is distinct from old.billing_hidden
    or new.orders_suspended is distinct from old.orders_suspended) then
    raise exception 'Estes campos só mudam pela função própria, que registra quem mudou' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function private.restaurants_guard_commercial() from public, anon, authenticated;
create trigger restaurants_guard_commercial before update on public.restaurants for each row execute function private.restaurants_guard_commercial();

-- Aproximação disponível: fornecedor ligado, plano que inclui, e taxa cadastrada. Sem isso, nem o botão aparece.
create or replace function private.tap_available(p_restaurant uuid) returns boolean
language sql stable security definer set search_path = public, private, pg_temp as $$
  select private.tap_provider_active() and private.plan_allows(p_restaurant, 'tap_to_pay') and private.noowe_pay_rate_bps(p_restaurant, 'tap_card') is not null $$;
revoke all on function private.tap_available(uuid) from public, anon, authenticated;

-- A forma como a nota declara. Vale leva o tipo: refeição e alimentação têm códigos fiscais diferentes.
create or replace function private.fiscal_payment_method(g public.gateway_transactions) returns text
language sql stable set search_path = public, pg_temp as $$
  select case when g.payment_method = 'voucher' and g.metadata->>'voucher_kind' is not null then 'voucher_' || (g.metadata->>'voucher_kind') else g.payment_method end $$;
revoke all on function private.fiscal_payment_method(public.gateway_transactions) from public, anon, authenticated;

-- Referência e dados do SDK ficam guardados: repetir devolve os mesmos, sem cobrar de novo.
create or replace function public.service_tap_started(p_payment_id uuid, p_provider_ref text, p_sdk_payload jsonb)
returns void language sql security definer set search_path = public, pg_temp as $$
  update public.gateway_transactions set provider_ref = p_provider_ref, metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('sdk_payload', p_sdk_payload), updated_at = now()
    where id = p_payment_id and provider = 'tap' $$;
revoke all on function public.service_tap_started(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.service_tap_started(uuid, text, jsonb) to service_role;

-- Aprovação sem valor não confirma: é o valor que se confere contra o cobrado.
create or replace function public.service_tap_result(p_payment_id uuid, p_event_id text, p_approved boolean, p_amount_cents bigint default null, p_tariff_cents bigint default null)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  if p_approved and p_amount_cents is null then raise exception 'Aprovação sem valor' using errcode = '22023'; end if;
  if p_approved and p_tariff_cents is not null then
    update private.noowe_pay_transaction_fees set tariff_cents = p_tariff_cents, split_cents = private.noowe_pay_split_cents(fee_cents, p_tariff_cents), updated_at = now()
      where gateway_transaction_id = p_payment_id;
  end if;
  return private.apply_payment_event(p_payment_id, 'tap', p_event_id, case when p_approved then 'TAP_APPROVED' else 'TAP_DECLINED' end,
    case when p_approved then 'confirmed' else 'failed' end::public.noowe_payment_status, p_amount_cents);
end $$;

drop function public.service_tap_begin(uuid, uuid, uuid, bigint, boolean, bigint);
create function public.service_tap_begin(p_user_id uuid, p_table_session_id uuid, p_idempotency_key uuid, p_base_cents bigint default null, p_waive_fee boolean default false, p_tip_cents bigint default 0, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_hold integer; v_reason text := coalesce(nullif(btrim(p_reason), ''), 'A pedido do cliente'); s public.table_sessions; v_key text; t public.gateway_transactions; v_balance bigint; v_bps integer; v_base bigint; v_fee bigint; v_tip bigint := coalesce(p_tip_cents, 0); v_share uuid; v_expires timestamptz;
begin
  if not private.tap_provider_active() then raise exception 'Pagamento por aproximação indisponível' using errcode = 'P0007'; end if;
  if p_idempotency_key is null then raise exception 'Idempotency key required' using errcode = '22023'; end if;
  select * into s from public.table_sessions where id = p_table_session_id for update;
  if s.id is null then raise exception 'Table session not found' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.user_roles u where u.user_id = p_user_id and u.restaurant_id = s.restaurant_id and u.is_active
      and u.role in ('owner', 'manager', 'waiter', 'maitre')) then
    raise exception 'Restaurant access denied' using errcode = '42501'; end if;
  perform private.require_table_access(s, p_user_id);
  if not private.tap_available(s.restaurant_id) then raise exception 'Pagamento por aproximação indisponível neste restaurante' using errcode = 'P0007'; end if;
  v_key := 'tap:' || p_table_session_id || ':' || p_idempotency_key;
  select * into t from public.gateway_transactions where idempotency_key = v_key;
  if t.id is not null then return private.payment_json(t) || jsonb_build_object('idempotentReplay', true, 'sdkPayload', t.metadata->'sdk_payload'); end if;
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
  select p.card_hold_min into v_hold from public.restaurant_model_policies p where p.restaurant_id = s.restaurant_id and p.service_model = s.service_model;
  if v_hold is null then raise exception 'Serviço sem política de cobrança' using errcode = 'P0007'; end if;
  v_expires := now() + make_interval(mins => v_hold);
  insert into public.bill_shares(restaurant_id, table_session_id, participant_id, round_no, mode, base_cents, service_fee_cents, amount_cents, tip_cents, status, committed_by, fee_waived_by, fee_waived_at, fee_waived_reason)
    values (s.restaurant_id, s.id, null, (select coalesce(max(round_no), 0) + 1 from public.bill_shares where table_session_id = s.id), 'fixed_amount', v_base, v_fee, v_base + v_fee, v_tip, 'pending_payment', p_user_id,
      case when p_waive_fee and v_bps > 0 then p_user_id end, case when p_waive_fee and v_bps > 0 then now() end, case when p_waive_fee and v_bps > 0 then v_reason end)
    returning id into v_share;
  insert into public.gateway_transactions(restaurant_id, provider, payment_method, amount_cents, tip_cents, refunded_amount_cents, status, idempotency_key, purpose, table_session_id, bill_share_id, expires_at, metadata, created_at, updated_at)
    values (s.restaurant_id, 'tap', 'tap_card', v_base + v_fee + v_tip, v_tip, 0, 'pending', v_key, 'bill_share', s.id, v_share, v_expires, jsonb_build_object('recorded_by', p_user_id), now(), now())
    returning * into t;
  perform private.noowe_pay_freeze_fee(t);
  update public.bill_shares set payment_id = t.id where id = v_share;
  -- Retirar a taxa fica registrado, como na cobrança presencial.
  if p_waive_fee and v_bps > 0 then
    perform private.log_audit(s.restaurant_id, 'bill.fee_waived', 'bill_share', v_share, v_reason, null, jsonb_build_object('baseCents', v_base), p_user_id);
  end if;
  return private.payment_json(t);
end $$;
revoke all on function public.service_tap_begin(uuid, uuid, uuid, bigint, boolean, bigint, text) from public, anon, authenticated;
grant execute on function public.service_tap_begin(uuid, uuid, uuid, bigint, boolean, bigint, text) to service_role;

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
  -- Gorjeta só no cartão (vale no consumo): o teto é o saldo que ela acompanha.
  if v_tip < 0 or v_tip > (case when v_base > 0 then v_base + v_fee else v_balance end) then raise exception 'Gorjeta inválida' using errcode = '22023'; end if;
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
    'tapActive', private.tap_available(s.restaurant_id),
    -- Quem cobra a mesa vê quem já pagou. Maître vê o status, sem o valor de cada pagamento.
    'payers', coalesce((select jsonb_agg(jsonb_build_object('name', coalesce(p.display_name, 'Pago no salão'),
        'baseCents', case when private.has_restaurant_role(s.restaurant_id, array['owner','manager','waiter']::public.user_roles_role_enum[]) then b.base_cents end,
        'method', g.payment_method, 'paidAt', b.paid_at) order by b.paid_at)
      from public.bill_shares b left join public.table_session_participants p on p.id = b.participant_id
      left join public.gateway_transactions g on g.id = b.payment_id
      where b.table_session_id = p_table_session_id and b.status = 'paid'), '[]'::jsonb));
end $$;

create or replace function public.restaurant_get_payment_options(p_restaurant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner','manager','waiter','maitre','cashier']::public.user_roles_role_enum[]);
  return jsonb_build_object('tapActive', private.tap_available(p_restaurant_id),
    'acceptedVouchers', to_jsonb((select accepted_vouchers from public.restaurants where id = p_restaurant_id)));
end $$;

create or replace function private.fiscal_enqueue_session(p_session uuid)
returns uuid language plpgsql security definer set search_path = public, private, pg_temp as $$
declare s public.table_sessions; t record; v_lines jsonb; v_payments jsonb; v_ids uuid[]; v_gross bigint[]; v_fee bigint[]; v_id uuid; v_coupon bigint; v_disc bigint[];
begin
  select * into s from public.table_sessions where id = p_session;
  if s.id is null then return null; end if;
  -- Pagamento simulado não existe para o fisco.
  if exists (select 1 from public.bill_shares b join public.gateway_transactions g on g.id = b.payment_id
             where b.table_session_id = p_session and b.status = 'paid' and g.provider = 'simulated') then
    return null;
  end if;
  select * into t from private.session_totals(p_session);
  select array_agg(l.order_item_id order by l.order_item_id), array_agg(l.open_cents order by l.order_item_id)
    into v_ids, v_gross
  from private.session_lines(p_session) l where l.open_cents > 0;
  if v_ids is null then return null; end if;
  v_fee := private.allocate_proportional(t.fee_all, v_gross);
  -- O cupom sai como desconto na nota. O restante é o que foi vendido.
  select coalesce(sum(b.coupon_discount_cents), 0) into v_coupon from public.bill_shares b where b.table_session_id = p_session and b.status = 'paid';
  v_disc := private.allocate_proportional(v_coupon, v_gross);
  select jsonb_agg(jsonb_build_object('orderItemId', oi.id, 'menuItemId', oi.menu_item_id,
           'description', coalesce(mi.name, 'Item'), 'quantity', oi.quantity,
           'grossCents', v_gross[x.ord], 'discountCents', v_disc[x.ord], 'feeCents', v_fee[x.ord]) order by x.ord)
    into v_lines
  from unnest(v_ids) with ordinality as x(id, ord)
  join public.order_items oi on oi.id = x.id
  left join public.menu_items mi on mi.id = oi.menu_item_id;
  select jsonb_agg(jsonb_build_object('method', m.method, 'weightCents', m.cents) order by m.method)
    into v_payments
  from (select private.fiscal_payment_method(g) as method, sum(b.amount_cents)::bigint as cents
        from public.bill_shares b join public.gateway_transactions g on g.id = b.payment_id
        -- Parcela só de gorjeta não é forma de pagamento da nota: a gorjeta fica fora dela.
        where b.table_session_id = p_session and b.status = 'paid' and b.amount_cents > 0 group by private.fiscal_payment_method(g)) m;
  insert into public.fiscal_documents(restaurant_id, table_session_id, external_ref, total_cents, snapshot)
  values (s.restaurant_id, p_session, 's-' || p_session, t.base_all - v_coupon,
    jsonb_build_object('lines', v_lines, 'payments', coalesce(v_payments, '[]'::jsonb)))
  on conflict (external_ref) do update set total_cents = excluded.total_cents, snapshot = excluded.snapshot,
      status = 'pending', attempts = 0, next_attempt_at = now(), error_code = null, error_message = null, updated_at = now()
    where fiscal_documents.status = 'blocked' and fiscal_documents.error_code = 'enqueue_failed'
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.service_refund_claim(p_refund_id uuid)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare r public.payment_refunds; g public.gateway_transactions; p record; v_action text; v_total boolean;
begin
  select * into p from private.refund_retry_policy();
  select * into r from public.payment_refunds where id = p_refund_id for update;
  if r.id is null then return jsonb_build_object('claimed', false); end if;
  if r.status = 'sent' and r.next_attempt_at <= now() then v_action := 'verify';
  elsif (r.status = 'pending' and r.next_attempt_at <= now()) or (r.status = 'processing' and r.claimed_at < now() - p.stale_after) then v_action := 'send';
  else return jsonb_build_object('claimed', false); end if;
  select * into g from public.gateway_transactions where id = r.gateway_transaction_id;
  -- Um estorno de cada vez por pagamento: é o que permite saber a qual deles um aviso do provedor se refere.
  if v_action = 'send' and exists (select 1 from public.payment_refunds o where o.gateway_transaction_id = r.gateway_transaction_id and o.id <> r.id and o.status in ('processing', 'sent')) then
    return jsonb_build_object('claimed', false, 'waiting', true);
  end if;
  -- Aceito pelo provedor e sem confirmação há tempo demais: alguém precisa olhar.
  if v_action = 'verify' and r.stuck_alerted_at is null and r.sent_at < now() - private.refund_stuck_after() then
    update public.payment_refunds set stuck_alerted_at = now() where id = r.id;
    perform private.log_system_audit(r.restaurant_id, 'payment.refund_stuck', 'payment', r.gateway_transaction_id, 'Estorno sem confirmação do provedor', null, jsonb_build_object('refundId', r.id));
    perform private.notify_restaurant_staff(r.restaurant_id, array['owner','manager']::public.user_roles_role_enum[],
      'Estorno sem confirmação', 'O provedor aceitou um estorno de ' || to_char(r.amount_cents::numeric / 100, 'FM999G990D00') || ' e ainda não confirmou. Confira com o provedor.',
      'staff_bill_refund_review', r.id, null, jsonb_build_object('kind', 'staff_refund_stuck', 'refund_id', r.id, 'payment_id', r.gateway_transaction_id));
  end if;
  v_total := r.amount_cents >= g.amount_cents - g.refunded_amount_cents;
  if v_action = 'send' then
    update public.payment_refunds set status = 'processing', claimed_at = now(), attempts = attempts + 1, updated_at = now()
      where id = r.id returning * into r;
  else
    update public.payment_refunds set next_attempt_at = now() + p.verify_after, updated_at = now() where id = r.id;
  end if;
  return jsonb_build_object('claimed', true, 'refundId', r.id, 'action', v_action, 'attempt', r.attempts, 'total', v_total,
    'paymentId', g.id, 'paymentAccountId', g.payment_account_id, 'providerRef', g.provider_ref,
    'amountCents', r.amount_cents, 'reason', r.reason, 'provider', g.provider,
    'settledCents', coalesce((select sum(o.amount_cents) from public.payment_refunds o where o.gateway_transaction_id = r.gateway_transaction_id and o.status = 'done'), 0));
end $$;
