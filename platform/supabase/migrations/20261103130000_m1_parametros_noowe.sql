-- M1 — Parâmetros NOOWE (ADR-031). Todo valor comercial mora aqui, fora do alcance do restaurante, e a
-- equipe NOOWE altera direto no banco: ver docs/PARAMETROS-NOOWE.md. Os números da carga inicial são
-- provisórios (taxas em negociação com o Asaas).
--
-- Cobrança, fatura e crédito copiam o valor na hora em que nascem: nada aqui aponta para eles, então mudar
-- um parâmetro não reescreve o passado.

-- ---------------------------------------------------------------------------
-- 1. Histórico de alterações
-- ---------------------------------------------------------------------------
create table private.noowe_param_history (
  id bigint generated always as identity primary key,
  table_name text not null,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  author text not null,
  changed_at timestamptz not null default now(),
  "before" jsonb,
  "after" jsonb
);
create index noowe_param_history_table_idx on private.noowe_param_history(table_name, changed_at desc);

create or replace function private.noowe_param_history_is_append_only()
returns trigger language plpgsql set search_path = pg_temp as $$
begin
  raise exception 'O histórico de parâmetros não pode ser alterado' using errcode = '42501';
end $$;
revoke all on function private.noowe_param_history_is_append_only() from public, anon, authenticated, service_role;
create trigger trg_noowe_param_history_append_only before update or delete on private.noowe_param_history
  for each row execute function private.noowe_param_history_is_append_only();
create trigger trg_noowe_param_history_no_truncate before truncate on private.noowe_param_history
  for each statement execute function private.noowe_param_history_is_append_only();

-- Sem autor, a alteração não acontece. A exceção é a exclusão em cascata do restaurante, que não pode travar
-- e não é uma decisão comercial.
create or replace function private.noowe_param_record_change()
returns trigger language plpgsql security definer set search_path = private, pg_temp as $$
declare v_author text := nullif(btrim(coalesce(current_setting('noowe.param_author', true), '')), '');
begin
  if v_author is null and tg_op = 'DELETE' and to_jsonb(old)->>'restaurant_id' is not null
     and not exists (select 1 from public.restaurants r where r.id = (to_jsonb(old)->>'restaurant_id')::uuid) then
    v_author := 'cascata: restaurante excluído';
  end if;
  if v_author is null then
    raise exception 'Informe o autor: select set_config(''noowe.param_author'', ''seu nome'', true)' using errcode = '22023';
  end if;
  insert into private.noowe_param_history(table_name, action, author, "before", "after")
  values (tg_table_name, tg_op, v_author,
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;
revoke all on function private.noowe_param_record_change() from public, anon, authenticated, service_role;

create or replace function private.noowe_param_refuse_truncate()
returns trigger language plpgsql set search_path = pg_temp as $$
begin
  raise exception 'Parâmetros não aceitam TRUNCATE: a alteração ficaria fora do histórico' using errcode = '42501';
end $$;
revoke all on function private.noowe_param_refuse_truncate() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Taxa NOOWE Pay por meio de pagamento
-- ---------------------------------------------------------------------------
-- `charges_fee` falso: dinheiro e maquininha da casa só são registrados. `max_rate_bps`: teto legal do meio.
create table private.noowe_pay_methods (
  code text primary key,
  label text not null,
  charges_fee boolean not null default true,
  max_rate_bps integer check (max_rate_bps between 0 and 10000)
);

create table private.noowe_pay_rates (
  id uuid primary key default gen_random_uuid(),
  payment_method text not null references private.noowe_pay_methods(code) on update cascade,
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  rate_bps integer not null check (rate_bps between 0 and 10000),
  note text
);
create unique index noowe_pay_rates_default_key on private.noowe_pay_rates(payment_method) where restaurant_id is null;
create unique index noowe_pay_rates_restaurant_key on private.noowe_pay_rates(payment_method, restaurant_id)
  where restaurant_id is not null;

create or replace function private.noowe_pay_rate_within_limits()
returns trigger language plpgsql set search_path = private, pg_temp as $$
declare m private.noowe_pay_methods;
begin
  select * into m from private.noowe_pay_methods where code = new.payment_method;
  if not m.charges_fee then
    raise exception '% não tem taxa NOOWE Pay', m.label using errcode = '23514';
  end if;
  if new.rate_bps > m.max_rate_bps then
    raise exception 'Taxa de % (% bps) acima do teto (% bps)', m.label, new.rate_bps, m.max_rate_bps using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function private.noowe_pay_rate_within_limits() from public, anon, authenticated, service_role;
create trigger trg_noowe_pay_rate_within_limits before insert or update on private.noowe_pay_rates
  for each row execute function private.noowe_pay_rate_within_limits();

-- Baixar o teto não pode deixar uma taxa já cadastrada acima dele.
create or replace function private.noowe_pay_method_keeps_rates_valid()
returns trigger language plpgsql set search_path = private, pg_temp as $$
begin
  if exists (select 1 from private.noowe_pay_rates r where r.payment_method = new.code
      and (not new.charges_fee or r.rate_bps > new.max_rate_bps)) then
    raise exception 'Há taxa de % fora do novo limite: ajuste as taxas antes', new.label using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function private.noowe_pay_method_keeps_rates_valid() from public, anon, authenticated, service_role;
create trigger trg_noowe_pay_method_keeps_rates_valid before update on private.noowe_pay_methods
  for each row execute function private.noowe_pay_method_keeps_rates_valid();

-- O valor do restaurante prevalece sobre o padrão. Devolve 0 em meio sem taxa e null em meio sem valor
-- definido: quem cobra precisa recusar, nunca assumir zero.
create or replace function private.noowe_pay_rate_bps(p_restaurant_id uuid, p_method text)
returns integer language sql stable security definer set search_path = private, pg_temp as $$
  select case when not m.charges_fee then 0 else (
      select r.rate_bps from private.noowe_pay_rates r
      where r.payment_method = m.code and (r.restaurant_id = p_restaurant_id or r.restaurant_id is null)
      order by r.restaurant_id nulls last limit 1) end
  from private.noowe_pay_methods m where m.code = p_method
$$;
revoke all on function private.noowe_pay_rate_bps(uuid, text) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Taxa de conveniência, por fluxo (nunca por modelo de serviço)
-- ---------------------------------------------------------------------------
create table private.noowe_convenience_fees (
  id uuid primary key default gen_random_uuid(),
  flow text not null,
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  fee_cents bigint not null check (fee_cents >= 0),
  enabled boolean not null default true,
  note text
);
create unique index noowe_convenience_fees_default_key on private.noowe_convenience_fees(flow) where restaurant_id is null;
create unique index noowe_convenience_fees_restaurant_key on private.noowe_convenience_fees(flow, restaurant_id)
  where restaurant_id is not null;

-- Fluxo fora da tabela não cobra: a conta do salão nunca ganha esta linha por engano.
create or replace function private.convenience_fee_cents(p_restaurant_id uuid, p_flow text)
returns bigint language sql stable security definer set search_path = private, pg_temp as $$
  select coalesce((
    select case when c.enabled then c.fee_cents else 0 end
    from private.noowe_convenience_fees c
    where c.flow = p_flow and (c.restaurant_id = p_restaurant_id or c.restaurant_id is null)
    order by c.restaurant_id nulls last limit 1), 0)::bigint
$$;
revoke all on function private.convenience_fee_cents(uuid, text) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Planos e recursos por plano
-- ---------------------------------------------------------------------------
-- Enterprise é por contrato: sem preço de tabela. Franquia nula significa número ainda não definido
-- (pendência 24), não ilimitado.
create table private.noowe_plans (
  code text primary key,
  name text not null,
  monthly_price_cents bigint check (monthly_price_cents >= 0),
  annual_months_charged integer check (annual_months_charged between 1 and 12),
  order_allowance integer check (order_allowance >= 0),
  overage_order_cents bigint check (overage_order_cents >= 0),
  is_contract boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  check (is_contract or (monthly_price_cents is not null and annual_months_charged is not null))
);

create table private.noowe_plan_features (
  plan_code text not null references private.noowe_plans(code) on update cascade on delete cascade,
  feature_key text not null,
  enabled boolean not null default true,
  primary key (plan_code, feature_key)
);

-- ---------------------------------------------------------------------------
-- 5. Créditos NOOWE Pay
-- ---------------------------------------------------------------------------
create table private.noowe_credit_tiers (
  code text primary key,
  name text not null,
  min_index_bps integer not null unique check (min_index_bps between 0 and 10000),
  credit_bps integer not null check (credit_bps between 0 and 10000)
);

create table private.noowe_credit_plan_minimums (
  plan_code text primary key references private.noowe_plans(code) on update cascade on delete cascade,
  min_volume_cents bigint not null check (min_volume_cents >= 0)
);

create table private.noowe_credit_settings (
  id boolean primary key default true check (id),
  invoice_cap_bps integer not null check (invoice_cap_bps between 0 and 10000),
  release_after_invoices integer not null check (release_after_invoices >= 0),
  expiry_months_monthly integer not null check (expiry_months_monthly > 0),
  expiry_months_annual integer not null check (expiry_months_annual > 0),
  tap_counts_for_index boolean not null default false
);

-- ---------------------------------------------------------------------------
-- 6. Inadimplência e aviso de renovação
-- ---------------------------------------------------------------------------
create table private.noowe_billing_settings (
  id boolean primary key default true check (id),
  grace_days integer not null check (grace_days >= 0),
  suspend_orders_after_days integer not null,
  renewal_notice_days integer not null check (renewal_notice_days >= 0),
  check (suspend_orders_after_days >= grace_days)
);

-- ---------------------------------------------------------------------------
-- 7. Códigos promocionais (as regras; o uso entra na M6)
-- ---------------------------------------------------------------------------
create table private.noowe_promo_codes (
  code text primary key check (code = upper(code)),
  kind text not null check (kind in ('free_months', 'percent_off', 'fixed_off')),
  duration_months integer not null check (duration_months > 0),
  percent_off_bps integer check (percent_off_bps between 1 and 10000),
  amount_off_cents bigint check (amount_off_cents > 0),
  valid_from timestamptz,
  valid_until timestamptz,
  max_uses integer check (max_uses > 0),
  plan_codes text[],
  allow_monthly boolean not null default true,
  allow_annual boolean not null default false,
  new_restaurants_only boolean not null default false,
  is_active boolean not null default true,
  check ((kind = 'percent_off') = (percent_off_bps is not null)),
  check ((kind = 'fixed_off') = (amount_off_cents is not null)),
  check (valid_until is null or valid_from is null or valid_until > valid_from)
);

-- ---------------------------------------------------------------------------
-- 8. Cliente e equipe do restaurante não leem nem escrevem nada disto
-- ---------------------------------------------------------------------------
alter table private.noowe_param_history enable row level security;
revoke all on private.noowe_param_history from public, anon, authenticated, service_role;

do $$
declare t text;
begin
  foreach t in array array['noowe_pay_methods', 'noowe_pay_rates', 'noowe_convenience_fees', 'noowe_plans',
      'noowe_plan_features', 'noowe_credit_tiers', 'noowe_credit_plan_minimums', 'noowe_credit_settings',
      'noowe_billing_settings', 'noowe_promo_codes'] loop
    execute format('alter table private.%I enable row level security', t);
    execute format('revoke all on private.%I from public, anon, authenticated, service_role', t);
    execute format('create trigger trg_%s_history after insert or update or delete on private.%I
      for each row execute function private.noowe_param_record_change()', t, t);
    execute format('create trigger trg_%s_no_truncate before truncate on private.%I
      for each statement execute function private.noowe_param_refuse_truncate()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 9. Carga inicial (provisória, ver docs/PARAMETROS-NOOWE.md)
-- ---------------------------------------------------------------------------
do $$
begin
  perform set_config('noowe.param_author', 'migration: M1 carga inicial', true);

  -- Vale e Tap ficam sem linha em noowe_pay_rates: a spec não dá o valor, e sem valor o meio não é cobrado.
  insert into private.noowe_pay_methods(code, label, charges_fee, max_rate_bps) values
    ('credit_card', 'Crédito pelo app', true, null),
    ('debit_card', 'Débito pelo app', true, null),
    ('pix', 'Pix pelo app', true, null),
    ('voucher', 'Vale-refeição', true, 360),
    ('tap_card', 'Tap to Pay (cartão comum)', true, null),
    ('cash', 'Dinheiro', false, null),
    ('house_terminal', 'Maquininha da casa', false, null);

  insert into private.noowe_pay_rates(payment_method, rate_bps, note) values
    ('credit_card', 349, 'Provisório, em negociação com o Asaas'),
    ('debit_card', 149, 'Provisório, em negociação com o Asaas'),
    ('pix', 99, 'Provisório, em negociação com o Asaas');

  insert into private.noowe_convenience_fees(flow, fee_cents, note) values
    ('pickup', 99, 'Provisório'),
    ('scheduled', 99, 'Provisório');

  insert into private.noowe_plans(code, name, monthly_price_cents, annual_months_charged, order_allowance,
      overage_order_cents, is_contract, sort_order) values
    ('essencial', 'Essencial', 19900, 10, 1000, 15, false, 1),
    ('profissional', 'Profissional', 34900, 10, 3000, 15, false, 2),
    ('business', 'Business', 64900, 10, null, 15, false, 3),
    ('enterprise', 'Enterprise', null, null, null, null, true, 4);

  -- Tap to Pay fora da lista até haver contrato com o fornecedor (pendência 23). Enterprise sem linhas: é por contrato.
  insert into private.noowe_plan_features(plan_code, feature_key, enabled)
  select p.code, f.key, p.level >= f.min_level
  from (values ('essencial', 1), ('profissional', 2), ('business', 3)) as p(code, level)
  cross join (values ('menu', 1), ('app_ordering', 1), ('app_payment', 1), ('self_service', 1),
      ('waiter_app', 2), ('bill_split', 2), ('reservations', 2), ('waitlist', 2), ('loyalty', 2), ('assisted_onboarding', 2),
      ('nfce', 3), ('ai', 3), ('delivery_integrations', 3), ('priority_support', 3),
      ('tap_to_pay', 9)) as f(key, min_level);

  insert into private.noowe_credit_tiers(code, name, min_index_bps, credit_bps) values
    ('silver', 'Prata', 4000, 500),
    ('gold', 'Ouro', 6000, 1000),
    ('platinum', 'Platina', 8000, 2000);

  insert into private.noowe_credit_plan_minimums(plan_code, min_volume_cents) values
    ('essencial', 800000),
    ('profissional', 1500000),
    ('business', 3000000);

  insert into private.noowe_credit_settings(invoice_cap_bps, release_after_invoices, expiry_months_monthly,
      expiry_months_annual, tap_counts_for_index)
  values (3000, 2, 6, 12, false);

  insert into private.noowe_billing_settings(grace_days, suspend_orders_after_days, renewal_notice_days)
  values (7, 30, 30);
end $$;

-- ---------------------------------------------------------------------------
-- 10. Consulta interna
-- ---------------------------------------------------------------------------
-- Pela regra do ADR-031, o split já é o que sobra depois da tarifa do Asaas. As demais consultas (diferenças a
-- compensar, conveniência, créditos) nascem com seus razões, nas fatias M2, M3 e M5.
create view private.noowe_report_payment_margin with (security_invoker = true) as
  select g.id as payment_id, g.restaurant_id, coalesce(g.confirmed_at, g.created_at) as paid_at,
    g.payment_method, g.amount_cents, g.tip_cents, coalesce(g.platform_fee_cents, 0) as noowe_split_cents
  from public.gateway_transactions g
  where g.status = 'completed' and g.provider <> 'simulated';
revoke all on private.noowe_report_payment_margin from public, anon, authenticated, service_role;

-- Modelo anterior: comissão única. Sai na M2, com o split por meio de pagamento. Enquanto estiver vazia, o
-- cadastro de subconta segue recusado, e é o que deve acontecer até lá.
comment on table private.payment_platform_config is
  'Legado do ADR-020: não preencher. A M2 troca esta comissão única por private.noowe_pay_rates (ADR-031).';
