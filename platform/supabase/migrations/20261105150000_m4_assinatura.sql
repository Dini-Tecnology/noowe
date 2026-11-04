-- M4: assinatura. Plano, teste de 30 dias, troca de plano, uso e faturas. Tudo em centavos, com os valores da tabela de parâmetros.
-- Atraso nunca bloqueia comanda aberta. A fatura é uma cobrança avulsa na conta Asaas da NOOWE, porque o valor muda todo mês (créditos, excedente, compensação).

-- ---------------------------------------------------------------------------
-- 1. Razão de compensação: quem deve a quem
-- ---------------------------------------------------------------------------
-- tariff_over_fee e tariff_on_refund: a NOOWE deve ao restaurante, e abatem a fatura. fee_kept_on_refund: o restaurante deve à NOOWE.
alter table private.noowe_pay_compensations drop constraint noowe_pay_compensations_kind_check;
alter table private.noowe_pay_compensations add constraint noowe_pay_compensations_kind_check check (kind in ('tariff_over_fee', 'tariff_on_refund', 'fee_kept_on_refund'));
alter table private.noowe_pay_compensations add column applied_cents bigint not null default 0 check (applied_cents >= 0);
create or replace function private.refund_fee_policy(p_tx uuid)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare f private.noowe_pay_transaction_fees; g public.gateway_transactions; v_same_day boolean;
begin
  select * into f from private.noowe_pay_transaction_fees where gateway_transaction_id = p_tx;
  if f.gateway_transaction_id is null or f.fee_returned is not null then return; end if;
  select * into g from public.gateway_transactions where id = p_tx;
  v_same_day := coalesce(g.confirmed_at, g.created_at) >= (private.operational_day_current(g.restaurant_id)).started_at;
  if v_same_day then
    -- A NOOWE assume a tarifa: o que valia para a diferença é trocado pelo crédito da tarifa inteira.
    update private.noowe_pay_compensations set status = 'voided' where gateway_transaction_id = p_tx and status = 'open';
    if coalesce(f.tariff_cents, 0) > 0 then
      insert into private.noowe_pay_compensations(restaurant_id, gateway_transaction_id, kind, amount_cents)
        values (f.restaurant_id, p_tx, 'tariff_on_refund', f.tariff_cents)
        on conflict (gateway_transaction_id, kind) do nothing;
    end if;
  elsif private.noowe_pay_split_cents(f.fee_cents, coalesce(f.tariff_cents, f.fee_cents)) > 0 then
    -- Só a parte da taxa: a conveniência foi devolvida ao cliente.
    insert into private.noowe_pay_compensations(restaurant_id, gateway_transaction_id, kind, amount_cents)
      values (f.restaurant_id, p_tx, 'fee_kept_on_refund', private.noowe_pay_split_cents(f.fee_cents, coalesce(f.tariff_cents, f.fee_cents)))
      on conflict (gateway_transaction_id, kind) do nothing;
  end if;
  update private.noowe_pay_transaction_fees set fee_returned = v_same_day, updated_at = now() where gateway_transaction_id = p_tx;
end $$;

alter table private.noowe_billing_settings add column trial_notice_days integer not null default 7 check (trial_notice_days >= 0);

-- ---------------------------------------------------------------------------
-- 2. Assinatura e faturas
-- ---------------------------------------------------------------------------
create table public.restaurant_subscriptions (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  plan_code text not null,
  billing_cycle text not null check (billing_cycle in ('monthly', 'annual')),
  status text not null check (status in ('trial', 'active', 'past_due', 'canceled')),
  trial_ends_at timestamptz,
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz not null,
  next_plan_code text,
  next_billing_cycle text check (next_billing_cycle in ('monthly', 'annual')),
  cancel_requested_at timestamptz,
  cancel_reason text,
  canceled_at timestamptz,
  provider_customer_id text,
  renewal_notified_for timestamptz,
  trial_notified boolean not null default false,
  last_overage_billed_at timestamptz,
  chosen_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.restaurant_subscriptions enable row level security;
create policy restaurant_subscriptions_read on public.restaurant_subscriptions for select to authenticated
  using (private.has_restaurant_role(restaurant_id, array['owner']::public.user_roles_role_enum[]));

create table public.subscription_invoices (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  kind text not null check (kind in ('renewal', 'upgrade', 'overage')),
  period_start timestamptz not null,
  period_end timestamptz not null,
  subtotal_cents bigint not null,
  total_cents bigint not null check (total_cents >= 0),
  status text not null default 'open' check (status in ('open', 'overdue', 'paid', 'void')),
  due_at timestamptz not null,
  paid_at timestamptz,
  provider_ref text,
  checkout_url text,
  attempts integer not null default 0,
  claimed_at timestamptz,
  last_error text,
  nfse_status text not null default 'waiting_company_data' check (nfse_status in ('waiting_company_data', 'requested', 'issued', 'failed')),
  nfse_url text,
  notified_overdue boolean not null default false,
  created_at timestamptz not null default now()
);
create index subscription_invoices_restaurant_idx on public.subscription_invoices(restaurant_id, created_at desc);
create index subscription_invoices_due_idx on public.subscription_invoices(due_at) where status in ('open', 'overdue');
alter table public.subscription_invoices enable row level security;
create policy subscription_invoices_read on public.subscription_invoices for select to authenticated
  using (private.has_restaurant_role(restaurant_id, array['owner']::public.user_roles_role_enum[]));

create table public.subscription_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.subscription_invoices(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  kind text not null check (kind in ('plan', 'overage', 'upgrade', 'fee_adjustment', 'credit', 'promo', 'module')),
  description text not null,
  amount_cents bigint not null,
  created_at timestamptz not null default now()
);
alter table public.subscription_invoice_lines enable row level security;
create policy subscription_invoice_lines_read on public.subscription_invoice_lines for select to authenticated
  using (private.has_restaurant_role(restaurant_id, array['owner']::public.user_roles_role_enum[]));

alter table public.restaurants add column billing_hidden boolean not null default false,
  add column orders_suspended boolean not null default false;

-- ---------------------------------------------------------------------------
-- 3. Plano: o que vale e quanto custa
-- ---------------------------------------------------------------------------
create or replace function private.restaurant_plan_code(p_restaurant uuid)
returns text language sql stable security definer set search_path = public, private, pg_temp as $$
  select plan_code from public.restaurant_subscriptions where restaurant_id = p_restaurant and status <> 'canceled'
$$;
revoke all on function private.restaurant_plan_code(uuid) from public, anon, authenticated;

-- Quem ainda não escolheu plano segue com tudo até escolher (pendência 35). Plano por contrato sem linhas vale tudo. Tap depende do fornecedor ativo.
create or replace function private.plan_allows(p_restaurant uuid, p_feature text)
returns boolean language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare v_plan text := private.restaurant_plan_code(p_restaurant); v boolean;
begin
  if p_feature = 'tap_to_pay' then
    if not private.tap_provider_active() then return false; end if;
    p_feature := 'waiter_app';
  end if;
  if v_plan is null then return true; end if;
  if exists (select 1 from private.noowe_plans p where p.code = v_plan and p.is_contract) then return true; end if;
  select enabled into v from private.noowe_plan_features where plan_code = v_plan and feature_key = p_feature;
  return coalesce(v, true);
end $$;
revoke all on function private.plan_allows(uuid, text) from public, anon, authenticated;

create or replace function private.assert_plan_allows(p_restaurant uuid, p_feature text)
returns void language plpgsql stable security definer set search_path = public, private, pg_temp as $$
begin
  if p_restaurant is not null and not private.plan_allows(p_restaurant, p_feature) then
    raise exception 'Recurso fora do plano deste restaurante' using errcode = 'P0014';
  end if;
end $$;
revoke all on function private.assert_plan_allows(uuid, text) from public, anon, authenticated;

create or replace function private.apply_plan_to_capabilities(p_restaurant uuid, p_caps jsonb)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare v jsonb := p_caps;
begin
  if not private.plan_allows(p_restaurant, 'reservations') then v := jsonb_set(v, '{capabilities,reservation}', 'false'::jsonb, true); end if;
  if not private.plan_allows(p_restaurant, 'waitlist') then v := jsonb_set(v, '{capabilities,queue}', 'false'::jsonb, true); end if;
  if not private.plan_allows(p_restaurant, 'bill_split') then v := jsonb_set(v, '{capabilities,splitModes}', '[]'::jsonb, true); end if;
  return v;
end $$;
revoke all on function private.apply_plan_to_capabilities(uuid, jsonb) from public, anon, authenticated;

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
  -- O plano manda no que existe: recurso fora dele some, e o servidor também recusa.
  v_result := private.apply_plan_to_capabilities(p_restaurant_id, v_result);
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

create or replace function public.customer_bill_split_commit(
  p_table_session_id uuid, p_mode public.noowe_split_mode, p_params jsonb,
  p_expected_version text, p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_idempotency_key is null then raise exception 'Idempotency key required' using errcode = '22023'; end if;
  perform private.assert_plan_allows((select restaurant_id from public.table_sessions where id = p_table_session_id), 'bill_split');
  return private.commit_split(p_table_session_id, auth.uid(), p_mode, p_params, p_expected_version, p_idempotency_key);
end $$;

create or replace function public.customer_create_reservation(
  p_restaurant_id uuid, p_reservation_time timestamptz, p_party_size integer,
  p_special_requests text default null
) returns public.reservations language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare v_capacity integer; v_reserved integer; v_result public.reservations; v_restaurant_name text;
begin
  perform private.assert_plan_allows(p_restaurant_id, 'reservations');
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_party_size < 1 or p_party_size > 20 or p_reservation_time < now() + interval '30 minutes'
  then raise exception 'Invalid reservation request' using errcode = '22023'; end if;
  select r.name into v_restaurant_name
  from public.restaurants r
  where r.id = p_restaurant_id and r.is_active
    and r.service_type in ('fine_dining', 'casual_dining')
    and coalesce((r.service_config->'feature_overrides'->>'reservations')::boolean, true)
    and coalesce((r.settings->'customer_experience'->>'onlineReservations')::boolean, true)
    and coalesce((r.settings->'customer_experience'->>'journeyReservation')::boolean, true);
  if v_restaurant_name is null
  then raise exception 'Reservations are unavailable for this restaurant' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext(p_restaurant_id::text || date_trunc('hour', p_reservation_time)::text));
  select coalesce(sum(seats), 0)::integer into v_capacity from public.tables where restaurant_id = p_restaurant_id;
  select coalesce(sum(party_size), 0)::integer into v_reserved from public.reservations
    where restaurant_id = p_restaurant_id and status::text in ('pending','confirmed')
      and reservation_time between p_reservation_time - interval '90 minutes' and p_reservation_time + interval '90 minutes';
  if v_capacity = 0 or v_reserved + p_party_size > v_capacity
  then raise exception 'No availability for this time' using errcode = 'P0001'; end if;
  insert into public.reservations(restaurant_id, customer_id, reservation_time, party_size, special_requests, status)
    values(p_restaurant_id, auth.uid(), p_reservation_time, p_party_size, nullif(trim(p_special_requests), ''), 'confirmed')
    returning * into v_result;

  perform private.create_notification(
    auth.uid(),
    'Reserva confirmada!',
    v_restaurant_name || ' · ' || to_char(p_reservation_time at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI') ||
      ' · ' || p_party_size || case when p_party_size = 1 then ' pessoa' else ' pessoas' end,
    'reservation_confirmed',
    v_result.id,
    'reservation',
    jsonb_build_object('confirmation_code', v_result.confirmation_code, 'restaurant_id', p_restaurant_id)
  );
  return v_result;
end $$;

create or replace function public.customer_join_waitlist(
  p_restaurant_id uuid, p_party_size integer, p_preference text default 'qualquer', p_has_kids boolean default false
) returns public.waitlist_entries language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare
  v_profile public.profiles; v_entry public.waitlist_entries; v_position integer;
  v_preference text := coalesce(nullif(btrim(p_preference), ''), 'qualquer');
begin
  perform private.assert_plan_allows(p_restaurant_id, 'waitlist');
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_party_size < 1 or p_party_size > 20 then raise exception 'Invalid party size' using errcode = '22023'; end if;
  if not exists(
    select 1 from public.restaurants r
    where r.id = p_restaurant_id and r.is_active
      and r.service_type in ('fine_dining', 'casual_dining', 'quick_service')
      and coalesce((r.service_config->'feature_overrides'->>'virtualQueue')::boolean, true)
      and coalesce((r.settings->'customer_experience'->>'waitlist')::boolean, true)
      and coalesce((r.settings->'customer_experience'->>'journeyArrival')::boolean, true)
  ) then raise exception 'Waitlist is unavailable for this restaurant' using errcode = 'P0001'; end if;
  if not private.restaurant_is_open_now(p_restaurant_id) then
    raise exception 'Restaurant is closed' using errcode = 'P0001';
  end if;

  perform private.assert_single_active_session(auth.uid(), null); -- ADR-021: comanda ativa bloqueia a fila

  if lower(v_preference) = 'qualquer' then
    v_preference := 'qualquer';
  else
    select s into v_preference
    from unnest(private.restaurant_sections(p_restaurant_id)) s
    where private.normalize_section_name(s) = private.normalize_section_name(v_preference)
    limit 1;
    if v_preference is null then
      raise exception 'Setor indisponível neste restaurante' using errcode = '22023';
    end if;
  end if;

  if exists(select 1 from public.waitlist_entries where customer_id = auth.uid()
      and restaurant_id = p_restaurant_id and status in ('waiting', 'called'))
    then raise exception 'Already on waitlist' using errcode = '23505'; end if;
  select * into v_profile from public.profiles where id = auth.uid();
  select coalesce(max(position),0)+1 into v_position from public.waitlist_entries
    where restaurant_id = p_restaurant_id and status = 'waiting';
  insert into public.waitlist_entries(restaurant_id, customer_id, customer_name, customer_phone,
    party_size, preference, has_kids, status, position, created_at, updated_at)
  values(p_restaurant_id, auth.uid(), coalesce(v_profile.full_name,'Cliente'), v_profile.phone,
    p_party_size, v_preference, p_has_kids, 'waiting', v_position, now(), now())
  returning * into v_entry;
  return v_entry;
end $$;

-- Preço e franquia: o contrato do restaurante prevalece sobre a tabela.
create or replace function private.plan_terms(p_restaurant uuid, p_plan text, out monthly_cents bigint, out annual_months integer, out allowance integer, out overage_cents bigint)
language sql stable security definer set search_path = private, pg_temp as $$
  select coalesce(c.monthly_price_cents, p.monthly_price_cents), coalesce(p.annual_months_charged, 12),
    coalesce(c.order_allowance, p.order_allowance), coalesce(c.overage_order_cents, p.overage_order_cents)
  from private.noowe_plans p left join private.noowe_restaurant_contracts c on c.restaurant_id = p_restaurant and c.plan_code = p.code
  where p.code = p_plan
$$;
revoke all on function private.plan_terms(uuid, text) from public, anon, authenticated;

create or replace function private.plan_period_price(p_restaurant uuid, p_plan text, p_cycle text)
returns bigint language sql stable security definer set search_path = private, pg_temp as $$
  select case when p_cycle = 'annual' then t.monthly_cents * t.annual_months else t.monthly_cents end from private.plan_terms(p_restaurant, p_plan) t
$$;
revoke all on function private.plan_period_price(uuid, text, text) from public, anon, authenticated;

-- Pedido na franquia: cada envio à cozinha ou ao bar conta 1; quem esperou na fila e foi atendido conta 1; cancelado não conta.
create or replace function private.plan_orders_used(p_restaurant uuid, p_from timestamptz, p_to timestamptz)
returns bigint language sql stable security definer set search_path = public, pg_temp as $$
  select (select count(*) from public.orders o where o.restaurant_id = p_restaurant and o.status::text <> 'cancelled' and o.created_at >= p_from and o.created_at < p_to)
    + (select count(*) from public.waitlist_entries w where w.restaurant_id = p_restaurant and w.status::text in ('seated', 'completed') and w.created_at >= p_from and w.created_at < p_to)
$$;
revoke all on function private.plan_orders_used(uuid, timestamptz, timestamptz) from public, anon, authenticated;

-- Excedente do mês, calculado no servidor.
create or replace function private.plan_overage_cents(p_restaurant uuid, p_plan text, p_used bigint)
returns bigint language sql stable security definer set search_path = private, pg_temp as $$
  select greatest(0, p_used - coalesce(t.allowance, p_used)) * coalesce(t.overage_cents, 0) from private.plan_terms(p_restaurant, p_plan) t
$$;
revoke all on function private.plan_overage_cents(uuid, text, bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Fatura
-- ---------------------------------------------------------------------------
-- Compensação: o que a NOOWE deve abate sem limite nem validade, e o que sobrar segue para as próximas. O que o restaurante deve entra por cima.
create or replace function private.invoice_apply_compensations(p_invoice uuid, p_restaurant uuid, p_base bigint)
returns bigint language plpgsql security definer set search_path = public, private, pg_temp as $$
declare c record; v_left bigint := p_base; v_take bigint; v_owed bigint := 0; v_credit bigint := 0;
begin
  for c in select * from private.noowe_pay_compensations where restaurant_id = p_restaurant and status = 'open' and kind = 'fee_kept_on_refund' for update loop
    v_owed := v_owed + c.amount_cents;
    update private.noowe_pay_compensations set status = 'invoiced', applied_cents = amount_cents, invoice_id = p_invoice where id = c.id;
  end loop;
  v_left := v_left + v_owed;
  for c in select * from private.noowe_pay_compensations where restaurant_id = p_restaurant and status = 'open' and kind <> 'fee_kept_on_refund' order by created_at for update loop
    exit when v_left <= 0;
    v_take := least(v_left, c.amount_cents - c.applied_cents);
    v_left := v_left - v_take;
    v_credit := v_credit + v_take;
    update private.noowe_pay_compensations set applied_cents = applied_cents + v_take, invoice_id = p_invoice,
        status = case when applied_cents + v_take >= amount_cents then 'invoiced' else 'open' end where id = c.id;
  end loop;
  if v_owed - v_credit <> 0 then
    insert into public.subscription_invoice_lines(invoice_id, restaurant_id, kind, description, amount_cents)
      values (p_invoice, p_restaurant, 'fee_adjustment', 'Ajuste de taxa NOOWE Pay', v_owed - v_credit);
  end if;
  return v_left;
end $$;
revoke all on function private.invoice_apply_compensations(uuid, uuid, bigint) from public, anon, authenticated;

-- Créditos (M5) e códigos (M6) entram por estas portas.
create or replace function private.invoice_apply_promo(p_invoice uuid, p_restaurant uuid, p_plan_cents bigint) returns bigint
language sql stable as $$ select 0::bigint $$;
revoke all on function private.invoice_apply_promo(uuid, uuid, bigint) from public, anon, authenticated;
create or replace function private.invoice_apply_credits(p_invoice uuid, p_restaurant uuid, p_plan_cents bigint) returns bigint
language sql stable as $$ select 0::bigint $$;
revoke all on function private.invoice_apply_credits(uuid, uuid, bigint) from public, anon, authenticated;

create or replace function private.invoice_create(p_restaurant uuid, p_kind text, p_from timestamptz, p_to timestamptz, p_plan_cents bigint, p_plan_label text, p_extra_cents bigint default 0, p_extra_label text default null)
returns public.subscription_invoices language plpgsql security definer set search_path = public, private, pg_temp as $$
declare i public.subscription_invoices; v_total bigint; v_promo bigint := 0; v_credit bigint := 0; v_sub bigint := coalesce(p_plan_cents, 0) + coalesce(p_extra_cents, 0);
begin
  insert into public.subscription_invoices(restaurant_id, kind, period_start, period_end, subtotal_cents, total_cents, due_at)
    values (p_restaurant, p_kind, p_from, p_to, v_sub, 0, now() + interval '3 days') returning * into i;
  if coalesce(p_plan_cents, 0) > 0 then
    insert into public.subscription_invoice_lines(invoice_id, restaurant_id, kind, description, amount_cents)
      values (i.id, p_restaurant, case when p_kind = 'upgrade' then 'upgrade' else 'plan' end, p_plan_label, p_plan_cents);
  end if;
  if coalesce(p_extra_cents, 0) > 0 then
    insert into public.subscription_invoice_lines(invoice_id, restaurant_id, kind, description, amount_cents)
      values (i.id, p_restaurant, 'overage', p_extra_label, p_extra_cents);
  end if;
  -- Ordem do item E: primeiro o código, depois os créditos, e por fim a compensação.
  v_promo := private.invoice_apply_promo(i.id, p_restaurant, coalesce(p_plan_cents, 0));
  v_credit := private.invoice_apply_credits(i.id, p_restaurant, coalesce(p_plan_cents, 0) - v_promo);
  v_total := private.invoice_apply_compensations(i.id, p_restaurant, v_sub - v_promo - v_credit);
  update public.subscription_invoices set total_cents = greatest(v_total, 0),
      status = case when v_total <= 0 then 'paid' else 'open' end, paid_at = case when v_total <= 0 then now() end
    where id = i.id returning * into i;
  if i.status = 'open' then perform private.invoice_post(i.id); end if;
  return i;
end $$;
revoke all on function private.invoice_create(uuid, text, timestamptz, timestamptz, bigint, text, bigint, text) from public, anon, authenticated;

create or replace function private.invoice_post(p_invoice uuid)
returns boolean language plpgsql security definer set search_path = public, private, vault, net, pg_temp as $$
declare v_url text; v_key text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url' limit 1;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key' limit 1;
  if v_url is null or v_key is null then return false; end if;
  perform net.http_post(url := rtrim(v_url, '/') || '/functions/v1/billing-charge',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body := jsonb_build_object('invoiceId', p_invoice));
  return true;
exception when others then
  raise warning 'Disparo de fatura falhou para %: %', p_invoice, sqlerrm;
  return false;
end $$;
revoke all on function private.invoice_post(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. O ciclo: renovação, avisos e atraso
-- ---------------------------------------------------------------------------
create or replace function private.notify_owner(p_restaurant uuid, p_title text, p_message text, p_kind text, p_related uuid default null)
returns void language sql security definer set search_path = public, private, pg_temp as $$
  select private.notify_restaurant_staff(p_restaurant, array['owner']::public.user_roles_role_enum[], p_title, p_message, 'system', p_related, null,
    jsonb_build_object('kind', p_kind, 'restaurant_id', p_restaurant));
$$;
revoke all on function private.notify_owner(uuid, text, text, text, uuid) from public, anon, authenticated;

create or replace function private.subscription_renew(s public.restaurant_subscriptions)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_plan text := coalesce(s.next_plan_code, s.plan_code); v_cycle text := coalesce(s.next_billing_cycle, s.billing_cycle);
  v_from timestamptz := s.current_period_end; v_to timestamptz; v_price bigint; v_name text; v_used bigint; v_over bigint := 0;
begin
  if s.status <> 'trial' and s.billing_cycle = 'monthly' then
    v_used := private.plan_orders_used(s.restaurant_id, s.current_period_start, s.current_period_end);
    v_over := private.plan_overage_cents(s.restaurant_id, s.plan_code, v_used);
  end if;
  v_to := v_from + case when v_cycle = 'annual' then interval '1 year' else interval '1 month' end;
  v_price := coalesce(private.plan_period_price(s.restaurant_id, v_plan, v_cycle), 0);
  select name into v_name from private.noowe_plans where code = v_plan;
  update public.restaurant_subscriptions set plan_code = v_plan, billing_cycle = v_cycle, next_plan_code = null, next_billing_cycle = null,
      status = 'active', current_period_start = v_from, current_period_end = v_to, trial_ends_at = null, renewal_notified_for = null, updated_at = now()
    where restaurant_id = s.restaurant_id;
  perform private.invoice_create(s.restaurant_id, 'renewal', v_from, v_to, v_price,
    'Plano ' || coalesce(v_name, v_plan) || case when v_cycle = 'annual' then ' (anual)' else ' (mensal)' end,
    v_over, case when v_over > 0 then 'Pedidos acima da franquia' end);
end $$;
revoke all on function private.subscription_renew(public.restaurant_subscriptions) from public, anon, authenticated;

-- Atraso nunca bloqueia comanda aberta: tolerância, sai da busca, e só depois suspende pedido novo.
create or replace function private.subscription_apply_overdue(p_restaurant uuid)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_oldest timestamptz; b private.noowe_billing_settings; v_days numeric;
begin
  select * into b from private.noowe_billing_settings;
  select min(due_at) into v_oldest from public.subscription_invoices where restaurant_id = p_restaurant and status = 'overdue';
  v_days := case when v_oldest is null then 0 else extract(epoch from now() - v_oldest) / 86400 end;
  update public.restaurants set billing_hidden = v_oldest is not null and v_days > b.grace_days,
      orders_suspended = v_oldest is not null and v_days > b.suspend_orders_after_days
    where id = p_restaurant and (billing_hidden, orders_suspended) is distinct from (v_oldest is not null and v_days > b.grace_days, v_oldest is not null and v_days > b.suspend_orders_after_days);
  if v_oldest is null then
    update public.restaurant_subscriptions set status = 'active', updated_at = now() where restaurant_id = p_restaurant and status = 'past_due';
  else
    update public.restaurant_subscriptions set status = 'past_due', updated_at = now() where restaurant_id = p_restaurant and status = 'active';
  end if;
end $$;
revoke all on function private.subscription_apply_overdue(uuid) from public, anon, authenticated;

create or replace function private.subscription_tick()
returns integer language plpgsql security definer set search_path = public, private, pg_temp as $$
declare s public.restaurant_subscriptions; b private.noowe_billing_settings; i public.subscription_invoices; v_n integer := 0; v_used bigint; v_over bigint; v_month timestamptz; v_id uuid;
begin
  select * into b from private.noowe_billing_settings;
  for s in select * from public.restaurant_subscriptions where status <> 'canceled' loop
    begin
      if s.status = 'trial' and not s.trial_notified and s.trial_ends_at - make_interval(days => b.trial_notice_days) <= now() then
        perform private.notify_owner(s.restaurant_id, 'Seu teste está acabando', 'Em breve começa a cobrança do plano. Escolha a forma de pagamento em Módulos e plano.', 'plan_trial_ending');
        update public.restaurant_subscriptions set trial_notified = true where restaurant_id = s.restaurant_id;
      end if;
      -- No anual, excedente e módulos seguem mensais.
      if s.status <> 'trial' and s.billing_cycle = 'annual' then
        v_month := coalesce(s.last_overage_billed_at, s.current_period_start);
        if v_month + interval '1 month' <= now() then
          v_used := private.plan_orders_used(s.restaurant_id, v_month, v_month + interval '1 month');
          v_over := private.plan_overage_cents(s.restaurant_id, s.plan_code, v_used);
          update public.restaurant_subscriptions set last_overage_billed_at = v_month + interval '1 month' where restaurant_id = s.restaurant_id;
          if v_over > 0 then perform private.invoice_create(s.restaurant_id, 'overage', v_month, v_month + interval '1 month', 0, null, v_over, 'Pedidos acima da franquia'); end if;
        end if;
      end if;
      if s.status <> 'trial' and s.current_period_end - make_interval(days => b.renewal_notice_days) <= now() and s.renewal_notified_for is distinct from s.current_period_end and s.cancel_requested_at is null then
        perform private.notify_owner(s.restaurant_id, 'Renovação do plano', 'Seu plano renova em breve, no preço de tabela vigente.', 'plan_renewal_notice');
        update public.restaurant_subscriptions set renewal_notified_for = s.current_period_end where restaurant_id = s.restaurant_id;
      end if;
      if s.current_period_end <= now() then
        if s.cancel_requested_at is not null then
          update public.restaurant_subscriptions set status = 'canceled', canceled_at = now(), updated_at = now() where restaurant_id = s.restaurant_id;
          perform private.subscription_on_canceled(s.restaurant_id);
        else
          perform private.subscription_renew(s);
        end if;
        v_n := v_n + 1;
      end if;
    exception when others then
      raise warning 'assinatura %: %', s.restaurant_id, sqlerrm;
    end;
  end loop;
  for i in select * from public.subscription_invoices where status = 'open' and due_at < now() loop
    update public.subscription_invoices set status = 'overdue' where id = i.id;
    perform private.notify_owner(i.restaurant_id, 'Fatura em atraso', 'Regularize para seguir aparecendo no app. Comandas abertas continuam normalmente.', 'plan_invoice_overdue', i.id);
  end loop;
  for v_id in select distinct restaurant_id from public.subscription_invoices where status = 'overdue'
      union select id from public.restaurants where billing_hidden or orders_suspended loop
    perform private.subscription_apply_overdue(v_id);
  end loop;
  -- Fatura que ainda não chegou ao Asaas.
  for v_id in select id from public.subscription_invoices where status in ('open', 'overdue') and provider_ref is null and attempts < 6 and (claimed_at is null or claimed_at < now() - interval '10 minutes') limit 50 loop
    perform private.invoice_post(v_id);
  end loop;
  return v_n;
end $$;
revoke all on function private.subscription_tick() from public, anon, authenticated;

-- Cancelar perde os créditos (M5).
create or replace function private.subscription_on_canceled(p_restaurant uuid) returns void language sql as $$ select $$;
revoke all on function private.subscription_on_canceled(uuid) from public, anon, authenticated;

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

-- Suspenso: nada de comanda nova nem pedido fora de comanda. O que já está aberto continua até fechar.
create or replace function private.billing_block_new_session()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if (select orders_suspended from public.restaurants where id = new.restaurant_id) then
    raise exception 'Este restaurante não está recebendo pedidos pelo app agora' using errcode = 'P0015';
  end if;
  return new;
end $$;
revoke all on function private.billing_block_new_session() from public, anon, authenticated;
create trigger table_sessions_billing_block before insert on public.table_sessions for each row execute function private.billing_block_new_session();
create or replace function private.billing_block_new_order()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.table_session_id is null and (select orders_suspended from public.restaurants where id = new.restaurant_id) then
    raise exception 'Este restaurante não está recebendo pedidos pelo app agora' using errcode = 'P0015';
  end if;
  return new;
end $$;
revoke all on function private.billing_block_new_order() from public, anon, authenticated;
create trigger orders_billing_block before insert on public.orders for each row execute function private.billing_block_new_order();

-- ---------------------------------------------------------------------------
-- 6. O que o Dono faz
-- ---------------------------------------------------------------------------
create or replace function public.restaurant_list_plans(p_restaurant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare v_models public.noowe_service_model[];
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner']::public.user_roles_role_enum[]);
  select service_models into v_models from public.restaurant_model_configs where restaurant_id = p_restaurant_id;
  return coalesce((select jsonb_agg(jsonb_build_object('code', p.code, 'name', p.name, 'isContract', p.is_contract,
      'monthlyCents', case when p.is_contract then null else t.monthly_cents end,
      'annualCents', case when p.is_contract then null else t.monthly_cents * t.annual_months end,
      'annualSavingsCents', case when p.is_contract then null else t.monthly_cents * (12 - t.annual_months) end,
      'orderAllowance', t.allowance, 'overageCents', t.overage_cents,
      'features', coalesce((select jsonb_agg(f.feature_key order by f.feature_key) from private.noowe_plan_features f where f.plan_code = p.code and f.enabled and f.feature_key <> 'tap_to_pay'), '[]'::jsonb)
        || case when private.tap_provider_active() and exists (select 1 from private.noowe_plan_features f where f.plan_code = p.code and f.feature_key = 'waiter_app' and f.enabled) then '["tap_to_pay"]'::jsonb else '[]'::jsonb end,
      'suggested', exists (select 1 from unnest(v_models) m where private.suggested_plan_code(m) = p.code)) order by p.sort_order)
    from private.noowe_plans p cross join lateral private.plan_terms(p_restaurant_id, p.code) t where p.is_active), '[]'::jsonb);
end $$;
revoke all on function public.restaurant_list_plans(uuid) from public, anon;
grant execute on function public.restaurant_list_plans(uuid) to authenticated;

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
    'billingHidden', (select billing_hidden from public.restaurants where id = p_restaurant_id),
    'ordersSuspended', (select orders_suspended from public.restaurants where id = p_restaurant_id),
    'locked', coalesce((select jsonb_agg(x.key) from (select distinct f.feature_key as key from private.noowe_plan_features f) x where not private.plan_allows(p_restaurant_id, x.key)), '[]'::jsonb));
end $$;
revoke all on function public.restaurant_get_plan_summary(uuid) from public, anon;
grant execute on function public.restaurant_get_plan_summary(uuid) to authenticated;

-- O que está travado no plano, para todo perfil: fora dele, o recurso some. Só o Dono vê o cadeado.
create or replace function public.restaurant_get_plan_locks(p_restaurant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner','manager','maitre','chef','cook','barman','waiter','cashier','host']::public.user_roles_role_enum[]);
  return coalesce((select jsonb_agg(x.key) from (select distinct f.feature_key as key from private.noowe_plan_features f) x where not private.plan_allows(p_restaurant_id, x.key)), '[]'::jsonb);
end $$;
revoke all on function public.restaurant_get_plan_locks(uuid) from public, anon;
grant execute on function public.restaurant_get_plan_locks(uuid) to authenticated;

-- Etapa "Escolha seu plano": teste sem cartão. Enterprise é por contrato.
create or replace function public.restaurant_choose_plan(p_restaurant_id uuid, p_plan_code text, p_cycle text default 'monthly')
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare p private.noowe_plans; v_days integer; v_end timestamptz; s public.restaurant_subscriptions;
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner']::public.user_roles_role_enum[]);
  select * into p from private.noowe_plans where code = p_plan_code and is_active;
  if p.code is null then raise exception 'Plano inválido' using errcode = '22023'; end if;
  if p_cycle not in ('monthly', 'annual') then raise exception 'Ciclo inválido' using errcode = '22023'; end if;
  if p.is_contract and not exists (select 1 from private.noowe_restaurant_contracts c where c.restaurant_id = p_restaurant_id and c.plan_code = p.code) then
    raise exception 'Plano sob consulta: fale com a NOOWE' using errcode = 'P0001'; end if;
  select * into s from public.restaurant_subscriptions where restaurant_id = p_restaurant_id;
  if s.restaurant_id is not null and s.status <> 'canceled' then raise exception 'Este restaurante já tem plano' using errcode = '23505'; end if;
  select trial_days into v_days from private.noowe_billing_settings;
  -- Quem já testou não testa de novo ao voltar.
  v_end := now() + make_interval(days => case when s.restaurant_id is null then v_days else 0 end);
  insert into public.restaurant_subscriptions(restaurant_id, plan_code, billing_cycle, status, trial_ends_at, current_period_start, current_period_end, chosen_by)
    values (p_restaurant_id, p_plan_code, p_cycle, 'trial', v_end, now(), v_end, auth.uid())
    on conflict (restaurant_id) do update set plan_code = excluded.plan_code, billing_cycle = excluded.billing_cycle, status = 'trial', trial_ends_at = excluded.trial_ends_at,
      current_period_start = excluded.current_period_start, current_period_end = excluded.current_period_end, chosen_by = excluded.chosen_by, cancel_requested_at = null,
      cancel_reason = null, canceled_at = null, next_plan_code = null, next_billing_cycle = null, trial_notified = false, updated_at = now();
  perform private.log_audit(p_restaurant_id, 'plan.chosen', 'restaurant_subscription', p_restaurant_id, 'Plano escolhido', null, jsonb_build_object('plan', p_plan_code, 'cycle', p_cycle, 'trialDays', v_days));
  return public.restaurant_get_plan_summary(p_restaurant_id);
end $$;
revoke all on function public.restaurant_choose_plan(uuid, text, text) from public, anon;
grant execute on function public.restaurant_choose_plan(uuid, text, text) to authenticated;

-- Upgrade vale na hora, com a diferença proporcional. Downgrade só no ciclo seguinte (no anual, na renovação).
create or replace function public.restaurant_change_plan(p_restaurant_id uuid, p_plan_code text, p_cycle text default null)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare s public.restaurant_subscriptions; p private.noowe_plans; v_cycle text; v_old bigint; v_new bigint; v_total numeric; v_left numeric; v_diff bigint; v_old_level integer; v_name text;
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner']::public.user_roles_role_enum[]);
  select * into s from public.restaurant_subscriptions where restaurant_id = p_restaurant_id for update;
  if s.restaurant_id is null or s.status = 'canceled' then raise exception 'Escolha um plano primeiro' using errcode = 'P0001'; end if;
  select * into p from private.noowe_plans where code = p_plan_code and is_active;
  if p.code is null then raise exception 'Plano inválido' using errcode = '22023'; end if;
  if p.is_contract then raise exception 'Plano sob consulta: fale com a NOOWE' using errcode = 'P0001'; end if;
  v_cycle := coalesce(p_cycle, s.billing_cycle);
  if v_cycle not in ('monthly', 'annual') then raise exception 'Ciclo inválido' using errcode = '22023'; end if;
  v_old := coalesce(private.plan_period_price(p_restaurant_id, s.plan_code, s.billing_cycle), 0);
  v_new := private.plan_period_price(p_restaurant_id, p_plan_code, s.billing_cycle);
  select sort_order into v_old_level from private.noowe_plans where code = s.plan_code;
  if s.status = 'trial' then
    update public.restaurant_subscriptions set plan_code = p_plan_code, billing_cycle = v_cycle, updated_at = now() where restaurant_id = p_restaurant_id;
  elsif p.sort_order > v_old_level then
    -- Upgrade: diferença proporcional ao que falta do período. Mudar para anual vale a partir da próxima fatura.
    v_total := greatest(extract(epoch from s.current_period_end - s.current_period_start), 1);
    v_left := greatest(extract(epoch from s.current_period_end - now()), 0);
    v_diff := round((v_new - v_old) * v_left / v_total)::bigint;
    select name into v_name from private.noowe_plans where code = p_plan_code;
    update public.restaurant_subscriptions set plan_code = p_plan_code, next_plan_code = null,
        next_billing_cycle = case when v_cycle <> s.billing_cycle then v_cycle end, updated_at = now() where restaurant_id = p_restaurant_id;
    if v_diff > 0 then perform private.invoice_create(p_restaurant_id, 'upgrade', now(), s.current_period_end, v_diff, 'Diferença proporcional: plano ' || v_name); end if;
  else
    update public.restaurant_subscriptions set next_plan_code = case when p_plan_code <> s.plan_code then p_plan_code end,
        next_billing_cycle = case when v_cycle <> s.billing_cycle then v_cycle end, updated_at = now() where restaurant_id = p_restaurant_id;
  end if;
  perform private.log_audit(p_restaurant_id, 'plan.changed', 'restaurant_subscription', p_restaurant_id, 'Plano alterado',
    jsonb_build_object('plan', s.plan_code, 'cycle', s.billing_cycle), jsonb_build_object('plan', p_plan_code, 'cycle', v_cycle));
  return public.restaurant_get_plan_summary(p_restaurant_id);
end $$;
revoke all on function public.restaurant_change_plan(uuid, text, text) from public, anon;
grant execute on function public.restaurant_change_plan(uuid, text, text) to authenticated;

-- Cancelar: com motivo. O serviço segue até o fim do período pago, sem reembolso; dados e exportação continuam.
create or replace function public.restaurant_cancel_subscription(p_restaurant_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner']::public.user_roles_role_enum[]);
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'Motivo obrigatório' using errcode = '22023'; end if;
  update public.restaurant_subscriptions set cancel_requested_at = now(), cancel_reason = btrim(p_reason), updated_at = now()
    where restaurant_id = p_restaurant_id and status <> 'canceled';
  if not found then raise exception 'Sem assinatura ativa' using errcode = 'P0001'; end if;
  perform private.log_audit(p_restaurant_id, 'plan.cancel_requested', 'restaurant_subscription', p_restaurant_id, btrim(p_reason), null, null);
  return public.restaurant_get_plan_summary(p_restaurant_id);
end $$;
revoke all on function public.restaurant_cancel_subscription(uuid, text) from public, anon;
grant execute on function public.restaurant_cancel_subscription(uuid, text) to authenticated;

create or replace function public.restaurant_list_invoices(p_restaurant_id uuid, p_limit integer default 24)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner']::public.user_roles_role_enum[]);
  return coalesce((select jsonb_agg(x.j order by x.at desc) from (
    select i.created_at at, jsonb_build_object('id', i.id, 'kind', i.kind, 'status', i.status, 'totalCents', i.total_cents, 'dueAt', i.due_at, 'paidAt', i.paid_at,
      'periodStart', i.period_start, 'periodEnd', i.period_end, 'checkoutUrl', i.checkout_url, 'nfseStatus', i.nfse_status, 'nfseUrl', i.nfse_url,
      'lines', coalesce((select jsonb_agg(jsonb_build_object('kind', l.kind, 'description', l.description, 'amountCents', l.amount_cents) order by l.created_at) from public.subscription_invoice_lines l where l.invoice_id = i.id), '[]'::jsonb)) j
    from public.subscription_invoices i where i.restaurant_id = p_restaurant_id order by i.created_at desc limit greatest(p_limit, 1)) x), '[]'::jsonb);
end $$;
revoke all on function public.restaurant_list_invoices(uuid, integer) from public, anon;
grant execute on function public.restaurant_list_invoices(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Worker da fatura
-- ---------------------------------------------------------------------------
create or replace function public.service_invoice_claim(p_invoice_id uuid)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare i public.subscription_invoices; r public.restaurants; s public.restaurant_subscriptions;
begin
  update public.subscription_invoices set claimed_at = now(), attempts = attempts + 1
    where id = p_invoice_id and status in ('open', 'overdue') and provider_ref is null and (claimed_at is null or claimed_at < now() - interval '5 minutes')
    returning * into i;
  if i.id is null then return jsonb_build_object('claimed', false); end if;
  select * into r from public.restaurants where id = i.restaurant_id;
  select * into s from public.restaurant_subscriptions where restaurant_id = i.restaurant_id;
  return jsonb_build_object('claimed', true, 'invoiceId', i.id, 'restaurantId', r.id, 'name', r.name, 'cnpj', regexp_replace(coalesce((select c.cnpj from public.fiscal_configs c where c.restaurant_id = r.id limit 1), r.cnpj, ''), '\D', '', 'g'),
    'email', r.email, 'customerId', s.provider_customer_id, 'totalCents', i.total_cents, 'dueDate', (i.due_at at time zone 'America/Sao_Paulo')::date);
end $$;
revoke all on function public.service_invoice_claim(uuid) from public, anon, authenticated;
grant execute on function public.service_invoice_claim(uuid) to service_role;

create or replace function public.service_invoice_attach(p_invoice_id uuid, p_customer_id text, p_provider_ref text, p_checkout_url text, p_error text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_restaurant uuid;
begin
  update public.subscription_invoices set provider_ref = coalesce(p_provider_ref, provider_ref), checkout_url = coalesce(p_checkout_url, checkout_url), last_error = p_error where id = p_invoice_id returning restaurant_id into v_restaurant;
  if p_customer_id is not null then update public.restaurant_subscriptions set provider_customer_id = p_customer_id where restaurant_id = v_restaurant; end if;
end $$;
revoke all on function public.service_invoice_attach(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.service_invoice_attach(uuid, text, text, text, text) to service_role;

-- Paga: tudo volta ao normal. Nota só com os dados da empresa completos (pendência 34).
create or replace function public.service_invoice_paid(p_invoice_id uuid)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare i public.subscription_invoices; v_ready boolean;
begin
  select * into i from public.subscription_invoices where id = p_invoice_id for update;
  if i.id is null then raise exception 'Fatura não encontrada' using errcode = 'P0002'; end if;
  if i.status = 'paid' then return; end if;
  select legal_name is not null and address is not null and municipal_registration is not null and tax_regime is not null into v_ready from private.noowe_company;
  update public.subscription_invoices set status = 'paid', paid_at = now(), nfse_status = case when coalesce(v_ready, false) then 'requested' else 'waiting_company_data' end where id = i.id;
  perform private.subscription_apply_overdue(i.restaurant_id);
end $$;
revoke all on function public.service_invoice_paid(uuid) from public, anon, authenticated;
grant execute on function public.service_invoice_paid(uuid) to service_role;
