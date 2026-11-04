-- P3: cupons do restaurante. A tabela promotions, vazia, ganha o que faltava, em centavos. A regra vale no servidor, com a mensagem dizendo por que não vale.
-- O desconto é do restaurante, entra antes da taxa ou gorjeta, e sai como desconto na nota. Na conta dividida, vale só para a parte de quem aplicou.

alter table public.promotions
  add column discount_kind text check (discount_kind in ('percent', 'fixed', 'free_item')),
  add column discount_bps integer check (discount_bps between 1 and 10000),
  add column discount_cents bigint check (discount_cents > 0),
  add column min_order_cents bigint check (min_order_cents >= 0),
  add column services text[],
  add column scope text not null default 'bill' check (scope in ('bill', 'categories', 'items')),
  add column scope_ids uuid[],
  add column dow integer[],
  add column audience text not null default 'all' check (audience in ('all', 'new', 'vip', 'birthday', 'inactive')),
  add column inactive_days integer check (inactive_days > 0),
  add column is_auto boolean not null default false,
  add column is_visible boolean not null default false,
  add column stacks_with_promotions boolean not null default false,
  add column first_used_at timestamptz,
  add column created_by uuid references public.profiles(id) on delete set null,
  alter column current_uses set default 0,
  alter column max_uses_per_user set default 1,
  alter column status set default 'active',
  alter column created_at set default now(),
  alter column updated_at set default now();
create unique index promotions_code_per_restaurant on public.promotions(restaurant_id, upper(code));

drop index if exists public.uq_promotion_redemptions_active_user;
alter table public.promotion_redemptions alter column user_id drop not null,
  add column table_session_id uuid references public.table_sessions(id) on delete set null,
  add column bill_share_id uuid references public.bill_shares(id) on delete set null,
  add column discount_cents bigint not null default 0 check (discount_cents >= 0);
alter table public.orders add column coupon_id uuid references public.promotions(id) on delete set null,
  add column coupon_discount_cents bigint not null default 0 check (coupon_discount_cents >= 0);

alter table public.bill_shares add column coupon_id uuid references public.promotions(id) on delete set null,
  add column coupon_discount_cents bigint not null default 0 check (coupon_discount_cents >= 0),
  drop constraint bill_shares_amount_is_base_plus_fee,
  add constraint bill_shares_amount_is_base_plus_fee check (amount_cents = base_cents - coupon_discount_cents + service_fee_cents),
  add constraint bill_shares_discount_within_base check (coupon_discount_cents <= base_cents);

-- ---------------------------------------------------------------------------
-- 1. A regra
-- ---------------------------------------------------------------------------
-- Grupos da ficha do cliente (o mínimo da P2 que os cupons usam).
create or replace function private.customer_in_group(p_restaurant uuid, p_user uuid, p_audience text, p_inactive_days integer)
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
declare c public.customer_profiles; v_last timestamptz; v_birth date;
begin
  if p_audience = 'all' then return true; end if;
  if p_user is null then return p_audience = 'all'; end if;
  select * into c from public.customer_profiles where restaurant_id = p_restaurant and user_id = p_user;
  select max(o.created_at) into v_last from public.orders o where o.restaurant_id = p_restaurant and o.customer_id = p_user and o.status::text <> 'cancelled'
    and o.created_at < now() - interval '1 hour';
  v_last := greatest(v_last, c.last_visit_at);
  return case p_audience
    when 'new' then v_last is null and coalesce(c.total_visits, 0) = 0
    when 'vip' then c.segment = 'vip'
    when 'birthday' then (select extract(month from coalesce(c.birthday, p.birth_date)) from public.profiles p where p.id = p_user) = extract(month from now() at time zone 'America/Sao_Paulo')
    when 'inactive' then v_last is not null and v_last < now() - make_interval(days => coalesce(p_inactive_days, 30))
    else false end;
end $$;
revoke all on function private.customer_in_group(uuid, uuid, text, integer) from public, anon, authenticated;

create or replace function private.coupon_for_code(p_restaurant uuid, p_code text)
returns public.promotions language plpgsql security definer set search_path = public, pg_temp as $$
declare p public.promotions;
begin
  select * into p from public.promotions where restaurant_id = p_restaurant and upper(code) = upper(btrim(coalesce(p_code, ''))) and discount_kind is not null for update;
  if p.id is null then raise exception 'Cupom não encontrado' using errcode = 'P0017'; end if;
  return p;
end $$;
revoke all on function private.coupon_for_code(uuid, text) from public, anon, authenticated;

-- Por que não vale, em uma frase. Nulo: vale. O limite de usos é conferido com a linha do cupom travada: não estoura em simultâneo.
create or replace function private.coupon_refusal(p public.promotions, p_service text, p_user uuid, p_amount bigint)
returns text language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare v_local timestamp := now() at time zone 'America/Sao_Paulo'; v_used bigint; v_mine bigint; v_dow integer := extract(dow from v_local)::integer; v_names text[] := array['domingo','segunda','terça','quarta','quinta','sexta','sábado'];
begin
  if p.status <> 'active' then return 'Este cupom não está ativo'; end if;
  if now() < p.valid_from then return 'Válido a partir de ' || to_char(p.valid_from at time zone 'America/Sao_Paulo', 'DD/MM'); end if;
  if now() > p.valid_until then return 'Este cupom venceu em ' || to_char(p.valid_until at time zone 'America/Sao_Paulo', 'DD/MM'); end if;
  if p.services is not null and cardinality(p.services) > 0 and p_service is not null and not p_service = any(p.services) then return 'Este cupom não vale neste tipo de serviço'; end if;
  if p.dow is not null and cardinality(p.dow) > 0 and not v_dow = any(p.dow) then
    return 'Válido ' || (select string_agg(v_names[x + 1], ', ' order by x) from unnest(p.dow) x) || coalesce(', das ' || p.hours_from || ' às ' || p.hours_until, '');
  end if;
  if p.hours_from is not null and p.hours_until is not null and not (v_local::time >= p.hours_from::time and v_local::time < p.hours_until::time) then
    return 'Válido das ' || p.hours_from || ' às ' || p.hours_until;
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
revoke all on function private.coupon_refusal(public.promotions, text, uuid, bigint) from public, anon, authenticated;

create or replace function private.coupon_assert_valid(p public.promotions, p_service text, p_user uuid, p_amount bigint)
returns void language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare v text := private.coupon_refusal(p, p_service, p_user, p_amount);
begin
  if v is not null then raise exception '%', v using errcode = 'P0017'; end if;
end $$;
revoke all on function private.coupon_assert_valid(public.promotions, text, uuid, bigint) from public, anon, authenticated;

-- Quanto desconta sobre o valor. Escopo por categoria ou item olha o que foi pedido nesta conta. Item grátis: o preço de um.
create or replace function private.coupon_discount_cents(p public.promotions, p_session uuid, p_order uuid, p_base bigint)
returns bigint language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare v_eligible bigint := p_base; v bigint;
begin
  if p.scope <> 'bill' or p.discount_kind = 'free_item' then
    select coalesce(sum(coalesce(oi.total_price_cents, round(oi.total_price * 100)::bigint)), 0) into v_eligible
    from public.order_items oi join public.orders o on o.id = oi.order_id left join public.menu_items mi on mi.id = oi.menu_item_id
    where (o.table_session_id = p_session or o.id = p_order) and oi.status::text <> 'cancelled'
      and ((p.discount_kind = 'free_item' and oi.menu_item_id = p.free_item_id)
        or (p.discount_kind <> 'free_item' and ((p.scope = 'items' and oi.menu_item_id = any(p.scope_ids)) or (p.scope = 'categories' and mi.category_id = any(p.scope_ids)))));
    v_eligible := least(v_eligible, p_base);
  end if;
  v := case p.discount_kind
    when 'percent' then div(v_eligible * p.discount_bps + 5000, 10000)::bigint
    when 'fixed' then p.discount_cents
    else (select coalesce(min(coalesce(oi.unit_price_cents, round(oi.unit_price * 100)::bigint)), 0) from public.order_items oi join public.orders o on o.id = oi.order_id
      where (o.table_session_id = p_session or o.id = p_order) and oi.menu_item_id = p.free_item_id and oi.status::text <> 'cancelled') end;
  return least(greatest(coalesce(v, 0), 0), v_eligible);
end $$;
revoke all on function private.coupon_discount_cents(public.promotions, uuid, uuid, bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Aplicar na conta
-- ---------------------------------------------------------------------------
create or replace function private.share_set_coupon(p_share uuid, p public.promotions, p_user uuid)
returns bigint language plpgsql security definer set search_path = public, private, pg_temp as $$
declare s public.bill_shares; v_disc bigint; v_bps integer; v_fee bigint;
begin
  select * into s from public.bill_shares where id = p_share for update;
  v_disc := case when p.id is null then 0 else private.coupon_discount_cents(p, s.table_session_id, null, s.base_cents) end;
  v_bps := private.session_fee_bps(s.table_session_id);
  v_fee := case when s.fee_waived_at is not null then 0 else private.service_fee_cents(s.base_cents - v_disc, v_bps) end;
  update public.promotion_redemptions set status = 'cancelled', updated_at = now() where bill_share_id = p_share and status = 'reserved';
  update public.bill_shares set coupon_id = p.id, coupon_discount_cents = v_disc, service_fee_cents = v_fee, amount_cents = s.base_cents - v_disc + v_fee, updated_at = now() where id = p_share;
  if p.id is not null and v_disc > 0 then
    insert into public.promotion_redemptions(promotion_id, user_id, table_session_id, bill_share_id, discount_cents, status)
      values (p.id, p_user, s.table_session_id, p_share, v_disc, 'reserved');
  end if;
  return v_disc;
end $$;
revoke all on function private.share_set_coupon(uuid, public.promotions, uuid) from public, anon, authenticated;

-- Parcela nova: mantém o cupom da pessoa, se ainda valer; senão, o automático que melhor servir. Nunca soma cupons.
create or replace function private.coupon_attach(p_share uuid, p_previous uuid)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare s public.bill_shares; p public.promotions; v_user uuid; v_model text; v_best public.promotions; v_best_cents bigint := 0; v_cents bigint;
begin
  select * into s from public.bill_shares where id = p_share;
  select user_id into v_user from public.table_session_participants where id = s.participant_id;
  select service_model::text into v_model from public.table_sessions where id = s.table_session_id;
  if p_previous is not null then
    select * into p from public.promotions where id = p_previous for update;
    if p.id is not null and private.coupon_refusal(p, v_model, v_user, s.base_cents) is null then
      perform private.share_set_coupon(p_share, p, v_user);
      return;
    end if;
  end if;
  if exists (select 1 from public.bill_shares b where b.participant_id = s.participant_id and b.table_session_id = s.table_session_id and b.status = 'paid' and b.coupon_id is not null) then return; end if;
  for p in select * from public.promotions x where x.restaurant_id = s.restaurant_id and x.is_auto and x.status = 'active' and x.discount_kind is not null for update loop
    continue when private.coupon_refusal(p, v_model, v_user, s.base_cents) is not null;
    v_cents := private.coupon_discount_cents(p, s.table_session_id, null, s.base_cents);
    if v_cents > v_best_cents then v_best := p; v_best_cents := v_cents; end if;
  end loop;
  if v_best.id is not null then perform private.share_set_coupon(p_share, v_best, v_user); end if;
end $$;
revoke all on function private.coupon_attach(uuid, uuid) from public, anon, authenticated;

-- Paga, o uso vale. Parcela que deixou de valer devolve o uso.
create or replace function private.coupon_follow_share()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.status = 'paid' and old.status <> 'paid' and new.coupon_id is not null then
    update public.promotion_redemptions set status = 'applied', updated_at = now() where bill_share_id = new.id and status = 'reserved';
    update public.promotions set first_used_at = coalesce(first_used_at, now()) where id = new.coupon_id;
  elsif new.status in ('superseded', 'abandoned', 'refunded') and old.status <> new.status then
    update public.promotion_redemptions set status = 'cancelled', updated_at = now() where bill_share_id = new.id and status in ('reserved', 'applied');
  end if;
  return new;
end $$;
revoke all on function private.coupon_follow_share() from public, anon, authenticated;
create trigger zz_bill_shares_coupon after update of status on public.bill_shares for each row execute function private.coupon_follow_share();

create or replace function private.commit_split(
  p_session uuid, p_actor uuid, p_mode public.noowe_split_mode, p_params jsonb,
  p_expected_version text, p_key uuid
) returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  v_session public.table_sessions; v_plan jsonb; v_share jsonb; v_id uuid; v_round integer; v_ids uuid[] := '{}';
  v_line jsonb; v_prev public.bill_shares; v_part uuid; v_sum bigint := 0; v_balance bigint;
begin
  select * into v_session from public.table_sessions where id = p_session for update;
  if v_session.id is null or v_session.status <> 'active' then
    raise exception 'Sessão da mesa indisponível' using errcode = 'P0001'; end if;
  if p_actor is not null and not exists (
    select 1 from public.table_session_participants where table_session_id = p_session and user_id = p_actor) then
    raise exception 'Participante não encontrado' using errcode = 'P0001'; end if;

  if p_key is not null and p_actor is not null then
    select coalesce(array_agg(id), '{}') into v_ids from public.bill_shares
      where committed_by = p_actor and idempotency_key = p_key and table_session_id = p_session;
    if cardinality(v_ids) > 0 then
      return jsonb_build_object('shareIds', to_jsonb(v_ids), 'idempotentReplay', true);
    end if;
  end if;
  if p_expected_version is not null and p_expected_version <> private.split_version(p_session) then
    raise exception 'A conta mudou. Confira os valores atualizados.' using errcode = 'P0012'; end if;

  v_plan := private.compute_split(p_session, p_mode, p_params, p_actor);
  v_balance := (v_plan->>'balanceCents')::bigint;
  select coalesce(max(round_no), 0) + 1 into v_round from public.bill_shares where table_session_id = p_session;
  v_ids := '{}';
  for v_share in select * from jsonb_array_elements(v_plan->'shares') loop
    v_part := (v_share->>'participantId')::uuid;
    v_sum := v_sum + (v_share->>'baseCents')::bigint;
    select * into v_prev from public.bill_shares s
      where s.table_session_id = p_session and s.participant_id = v_part and s.status = 'open';
    update public.bill_shares set status = 'superseded', updated_at = now()
      where table_session_id = p_session and participant_id = v_part and status = 'open';
    insert into public.bill_shares(restaurant_id, table_session_id, participant_id, round_no, mode,
        base_cents, service_fee_cents, amount_cents, tip_cents, committed_by, idempotency_key,
        fee_waived_by, fee_waived_at, fee_waived_reason)
      values (v_session.restaurant_id, p_session, v_part, v_round,
        (v_share->>'mode')::public.noowe_split_mode, (v_share->>'baseCents')::bigint,
        (v_share->>'feeCents')::bigint, (v_share->>'amountCents')::bigint, (v_share->>'tipCents')::bigint, p_actor, p_key,
        case when (v_share->>'feeWaived')::boolean then coalesce(v_prev.fee_waived_by, p_actor) end,
        case when (v_share->>'feeWaived')::boolean then coalesce(v_prev.fee_waived_at, now()) end,
        case when (v_share->>'feeWaived')::boolean then coalesce(v_prev.fee_waived_reason, 'A pedido do cliente') end)
      returning id into v_id;
    v_ids := v_ids || v_id;
    -- O cupom acompanha a pessoa, como a retirada da taxa. Sem cupom, vale o automático, se a regra bater.
    perform private.coupon_attach(v_id, v_prev.coupon_id);
    if (v_share->>'feeWaived')::boolean and v_prev.fee_waived_at is null then
      perform private.log_audit(v_session.restaurant_id, 'bill.fee_waived', 'bill_share', v_id, 'A pedido do cliente',
        null, jsonb_build_object('baseCents', v_share->'baseCents'), p_actor);
    end if;
    for v_line in select * from jsonb_array_elements(v_share->'lines') loop
      insert into public.bill_share_lines(bill_share_id, order_item_id, base_cents)
        values (v_id, (v_line->>'orderItemId')::uuid, (v_line->>'baseCents')::bigint);
    end loop;
  end loop;
  -- O que o plano substitui e não recriou (quem saiu da divisão) também deixa de valer.
  update public.bill_shares set status = 'superseded', updated_at = now()
    where id in (select (x)::uuid from jsonb_array_elements_text(v_plan->'excludeShareIds') x) and status = 'open';
  update public.table_sessions set billing_status = 'billing',
      billing_started_at = coalesce(billing_started_at, now()), updated_at = now() where id = p_session;

  -- Invariante: nunca se cobra mais consumo do que o saldo.
  if v_sum > v_balance then
    raise exception 'Soma das parcelas (%) excede o saldo (%)', v_sum, v_balance using errcode = 'P0009'; end if;
  return v_plan - 'shares' || jsonb_build_object('shareIds', to_jsonb(v_ids), 'round', v_round,
    'sharesCount', cardinality(v_ids), 'idempotentReplay', false);
end $$;

create or replace function public.customer_set_share_fee_waived(p_share_id uuid, p_waived boolean)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare s public.bill_shares; v_bps integer; v_base bigint; v_fee bigint; v_total bigint; v_balance bigint;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  perform 1 from public.table_sessions t join public.bill_shares b on b.table_session_id = t.id where b.id = p_share_id for update of t;
  select * into s from public.bill_shares where id = p_share_id for update;
  if s.id is null or not private.share_payer_allowed(s, auth.uid()) then
    raise exception 'Parcela não encontrada' using errcode = 'P0002'; end if;
  if s.status <> 'open' then raise exception 'Parcela não está aberta' using errcode = 'P0001'; end if;
  if private.fee_or_tip_mode(s.table_session_id) <> 'service_fee' then
    raise exception 'Este restaurante não cobra taxa de serviço' using errcode = '22023'; end if;
  if coalesce(p_waived, false) = (s.fee_waived_at is not null) then
    return jsonb_build_object('shareId', s.id, 'baseCents', s.base_cents, 'feeCents', s.service_fee_cents,
      'amountCents', s.amount_cents, 'feeWaived', s.fee_waived_at is not null);
  end if;
  v_bps := private.session_fee_bps(s.table_session_id);
  v_balance := private.session_consumption_balance(s.table_session_id);
  v_total := s.amount_cents;
  if s.mode = 'fixed_amount' then
    -- Valor fixo é o que sai do cartão: sem a taxa, o mesmo valor é todo consumo.
    if p_waived then
      v_base := private.adjust_to_balance(v_total, v_balance); v_fee := 0;
    else
      select x.base_cents, x.rest_cents into v_base, v_fee from private.split_out_of_total(v_total, v_bps) x;
    end if;
  else
    v_base := s.base_cents;
    v_fee := case when p_waived then 0 else private.service_fee_cents(v_base - s.coupon_discount_cents, v_bps) end;
  end if;
  update public.bill_shares set base_cents = v_base, service_fee_cents = v_fee, amount_cents = v_base - s.coupon_discount_cents + v_fee,
      fee_waived_by = case when p_waived then auth.uid() end,
      fee_waived_at = case when p_waived then now() end,
      fee_waived_reason = case when p_waived then 'A pedido do cliente' end,
      updated_at = now()
    where id = s.id;
  perform private.log_audit(s.restaurant_id, case when p_waived then 'bill.fee_waived' else 'bill.fee_restored' end,
    'bill_share', s.id, case when p_waived then 'A pedido do cliente' else 'Cliente manteve a taxa' end,
    jsonb_build_object('feeCents', s.service_fee_cents), jsonb_build_object('feeCents', v_fee));
  return jsonb_build_object('shareId', s.id, 'baseCents', v_base, 'feeCents', v_fee, 'amountCents', v_base - s.coupon_discount_cents + v_fee, 'feeWaived', p_waived);
end $$;

create or replace function public.customer_share_tip_options(p_share_id uuid, p_percents integer[] default null)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare s public.bill_shares; v_percents integer[] := p_percents;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select * into s from public.bill_shares where id = p_share_id;
  if s.id is null or not private.share_payer_allowed(s, auth.uid()) then
    raise exception 'Parcela não encontrada' using errcode = 'P0002'; end if;
  if exists (select 1 from unnest(coalesce(v_percents, '{}')) x where x < 0 or x > 100) then
    raise exception 'Percentual inválido' using errcode = '22023'; end if;
  if private.fee_or_tip_mode(s.table_session_id) <> 'tip' then return '[]'::jsonb; end if;
  if v_percents is null then
    select array(select x / 100 from unnest(pol.tip_presets_bps) x) into v_percents
      from public.table_sessions t
      join public.restaurant_model_policies pol on pol.restaurant_id = t.restaurant_id and pol.service_model = t.service_model
      where t.id = s.table_session_id;
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('percent', x, 'cents', t.tip, 'totalCents', s.amount_cents + t.tip)
    order by x) from unnest(v_percents) x, lateral (select div((s.base_cents - s.coupon_discount_cents) * x + 50, 100) as tip) t), '[]'::jsonb);
end $$;

-- O cliente aplica na hora de pagar. Um cupom por pessoa por conta. Só na própria parte.
create or replace function public.customer_apply_coupon(p_share_id uuid, p_code text)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare s public.bill_shares; p public.promotions; v_model text; v_disc bigint;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select * into s from public.bill_shares where id = p_share_id for update;
  if s.id is null or not private.share_payer_allowed(s, auth.uid()) then raise exception 'Parcela não encontrada' using errcode = 'P0002'; end if;
  if s.status <> 'open' then raise exception 'Parcela não está aberta' using errcode = 'P0001'; end if;
  p := private.coupon_for_code(s.restaurant_id, p_code);
  if s.coupon_id = p.id then return jsonb_build_object('shareId', s.id, 'discountCents', s.coupon_discount_cents, 'amountCents', s.amount_cents, 'couponTitle', p.title); end if;
  if exists (select 1 from public.bill_shares b where b.table_session_id = s.table_session_id and b.participant_id = s.participant_id and b.status = 'paid' and b.coupon_id is not null) then
    raise exception 'Você já usou um cupom nesta conta' using errcode = 'P0017'; end if;
  select service_model::text into v_model from public.table_sessions where id = s.table_session_id;
  update public.promotion_redemptions set status = 'cancelled', updated_at = now() where bill_share_id = s.id and status = 'reserved';
  perform private.coupon_assert_valid(p, v_model, auth.uid(), s.base_cents);
  v_disc := private.share_set_coupon(s.id, p, auth.uid());
  if v_disc <= 0 then raise exception 'Este cupom não vale para o que você pediu' using errcode = 'P0017'; end if;
  select * into s from public.bill_shares where id = p_share_id;
  return jsonb_build_object('shareId', s.id, 'discountCents', v_disc, 'feeCents', s.service_fee_cents, 'amountCents', s.amount_cents, 'couponTitle', p.title);
end $$;
revoke all on function public.customer_apply_coupon(uuid, text) from public, anon;
grant execute on function public.customer_apply_coupon(uuid, text) to authenticated;

create or replace function public.customer_remove_coupon(p_share_id uuid)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare s public.bill_shares; v_none public.promotions;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select * into s from public.bill_shares where id = p_share_id for update;
  if s.id is null or not private.share_payer_allowed(s, auth.uid()) then raise exception 'Parcela não encontrada' using errcode = 'P0002'; end if;
  if s.status <> 'open' then raise exception 'Parcela não está aberta' using errcode = 'P0001'; end if;
  perform private.share_set_coupon(s.id, v_none, auth.uid());
  select * into s from public.bill_shares where id = p_share_id;
  return jsonb_build_object('shareId', s.id, 'amountCents', s.amount_cents);
end $$;
revoke all on function public.customer_remove_coupon(uuid) from public, anon;
grant execute on function public.customer_remove_coupon(uuid) to authenticated;

-- Pedido pago antes do preparo: o desconto sai do total do pedido, antes da cobrança.
create or replace function private.coupon_order_set(p_order public.orders, p public.promotions, p_user uuid)
returns bigint language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_gross bigint := p_order.total_cents + p_order.coupon_discount_cents; v_disc bigint;
begin
  v_disc := private.coupon_discount_cents(p, null, p_order.id, v_gross);
  update public.promotion_redemptions set status = 'cancelled', updated_at = now() where order_id = p_order.id and status = 'reserved';
  update public.orders set coupon_id = p.id, coupon_discount_cents = v_disc, total_cents = v_gross - v_disc,
      discount_cents = coalesce(discount_cents, 0) - p_order.coupon_discount_cents + v_disc,
      discount_amount = (coalesce(discount_cents, 0) - p_order.coupon_discount_cents + v_disc)::numeric / 100,
      total_amount = (v_gross - v_disc)::numeric / 100, updated_at = now()
    where id = p_order.id;
  if v_disc > 0 then
    insert into public.promotion_redemptions(promotion_id, user_id, order_id, discount_cents, status) values (p.id, p_user, p_order.id, v_disc, 'reserved');
    update public.promotions set first_used_at = coalesce(first_used_at, now()) where id = p.id;
  end if;
  return v_disc;
end $$;
revoke all on function private.coupon_order_set(public.orders, public.promotions, uuid) from public, anon, authenticated;

create or replace function private.coupon_order_auto(p_order public.orders)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare p public.promotions; v_best public.promotions; v_best_cents bigint := 0; v bigint;
begin
  if p_order.coupon_id is not null then return; end if;
  for p in select * from public.promotions x where x.restaurant_id = p_order.restaurant_id and x.is_auto and x.status = 'active' and x.discount_kind is not null for update loop
    continue when private.coupon_refusal(p, p_order.service_model::text, p_order.customer_id, p_order.total_cents) is not null;
    v := private.coupon_discount_cents(p, null, p_order.id, p_order.total_cents);
    if v > v_best_cents then v_best := p; v_best_cents := v; end if;
  end loop;
  if v_best.id is not null then perform private.coupon_order_set(p_order, v_best, p_order.customer_id); end if;
end $$;
revoke all on function private.coupon_order_auto(public.orders) from public, anon, authenticated;

create or replace function public.customer_apply_coupon_to_order(p_order_id uuid, p_code text)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare o public.orders; p public.promotions; v bigint;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select * into o from public.orders where id = p_order_id and customer_id = auth.uid() for update;
  if o.id is null then raise exception 'Pedido não encontrado' using errcode = 'P0002'; end if;
  if o.payment_status = 'confirmed' then raise exception 'Este pedido já foi pago' using errcode = 'P0001'; end if;
  p := private.coupon_for_code(o.restaurant_id, p_code);
  if o.coupon_id = p.id then return jsonb_build_object('orderId', o.id, 'discountCents', o.coupon_discount_cents, 'totalCents', o.total_cents, 'couponTitle', p.title); end if;
  update public.promotion_redemptions set status = 'cancelled', updated_at = now() where order_id = o.id and status = 'reserved';
  perform private.coupon_assert_valid(p, o.service_model::text, auth.uid(), o.total_cents + o.coupon_discount_cents);
  v := private.coupon_order_set(o, p, auth.uid());
  if v <= 0 then raise exception 'Este cupom não vale para o que você pediu' using errcode = 'P0017'; end if;
  select * into o from public.orders where id = p_order_id;
  return jsonb_build_object('orderId', o.id, 'discountCents', v, 'totalCents', o.total_cents, 'couponTitle', p.title);
end $$;
revoke all on function public.customer_apply_coupon_to_order(uuid, text) from public, anon;
grant execute on function public.customer_apply_coupon_to_order(uuid, text) to authenticated;

-- Cupons marcados como visíveis aparecem na página do restaurante.
create or replace function public.customer_list_visible_coupons(p_restaurant_id uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('code', p.code, 'title', p.title, 'description', p.description, 'validUntil', p.valid_until) order by p.valid_until), '[]'::jsonb)
  from public.promotions p where p.restaurant_id = p_restaurant_id and p.is_visible and p.status = 'active' and p.discount_kind is not null and now() between p.valid_from and p.valid_until
$$;
revoke all on function public.customer_list_visible_coupons(uuid) from public, anon;
grant execute on function public.customer_list_visible_coupons(uuid) to authenticated;

drop function public.restaurant_record_bill_payment(uuid, text, uuid, bigint, boolean, bigint, text, text);
create function public.restaurant_record_bill_payment(
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
  insert into public.bill_shares(restaurant_id, table_session_id, participant_id, round_no, mode, base_cents, service_fee_cents, amount_cents,
      tip_cents, tip_recipient_kind, tip_recipient_user_id, status, committed_by, paid_at, fee_waived_by, fee_waived_at, fee_waived_reason)
    values (v_session.restaurant_id, p_table_session_id, null,
      (select coalesce(max(round_no), 0) + 1 from public.bill_shares where table_session_id = p_table_session_id),
      'fixed_amount', v_base, v_fee, v_base - v_discount + v_fee, v_tip, v_kind, v_waiter, 'paid', auth.uid(), now(),
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
    update public.bill_shares set coupon_id = v_coupon.id, coupon_discount_cents = v_discount where id = v_share;
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
revoke all on function public.restaurant_record_bill_payment(uuid, text, uuid, bigint, boolean, bigint, text, text, text) from public, anon;
grant execute on function public.restaurant_record_bill_payment(uuid, text, uuid, bigint, boolean, bigint, text, text, text) to authenticated;

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
  from (select g.payment_method as method, sum(b.amount_cents)::bigint as cents
        from public.bill_shares b join public.gateway_transactions g on g.id = b.payment_id
        where b.table_session_id = p_session and b.status = 'paid' group by g.payment_method) m;
  insert into public.fiscal_documents(restaurant_id, table_session_id, external_ref, total_cents, snapshot)
  values (s.restaurant_id, p_session, 's-' || p_session, t.base_all - v_coupon,
    jsonb_build_object('lines', v_lines, 'payments', coalesce(v_payments, '[]'::jsonb)))
  on conflict (external_ref) do update set total_cents = excluded.total_cents, snapshot = excluded.snapshot,
      status = 'pending', attempts = 0, next_attempt_at = now(), error_code = null, error_message = null, updated_at = now()
    where fiscal_documents.status = 'blocked' and fiscal_documents.error_code = 'enqueue_failed'
  returning id into v_id;
  return v_id;
end $$;

create or replace function private.fiscal_paid_cents(p_type text, p_id uuid)
returns bigint language sql stable security definer set search_path = public, private, pg_temp as $$
  select case p_type
    when 'table_session' then (
      select case when bool_or(g.provider = 'simulated') then 0 else coalesce(sum(b.base_cents - b.coupon_discount_cents), 0) end
      from public.bill_shares b join public.gateway_transactions g on g.id = b.payment_id
      where b.table_session_id = p_id and b.status = 'paid')
    else (
      select case when bool_or(g.provider = 'simulated') then 0 else coalesce(sum(g.amount_cents - g.tip_cents - g.convenience_cents), 0) end
      from public.orders o join public.gateway_transactions g on g.order_id = o.id and g.status = 'completed'
      where o.id = p_id and o.payment_status = 'confirmed' and o.status::text <> 'cancelled')
  end::bigint
$$;

create or replace function public.service_payment_reserve_order(
  p_user_id uuid, p_order_id uuid, p_payment_method text, p_idempotency_key uuid,
  p_tip_bps integer default 0, p_tip_cents bigint default 0
) returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  v_order public.orders; v_tx public.gateway_transactions; v_acct public.restaurant_payment_accounts;
  v_policy public.restaurant_model_policies; v_key text; v_expires timestamptz; v_tip bigint; v_amount bigint; v_conv bigint;
begin
  if p_user_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_idempotency_key is null then raise exception 'Idempotency key required' using errcode = '22023'; end if;
  if p_payment_method not in ('pix', 'credit_card') then
    raise exception 'Forma de pagamento inválida' using errcode = '22023';
  end if;
  v_key := 'order-payment:' || p_user_id || ':' || p_idempotency_key;
  perform pg_advisory_xact_lock(hashtextextended(v_key, 0));

  select * into v_tx from public.gateway_transactions where idempotency_key = v_key and customer_id = p_user_id;
  if v_tx.id is null then
    select * into v_order from public.orders where id = p_order_id and customer_id = p_user_id for update;
    if v_order.id is null then raise exception 'Pedido não encontrado' using errcode = 'P0002'; end if;
    if v_order.fulfillment_status in ('cancelled', 'not_picked_up') or v_order.payment_status = 'failed' then
      raise exception 'Este pedido foi cancelado e não aceita mais pagamento' using errcode = 'P0001';
    end if;
    if v_order.payment_status = 'confirmed' then
      return jsonb_build_object('orderId', v_order.id, 'paymentStatus', v_order.payment_status,
        'alreadyPaid', true, 'idempotentReplay', true);
    end if;
    if v_order.total_cents is null or v_order.total_cents <= 0 then
      raise exception 'Total inválido' using errcode = '23514'; end if;

    perform private.coupon_order_auto(v_order);
    select * into v_order from public.orders where id = v_order.id;
    v_tip := private.order_tip_cents(v_order, p_tip_bps, p_tip_cents);
    v_conv := private.order_convenience_set(v_order);
    v_amount := v_order.total_cents + v_tip + v_conv;

    -- Pix ainda válido para o mesmo pedido e o mesmo valor: reaproveita em vez de gerar outro.
    if p_payment_method = 'pix' then
      select * into v_tx from public.gateway_transactions
        where order_id = v_order.id and payment_method = 'pix' and provider = 'asaas' and amount_cents = v_amount
          and status in ('creating', 'pending') and (expires_at is null or expires_at > now())
        order by created_at desc limit 1;
    end if;

    if v_tx.id is null then
      select * into v_acct from public.restaurant_payment_accounts
        where restaurant_id = v_order.restaurant_id and status = 'active';
      if v_acct.id is null then
        raise exception 'Pagamento online indisponível neste restaurante' using errcode = 'P0007';
      end if;
      select * into v_policy from public.restaurant_model_policies
        where restaurant_id = v_order.restaurant_id and service_model = v_order.service_model;
      if p_payment_method = 'pix' and v_policy.pix_expiry_min is not null then
        v_expires := now() + make_interval(mins => v_policy.pix_expiry_min);
      end if;
      perform private.assert_online_minimum(v_amount);

      insert into public.gateway_transactions(
        restaurant_id, order_id, customer_id, provider, payment_method, amount_cents, tip_cents, convenience_cents,
        refunded_amount_cents, status, idempotency_key, purpose, payment_account_id,
        platform_fee_cents, expires_at, metadata, created_at, updated_at)
      values (
        v_order.restaurant_id, v_order.id, p_user_id, 'asaas', p_payment_method, v_amount, v_tip, v_conv,
        0, 'creating', v_key, 'order', v_acct.id, null, v_expires,
        jsonb_build_object('service_model', v_order.service_model), now(), now())
      returning * into v_tx;
      perform private.noowe_pay_freeze_fee(v_tx);

      -- Pedido que só entra em produção pago expira junto com o Pix.
      if coalesce(v_policy.prepaid_required, false) and v_expires is not null then
        update public.orders set payment_expires_at = v_expires, updated_at = now() where id = v_order.id;
      end if;
    end if;
  end if;

  select * into v_acct from public.restaurant_payment_accounts where id = v_tx.payment_account_id;
  return jsonb_build_object(
    'paymentId', v_tx.id, 'orderId', v_tx.order_id, 'restaurantId', v_tx.restaurant_id,
    'provider', v_tx.provider, 'method', v_tx.payment_method, 'status', v_tx.status,
    'amountCents', v_tx.amount_cents,
    'providerRef', v_tx.provider_ref, 'checkoutUrl', v_tx.checkout_url, 'pixPayload', v_tx.pix_payload,
    'expiresAt', v_tx.expires_at, 'paymentAccountId', v_tx.payment_account_id,
    'walletId', v_acct.wallet_id, 'alreadyPaid', false, 'idempotentReplay', v_tx.provider_ref is not null);
end $$;

create or replace function public.customer_start_payment_simulated(
  p_order_id uuid, p_payment_method text, p_idempotency_key uuid,
  p_tip_bps integer default 0, p_tip_cents bigint default 0
) returns jsonb language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare v_order public.orders; v_tx public.gateway_transactions; v_result jsonb; v_key text;
  v_pix_min integer; v_async boolean; v_tip bigint; v_conv bigint;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_idempotency_key is null then raise exception 'Idempotency key required' using errcode = '22023'; end if;
  if p_payment_method not in ('pix','credit','credit_card','debit_card','apple','apple_pay','google','google_pay','tap','tap_to_pay','wallet') then
    raise exception 'Forma de pagamento inválida' using errcode = '22023';
  end if;
  v_key := 'order-payment:' || auth.uid() || ':' || p_idempotency_key;
  perform pg_advisory_xact_lock(hashtextextended(v_key,0));
  select * into v_tx from public.gateway_transactions where idempotency_key = v_key;
  if v_tx.id is not null then
    select * into v_order from public.orders where id = v_tx.order_id;
    return jsonb_build_object('transactionId',v_tx.id,'orderId',v_order.id,
      'paymentStatus',v_order.payment_status,'fulfillmentStatus',v_order.fulfillment_status,
      'paymentExpiresAt',v_order.payment_expires_at,
      'pixCode',case when v_tx.payment_method = 'pix' and v_order.payment_status = 'pending'
        then 'noowe-pix-' || v_tx.id::text end,
      'idempotentReplay',true);
  end if;
  select * into v_order from public.orders where id = p_order_id and customer_id = auth.uid() for update;
  if v_order.id is null then raise exception 'Pedido não encontrado' using errcode = 'P0002'; end if;
  if v_order.service_model = 'quick_service' then
    perform private.quick_service_sweep(v_order.restaurant_id);
    select * into v_order from public.orders where id = p_order_id for update;
  end if;
  if v_order.fulfillment_status in ('cancelled', 'not_picked_up') or v_order.payment_status = 'failed' then
    raise exception 'Este pedido foi cancelado e não aceita mais pagamento' using errcode = 'P0001';
  end if;
  if v_order.payment_status = 'confirmed' then
    return jsonb_build_object('orderId',v_order.id,'paymentStatus',v_order.payment_status,
      'fulfillmentStatus',v_order.fulfillment_status,'idempotentReplay',true);
  end if;
  if v_order.total_cents is null or v_order.total_cents < 0 then raise exception 'Total inválido' using errcode = '23514'; end if;

  perform private.coupon_order_auto(v_order);
  select * into v_order from public.orders where id = v_order.id;
  v_tip := private.order_tip_cents(v_order, p_tip_bps, p_tip_cents);
  v_conv := private.order_convenience_set(v_order);
  v_async := v_order.service_model = 'quick_service' and p_payment_method = 'pix';
  if v_async then
    -- Pix já gerado e ainda válido para este pedido: reaproveita.
    select * into v_tx from public.gateway_transactions
      where order_id = v_order.id and payment_method = 'pix' and status = 'pending' and amount_cents = v_order.total_cents + v_tip + v_conv
      order by created_at desc limit 1;
    if v_tx.id is not null then
      return jsonb_build_object('transactionId',v_tx.id,'orderId',v_order.id,'paymentStatus','pending',
        'fulfillmentStatus',v_order.fulfillment_status,'paymentExpiresAt',v_order.payment_expires_at,
        'pixCode','noowe-pix-' || v_tx.id::text,'simulated',true,'idempotentReplay',true);
    end if;
  end if;

  insert into public.gateway_transactions(
    restaurant_id,order_id,customer_id,provider,payment_method,amount,amount_cents,tip_cents,convenience_cents,
    refunded_amount_cents,status,idempotency_key,metadata,created_at,updated_at
  ) values (
    v_order.restaurant_id,v_order.id,auth.uid(),'simulated',p_payment_method,
    (v_order.total_cents + v_tip + v_conv)::numeric/100,v_order.total_cents + v_tip + v_conv,v_tip,v_conv,0,'pending',v_key,
    jsonb_build_object('service_model',v_order.service_model,'simulated',true),now(),now()
  ) returning * into v_tx;

  if v_async then
    select pix_expiry_min into v_pix_min from public.restaurant_model_policies
      where restaurant_id = v_order.restaurant_id and service_model = 'quick_service';
    update public.orders set payment_expires_at = now() + make_interval(mins => v_pix_min), updated_at = now()
      where id = v_order.id returning * into v_order;
    return jsonb_build_object('transactionId',v_tx.id,'orderId',v_order.id,'paymentStatus','pending',
      'fulfillmentStatus',v_order.fulfillment_status,'paymentExpiresAt',v_order.payment_expires_at,
      'pixCode','noowe-pix-' || v_tx.id::text,'simulated',true,'idempotentReplay',false);
  end if;

  -- The simulated provider adapter is synchronous, but confirmation still
  -- enters through the same private, idempotent event boundary as a webhook.
  v_result := private.process_simulated_payment_event(v_tx.id,'simulated:' || v_tx.id,'confirmed');
  return v_result || jsonb_build_object('simulated',true);
end $$;

-- ---------------------------------------------------------------------------
-- 3. O restaurante cria e acompanha
-- ---------------------------------------------------------------------------
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
  if v_code = '' then v_code := upper(substr(md5(gen_random_uuid()::text), 1, 8)); end if;
  if nullif(btrim(coalesce(p_coupon->>'title', '')), '') is null then raise exception 'Dê um nome ao cupom' using errcode = '22023'; end if;
  if (p_coupon->>'validFrom') is null or (p_coupon->>'validUntil') is null or (p_coupon->>'validUntil')::timestamptz <= (p_coupon->>'validFrom')::timestamptz then raise exception 'Confira as datas' using errcode = '22023'; end if;
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
revoke all on function public.restaurant_upsert_coupon(uuid, jsonb) from public, anon;
grant execute on function public.restaurant_upsert_coupon(uuid, jsonb) to authenticated;

create or replace function public.restaurant_set_coupon_active(p_coupon_id uuid, p_active boolean)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_restaurant uuid;
begin
  select restaurant_id into v_restaurant from public.promotions where id = p_coupon_id;
  if v_restaurant is null then raise exception 'Cupom não encontrado' using errcode = 'P0002'; end if;
  perform private.require_restaurant_role(v_restaurant, array['owner','manager']::public.user_roles_role_enum[]);
  update public.promotions set status = case when p_active then 'active' else 'inactive' end, updated_at = now() where id = p_coupon_id;
  perform private.log_audit(v_restaurant, 'coupon.status_changed', 'promotion', p_coupon_id, case when p_active then 'Cupom ativado' else 'Cupom desativado' end, null, null);
end $$;
revoke all on function public.restaurant_set_coupon_active(uuid, boolean) from public, anon;
grant execute on function public.restaurant_set_coupon_active(uuid, boolean) to authenticated;

-- Relatório de cupons: usos e desconto dado.
create or replace function public.restaurant_list_coupons(p_restaurant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner','manager','maitre','waiter']::public.user_roles_role_enum[]);
  return coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'code', p.code, 'title', p.title, 'status', p.status, 'discountKind', p.discount_kind, 'discountBps', p.discount_bps, 'discountCents', p.discount_cents,
      'freeItemId', p.free_item_id, 'minOrderCents', p.min_order_cents, 'services', to_jsonb(p.services), 'scope', p.scope, 'dow', to_jsonb(p.dow), 'hoursFrom', p.hours_from, 'hoursUntil', p.hours_until,
      'audience', p.audience, 'inactiveDays', p.inactive_days, 'maxUses', p.max_uses, 'maxUsesPerUser', p.max_uses_per_user, 'validFrom', p.valid_from, 'validUntil', p.valid_until, 'isAuto', p.is_auto, 'isVisible', p.is_visible,
      'locked', p.first_used_at is not null,
      'uses', (select count(*) from public.promotion_redemptions r where r.promotion_id = p.id and r.status = 'applied'),
      'discountGivenCents', (select coalesce(sum(r.discount_cents), 0) from public.promotion_redemptions r where r.promotion_id = p.id and r.status = 'applied')) order by p.created_at desc)
    from public.promotions p where p.restaurant_id = p_restaurant_id and p.discount_kind is not null), '[]'::jsonb);
end $$;
revoke all on function public.restaurant_list_coupons(uuid) from public, anon;
grant execute on function public.restaurant_list_coupons(uuid) to authenticated;

-- Envio a um grupo da ficha, só para quem aceitou receber ofertas.
create or replace function public.restaurant_send_coupon(p_coupon_id uuid)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare p public.promotions; v_user uuid; v_n integer := 0;
begin
  select * into p from public.promotions where id = p_coupon_id;
  if p.id is null then raise exception 'Cupom não encontrado' using errcode = 'P0002'; end if;
  perform private.require_restaurant_role(p.restaurant_id, array['owner','manager']::public.user_roles_role_enum[]);
  for v_user in
    select distinct u.id from public.profiles u
    where u.marketing_consent and (u.id in (select customer_id from public.orders where restaurant_id = p.restaurant_id and customer_id is not null)
      or u.id in (select user_id from public.customer_profiles where restaurant_id = p.restaurant_id))
  loop
    continue when not private.customer_in_group(p.restaurant_id, v_user, p.audience, p.inactive_days);
    perform private.create_notification(v_user, p.title, coalesce(p.description, 'Use o cupom ' || p.code || '.'), 'system', p.id, null,
      jsonb_build_object('kind', 'restaurant_coupon', 'restaurant_id', p.restaurant_id, 'code', p.code));
    v_n := v_n + 1;
  end loop;
  perform private.log_audit(p.restaurant_id, 'coupon.sent', 'promotion', p.id, 'Cupom enviado a um grupo', null, jsonb_build_object('recipients', v_n));
  return jsonb_build_object('recipients', v_n);
end $$;
revoke all on function public.restaurant_send_coupon(uuid) from public, anon;
grant execute on function public.restaurant_send_coupon(uuid) to authenticated;
