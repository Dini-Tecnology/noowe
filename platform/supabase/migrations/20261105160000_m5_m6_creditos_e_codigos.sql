-- M5 e M6: Créditos NOOWE Pay e códigos promocionais. Quanto mais se recebe pelo app, mais crédito abate da mensalidade.
-- Razão imutável, separado da compensação de M2. O crédito não vira dinheiro e some ao cancelar.

alter table private.noowe_credit_settings add column min_invoice_cents bigint not null default 0 check (min_invoice_cents >= 0);

create table private.noowe_credit_month_close (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  month date not null,
  paid_cents bigint not null,
  revenue_cents bigint not null,
  index_bps integer not null,
  tier_code text,
  credit_cents bigint not null,
  closed_at timestamptz not null default now(),
  primary key (restaurant_id, month)
);
create table private.noowe_credit_lots (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  month date not null,
  tier_code text not null,
  amount_cents bigint not null check (amount_cents > 0),
  remaining_cents bigint not null check (remaining_cents >= 0),
  available_from date not null,
  expires_at date not null,
  release_notified boolean not null default false,
  expiry_notified boolean not null default false,
  created_at timestamptz not null default now(),
  unique (restaurant_id, month)
);
create table private.noowe_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  lot_id uuid references private.noowe_credit_lots(id) on delete set null,
  kind text not null check (kind in ('generated', 'used', 'expired', 'lost')),
  amount_cents bigint not null,
  invoice_id uuid references public.subscription_invoices(id) on delete set null,
  created_at timestamptz not null default now()
);
create index noowe_credit_ledger_restaurant_idx on private.noowe_credit_ledger(restaurant_id, created_at desc);
create or replace function private.credit_ledger_immutable() returns trigger language plpgsql as $$
begin raise exception 'O razão de créditos é imutável' using errcode = '42501'; end $$;
revoke all on function private.credit_ledger_immutable() from public, anon, authenticated;
create trigger noowe_credit_ledger_immutable before update or delete on private.noowe_credit_ledger for each row execute function private.credit_ledger_immutable();
do $$
declare t text;
begin
  foreach t in array array['noowe_credit_month_close', 'noowe_credit_lots', 'noowe_credit_ledger'] loop
    execute format('alter table private.%I enable row level security', t);
    execute format('revoke all on private.%I from public, anon, authenticated, service_role', t);
  end loop;
end $$;

-- Índice = pago pelo app (cartão e Pix) ÷ faturamento registrado. Vale fica fora dos dois lados. Tap, só com o parâmetro. Estorno e contestação saem.
create or replace function private.credit_figures(p_restaurant uuid, p_from timestamptz, p_to timestamptz, out paid_cents bigint, out revenue_cents bigint, out index_bps integer)
language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare v_tap boolean := coalesce((select tap_counts_for_index from private.noowe_credit_settings), false);
begin
  select coalesce(sum(g.amount_cents - g.refunded_amount_cents) filter (where (g.provider = 'asaas' and g.payment_method in ('pix', 'credit_card')) or (v_tap and g.provider = 'tap')), 0)::bigint,
         coalesce(sum(g.amount_cents - g.refunded_amount_cents), 0)::bigint
    into paid_cents, revenue_cents
  from public.gateway_transactions g
  left join private.noowe_pay_transaction_fees f on f.gateway_transaction_id = g.id
  where g.restaurant_id = p_restaurant and g.status = 'completed' and g.provider <> 'simulated' and g.payment_method <> 'voucher'
    and f.chargeback_at is null
    and coalesce(g.confirmed_at, g.created_at) >= p_from and coalesce(g.confirmed_at, g.created_at) < p_to;
  index_bps := case when revenue_cents > 0 then div(paid_cents * 10000, revenue_cents)::integer else 0 end;
end $$;
revoke all on function private.credit_figures(uuid, timestamptz, timestamptz) from public, anon, authenticated;

-- Faixa do índice, se o volume mínimo do plano foi atingido.
create or replace function private.credit_tier(p_plan text, p_paid bigint, p_index integer, out tier_code text, out credit_bps integer)
language sql stable security definer set search_path = private, pg_temp as $$
  select t.code, t.credit_bps from private.noowe_credit_tiers t
  where t.min_index_bps <= p_index and p_paid >= coalesce((select m.min_volume_cents from private.noowe_credit_plan_minimums m where m.plan_code = p_plan), 0)
  order by t.min_index_bps desc limit 1
$$;
revoke all on function private.credit_tier(text, bigint, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Códigos promocionais
-- ---------------------------------------------------------------------------
create table private.noowe_promo_code_phases (
  code text not null references private.noowe_promo_codes(code) on update cascade on delete cascade,
  phase_order integer not null,
  kind text not null check (kind in ('free_months', 'percent_off', 'fixed_off')),
  duration_months integer not null check (duration_months > 0),
  percent_off_bps integer check (percent_off_bps between 1 and 10000),
  amount_off_cents bigint check (amount_off_cents > 0),
  primary key (code, phase_order)
);
alter table private.noowe_promo_codes add column skips_trial boolean not null default false, add column grants_category text;
alter table public.restaurants add column noowe_category text;

create table private.noowe_promo_redemptions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  code text not null references private.noowe_promo_codes(code) on update cascade,
  applied_by uuid references public.profiles(id) on delete set null,
  applied_at timestamptz not null default now(),
  started_at timestamptz,
  status text not null default 'active' check (status in ('active', 'ended'))
);
create unique index noowe_promo_one_active on private.noowe_promo_redemptions(restaurant_id) where status = 'active';
create unique index noowe_promo_one_per_code on private.noowe_promo_redemptions(restaurant_id, code);
do $$
declare t text;
begin
  foreach t in array array['noowe_promo_code_phases', 'noowe_promo_redemptions'] loop
    execute format('alter table private.%I enable row level security', t);
    execute format('revoke all on private.%I from public, anon, authenticated, service_role', t);
  end loop;
  execute 'create trigger trg_noowe_promo_code_phases_history after insert or update or delete on private.noowe_promo_code_phases
    for each row execute function private.noowe_param_record_change()';
end $$;

-- As fases do código, em ordem; sem fases próprias, ele é uma fase só.
create or replace function private.promo_phases(p_code text)
returns table(phase_order integer, kind text, duration_months integer, percent_off_bps integer, amount_off_cents bigint, starts_month integer)
language sql stable security definer set search_path = private, pg_temp as $$
  with raw as (
    select f.phase_order, f.kind, f.duration_months, f.percent_off_bps, f.amount_off_cents from private.noowe_promo_code_phases f where f.code = p_code
    union all
    select 1, c.kind, c.duration_months, c.percent_off_bps, c.amount_off_cents from private.noowe_promo_codes c
      where c.code = p_code and not exists (select 1 from private.noowe_promo_code_phases f where f.code = p_code))
  select r.phase_order, r.kind, r.duration_months, r.percent_off_bps, r.amount_off_cents,
    (coalesce(sum(r.duration_months) over (order by r.phase_order rows between unbounded preceding and 1 preceding), 0))::integer
  from raw r order by r.phase_order
$$;
revoke all on function private.promo_phases(text) from public, anon, authenticated;

-- A fase vigente em uma data. Nula: benefício acabou ou ainda não começou.
create or replace function private.promo_current_phase(p_redemption private.noowe_promo_redemptions, p_at timestamptz)
returns table(kind text, percent_off_bps integer, amount_off_cents bigint)
language sql stable security definer set search_path = private, pg_temp as $$
  select f.kind, f.percent_off_bps, f.amount_off_cents from private.promo_phases(p_redemption.code) f
  where p_redemption.started_at is not null
    and (extract(year from age(p_at, p_redemption.started_at)) * 12 + extract(month from age(p_at, p_redemption.started_at)))::integer >= f.starts_month
    and (extract(year from age(p_at, p_redemption.started_at)) * 12 + extract(month from age(p_at, p_redemption.started_at)))::integer < f.starts_month + f.duration_months
  limit 1
$$;
revoke all on function private.promo_current_phase(private.noowe_promo_redemptions, timestamptz) from public, anon, authenticated;

create or replace function private.promo_status(p_restaurant uuid)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare r private.noowe_promo_redemptions; v_months integer; v_plan text; v_cycle text;
begin
  select * into r from private.noowe_promo_redemptions where restaurant_id = p_restaurant and status = 'active';
  if r.id is null then return null; end if;
  select coalesce(sum(duration_months), 0) into v_months from private.promo_phases(r.code);
  select plan_code, billing_cycle into v_plan, v_cycle from public.restaurant_subscriptions where restaurant_id = p_restaurant;
  return jsonb_build_object('code', r.code,
    'endsAt', case when r.started_at is not null then r.started_at + make_interval(months => v_months) end,
    'startsWithFirstInvoice', r.started_at is null,
    'priceAfterCents', private.plan_period_price(p_restaurant, v_plan, v_cycle));
end $$;
revoke all on function private.promo_status(uuid) from public, anon, authenticated;

-- Só o Dono aplica. Aplicar duas vezes não duplica. Um código por restaurante por vez, e o uso não passa do limite, mesmo em simultâneo.
create or replace function public.restaurant_apply_promo_code(p_restaurant_id uuid, p_code text)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare c private.noowe_promo_codes; s public.restaurant_subscriptions; v_code text := upper(btrim(coalesce(p_code, ''))); v_used integer; r private.noowe_promo_redemptions;
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner']::public.user_roles_role_enum[]);
  select * into c from private.noowe_promo_codes where code = v_code and is_active for update;
  if c.code is null then raise exception 'Código inválido' using errcode = 'P0016'; end if;
  select * into r from private.noowe_promo_redemptions where restaurant_id = p_restaurant_id and code = v_code;
  if r.id is not null then return public.restaurant_get_plan_summary(p_restaurant_id); end if;
  if exists (select 1 from private.noowe_promo_redemptions x where x.restaurant_id = p_restaurant_id and x.status = 'active') then
    raise exception 'Já há um código em uso neste restaurante' using errcode = 'P0016'; end if;
  if (c.valid_from is not null and now() < c.valid_from) or (c.valid_until is not null and now() > c.valid_until) then
    raise exception 'Este código está fora da validade' using errcode = 'P0016'; end if;
  select count(*) into v_used from private.noowe_promo_redemptions where code = v_code;
  if c.max_uses is not null and v_used >= c.max_uses then raise exception 'Este código já atingiu o limite de usos' using errcode = 'P0016'; end if;
  select * into s from public.restaurant_subscriptions where restaurant_id = p_restaurant_id;
  if s.restaurant_id is null or s.status = 'canceled' then raise exception 'Escolha um plano primeiro' using errcode = 'P0016'; end if;
  if c.plan_codes is not null and cardinality(c.plan_codes) > 0 and not s.plan_code = any(c.plan_codes) then raise exception 'Este código não vale para o seu plano' using errcode = 'P0016'; end if;
  if (s.billing_cycle = 'monthly' and not c.allow_monthly) or (s.billing_cycle = 'annual' and not c.allow_annual) then
    raise exception 'Este código não vale para este ciclo de cobrança' using errcode = 'P0016'; end if;
  if c.new_restaurants_only and exists (select 1 from public.subscription_invoices i where i.restaurant_id = p_restaurant_id) then
    raise exception 'Este código é só para restaurantes novos' using errcode = 'P0016'; end if;
  insert into private.noowe_promo_redemptions(restaurant_id, code, applied_by, started_at)
    values (p_restaurant_id, v_code, auth.uid(), case when s.status <> 'trial' or c.skips_trial then now() end) returning * into r;
  if c.grants_category is not null then update public.restaurants set noowe_category = c.grants_category where id = p_restaurant_id; end if;
  perform private.log_audit(p_restaurant_id, 'plan.promo_applied', 'restaurant_subscription', p_restaurant_id, 'Código promocional aplicado', null, jsonb_build_object('code', v_code));
  -- Código de fundador dispensa o teste: a primeira fatura já sai, com o benefício.
  if c.skips_trial and s.status = 'trial' then
    update public.restaurant_subscriptions set current_period_end = now() where restaurant_id = p_restaurant_id returning * into s;
    perform private.subscription_renew(s);
  end if;
  return public.restaurant_get_plan_summary(p_restaurant_id);
end $$;
revoke all on function public.restaurant_apply_promo_code(uuid, text) from public, anon;
grant execute on function public.restaurant_apply_promo_code(uuid, text) to authenticated;

create or replace function private.invoice_apply_promo(p_invoice uuid, p_restaurant uuid, p_plan_cents bigint)
returns bigint language plpgsql security definer set search_path = public, private, pg_temp as $$
declare r private.noowe_promo_redemptions; f record; v bigint := 0; v_months integer; v_kind text; v_billed date;
begin
  if p_plan_cents <= 0 then return 0; end if;
  select kind into v_kind from public.subscription_invoices where id = p_invoice;
  if v_kind <> 'renewal' then return 0; end if;
  select * into r from private.noowe_promo_redemptions where restaurant_id = p_restaurant and status = 'active' for update;
  if r.id is null then return 0; end if;
  if r.started_at is null then
    update private.noowe_promo_redemptions set started_at = now() where id = r.id returning * into r;
  end if;
  select * into f from private.promo_current_phase(r, now());
  if f.kind is not null then
    v := case f.kind when 'free_months' then p_plan_cents
      when 'percent_off' then div(p_plan_cents * f.percent_off_bps + 5000, 10000)::bigint
      else least(p_plan_cents, f.amount_off_cents) end;
  end if;
  select coalesce(sum(duration_months), 0) into v_months from private.promo_phases(r.code);
  if now() >= r.started_at + make_interval(months => v_months) then
    update private.noowe_promo_redemptions set status = 'ended' where id = r.id;
  end if;
  if v > 0 then
    insert into public.subscription_invoice_lines(invoice_id, restaurant_id, kind, description, amount_cents)
      values (p_invoice, p_restaurant, 'promo', 'Código promocional ' || r.code, -v);
  end if;
  return v;
end $$;

-- Durante a isenção total o restaurante não gera crédito. Nos descontos parciais, gera normalmente.
create or replace function private.promo_free_during(p_restaurant uuid, p_at timestamptz)
returns boolean language plpgsql stable security definer set search_path = private, pg_temp as $$
declare r private.noowe_promo_redemptions; v text;
begin
  select * into r from private.noowe_promo_redemptions where restaurant_id = p_restaurant and status = 'active';
  if r.id is null then return false; end if;
  select kind into v from private.promo_current_phase(r, p_at);
  return v = 'free_months';
end $$;
revoke all on function private.promo_free_during(uuid, timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Créditos: fechamento e uso
-- ---------------------------------------------------------------------------
create or replace function private.credit_tick()
returns integer language plpgsql security definer set search_path = public, private, pg_temp as $$
declare s public.restaurant_subscriptions; cfg private.noowe_credit_settings; v_month date := date_trunc('month', (now() at time zone 'America/Sao_Paulo') - interval '1 month')::date; v_from timestamptz; v_to timestamptz;
  fig record; tier record; v_terms record; v_credit bigint; v_prev text; v_lot uuid; l private.noowe_credit_lots; v_n integer := 0; v_tier_name text;
begin
  select * into cfg from private.noowe_credit_settings;
  v_from := v_month::timestamp at time zone 'America/Sao_Paulo';
  v_to := (v_month + interval '1 month')::timestamp at time zone 'America/Sao_Paulo';
  for s in select x.* from public.restaurant_subscriptions x where x.status <> 'canceled' and x.created_at <= v_from
      and not exists (select 1 from private.noowe_credit_month_close c where c.restaurant_id = x.restaurant_id and c.month = v_month) loop
    select * into fig from private.credit_figures(s.restaurant_id, v_from, v_to);
    select * into tier from private.credit_tier(s.plan_code, fig.paid_cents, fig.index_bps);
    select * into v_terms from private.plan_terms(s.restaurant_id, s.plan_code);
    v_credit := 0;
    if tier.tier_code is not null and not private.promo_free_during(s.restaurant_id, v_from) then
      v_credit := div(coalesce(v_terms.monthly_cents, 0) * tier.credit_bps + 5000, 10000)::bigint;
    end if;
    select tier_code into v_prev from private.noowe_credit_month_close where restaurant_id = s.restaurant_id and month = (v_month - interval '1 month')::date;
    insert into private.noowe_credit_month_close(restaurant_id, month, paid_cents, revenue_cents, index_bps, tier_code, credit_cents)
      values (s.restaurant_id, v_month, fig.paid_cents, fig.revenue_cents, fig.index_bps, tier.tier_code, v_credit);
    if v_credit > 0 then
      insert into private.noowe_credit_lots(restaurant_id, month, tier_code, amount_cents, remaining_cents, available_from, expires_at)
        values (s.restaurant_id, v_month, tier.tier_code, v_credit, v_credit, (v_month + make_interval(months => cfg.release_after_invoices))::date,
          (v_month + interval '1 month' + make_interval(months => case when s.billing_cycle = 'annual' then cfg.expiry_months_annual else cfg.expiry_months_monthly end))::date)
        returning id into v_lot;
      insert into private.noowe_credit_ledger(restaurant_id, lot_id, kind, amount_cents) values (s.restaurant_id, v_lot, 'generated', v_credit);
      perform private.notify_owner(s.restaurant_id, 'Crédito NOOWE Pay gerado', 'O mês fechou com ' || to_char(v_credit::numeric / 100, 'FM999G990D00') || ' de crédito.', 'credit_generated');
    end if;
    if v_prev is distinct from tier.tier_code and (v_prev is not null or tier.tier_code is not null) then
      select name into v_tier_name from private.noowe_credit_tiers where code = tier.tier_code;
      perform private.notify_owner(s.restaurant_id, 'Sua faixa mudou', coalesce('Agora você está na faixa ' || v_tier_name || '.', 'Neste mês o restaurante ficou sem faixa.'), 'credit_tier_changed');
    end if;
    v_n := v_n + 1;
  end loop;
  for l in select * from private.noowe_credit_lots where remaining_cents > 0 and (
      (not release_notified and available_from <= (now() at time zone 'America/Sao_Paulo')::date)
      or (not expiry_notified and expires_at <= (now() at time zone 'America/Sao_Paulo')::date + 30)
      or expires_at <= (now() at time zone 'America/Sao_Paulo')::date) loop
    if l.expires_at <= (now() at time zone 'America/Sao_Paulo')::date then
      insert into private.noowe_credit_ledger(restaurant_id, lot_id, kind, amount_cents) values (l.restaurant_id, l.id, 'expired', -l.remaining_cents);
      update private.noowe_credit_lots set remaining_cents = 0 where id = l.id;
    else
      if not l.release_notified and l.available_from <= (now() at time zone 'America/Sao_Paulo')::date then
        perform private.notify_owner(l.restaurant_id, 'Crédito liberado', 'Um crédito NOOWE Pay já abate a próxima fatura.', 'credit_released');
        update private.noowe_credit_lots set release_notified = true where id = l.id;
      end if;
      if not l.expiry_notified and l.expires_at <= (now() at time zone 'America/Sao_Paulo')::date + 30 then
        perform private.notify_owner(l.restaurant_id, 'Crédito perto de expirar', 'Um crédito NOOWE Pay expira em até 30 dias.', 'credit_expiring');
        update private.noowe_credit_lots set expiry_notified = true where id = l.id;
      end if;
    end if;
  end loop;
  return v_n;
end $$;
revoke all on function private.credit_tick() from public, anon, authenticated;

-- Abate até o limite de cada fatura, só da mensalidade, depois do código, e sem passar do piso.
create or replace function private.invoice_apply_credits(p_invoice uuid, p_restaurant uuid, p_plan_cents bigint)
returns bigint language plpgsql security definer set search_path = public, private, pg_temp as $$
declare cfg private.noowe_credit_settings; v_cap bigint; v_left bigint; v_used bigint := 0; v_take bigint; l private.noowe_credit_lots; v_kind text;
begin
  if p_plan_cents <= 0 then return 0; end if;
  select kind into v_kind from public.subscription_invoices where id = p_invoice;
  if v_kind <> 'renewal' then return 0; end if;
  select * into cfg from private.noowe_credit_settings;
  v_cap := div(p_plan_cents * cfg.invoice_cap_bps, 10000)::bigint;
  v_left := least(v_cap, greatest(p_plan_cents - cfg.min_invoice_cents, 0));
  for l in select * from private.noowe_credit_lots where restaurant_id = p_restaurant and remaining_cents > 0
      and available_from <= (now() at time zone 'America/Sao_Paulo')::date and expires_at > (now() at time zone 'America/Sao_Paulo')::date order by expires_at, created_at for update loop
    exit when v_left <= 0;
    v_take := least(v_left, l.remaining_cents);
    update private.noowe_credit_lots set remaining_cents = remaining_cents - v_take where id = l.id;
    insert into private.noowe_credit_ledger(restaurant_id, lot_id, kind, amount_cents, invoice_id) values (p_restaurant, l.id, 'used', -v_take, p_invoice);
    v_left := v_left - v_take;
    v_used := v_used + v_take;
  end loop;
  if v_used > 0 then
    insert into public.subscription_invoice_lines(invoice_id, restaurant_id, kind, description, amount_cents)
      values (p_invoice, p_restaurant, 'credit', 'Créditos NOOWE Pay', -v_used);
  end if;
  return v_used;
end $$;

-- Cancelou, perdeu.
create or replace function private.subscription_on_canceled(p_restaurant uuid)
returns void language plpgsql security definer set search_path = private, pg_temp as $$
declare l private.noowe_credit_lots;
begin
  for l in select * from private.noowe_credit_lots where restaurant_id = p_restaurant and remaining_cents > 0 for update loop
    insert into private.noowe_credit_ledger(restaurant_id, lot_id, kind, amount_cents) values (p_restaurant, l.id, 'lost', -l.remaining_cents);
    update private.noowe_credit_lots set remaining_cents = 0 where id = l.id;
  end loop;
  update private.noowe_promo_redemptions set status = 'ended' where restaurant_id = p_restaurant and status = 'active';
end $$;

create or replace function private.engine_tick()
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_id uuid; v_result jsonb := '{}'::jsonb; v_n integer;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('noowe.engine_tick', 0)) then
    return jsonb_build_object('skipped', true);
  end if;
  begin
    v_result := v_result || jsonb_build_object('reservations', private.reservation_expire_sweep(null, null));
  exception when others then raise warning 'engine_tick reservas: %', sqlerrm; end;
  begin
    v_result := v_result || jsonb_build_object('queue', private.queue_expire_sweep(null, null));
  exception when others then raise warning 'engine_tick fila: %', sqlerrm; end;
  v_n := 0;
  for v_id in select distinct restaurant_id from public.restaurant_model_policies where service_model = 'quick_service' loop
    begin
      v_n := v_n + private.quick_service_sweep(v_id);
    exception when others then raise warning 'engine_tick quick %: %', v_id, sqlerrm; end;
  end loop;
  v_result := v_result || jsonb_build_object('quick', v_n);
  v_n := 0;
  for v_id in select distinct restaurant_id from public.table_sessions where status = 'active' loop
    begin
      v_n := v_n + private.session_idle_sweep(v_id);
    exception when others then raise warning 'engine_tick comanda parada %: %', v_id, sqlerrm; end;
  end loop;
  v_result := v_result || jsonb_build_object('idle', v_n);
  begin
    v_result := v_result || jsonb_build_object('credits', private.credit_tick());
  exception when others then raise warning 'engine_tick créditos: %', sqlerrm; end;
  begin
    v_result := v_result || jsonb_build_object('subscriptions', private.subscription_tick());
  exception when others then raise warning 'engine_tick assinaturas: %', sqlerrm; end;
  begin
    v_result := v_result || jsonb_build_object('operationalDays', private.operational_day_tick());
  exception when others then raise warning 'engine_tick dia operacional: %', sqlerrm; end;
  begin
    v_result := v_result || jsonb_build_object('refunds', private.refund_sweep());
  exception when others then raise warning 'engine_tick estornos: %', sqlerrm; end;
  begin
    v_result := v_result || jsonb_build_object('billHolds', private.bill_hold_sweep());
  exception when others then raise warning 'engine_tick reservas de conta: %', sqlerrm; end;
  begin
    v_result := v_result || jsonb_build_object('timeRules', private.engine_time_rules());
  exception when others then raise warning 'engine_tick regras: %', sqlerrm; end;
  begin
    v_result := v_result || jsonb_build_object('pushRetries', private.retry_undelivered_pushes());
  exception when others then raise warning 'engine_tick push: %', sqlerrm; end;
  return v_result;
end $$;

create or replace function public.restaurant_get_plan_summary(p_restaurant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare s public.restaurant_subscriptions; t record; v_from timestamptz; v_to timestamptz; v_used bigint; v_total numeric; v_elapsed numeric; v_proj bigint; v_name text; v_contract boolean;
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner']::public.user_roles_role_enum[]);
  select * into s from public.restaurant_subscriptions where restaurant_id = p_restaurant_id;
  if s.restaurant_id is null or s.status = 'canceled' then
    return jsonb_build_object('needsChoice', true, 'status', s.status, 'trialDays', (select trial_days from private.noowe_billing_settings));
  end if;
  select * into t from private.plan_terms(p_restaurant_id, s.plan_code);
  select name, is_contract into v_name, v_contract from private.noowe_plans where code = s.plan_code;
  v_from := case when s.billing_cycle = 'annual' then greatest(s.current_period_start, date_trunc('month', now())) else s.current_period_start end;
  v_to := case when s.billing_cycle = 'annual' then v_from + interval '1 month' else s.current_period_end end;
  v_used := private.plan_orders_used(p_restaurant_id, v_from, now());
  v_total := greatest(extract(epoch from v_to - v_from), 1);
  v_elapsed := greatest(extract(epoch from now() - v_from), 1);
  v_proj := ceil(v_used * v_total / v_elapsed)::bigint;
  return jsonb_build_object('needsChoice', false, 'planCode', s.plan_code, 'planName', v_name, 'isContract', v_contract, 'cycle', s.billing_cycle, 'status', s.status,
    'priceCents', case when v_contract then null else private.plan_period_price(p_restaurant_id, s.plan_code, s.billing_cycle) end,
    'trialEndsAt', s.trial_ends_at, 'periodEnd', s.current_period_end, 'nextPlanCode', s.next_plan_code, 'nextCycle', s.next_billing_cycle,
    'cancelAt', case when s.cancel_requested_at is not null then s.current_period_end end,
    'usage', jsonb_build_object('orders', v_used, 'allowance', t.allowance, 'projectedOrders', v_proj,
      'projectedOverageCents', private.plan_overage_cents(p_restaurant_id, s.plan_code, v_proj), 'overageCents', private.plan_overage_cents(p_restaurant_id, s.plan_code, v_used)),
    'promo', private.promo_status(p_restaurant_id),
    'category', (select noowe_category from public.restaurants where id = p_restaurant_id),
    'billingHidden', (select billing_hidden from public.restaurants where id = p_restaurant_id),
    'ordersSuspended', (select orders_suspended from public.restaurants where id = p_restaurant_id),
    'locked', coalesce((select jsonb_agg(x.key) from (select distinct f.feature_key as key from private.noowe_plan_features f) x where not private.plan_allows(p_restaurant_id, x.key)), '[]'::jsonb));
end $$;

-- A tela do Dono: índice em tempo real, previsão, quanto falta, saldo, a liberar, a expirar e extrato.
create or replace function public.restaurant_get_credits(p_restaurant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare s public.restaurant_subscriptions; v_from timestamptz; fig record; tier record; v_terms record; v_today date := (now() at time zone 'America/Sao_Paulo')::date; nxt private.noowe_credit_tiers; v_gap bigint; v_min bigint;
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner']::public.user_roles_role_enum[]);
  select * into s from public.restaurant_subscriptions where restaurant_id = p_restaurant_id;
  v_from := date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  select * into fig from private.credit_figures(p_restaurant_id, v_from, now() + interval '1 minute');
  select * into tier from private.credit_tier(s.plan_code, fig.paid_cents, fig.index_bps);
  select * into v_terms from private.plan_terms(p_restaurant_id, s.plan_code);
  select m.min_volume_cents into v_min from private.noowe_credit_plan_minimums m where m.plan_code = s.plan_code;
  select * into nxt from private.noowe_credit_tiers t where t.min_index_bps > fig.index_bps order by t.min_index_bps limit 1;
  -- Pagamento novo pelo app entra nos dois lados da conta.
  if nxt.code is not null then
    v_gap := greatest(ceil((nxt.min_index_bps::numeric * fig.revenue_cents - 10000 * fig.paid_cents) / greatest(10000 - nxt.min_index_bps, 1)), 0)::bigint;
  end if;
  return jsonb_build_object('indexBps', fig.index_bps, 'tierCode', tier.tier_code, 'paidCents', fig.paid_cents, 'revenueCents', fig.revenue_cents, 'minVolumeCents', v_min,
    'marks', coalesce((select jsonb_agg(jsonb_build_object('code', t.code, 'name', t.name, 'minIndexBps', t.min_index_bps, 'creditBps', t.credit_bps) order by t.min_index_bps) from private.noowe_credit_tiers t), '[]'::jsonb),
    'forecastCents', case when tier.tier_code is null then 0 else div(coalesce(v_terms.monthly_cents, 0) * tier.credit_bps + 5000, 10000)::bigint end,
    'nextTier', case when nxt.code is null then null else jsonb_build_object('name', nxt.name, 'missingCents', v_gap) end,
    'balanceCents', coalesce((select sum(remaining_cents) from private.noowe_credit_lots l where l.restaurant_id = p_restaurant_id and l.available_from <= v_today and l.expires_at > v_today), 0),
    'toRelease', coalesce((select jsonb_agg(jsonb_build_object('amountCents', l.remaining_cents, 'availableFrom', l.available_from) order by l.available_from) from private.noowe_credit_lots l where l.restaurant_id = p_restaurant_id and l.remaining_cents > 0 and l.available_from > v_today), '[]'::jsonb),
    'expiringSoonCents', coalesce((select sum(remaining_cents) from private.noowe_credit_lots l where l.restaurant_id = p_restaurant_id and l.expires_at > v_today and l.expires_at <= v_today + 30), 0),
    'statement', coalesce((select jsonb_agg(x.j order by x.at desc) from (select e.created_at at, jsonb_build_object('kind', e.kind, 'amountCents', e.amount_cents, 'at', e.created_at, 'invoiceId', e.invoice_id, 'month', lot.month) j
      from private.noowe_credit_ledger e left join private.noowe_credit_lots lot on lot.id = e.lot_id where e.restaurant_id = p_restaurant_id order by e.created_at desc limit 60) x), '[]'::jsonb));
end $$;
revoke all on function public.restaurant_get_credits(uuid) from public, anon;
grant execute on function public.restaurant_get_credits(uuid) to authenticated;

-- Gerente vê índice e faixa, nunca valores em reais.
create or replace function public.restaurant_get_credit_index(p_restaurant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare s public.restaurant_subscriptions; fig record; tier record; v_name text;
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner','manager']::public.user_roles_role_enum[]);
  select * into s from public.restaurant_subscriptions where restaurant_id = p_restaurant_id;
  select * into fig from private.credit_figures(p_restaurant_id, date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo', now() + interval '1 minute');
  select * into tier from private.credit_tier(s.plan_code, fig.paid_cents, fig.index_bps);
  select name into v_name from private.noowe_credit_tiers where code = tier.tier_code;
  return jsonb_build_object('indexBps', fig.index_bps, 'tierName', v_name);
end $$;
revoke all on function public.restaurant_get_credit_index(uuid) from public, anon;
grant execute on function public.restaurant_get_credit_index(uuid) to authenticated;

create view private.noowe_report_credits with (security_invoker = true) as
  select e.restaurant_id, date_trunc('month', e.created_at) as month, e.kind, sum(e.amount_cents)::bigint as amount_cents from private.noowe_credit_ledger e group by 1, 2, 3
  union all
  select l.restaurant_id, date_trunc('month', l.available_from::timestamp), 'to_release', sum(l.remaining_cents)::bigint from private.noowe_credit_lots l where l.remaining_cents > 0 and l.available_from > current_date group by 1, 2;
revoke all on private.noowe_report_credits from public, anon, authenticated, service_role;
