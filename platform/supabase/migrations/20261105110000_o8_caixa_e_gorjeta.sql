-- O8: caixa em centavos e auditado, ligado aos pagamentos; dia operacional; rateio de gorjeta; reabrir comanda paga.
-- O app calcula e informa o rateio: não paga gorjeta. Quem valida com a convenção coletiva é o contador do restaurante.

-- ---------------------------------------------------------------------------
-- 1. Parâmetros
-- ---------------------------------------------------------------------------
create table private.noowe_tip_retention_caps (
  regime text primary key,
  cap_bps integer not null check (cap_bps between 0 and 10000),
  updated_at timestamptz not null default now()
);
insert into private.noowe_tip_retention_caps(regime, cap_bps) values ('simples_nacional', 2000), ('outros', 3300);
revoke all on private.noowe_tip_retention_caps from public, anon, authenticated;

alter table public.restaurants add column tax_regime text check (tax_regime in ('simples_nacional', 'outros'));

-- Sem regime informado, vale o teto menor até o Dono preencher o Perfil.
create or replace function private.tip_retention_cap_bps(p_restaurant uuid)
returns integer language sql stable security definer set search_path = public, private, pg_temp as $$
  select coalesce((select c.cap_bps from public.restaurants r join private.noowe_tip_retention_caps c
      on c.regime = coalesce(r.tax_regime, 'simples_nacional') where r.id = p_restaurant),
    (select min(cap_bps) from private.noowe_tip_retention_caps))
$$;
revoke all on function private.tip_retention_cap_bps(uuid) from public, anon, authenticated;

create table public.restaurant_cash_settings (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  opening_float_cents bigint not null default 0 check (opening_float_cents >= 0),
  sangria_suggest_cents bigint check (sangria_suggest_cents > 0),
  break_limit_cents bigint not null default 0 check (break_limit_cents >= 0),
  day_turnover time not null default '06:00',
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.restaurant_cash_settings enable row level security;
create policy restaurant_cash_settings_read on public.restaurant_cash_settings for select to authenticated
  using (private.has_restaurant_role(restaurant_id, array['owner','manager']::public.user_roles_role_enum[]));

create or replace function private.cash_settings(p_restaurant uuid)
returns public.restaurant_cash_settings language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.restaurant_cash_settings;
begin
  select * into s from public.restaurant_cash_settings where restaurant_id = p_restaurant;
  if s.restaurant_id is null then
    insert into public.restaurant_cash_settings(restaurant_id) values (p_restaurant)
      on conflict (restaurant_id) do update set restaurant_id = excluded.restaurant_id returning * into s;
  end if;
  return s;
end $$;
revoke all on function private.cash_settings(uuid) from public, anon, authenticated;

-- Histórico: a regra de um dia é a mais recente que já valia. Mudança vale do próximo dia, nunca retroativa.
create table public.restaurant_tip_rules (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  effective_day date not null,
  mode text not null check (mode in ('equal', 'points', 'hours')),
  retention_bps integer not null default 0 check (retention_bps between 0 and 10000),
  role_points jsonb not null default '{}'::jsonb,
  changed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (restaurant_id, effective_day)
);
alter table public.restaurant_tip_rules enable row level security;
create policy restaurant_tip_rules_read on public.restaurant_tip_rules for select to authenticated
  using (private.has_restaurant_role(restaurant_id, array['owner','manager']::public.user_roles_role_enum[]));

-- Padrão: igualitário, sem retenção.
create or replace function private.tip_rule_for(p_restaurant uuid, p_day date, out mode text, out retention_bps integer, out role_points jsonb)
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(r.mode, 'equal'), coalesce(r.retention_bps, 0), coalesce(r.role_points, '{}'::jsonb)
  from (select 1) x left join lateral (select * from public.restaurant_tip_rules t
    where t.restaurant_id = p_restaurant and t.effective_day <= p_day order by t.effective_day desc limit 1) r on true
$$;
revoke all on function private.tip_rule_for(uuid, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Dia operacional
-- ---------------------------------------------------------------------------
create table public.operational_days (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  business_date date not null,
  status text not null default 'open' check (status in ('open', 'unclosed', 'closed')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  closed_at timestamptz,
  closed_by uuid references public.profiles(id) on delete set null,
  summary jsonb,
  alerted_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index operational_days_one_open on public.operational_days(restaurant_id) where status = 'open';
create index operational_days_restaurant_idx on public.operational_days(restaurant_id, started_at desc);
alter table public.operational_days enable row level security;
create policy operational_days_read on public.operational_days for select to authenticated
  using (private.has_restaurant_role(restaurant_id, array['owner','manager']::public.user_roles_role_enum[]));

create or replace function private.operational_day_current(p_restaurant uuid)
returns public.operational_days language plpgsql security definer set search_path = public, private, pg_temp as $$
declare d public.operational_days; s public.restaurant_cash_settings := private.cash_settings(p_restaurant);
begin
  select * into d from public.operational_days where restaurant_id = p_restaurant and status = 'open';
  if d.id is null then
    insert into public.operational_days(restaurant_id, business_date)
      values (p_restaurant, ((now() at time zone 'America/Sao_Paulo') - s.day_turnover::interval)::date)
      on conflict do nothing returning * into d;
    if d.id is null then select * into d from public.operational_days where restaurant_id = p_restaurant and status = 'open'; end if;
  end if;
  return d;
end $$;
revoke all on function private.operational_day_current(uuid) from public, anon, authenticated;

create or replace function private.day_has_sales(p_restaurant uuid, p_from timestamptz, p_to timestamptz)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.gateway_transactions g where g.restaurant_id = p_restaurant and g.status = 'completed'
    and coalesce(g.confirmed_at, g.created_at) >= p_from and coalesce(g.confirmed_at, g.created_at) < p_to)
$$;
revoke all on function private.day_has_sales(uuid, timestamptz, timestamptz) from public, anon, authenticated;

-- Passou da hora de virar: com caixa aberto só avisa; sem caixa, o dia vira. Dia com venda fica pendente de fechamento. Nada fecha sozinho.
create or replace function private.operational_day_tick()
returns integer language plpgsql security definer set search_path = public, private, pg_temp as $$
declare d public.operational_days; s public.restaurant_cash_settings; v_turn timestamptz; v_cash boolean; v_n integer := 0; v_sales boolean;
begin
  for d in select * from public.operational_days where status = 'open' loop
    begin
      s := private.cash_settings(d.restaurant_id);
      v_turn := ((d.business_date + 1)::timestamp + s.day_turnover) at time zone 'America/Sao_Paulo';
      continue when now() < v_turn;
      v_cash := exists (select 1 from public.cash_register_sessions c where c.restaurant_id = d.restaurant_id and c.status = 'open');
      v_sales := private.day_has_sales(d.restaurant_id, d.started_at, now());
      if (v_cash or v_sales) and d.alerted_at is null then
        perform private.emit_event_safe(d.restaurant_id, 'day.close_missing', 'day.close_missing:' || d.id, 'operational_day', d.id,
          jsonb_build_object('title', 'Fechamento do dia pendente', 'detail', 'O dia ' || to_char(d.business_date, 'DD/MM') || ' ainda não foi fechado.'));
        update public.operational_days set alerted_at = now() where id = d.id;
      end if;
      if not v_cash then
        update public.operational_days set status = case when v_sales then 'unclosed' else 'closed' end, ended_at = now(),
            closed_at = case when v_sales then null else now() end,
            summary = case when v_sales then null else jsonb_build_object('noSales', true) end
          where id = d.id;
        perform private.operational_day_current(d.restaurant_id);
        v_n := v_n + 1;
      end if;
    exception when others then
      raise warning 'dia operacional %: %', d.id, sqlerrm;
    end;
  end loop;
  return v_n;
end $$;
revoke all on function private.operational_day_tick() from public, anon, authenticated;

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

insert into private.event_catalog(event_type, task_type, primary_roles, manager_joins, push_policy, priority) values
  ('day.close_missing', 'notice', '{manager,owner}', false, 'always', 2),
  ('day.closed', 'notice', '{owner}', false, 'always', 3),
  ('cash.break_over_limit', 'notice', '{owner}', false, 'always', 1),
  ('tips.unallocated', 'notice', '{manager,owner}', false, 'always', 2);

-- ---------------------------------------------------------------------------
-- 3. Caixa em centavos
-- ---------------------------------------------------------------------------
alter table public.cash_register_sessions
  add column opening_cents bigint, add column expected_cents bigint, add column counted_cents bigint, add column difference_cents bigint,
  add column opened_by_id uuid references public.profiles(id) on delete set null,
  add column closed_by_id uuid references public.profiles(id) on delete set null,
  add column operational_day_id uuid references public.operational_days(id) on delete set null,
  add column needs_owner_review boolean not null default false,
  add column reviewed_by uuid references public.profiles(id) on delete set null,
  add column reviewed_at timestamptz,
  add column review_note text;
alter table public.cash_register_movements
  add column amount_cents bigint, add column actor_id uuid references public.profiles(id) on delete set null,
  add column gateway_transaction_id uuid references public.gateway_transactions(id) on delete set null;
update public.cash_register_sessions set opening_cents = round(opening_balance * 100)::bigint, expected_cents = round(coalesce(expected_balance, opening_balance) * 100)::bigint,
  counted_cents = round(actual_balance * 100)::bigint, difference_cents = round(difference * 100)::bigint;
update public.cash_register_movements set amount_cents = round(amount * 100)::bigint;
alter table public.cash_register_sessions alter column opening_cents set not null, alter column expected_cents set not null;
alter table public.cash_register_movements alter column amount_cents set not null;
create unique index cash_register_one_open on public.cash_register_sessions(restaurant_id) where status = 'open';
alter table public.cash_register_sessions enable row level security;
alter table public.cash_register_movements enable row level security;

-- Lança na gaveta aberta. Sem caixa aberto, o dinheiro não some: fica registrado para aparecer no fechamento do dia.
create or replace function private.cash_record(p_restaurant uuid, p_type text, p_cents bigint, p_description text, p_tx uuid default null, p_order uuid default null)
returns uuid language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_session public.cash_register_sessions; v_delta bigint; v_id uuid; v_name text;
begin
  select * into v_session from public.cash_register_sessions where restaurant_id = p_restaurant and status = 'open' for update;
  if v_session.id is null then
    perform private.log_system_audit(p_restaurant, 'cash.outside_register', 'payment', p_tx, 'Dinheiro lançado sem caixa aberto',
      null, jsonb_build_object('type', p_type, 'amountCents', p_cents));
    return null;
  end if;
  v_delta := case p_type when 'sale' then p_cents when 'reforco' then p_cents else -p_cents end;
  select full_name into v_name from public.profiles where id = auth.uid();
  insert into public.cash_register_movements(session_id, type, amount, amount_cents, is_cash, description, order_id, created_by, actor_id, gateway_transaction_id, created_at)
    values (v_session.id, p_type, p_cents::numeric / 100, p_cents, true, p_description, p_order, coalesce(v_name, auth.uid()::text, 'sistema'), auth.uid(), p_tx, now())
    returning id into v_id;
  update public.cash_register_sessions set expected_cents = expected_cents + v_delta, expected_balance = (expected_cents + v_delta)::numeric / 100 where id = v_session.id;
  return v_id;
end $$;
revoke all on function private.cash_record(uuid, text, bigint, text, uuid, uuid) from public, anon, authenticated;

-- Agora a fonte é a gaveta: quem lançou dinheiro neste caixa.
create or replace function private.cash_closed_by_receiver(p_restaurant uuid, p_since timestamptz)
returns boolean language sql stable security definer set search_path = public, private, pg_temp as $$
  select exists (select 1 from public.cash_register_movements m join public.cash_register_sessions s on s.id = m.session_id
    where s.restaurant_id = p_restaurant and m.type = 'sale' and m.actor_id = auth.uid() and m.created_at >= p_since)
$$;

-- Enquanto aberto, o valor esperado fica escondido: o fechamento é cego. Só o Dono vê em tempo real.
create or replace function public.restaurant_get_cash_register(p_restaurant_id uuid)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v public.cash_register_sessions; v_owner boolean; v_manage boolean; s public.restaurant_cash_settings; v_in_drawer bigint;
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner','manager','cashier','waiter']::public.user_roles_role_enum[]);
  select * into v from public.cash_register_sessions where restaurant_id = p_restaurant_id and status = 'open' order by opened_at desc limit 1;
  if v.id is null then return jsonb_build_object('session', null, 'history', '[]'::jsonb); end if;
  v_owner := private.has_restaurant_role(p_restaurant_id, array['owner']::public.user_roles_role_enum[]);
  v_manage := v_owner or private.has_restaurant_role(p_restaurant_id, array['manager','cashier']::public.user_roles_role_enum[]);
  -- Garçom só precisa saber se o caixa está aberto.
  if not v_manage then
    return jsonb_build_object('session', jsonb_build_object('id', v.id, 'status', v.status, 'opened_at', v.opened_at), 'history', '[]'::jsonb);
  end if;
  s := private.cash_settings(p_restaurant_id);
  return jsonb_build_object('session', jsonb_build_object('id', v.id, 'restaurant_id', v.restaurant_id,
      'opening_balance', v.opening_cents::numeric / 100, 'opening_cents', v.opening_cents,
      'expected_balance', case when v_owner then v.expected_cents::numeric / 100 end,
      'expected_cents', case when v_owner then v.expected_cents end,
      'status', v.status, 'opened_at', v.opened_at, 'opened_by', v.opened_by,
      'suggest_sangria', s.sangria_suggest_cents is not null and v.expected_cents >= s.sangria_suggest_cents,
      'movements', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'type', m.type, 'amount', m.amount_cents::numeric / 100, 'amount_cents', m.amount_cents,
          'is_cash', m.is_cash, 'description', m.description, 'order_id', m.order_id, 'created_by', m.created_by, 'created_at', m.created_at) order by m.created_at desc)
        from public.cash_register_movements m where m.session_id = v.id and (v_owner or m.type in ('sangria', 'reforco'))), '[]'::jsonb)),
    'history', '[]'::jsonb);
end $$;

drop function public.restaurant_open_cash_register(uuid, numeric);
create function public.restaurant_open_cash_register(p_restaurant_id uuid, p_opening_balance numeric default null)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v public.cash_register_sessions; v_cents bigint; v_name text; d public.operational_days; s public.restaurant_cash_settings;
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner','manager','cashier']::public.user_roles_role_enum[]);
  if exists (select 1 from public.cash_register_sessions where restaurant_id = p_restaurant_id and status = 'open') then
    raise exception 'Cash register already open' using errcode = '23505'; end if;
  s := private.cash_settings(p_restaurant_id);
  v_cents := coalesce(round(p_opening_balance * 100)::bigint, s.opening_float_cents);
  if v_cents < 0 then raise exception 'Fundo de troco inválido' using errcode = '22023'; end if;
  d := private.operational_day_current(p_restaurant_id);
  select full_name into v_name from public.profiles where id = auth.uid();
  insert into public.cash_register_sessions(restaurant_id, opened_by, opened_by_id, opening_balance, expected_balance, opening_cents, expected_cents, status, opened_at, operational_day_id)
    values (p_restaurant_id, coalesce(v_name, auth.uid()::text), auth.uid(), v_cents::numeric / 100, v_cents::numeric / 100, v_cents, v_cents, 'open', now(), d.id)
    returning * into v;
  perform private.log_audit(p_restaurant_id, 'cash.opened', 'cash_register_session', v.id, 'Abertura de caixa', null, jsonb_build_object('openingCents', v_cents));
  return jsonb_build_object('id', v.id, 'restaurant_id', v.restaurant_id, 'opening_balance', v.opening_balance, 'opening_cents', v_cents,
    'status', v.status, 'opened_at', v.opened_at, 'opened_by', v.opened_by, 'movements', '[]'::jsonb);
end $$;
revoke all on function public.restaurant_open_cash_register(uuid, numeric) from public, anon;
grant execute on function public.restaurant_open_cash_register(uuid, numeric) to authenticated, service_role;

-- Sangria e reforço, com motivo e responsável. Venda e estorno entram sozinhos, pelos pagamentos.
create or replace function public.restaurant_add_cash_movement(
  p_session_id uuid, p_type text, p_amount numeric, p_description text default null, p_is_cash boolean default true, p_order_id uuid default null
) returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v public.cash_register_sessions; v_cents bigint := round(coalesce(p_amount, 0) * 100)::bigint; v_id uuid; v_reason text := nullif(btrim(coalesce(p_description, '')), '');
begin
  select * into v from public.cash_register_sessions where id = p_session_id and status = 'open';
  if v.id is null then raise exception 'Cash register session not found or already closed' using errcode = 'P0002'; end if;
  perform private.require_restaurant_role(v.restaurant_id, array['owner','manager','cashier']::public.user_roles_role_enum[]);
  if p_type not in ('sangria', 'reforco') then raise exception 'Invalid movement type: %', p_type using errcode = '22023'; end if;
  if v_cents <= 0 then raise exception 'Valor inválido' using errcode = '22023'; end if;
  if v_reason is null then raise exception 'Motivo obrigatório' using errcode = '22023'; end if;
  v_id := private.cash_record(v.restaurant_id, p_type, v_cents, v_reason, null, p_order_id);
  perform private.log_audit(v.restaurant_id, 'cash.' || p_type, 'cash_register_session', v.id, v_reason, null, jsonb_build_object('amountCents', v_cents, 'movementId', v_id));
  return (select to_jsonb(m) from public.cash_register_movements m where m.id = v_id);
end $$;

-- Fechamento cego: conta, informa, e só então vê o esperado. Quebra acima do limite vai ao Dono.
create or replace function public.restaurant_close_cash_register(p_session_id uuid, p_actual_balance numeric, p_closing_notes text default null)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v public.cash_register_sessions; v_name text; v_counted bigint := round(p_actual_balance * 100)::bigint; v_diff bigint; s public.restaurant_cash_settings; v_over boolean;
begin
  select * into v from public.cash_register_sessions where id = p_session_id and status = 'open' for update;
  if v.id is null then raise exception 'Cash register session not found or already closed' using errcode = 'P0002'; end if;
  perform private.require_restaurant_role(v.restaurant_id, array['owner','manager']::public.user_roles_role_enum[]);
  if v_counted is null or v_counted < 0 then raise exception 'Valor contado inválido' using errcode = '22023'; end if;
  s := private.cash_settings(v.restaurant_id);
  v_diff := v_counted - v.expected_cents;
  v_over := abs(v_diff) > s.break_limit_cents;
  select full_name into v_name from public.profiles where id = auth.uid();
  update public.cash_register_sessions set status = 'closed', actual_balance = v_counted::numeric / 100, difference = v_diff::numeric / 100,
      counted_cents = v_counted, difference_cents = v_diff, needs_owner_review = v_over, closed_at = now(),
      closed_by = coalesce(v_name, auth.uid()::text), closed_by_id = auth.uid(), closing_notes = p_closing_notes
    where id = p_session_id returning * into v;
  perform private.log_audit(v.restaurant_id, 'cash.closed', 'cash_register_session', v.id, coalesce(p_closing_notes, 'Fechamento de caixa'),
    jsonb_build_object('expectedCents', v.expected_cents), jsonb_build_object('countedCents', v_counted, 'differenceCents', v_diff));
  if v_over then
    perform private.emit_event_safe(v.restaurant_id, 'cash.break_over_limit', 'cash.break_over_limit:' || v.id, 'cash_register_session', v.id,
      jsonb_build_object('title', 'Quebra de caixa acima do limite', 'detail', 'Diferença de ' || to_char(v_diff::numeric / 100, 'FM999G990D00') || ' no fechamento de ' || coalesce(v_name, 'alguém da equipe') || '.'));
  end if;
  if private.cash_closed_by_receiver(v.restaurant_id, v.opened_at) then
    perform private.log_audit(v.restaurant_id, 'cash.closed_by_receiver', 'cash_register_session', p_session_id,
      'Caixa fechado por quem recebeu dinheiro neste período', null, jsonb_build_object('differenceCents', v_diff));
    -- O Dono que fecha o próprio caixa não precisa ser avisado disso.
    if not private.has_restaurant_role(v.restaurant_id, array['owner']::public.user_roles_role_enum[]) then
      perform private.emit_event_safe(v.restaurant_id, 'cash.closed_by_receiver', 'cash.closed_by_receiver:' || p_session_id,
        'cash_register_session', p_session_id,
        jsonb_build_object('title', 'Caixa fechado por quem recebeu dinheiro',
          'detail', coalesce(v_name, 'Alguém da equipe') || ' lançou dinheiro e fechou este caixa'));
    end if;
  end if;
  return to_jsonb(v);
end $$;

create or replace function public.restaurant_review_cash_break(p_session_id uuid, p_note text)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v public.cash_register_sessions;
begin
  select * into v from public.cash_register_sessions where id = p_session_id for update;
  if v.id is null then raise exception 'Caixa não encontrado' using errcode = 'P0002'; end if;
  perform private.require_restaurant_role(v.restaurant_id, array['owner']::public.user_roles_role_enum[]);
  if nullif(btrim(coalesce(p_note, '')), '') is null then raise exception 'Motivo obrigatório' using errcode = '22023'; end if;
  update public.cash_register_sessions set needs_owner_review = false, reviewed_by = auth.uid(), reviewed_at = now(), review_note = btrim(p_note) where id = v.id returning * into v;
  perform private.log_audit(v.restaurant_id, 'cash.break_reviewed', 'cash_register_session', v.id, btrim(p_note), null, jsonb_build_object('differenceCents', v.difference_cents));
  return to_jsonb(v);
end $$;
revoke all on function public.restaurant_review_cash_break(uuid, text) from public, anon;
grant execute on function public.restaurant_review_cash_break(uuid, text) to authenticated;

create or replace function public.restaurant_get_cash_settings(p_restaurant_id uuid)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare s public.restaurant_cash_settings;
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner','manager']::public.user_roles_role_enum[]);
  s := private.cash_settings(p_restaurant_id);
  return jsonb_build_object('openingFloatCents', s.opening_float_cents, 'sangriaSuggestCents', s.sangria_suggest_cents,
    'breakLimitCents', s.break_limit_cents, 'dayTurnover', to_char(s.day_turnover, 'HH24:MI'));
end $$;
revoke all on function public.restaurant_get_cash_settings(uuid) from public, anon;
grant execute on function public.restaurant_get_cash_settings(uuid) to authenticated;

-- Limite de quebra só o Dono (resposta 19). Fundo de troco, sangria sugerida e virada do dia: Dono e Gerente.
create or replace function public.restaurant_update_cash_settings(
  p_restaurant_id uuid, p_opening_float_cents bigint, p_sangria_suggest_cents bigint, p_day_turnover text, p_break_limit_cents bigint default null
) returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare o public.restaurant_cash_settings; n public.restaurant_cash_settings;
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner','manager']::public.user_roles_role_enum[]);
  o := private.cash_settings(p_restaurant_id);
  if p_break_limit_cents is not null and p_break_limit_cents <> o.break_limit_cents
     and not private.has_restaurant_role(p_restaurant_id, array['owner']::public.user_roles_role_enum[]) then
    raise exception 'Só o Dono altera o limite de quebra' using errcode = '42501'; end if;
  if p_opening_float_cents < 0 or p_sangria_suggest_cents <= 0 or p_break_limit_cents < 0 then raise exception 'Valor inválido' using errcode = '22023'; end if;
  update public.restaurant_cash_settings set opening_float_cents = coalesce(p_opening_float_cents, opening_float_cents),
      sangria_suggest_cents = p_sangria_suggest_cents, break_limit_cents = coalesce(p_break_limit_cents, break_limit_cents),
      day_turnover = coalesce(p_day_turnover::time, day_turnover), updated_by = auth.uid(), updated_at = now()
    where restaurant_id = p_restaurant_id returning * into n;
  perform private.log_audit(p_restaurant_id, 'cash.settings_changed', 'restaurant_cash_settings', p_restaurant_id, 'Parâmetros de caixa alterados', to_jsonb(o) - 'updated_at', to_jsonb(n) - 'updated_at');
  return public.restaurant_get_cash_settings(p_restaurant_id);
end $$;
revoke all on function public.restaurant_update_cash_settings(uuid, bigint, bigint, text, bigint) from public, anon;
grant execute on function public.restaurant_update_cash_settings(uuid, bigint, bigint, text, bigint) to authenticated;

create or replace function private.enqueue_refund(
  p_transaction_id uuid, p_reason text, p_amount_cents bigint default null, p_requested_by uuid default null, p_approval_id uuid default null
) returns uuid language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_tx public.gateway_transactions; v_available bigint; v_cents bigint; v_total boolean; v_id uuid; v_direct boolean;
begin
  select * into v_tx from public.gateway_transactions where id = p_transaction_id for update;
  if v_tx.id is null then raise exception 'Payment transaction not found' using errcode = 'P0002'; end if;
  v_available := private.refund_available_cents(v_tx.id);
  v_cents := coalesce(p_amount_cents, v_available);
  -- Repetir um estorno inteiro (pagamento tardio reprocessado) não faz nada.
  if p_amount_cents is null and v_cents <= 0 then return null; end if;
  if v_cents <= 0 or v_cents > v_available then
    raise exception 'Valor acima do que ainda pode ser estornado' using errcode = '23514'; end if;
  v_total := v_cents = v_available;
  -- Sem provedor no caminho (simulado ou presencial), não há o que esperar. Devolver o dinheiro da gaveta é a O8.
  v_direct := v_tx.provider in ('simulated', 'manual');

  insert into public.payment_refunds(restaurant_id, gateway_transaction_id, amount_cents, reason, status, sent_at, done_at, requested_by, approval_id)
    values (v_tx.restaurant_id, v_tx.id, v_cents, coalesce(nullif(btrim(p_reason), ''), 'Estorno'),
      case when v_direct then 'done' else 'pending' end, case when v_direct then now() end, case when v_direct then now() end,
      p_requested_by, p_approval_id)
    returning id into v_id;
  if v_direct then
    update public.gateway_transactions set refunded_amount_cents = refunded_amount_cents + v_cents,
        status = case when v_total then 'refunded' else status end,
        refund_requested_at = coalesce(refund_requested_at, now()), updated_at = now(),
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('refund_reason', p_reason)
      where id = v_tx.id;
    -- Devolver dinheiro sai da gaveta.
    if v_tx.provider = 'manual' and v_tx.payment_method = 'cash' then
      perform private.cash_record(v_tx.restaurant_id, 'refund', v_cents, 'Estorno: ' || coalesce(p_reason, ''), v_tx.id, v_tx.order_id);
    end if;
    if v_total then
      update public.bill_shares set status = 'refunded', updated_at = now() where payment_id = v_tx.id and status = 'paid';
    end if;
  else
    update public.gateway_transactions set status = case when v_total then 'refund_pending' else status end,
        refund_requested_at = coalesce(refund_requested_at, now()), updated_at = now(),
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('refund_reason', p_reason)
      where id = v_tx.id;
  end if;
  perform private.log_system_audit(v_tx.restaurant_id, 'payment.refund_enqueued', 'payment', v_tx.id,
    p_reason, jsonb_build_object('status', v_tx.status), jsonb_build_object('refundId', v_id, 'amountCents', v_cents, 'total', v_total));
  return v_id;
end $$;

create or replace function public.restaurant_record_bill_payment(
  p_table_session_id uuid, p_payment_method text, p_idempotency_key uuid,
  p_base_cents bigint default null, p_waive_fee boolean default false, p_tip_cents bigint default 0, p_reason text default null
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
  if v_session.id is null then raise exception 'Table session not found' using errcode = 'P0002'; end if;
  perform private.require_restaurant_role(v_session.restaurant_id, array['owner','manager','waiter','maitre']::public.user_roles_role_enum[]);

  v_key := 'manual-share:' || p_table_session_id || ':' || p_idempotency_key;
  select * into v_tx from public.gateway_transactions where idempotency_key = v_key;
  if v_tx.id is not null then
    return jsonb_build_object('transactionId', v_tx.id, 'shareId', v_tx.bill_share_id, 'amountCents', v_tx.amount_cents, 'idempotentReplay', true);
  end if;
  if v_session.status <> 'active' then raise exception 'Sessão já encerrada' using errcode = 'P0001'; end if;

  v_balance := private.session_consumption_balance(p_table_session_id);
  if v_balance <= 0 then raise exception 'Esta conta já está quitada' using errcode = 'P0011'; end if;
  if p_base_cents is not null and p_base_cents <= 0 then raise exception 'Valor inválido' using errcode = '22023'; end if;
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
      p_table_session_id, v_share, now(), jsonb_build_object('recorded_by', auth.uid(), 'external', p_payment_method <> 'cash'), now(), now())
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
    array['owner','manager','waiter']::public.user_roles_role_enum[]
  );

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
    -- Quem cobra a mesa vê quem já pagou. Maître não vê caixa nem taxas da plataforma.
    'payers', coalesce((select jsonb_agg(jsonb_build_object('name', coalesce(p.display_name, 'Pago no salão'), 'baseCents', b.base_cents,
        'method', g.payment_method, 'paidAt', b.paid_at) order by b.paid_at)
      from public.bill_shares b left join public.table_session_participants p on p.id = b.participant_id
      left join public.gateway_transactions g on g.id = b.payment_id
      where b.table_session_id = p_table_session_id and b.status = 'paid'), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------------
-- 4. Rateio de gorjeta
-- ---------------------------------------------------------------------------
create table public.tip_distributions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  operational_day_id uuid not null unique references public.operational_days(id) on delete cascade,
  mode text not null,
  retention_bps integer not null,
  pool_cents bigint not null,
  retained_cents bigint not null,
  distributed_cents bigint not null,
  unallocated_cents bigint not null,
  created_at timestamptz not null default now(),
  check (retained_cents + distributed_cents + unallocated_cents = pool_cents)
);
create table public.tip_distribution_lines (
  id uuid primary key default gen_random_uuid(),
  distribution_id uuid not null references public.tip_distributions(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text,
  weight numeric not null,
  amount_cents bigint not null check (amount_cents >= 0),
  created_at timestamptz not null default now()
);
create index tip_distribution_lines_user_idx on public.tip_distribution_lines(user_id, created_at desc);
alter table public.tip_distributions enable row level security;
alter table public.tip_distribution_lines enable row level security;
create policy tip_distributions_read on public.tip_distributions for select to authenticated
  using (private.has_restaurant_role(restaurant_id, array['owner','manager']::public.user_roles_role_enum[]));
-- Cada pessoa vê só o próprio extrato; Dono e Gerente veem o relatório.
create policy tip_distribution_lines_read on public.tip_distribution_lines for select to authenticated
  using (user_id = auth.uid() or private.has_restaurant_role(restaurant_id, array['owner','manager']::public.user_roles_role_enum[]));

-- Minutos do turno pela entrada e saída registradas, ou pela escala. Turno que passa da meia-noite vale.
create or replace function private.shift_minutes(p_start text, p_end text, p_actual_start text, p_actual_end text, p_break numeric)
returns numeric language plpgsql immutable as $$
declare a time; b time; v numeric;
begin
  a := coalesce(nullif(p_actual_start, ''), p_start)::time;
  b := coalesce(nullif(p_actual_end, ''), p_end)::time;
  v := extract(epoch from (b - a)) / 60;
  if v <= 0 then v := v + 1440; end if;
  return greatest(v - coalesce(p_break, 0), 0);
exception when others then return 0;
end $$;
revoke all on function private.shift_minutes(text, text, text, text, numeric) from public, anon, authenticated;

-- Taxa de serviço e gorjeta entram juntas (ADR-029). O que foi estornado sai.
create or replace function private.tip_pool_cents(p_restaurant uuid, p_from timestamptz, p_to timestamptz)
returns bigint language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select sum(b.service_fee_cents + b.tip_cents) from public.bill_shares b
      where b.restaurant_id = p_restaurant and b.status = 'paid' and b.paid_at >= p_from and b.paid_at < p_to), 0)
    + coalesce((select sum(g.tip_cents) from public.gateway_transactions g
      where g.restaurant_id = p_restaurant and g.purpose = 'order' and g.status = 'completed'
        and coalesce(g.confirmed_at, g.created_at) >= p_from and coalesce(g.confirmed_at, g.created_at) < p_to), 0)
$$;
revoke all on function private.tip_pool_cents(uuid, timestamptz, timestamptz) from public, anon, authenticated;

-- Pessoa com mais de uma função entra pela função escalada no turno. A soma fecha ao centavo.
create or replace function private.tip_distribute(p_day public.operational_days, p_to timestamptz)
returns public.tip_distributions language plpgsql security definer set search_path = public, private, pg_temp as $$
declare rule record; v_pool bigint; v_retained bigint; v_rest bigint; v_ids uuid[]; v_roles text[]; v_weights numeric[]; v_scaled bigint[]; v_amounts bigint[]; v_dist public.tip_distributions; v_un bigint := 0; i integer;
begin
  select * into v_dist from public.tip_distributions where operational_day_id = p_day.id;
  if v_dist.id is not null then return v_dist; end if;
  select * into rule from private.tip_rule_for(p_day.restaurant_id, p_day.business_date);
  v_pool := private.tip_pool_cents(p_day.restaurant_id, p_day.started_at, p_to);
  v_retained := div(v_pool * rule.retention_bps + 5000, 10000)::bigint;
  v_rest := v_pool - v_retained;
  select array_agg(x.staff_id order by x.staff_id, x.role), array_agg(x.role order by x.staff_id, x.role), array_agg(x.w order by x.staff_id, x.role)
    into v_ids, v_roles, v_weights
  from (
    select s.staff_id, s.role,
      case rule.mode
        when 'equal' then 1::numeric
        when 'points' then sum(coalesce((rule.role_points->>coalesce(s.role, ''))::numeric, 1))
        else sum(private.shift_minutes(s.start_time, s.end_time, s.actual_start_time, s.actual_end_time, s.break_minutes)) end as w
    from public.shifts s
    where s.restaurant_id = p_day.restaurant_id and s.status not in ('cancelled', 'canceled')
      and (s.date at time zone 'America/Sao_Paulo')::date = p_day.business_date
    group by s.staff_id, s.role) x
  where x.w > 0;
  if v_ids is null or v_rest = 0 then
    v_un := v_rest;
  else
    v_scaled := (select array_agg(round(w * 1000)::bigint order by ord) from unnest(v_weights) with ordinality t(w, ord));
    v_amounts := private.allocate_proportional(v_rest, v_scaled);
  end if;
  insert into public.tip_distributions(restaurant_id, operational_day_id, mode, retention_bps, pool_cents, retained_cents, distributed_cents, unallocated_cents)
    values (p_day.restaurant_id, p_day.id, rule.mode, rule.retention_bps, v_pool, v_retained, v_rest - v_un, v_un) returning * into v_dist;
  for i in 1 .. coalesce(array_length(v_amounts, 1), 0) loop
    insert into public.tip_distribution_lines(distribution_id, restaurant_id, user_id, role, weight, amount_cents)
      values (v_dist.id, p_day.restaurant_id, v_ids[i], v_roles[i], v_weights[i], v_amounts[i]);
  end loop;
  if v_un > 0 then
    perform private.emit_event_safe(p_day.restaurant_id, 'tips.unallocated', 'tips.unallocated:' || p_day.id, 'operational_day', p_day.id,
      jsonb_build_object('title', 'Gorjeta sem rateio', 'detail', 'Ninguém estava na escala do dia ' || to_char(p_day.business_date, 'DD/MM') || '. Confira o relatório.'));
  end if;
  return v_dist;
end $$;
revoke all on function private.tip_distribute(public.operational_days, timestamptz) from public, anon, authenticated;

-- Fecha o dia: bloqueia com comanda ou caixa abertos, gera o rateio e manda o resumo ao Dono.
create or replace function public.restaurant_close_operational_day(p_restaurant_id uuid, p_day_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare d public.operational_days; v_to timestamptz; v_open integer; v_dist public.tip_distributions; v_summary jsonb; v_next public.operational_days;
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner','manager']::public.user_roles_role_enum[]);
  if p_day_id is null then d := private.operational_day_current(p_restaurant_id);
  else select * into d from public.operational_days where id = p_day_id and restaurant_id = p_restaurant_id for update; end if;
  if d.id is null then raise exception 'Dia operacional não encontrado' using errcode = 'P0002'; end if;
  if d.status = 'closed' then raise exception 'Este dia já foi fechado' using errcode = 'P0001'; end if;
  if d.status = 'open' then
    select count(*) into v_open from public.table_sessions where restaurant_id = p_restaurant_id and status = 'active';
    if v_open > 0 then raise exception 'Há % comanda(s) aberta(s). Feche antes de encerrar o dia.', v_open using errcode = 'P0001'; end if;
    if exists (select 1 from public.cash_register_sessions where restaurant_id = p_restaurant_id and status = 'open') then
      raise exception 'Feche o caixa antes de encerrar o dia.' using errcode = 'P0001'; end if;
  end if;
  v_to := coalesce(d.ended_at, now());
  v_dist := private.tip_distribute(d, v_to);
  select jsonb_build_object('businessDate', d.business_date,
      'byMethod', coalesce((select jsonb_object_agg(x.m, x.c) from (select g.payment_method m, sum(g.amount_cents - g.refunded_amount_cents)::bigint c
        from public.gateway_transactions g where g.restaurant_id = p_restaurant_id and g.status = 'completed'
          and coalesce(g.confirmed_at, g.created_at) >= d.started_at and coalesce(g.confirmed_at, g.created_at) < v_to group by 1) x), '{}'::jsonb),
      'externalCents', coalesce((select sum(g.amount_cents - g.refunded_amount_cents)::bigint from public.gateway_transactions g
        where g.restaurant_id = p_restaurant_id and g.status = 'completed' and g.provider = 'manual' and g.payment_method <> 'cash'
          and coalesce(g.confirmed_at, g.created_at) >= d.started_at and coalesce(g.confirmed_at, g.created_at) < v_to), 0),
      'cashDifferenceCents', coalesce((select sum(c.difference_cents)::bigint from public.cash_register_sessions c
        where c.restaurant_id = p_restaurant_id and c.closed_at >= d.started_at and c.closed_at < v_to + interval '1 second'), 0),
      'tipPoolCents', v_dist.pool_cents, 'tipRetainedCents', v_dist.retained_cents, 'tipDistributedCents', v_dist.distributed_cents,
      'tipUnallocatedCents', v_dist.unallocated_cents)
    into v_summary;
  update public.operational_days set status = 'closed', ended_at = v_to, closed_at = now(), closed_by = auth.uid(), summary = v_summary where id = d.id;
  perform private.log_audit(p_restaurant_id, 'day.closed', 'operational_day', d.id, 'Fechamento do dia', null, v_summary);
  perform private.emit_event_safe(p_restaurant_id, 'day.closed', 'day.closed:' || d.id, 'operational_day', d.id,
    jsonb_build_object('title', 'Dia ' || to_char(d.business_date, 'DD/MM') || ' fechado', 'detail', 'Veja o resumo do dia e o rateio da gorjeta.', 'summary', v_summary));
  v_next := private.operational_day_current(p_restaurant_id);
  return v_summary || jsonb_build_object('dayId', d.id, 'nextDayId', v_next.id);
end $$;
revoke all on function public.restaurant_close_operational_day(uuid, uuid) from public, anon;
grant execute on function public.restaurant_close_operational_day(uuid, uuid) to authenticated;

create or replace function public.restaurant_get_day_status(p_restaurant_id uuid)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare d public.operational_days;
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner','manager']::public.user_roles_role_enum[]);
  d := private.operational_day_current(p_restaurant_id);
  return jsonb_build_object('dayId', d.id, 'businessDate', d.business_date, 'startedAt', d.started_at,
    'openSessions', (select count(*) from public.table_sessions where restaurant_id = p_restaurant_id and status = 'active'),
    'cashOpen', exists (select 1 from public.cash_register_sessions where restaurant_id = p_restaurant_id and status = 'open'),
    'unclosedDays', coalesce((select jsonb_agg(jsonb_build_object('dayId', x.id, 'businessDate', x.business_date) order by x.business_date)
      from public.operational_days x where x.restaurant_id = p_restaurant_id and x.status = 'unclosed'), '[]'::jsonb),
    'pendingBreaks', coalesce((select jsonb_agg(jsonb_build_object('sessionId', c.id, 'differenceCents', c.difference_cents, 'closedAt', c.closed_at) order by c.closed_at)
      from public.cash_register_sessions c where c.restaurant_id = p_restaurant_id and c.needs_owner_review), '[]'::jsonb));
end $$;
revoke all on function public.restaurant_get_day_status(uuid) from public, anon;
grant execute on function public.restaurant_get_day_status(uuid) to authenticated;

create or replace function public.restaurant_get_tip_rules(p_restaurant_id uuid)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare d public.operational_days; cur record; nxt public.restaurant_tip_rules;
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner','manager']::public.user_roles_role_enum[]);
  d := private.operational_day_current(p_restaurant_id);
  select * into cur from private.tip_rule_for(p_restaurant_id, d.business_date);
  select * into nxt from public.restaurant_tip_rules where restaurant_id = p_restaurant_id and effective_day > d.business_date order by effective_day desc limit 1;
  return jsonb_build_object('mode', cur.mode, 'retentionBps', cur.retention_bps, 'rolePoints', cur.role_points,
    'capBps', private.tip_retention_cap_bps(p_restaurant_id), 'taxRegime', (select tax_regime from public.restaurants where id = p_restaurant_id),
    'pending', case when nxt.id is null then null else jsonb_build_object('mode', nxt.mode, 'retentionBps', nxt.retention_bps, 'rolePoints', nxt.role_points, 'effectiveDay', nxt.effective_day) end);
end $$;
revoke all on function public.restaurant_get_tip_rules(uuid) from public, anon;
grant execute on function public.restaurant_get_tip_rules(uuid) to authenticated;

-- Vale do próximo dia operacional, nunca retroativa. Com autor, antes e depois.
create or replace function public.restaurant_update_tip_rules(p_restaurant_id uuid, p_mode text, p_retention_bps integer, p_role_points jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare d public.operational_days; cur record; v_day date;
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner','manager']::public.user_roles_role_enum[]);
  if p_mode not in ('equal', 'points', 'hours') then raise exception 'Modo de rateio inválido' using errcode = '22023'; end if;
  if p_retention_bps < 0 or p_retention_bps > private.tip_retention_cap_bps(p_restaurant_id) then
    raise exception 'A retenção passa do teto do regime tributário' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_each_text(coalesce(p_role_points, '{}'::jsonb)) x where x.value !~ '^\d+(\.\d+)?$') then
    raise exception 'Pontos inválidos' using errcode = '22023'; end if;
  d := private.operational_day_current(p_restaurant_id);
  select * into cur from private.tip_rule_for(p_restaurant_id, d.business_date);
  v_day := d.business_date + 1;
  insert into public.restaurant_tip_rules(restaurant_id, effective_day, mode, retention_bps, role_points, changed_by)
    values (p_restaurant_id, v_day, p_mode, p_retention_bps, coalesce(p_role_points, '{}'::jsonb), auth.uid())
    on conflict (restaurant_id, effective_day) do update set mode = excluded.mode, retention_bps = excluded.retention_bps,
      role_points = excluded.role_points, changed_by = excluded.changed_by, created_at = now();
  perform private.log_audit(p_restaurant_id, 'tips.rules_changed', 'restaurant_tip_rules', p_restaurant_id, 'Regras de rateio alteradas',
    jsonb_build_object('mode', cur.mode, 'retentionBps', cur.retention_bps, 'rolePoints', cur.role_points),
    jsonb_build_object('mode', p_mode, 'retentionBps', p_retention_bps, 'rolePoints', p_role_points, 'effectiveDay', v_day));
  return public.restaurant_get_tip_rules(p_restaurant_id);
end $$;
revoke all on function public.restaurant_update_tip_rules(uuid, text, integer, jsonb) from public, anon;
grant execute on function public.restaurant_update_tip_rules(uuid, text, integer, jsonb) to authenticated;

create or replace function public.restaurant_set_tax_regime(p_restaurant_id uuid, p_regime text)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_old text;
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner','manager']::public.user_roles_role_enum[]);
  if p_regime not in ('simples_nacional', 'outros') then raise exception 'Regime inválido' using errcode = '22023'; end if;
  select tax_regime into v_old from public.restaurants where id = p_restaurant_id;
  update public.restaurants set tax_regime = p_regime where id = p_restaurant_id;
  perform private.log_audit(p_restaurant_id, 'restaurant.tax_regime_changed', 'restaurant', p_restaurant_id, 'Regime tributário alterado',
    jsonb_build_object('regime', v_old), jsonb_build_object('regime', p_regime));
  return jsonb_build_object('taxRegime', p_regime, 'capBps', private.tip_retention_cap_bps(p_restaurant_id));
end $$;
revoke all on function public.restaurant_set_tax_regime(uuid, text) from public, anon;
grant execute on function public.restaurant_set_tax_regime(uuid, text) to authenticated;

-- "Minha gorjeta": cada pessoa vê só o próprio extrato. O repasse é da folha do restaurante.
create or replace function public.restaurant_my_tips(p_restaurant_id uuid, p_limit integer default 30)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  return coalesce((select jsonb_agg(x.j order by x.d desc) from (
    select d.business_date as d, jsonb_build_object('businessDate', d.business_date, 'role', l.role, 'amountCents', l.amount_cents, 'mode', t.mode, 'weight', l.weight) j
    from public.tip_distribution_lines l join public.tip_distributions t on t.id = l.distribution_id
    join public.operational_days d on d.id = t.operational_day_id
    where l.restaurant_id = p_restaurant_id and l.user_id = auth.uid() order by d.business_date desc limit greatest(p_limit, 1)) x), '[]'::jsonb);
end $$;
revoke all on function public.restaurant_my_tips(uuid, integer) from public, anon;
grant execute on function public.restaurant_my_tips(uuid, integer) to authenticated;

-- Relatório para a folha.
create or replace function public.restaurant_tip_report(p_restaurant_id uuid, p_day_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare t public.tip_distributions;
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner','manager']::public.user_roles_role_enum[]);
  select * into t from public.tip_distributions where restaurant_id = p_restaurant_id and operational_day_id = p_day_id;
  if t.id is null then raise exception 'Rateio não encontrado' using errcode = 'P0002'; end if;
  return jsonb_build_object('mode', t.mode, 'retentionBps', t.retention_bps, 'poolCents', t.pool_cents, 'retainedCents', t.retained_cents,
    'distributedCents', t.distributed_cents, 'unallocatedCents', t.unallocated_cents,
    'lines', coalesce((select jsonb_agg(jsonb_build_object('userId', l.user_id, 'name', coalesce(p.full_name, 'Sem nome'), 'role', l.role, 'weight', l.weight, 'amountCents', l.amount_cents) order by p.full_name)
      from public.tip_distribution_lines l left join public.profiles p on p.id = l.user_id where l.distribution_id = t.id), '[]'::jsonb));
end $$;
revoke all on function public.restaurant_tip_report(uuid, uuid) from public, anon;
grant execute on function public.restaurant_tip_report(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Reabrir comanda paga e "Estornar valor"
-- ---------------------------------------------------------------------------
alter table public.approvals add column table_session_id uuid references public.table_sessions(id) on delete set null;
alter table public.tables add column is_standalone boolean not null default false;

-- Os pagamentos feitos continuam valendo: só a diferença fica em aberto. Mesa ocupada: comanda avulsa, com mesa própria.
create or replace function private.reopen_paid_session(p_session uuid, p_reason text)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare s public.table_sessions; v_table uuid;
begin
  select * into s from public.table_sessions where id = p_session for update;
  perform private.assert_session_reopenable(s);
  v_table := s.table_id;
  if exists (select 1 from public.table_sessions x where x.table_id = s.table_id and x.status = 'active') then
    insert into public.tables(restaurant_id, table_number, seats, status, is_standalone, qr_code, created_at, updated_at)
      values (s.restaurant_id, 'Avulsa ' || left(s.id::text, 4), 1, 'occupied', true, 'avulsa-' || s.id, now(), now())
      returning id into v_table;
  else
    update public.tables set status = 'occupied', occupied_since = now(), updated_at = now() where id = s.table_id;
  end if;
  update public.table_sessions set status = 'active', table_id = v_table, ended_at = null, billing_status = 'open',
      reopened_count = reopened_count + 1, reopened_at = now(), updated_at = now() where id = p_session;
  perform private.log_system_audit(s.restaurant_id, 'bill.reopened_paid', 'table_session', p_session, p_reason,
    jsonb_build_object('status', s.status, 'tableId', s.table_id), jsonb_build_object('status', 'active', 'tableId', v_table));
end $$;
revoke all on function private.reopen_paid_session(uuid, text) from public, anon, authenticated;

-- Só no mesmo dia operacional, antes do fechamento do caixa (item 3 do aditivo).
create or replace function private.assert_session_reopenable(s public.table_sessions)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare d public.operational_days := private.operational_day_current(s.restaurant_id);
begin
  if s.id is null then raise exception 'Comanda não encontrada' using errcode = 'P0002'; end if;
  if s.status = 'active' then raise exception 'Esta comanda já está aberta' using errcode = 'P0001'; end if;
  if s.ended_at is null or s.ended_at < d.started_at then
    raise exception 'Só dá para reabrir no mesmo dia operacional' using errcode = 'P0001'; end if;
  if exists (select 1 from public.cash_register_sessions c where c.restaurant_id = s.restaurant_id and c.closed_at >= s.ended_at) then
    raise exception 'O caixa já foi fechado depois desta comanda' using errcode = 'P0001'; end if;
end $$;
revoke all on function private.assert_session_reopenable(public.table_sessions) from public, anon, authenticated;

-- Pedem Garçom, Maître e Gerente. Gerente e Dono aprovam, e ninguém aprova o próprio. O Dono aplica direto.
create or replace function public.restaurant_request_bill_reopen(p_table_session_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare s public.table_sessions; a public.approvals; v_owner boolean; v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select * into s from public.table_sessions where id = p_table_session_id;
  if s.id is null then raise exception 'Comanda não encontrada' using errcode = 'P0002'; end if;
  perform private.require_restaurant_role(s.restaurant_id, array['owner','manager','maitre','waiter']::public.user_roles_role_enum[]);
  if v_reason is null then raise exception 'Motivo obrigatório' using errcode = '22023'; end if;
  perform private.assert_session_reopenable(s);
  if exists (select 1 from public.approvals x where x.table_session_id = s.id and x.type = 'bill_reopen' and x.status = 'pending') then
    raise exception 'Já há um pedido aguardando aprovação' using errcode = '23505'; end if;
  v_owner := private.has_restaurant_role(s.restaurant_id, array['owner']::public.user_roles_role_enum[]);
  insert into public.approvals(restaurant_id, type, item_name, table_id, requester_id, reason, amount, status, table_session_id, resolver_id, resolution_note, resolved_at, created_at, updated_at)
    values (s.restaurant_id, 'bill_reopen', 'Reabrir comanda paga', s.table_id, auth.uid(), v_reason, 0,
      case when v_owner then 'approved' else 'pending' end, s.id,
      case when v_owner then auth.uid() end, case when v_owner then 'Aplicado direto pelo Dono' end, case when v_owner then now() end, now(), now())
    returning * into a;
  if v_owner then
    perform private.apply_approval_effect(a);
    perform private.log_audit(s.restaurant_id, 'approval.approved', 'approval', a.id, v_reason, jsonb_build_object('type', 'bill_reopen'), jsonb_build_object('status', 'approved', 'tableSessionId', s.id, 'direct', true));
  end if;
  return to_jsonb(a);
end $$;
revoke all on function public.restaurant_request_bill_reopen(uuid, text) from public, anon;
grant execute on function public.restaurant_request_bill_reopen(uuid, text) to authenticated;

create or replace function private.apply_approval_effect(p_approval public.approvals)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  -- Estorno aprovado: entra na fila do provedor; nada volta ao cliente sem esta aprovação (ADR-004).
  if p_approval.type = 'refund' and p_approval.gateway_transaction_id is not null then
    perform private.enqueue_refund(p_approval.gateway_transaction_id, p_approval.reason, p_approval.amount_cents,
      p_approval.requester_id, p_approval.id);
    perform private.fiscal_after_refund(p_approval.gateway_transaction_id, p_approval.reason);
    return;
  end if;
  if p_approval.type = 'bill_reopen' and p_approval.table_session_id is not null then
    perform private.reopen_paid_session(p_approval.table_session_id, p_approval.reason);
    return;
  end if;
  if p_approval.order_id is null then return; end if;
  if p_approval.type in ('cancellation', 'order_cancellation') then
    update public.orders
    set cancellation_reason = coalesce(nullif(btrim(coalesce(p_approval.reason, '')), ''), 'Cancelamento aprovado'),
        updated_at = now()
    where id = p_approval.order_id and restaurant_id = p_approval.restaurant_id;
    -- Aprovado, sai tudo: também o que já foi entregue, ou o pedido não ficaria cancelado.
    update public.order_items oi set status = 'cancelled', updated_at = now()
    from public.orders o
    where o.id = oi.order_id and o.id = p_approval.order_id
      and o.restaurant_id = p_approval.restaurant_id and oi.status::text <> 'cancelled';
  elsif p_approval.type = 'discount' then
    -- discount_cents é o que a conta usa: sem ele, o desconto aprovado não chegava ao que o cliente paga.
    update public.orders
    set discount_cents = greatest(coalesce(discount_cents, 0), p_approval.amount_cents),
        total_cents = greatest(total_cents - greatest(p_approval.amount_cents - coalesce(discount_cents, 0), 0), 0),
        discount_amount = greatest(coalesce(discount_amount, 0), p_approval.amount),
        total_amount = greatest(
          coalesce(subtotal, total_amount, 0) + coalesce(tax_amount, 0) + coalesce(tip_amount, 0)
            - greatest(coalesce(discount_amount, 0), p_approval.amount), 0),
        updated_at = now()
    where id = p_approval.order_id and restaurant_id = p_approval.restaurant_id;
  end if;
end $$;

-- Comanda avulsa: terminou, a mesa de mentira some da operação.
create or replace function private.retire_standalone_table()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.status <> 'active' and old.status = 'active' then
    update public.tables set is_active = false, status = 'available', updated_at = now() where id = new.table_id and is_standalone;
  end if;
  return new;
end $$;
revoke all on function private.retire_standalone_table() from public, anon, authenticated;
create trigger zz_retire_standalone_table after update of status on public.table_sessions
  for each row execute function private.retire_standalone_table();

-- O que pode ser estornado: o que a tela "Estornar valor" lista.
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
    order by g.created_at desc limit greatest(p_limit, 1)) x), '[]'::jsonb);
end $$;
revoke all on function public.restaurant_list_refundable_payments(uuid, integer) from public, anon;
grant execute on function public.restaurant_list_refundable_payments(uuid, integer) to authenticated;
