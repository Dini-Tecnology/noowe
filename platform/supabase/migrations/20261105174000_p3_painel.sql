-- P3: o que faltava do aditivo. Painel com status e relatório, encerrar cupom, cupom fora da página sem acesso público,
-- garçom só nas mesas dele, e a mensagem no formato que a pessoa lê ("de terça a quinta, das 15h às 18h").

-- O código de um cupom só chega a quem o restaurante escolheu. Antes, todo cupom ativo era legível por qualquer conta.
drop policy promotions_customer_active on public.promotions;
create policy promotions_customer_active on public.promotions for select to authenticated
  using (is_visible and discount_kind is not null and status = 'active' and valid_from <= now() and valid_until >= now());
-- Quem gerencia lê a tabela. Escrever é só pelas funções, que validam e auditam.
drop policy promotions_staff on public.promotions;
create policy promotions_staff on public.promotions for select to authenticated
  using (private.has_restaurant_role(restaurant_id, array['owner', 'manager']::public.user_roles_role_enum[]));

-- O "resgate" antigo reservava um uso sem nada na conta, e bastava repetir o toque para esgotar o cupom.
drop function public.customer_redeem_promotion(uuid);
-- A página do restaurante lê os visíveis pela própria tabela, sob a política acima.
drop function public.customer_list_visible_coupons(uuid);

create or replace function private.coupon_hour_label(p text) returns text language sql immutable set search_path = pg_temp as $$
  select split_part(p, ':', 1)::integer::text || 'h' || coalesce(nullif(split_part(p, ':', 2), '00'), '') $$;

create or replace function private.coupon_days_label(p_dow integer[]) returns text language sql immutable set search_path = pg_temp as $$
  with d as (select distinct x from unnest(p_dow) x),
       n as (select array['domingo','segunda','terça','quarta','quinta','sexta','sábado'] as names)
  select case when (select count(*) from d) > 2 and (select max(x) - min(x) + 1 from d) = (select count(*) from d)
    then 'de ' || names[(select min(x) from d) + 1] || ' a ' || names[(select max(x) from d) + 1]
    else (select string_agg(names[x + 1], ', ' order by x) from d) end
  from n $$;

create or replace function private.coupon_refusal(p public.promotions, p_service text, p_user uuid, p_amount bigint)
returns text language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare v_local timestamp := now() at time zone 'America/Sao_Paulo'; v_used bigint; v_mine bigint; v_dow integer := extract(dow from v_local)::integer;
begin
  if p.status <> 'active' then return 'Este cupom não está ativo'; end if;
  if now() < p.valid_from then return 'Válido a partir de ' || to_char(p.valid_from at time zone 'America/Sao_Paulo', 'DD/MM'); end if;
  if now() > p.valid_until then return 'Este cupom venceu em ' || to_char(p.valid_until at time zone 'America/Sao_Paulo', 'DD/MM'); end if;
  if p.services is not null and cardinality(p.services) > 0 and p_service is not null and not p_service = any(p.services) then return 'Este cupom não vale neste tipo de serviço'; end if;
  if p.dow is not null and cardinality(p.dow) > 0 and not v_dow = any(p.dow) then
    return 'Válido ' || private.coupon_days_label(p.dow) || coalesce(', das ' || private.coupon_hour_label(p.hours_from) || ' às ' || private.coupon_hour_label(p.hours_until), '');
  end if;
  if p.hours_from is not null and p.hours_until is not null and not (v_local::time >= p.hours_from::time and v_local::time < p.hours_until::time) then
    return 'Válido das ' || private.coupon_hour_label(p.hours_from) || ' às ' || private.coupon_hour_label(p.hours_until);
  end if;
  if p.min_order_cents is not null and p_amount < p.min_order_cents then return 'Pedido mínimo de R$ ' || to_char(p.min_order_cents::numeric / 100, 'FM999G990D00'); end if;
  if not private.customer_in_group(p.restaurant_id, p_user, p.audience, p.inactive_days) then
    return case p.audience when 'new' then 'Este cupom é para clientes novos' when 'vip' then 'Este cupom é para clientes VIP' when 'birthday' then 'Este cupom é para aniversariantes do mês' when 'inactive' then 'Este cupom é para quem não visita há um tempo' else 'Este cupom não vale para você' end;
  end if;
  select count(*) into v_used from public.promotion_redemptions r where r.promotion_id = p.id and r.status in ('reserved', 'applied');
  if p.max_uses is not null and v_used >= p.max_uses then return 'Este cupom esgotou'; end if;
  if p_user is not null then
    select count(*) into v_mine from public.promotion_redemptions r where r.promotion_id = p.id and r.user_id = p_user and r.status in ('reserved', 'applied');
    if v_mine >= coalesce(p.max_uses_per_user, 1) then return 'Você já usou este cupom'; end if;
  end if;
  return null;
end $$;

-- Horário inválido só apareceria quando o cliente fosse usar o cupom.
create or replace function private.coupon_assert_shape(p_restaurant uuid, p jsonb) returns void language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_from text := nullif(p->>'hoursFrom', ''); v_until text := nullif(p->>'hoursUntil', ''); v_scope text := coalesce(p->>'scope', 'bill'); v_format text := '^([01][0-9]|2[0-3]):[0-5][0-9]$';
begin
  if (v_from is null) <> (v_until is null) then raise exception 'Informe o início e o fim do horário' using errcode = '22023'; end if;
  if v_from is not null and (v_from !~ v_format or v_until !~ v_format) then raise exception 'Confira o horário, no formato 15:00' using errcode = '22023'; end if;
  if v_from is not null and v_from >= v_until then raise exception 'O horário final precisa ser depois do inicial' using errcode = '22023'; end if;
  if v_scope <> 'bill' and coalesce(jsonb_array_length(p->'scopeIds'), 0) = 0 then raise exception 'Escolha onde o cupom vale' using errcode = '22023'; end if;
  if p->>'discountKind' = 'free_item' and not exists (select 1 from public.menu_items m where m.id = (p->>'freeItemId')::uuid and m.restaurant_id = p_restaurant) then
    raise exception 'Escolha o item grátis' using errcode = '22023'; end if;
end $$;

-- Garçom aplica nas mesas dele. Mesa sem responsável é de quem atende (pendência 70).
create or replace function private.coupon_assert_staff_table(p_session public.table_sessions) returns void language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare v_assigned uuid;
begin
  if private.has_restaurant_role(p_session.restaurant_id, array['owner', 'manager', 'maitre']::public.user_roles_role_enum[]) then return; end if;
  select t.assigned_waiter_id into v_assigned from public.tables t where t.id = p_session.table_id;
  if v_assigned is not null and v_assigned <> auth.uid() then raise exception 'Este cupom só pode ser aplicado nas suas mesas' using errcode = 'P0017'; end if;
end $$;

create or replace function private.coupon_display_status(p public.promotions) returns text language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when p.status = 'ended' or now() > p.valid_until then 'ended'
    when p.status <> 'active' then 'paused'
    when now() < p.valid_from then 'scheduled'
    when p.max_uses is not null and (select count(*) from public.promotion_redemptions r where r.promotion_id = p.id and r.status in ('reserved', 'applied')) >= p.max_uses then 'sold_out'
    else 'active' end $$;

-- Faturamento é o consumo pago das contas com o cupom, já sem o desconto, sem taxa nem gorjeta (pendência 71).
create or replace function private.coupon_report(p public.promotions) returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  with r as (select * from public.promotion_redemptions x where x.promotion_id = p.id and x.status = 'applied'),
  n as (select count(distinct coalesce(table_session_id, order_id)) as accounts from r),
  rev as (select (coalesce((select sum(s.base_cents - s.coupon_discount_cents) from public.bill_shares s
                            where s.status = 'paid' and s.table_session_id in (select table_session_id from r)), 0)
               + coalesce((select sum(o.total_cents) from public.orders o where o.id in (select order_id from r where table_session_id is null)), 0))::bigint as cents)
  select jsonb_build_object('uses', (select count(*) from r), 'discountGivenCents', (select coalesce(sum(discount_cents), 0) from r),
    'revenueCents', rev.cents, 'avgTicketCents', case when n.accounts > 0 then rev.cents / n.accounts else 0 end,
    -- Cliente novo: nenhuma conta anterior nesta casa, fora a do próprio cupom.
    'newCustomers', (select count(distinct r.user_id) from r where r.user_id is not null and not exists (
      select 1 from public.orders o where o.restaurant_id = p.restaurant_id and o.customer_id = r.user_id and o.status::text <> 'cancelled' and o.created_at < r.created_at
        and o.table_session_id is distinct from r.table_session_id and o.id is distinct from r.order_id)))
  from n, rev $$;

-- Dono e Gerente veem o painel. Garçom e Maître, só os ativos, sem os números.
create or replace function public.restaurant_list_coupons(p_restaurant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare v_full boolean;
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner','manager','maitre','waiter']::public.user_roles_role_enum[]);
  v_full := private.has_restaurant_role(p_restaurant_id, array['owner','manager']::public.user_roles_role_enum[]);
  return coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'code', p.code, 'title', p.title, 'status', private.coupon_display_status(p), 'discountKind', p.discount_kind, 'discountBps', p.discount_bps, 'discountCents', p.discount_cents,
      'freeItemId', p.free_item_id, 'minOrderCents', p.min_order_cents, 'services', to_jsonb(p.services), 'scope', p.scope, 'scopeIds', to_jsonb(p.scope_ids), 'dow', to_jsonb(p.dow), 'hoursFrom', p.hours_from, 'hoursUntil', p.hours_until,
      'audience', p.audience, 'inactiveDays', p.inactive_days, 'maxUses', p.max_uses, 'maxUsesPerUser', p.max_uses_per_user, 'validFrom', p.valid_from, 'validUntil', p.valid_until, 'isAuto', p.is_auto, 'isVisible', p.is_visible,
      'stacksWithPromotions', p.stacks_with_promotions, 'locked', p.first_used_at is not null)
      || case when v_full then private.coupon_report(p) else '{}'::jsonb end order by p.created_at desc)
    from public.promotions p where p.restaurant_id = p_restaurant_id and p.discount_kind is not null
      and (v_full or private.coupon_display_status(p) = 'active')), '[]'::jsonb);
end $$;

create or replace function public.restaurant_set_coupon_active(p_coupon_id uuid, p_active boolean)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare p public.promotions;
begin
  select * into p from public.promotions where id = p_coupon_id for update;
  if p.id is null then raise exception 'Cupom não encontrado' using errcode = 'P0002'; end if;
  perform private.require_restaurant_role(p.restaurant_id, array['owner','manager']::public.user_roles_role_enum[]);
  if p.status = 'ended' then raise exception 'Cupom encerrado não volta. Duplique para usar de novo' using errcode = 'P0001'; end if;
  update public.promotions set status = case when p_active then 'active' else 'inactive' end, updated_at = now() where id = p_coupon_id;
  perform private.log_audit(p.restaurant_id, 'coupon.status_changed', 'promotion', p_coupon_id, case when p_active then 'Cupom ativado' else 'Cupom pausado' end, null, null);
end $$;

create or replace function public.restaurant_end_coupon(p_coupon_id uuid)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare p public.promotions;
begin
  select * into p from public.promotions where id = p_coupon_id for update;
  if p.id is null then raise exception 'Cupom não encontrado' using errcode = 'P0002'; end if;
  perform private.require_restaurant_role(p.restaurant_id, array['owner','manager']::public.user_roles_role_enum[]);
  update public.promotions set status = 'ended', updated_at = now() where id = p_coupon_id;
  perform private.log_audit(p.restaurant_id, 'coupon.ended', 'promotion', p_coupon_id, 'Cupom encerrado', null, null);
end $$;
revoke all on function public.restaurant_end_coupon(uuid) from public, anon;
grant execute on function public.restaurant_end_coupon(uuid) to authenticated;
revoke all on function private.coupon_report(public.promotions), private.coupon_display_status(public.promotions), private.coupon_assert_staff_table(public.table_sessions), private.coupon_assert_shape(uuid, jsonb) from public, anon, authenticated;

create or replace function public.restaurant_upsert_coupon(p_restaurant_id uuid, p_coupon jsonb)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_id uuid := nullif(p_coupon->>'id', '')::uuid; o public.promotions; p public.promotions; v_kind text := p_coupon->>'discountKind'; v_code text := upper(btrim(coalesce(p_coupon->>'code', '')));
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner','manager']::public.user_roles_role_enum[]);
  if v_id is not null then
    select * into o from public.promotions where id = v_id and restaurant_id = p_restaurant_id for update;
    if o.id is null then raise exception 'Cupom não encontrado' using errcode = 'P0002'; end if;
    -- Depois do primeiro uso, só validade e limite podem mudar: quem usou viu outra regra.
    if o.first_used_at is not null then
      update public.promotions set valid_until = coalesce((p_coupon->>'validUntil')::timestamptz, valid_until),
          max_uses = coalesce((p_coupon->>'maxUses')::numeric, max_uses), updated_at = now() where id = v_id returning * into p;
      perform private.log_audit(p_restaurant_id, 'coupon.changed', 'promotion', p.id, 'Validade ou limite alterados', jsonb_build_object('validUntil', o.valid_until, 'maxUses', o.max_uses), jsonb_build_object('validUntil', p.valid_until, 'maxUses', p.max_uses));
      return to_jsonb(p);
    end if;
  end if;
  if v_kind not in ('percent', 'fixed', 'free_item') then raise exception 'Diga o que o cliente ganha' using errcode = '22023'; end if;
  if v_kind = 'percent' and coalesce((p_coupon->>'discountBps')::integer, 0) not between 1 and 10000 then raise exception 'Percentual inválido' using errcode = '22023'; end if;
  if v_kind = 'fixed' and coalesce((p_coupon->>'discountCents')::bigint, 0) <= 0 then raise exception 'Valor inválido' using errcode = '22023'; end if;
  if v_kind = 'free_item' and nullif(p_coupon->>'freeItemId', '') is null then raise exception 'Escolha o item grátis' using errcode = '22023'; end if;
  -- Editar sem informar o código mantém o que já foi divulgado.
  if v_code = '' then v_code := coalesce(o.code, upper(substr(md5(gen_random_uuid()::text), 1, 8))); end if;
  if nullif(btrim(coalesce(p_coupon->>'title', '')), '') is null then raise exception 'Dê um nome ao cupom' using errcode = '22023'; end if;
  if (p_coupon->>'validFrom') is null or (p_coupon->>'validUntil') is null or (p_coupon->>'validUntil')::timestamptz <= (p_coupon->>'validFrom')::timestamptz then raise exception 'Confira as datas' using errcode = '22023'; end if;
  perform private.coupon_assert_shape(p_restaurant_id, p_coupon);
  insert into public.promotions(id, restaurant_id, code, title, description, type, status, discount_kind, discount_bps, discount_cents, free_item_id, min_order_cents, services, scope, scope_ids,
      dow, hours_from, hours_until, audience, inactive_days, max_uses, max_uses_per_user, current_uses, valid_from, valid_until, is_auto, is_visible, stacks_with_promotions, created_by, created_at, updated_at)
    values (coalesce(v_id, gen_random_uuid()), p_restaurant_id, v_code, btrim(p_coupon->>'title'), p_coupon->>'description', v_kind, 'active', v_kind,
      (p_coupon->>'discountBps')::integer, (p_coupon->>'discountCents')::bigint, nullif(p_coupon->>'freeItemId', '')::uuid, (p_coupon->>'minOrderCents')::bigint,
      (select array_agg(x) from jsonb_array_elements_text(p_coupon->'services') x), coalesce(p_coupon->>'scope', 'bill'), (select array_agg(x::uuid) from jsonb_array_elements_text(p_coupon->'scopeIds') x),
      (select array_agg(x::integer) from jsonb_array_elements_text(p_coupon->'dow') x), p_coupon->>'hoursFrom', p_coupon->>'hoursUntil', coalesce(p_coupon->>'audience', 'all'), (p_coupon->>'inactiveDays')::integer,
      (p_coupon->>'maxUses')::numeric, coalesce((p_coupon->>'maxUsesPerUser')::numeric, 1), 0, (p_coupon->>'validFrom')::timestamptz, (p_coupon->>'validUntil')::timestamptz,
      coalesce((p_coupon->>'isAuto')::boolean, false), coalesce((p_coupon->>'isVisible')::boolean, false), coalesce((p_coupon->>'stacksWithPromotions')::boolean, false), auth.uid(), now(), now())
    on conflict (id) do update set code = excluded.code, title = excluded.title, description = excluded.description, type = excluded.type, discount_kind = excluded.discount_kind, discount_bps = excluded.discount_bps,
      discount_cents = excluded.discount_cents, free_item_id = excluded.free_item_id, min_order_cents = excluded.min_order_cents, services = excluded.services, scope = excluded.scope, scope_ids = excluded.scope_ids,
      dow = excluded.dow, hours_from = excluded.hours_from, hours_until = excluded.hours_until, audience = excluded.audience, inactive_days = excluded.inactive_days, max_uses = excluded.max_uses,
      max_uses_per_user = excluded.max_uses_per_user, valid_from = excluded.valid_from, valid_until = excluded.valid_until, is_auto = excluded.is_auto, is_visible = excluded.is_visible,
      stacks_with_promotions = excluded.stacks_with_promotions, updated_at = now()
    returning * into p;
  perform private.log_audit(p_restaurant_id, 'coupon.saved', 'promotion', p.id, 'Cupom salvo', null, jsonb_build_object('code', p.code));
  return to_jsonb(p);
end $$;

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
    perform private.coupon_assert_staff_table(v_session);
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
