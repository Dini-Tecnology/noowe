-- Caixa e escala (respostas 45, 58 e 60 de 05/11/2026).
--  58: dinheiro recebido sem caixa aberto vale e abate o saldo. Quando o caixa abre, esses lançamentos do dia entram nele,
--      marcados "lançado antes da abertura", para a conferência do fechamento.
--  60: até o fechamento do dia, o Gerente inclui na escala do dia quem trabalhou, e o rateio é recalculado no fechamento.
--  45: cada pessoa vê a própria escala; o Maître vê a do salão no dia, e o Chef a da cozinha. Editar continua só com Dono e Gerente.

-- 1. Dinheiro sem caixa aberto fica guardado até o caixa do dia abrir.
create table private.cash_outside_register (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  operational_day_id uuid references public.operational_days(id) on delete set null,
  type text not null,
  amount_cents bigint not null check (amount_cents > 0),
  description text,
  order_id uuid,
  gateway_transaction_id uuid,
  actor_id uuid,
  created_by text not null,
  created_at timestamptz not null default now(),
  movement_id uuid
);
create index cash_outside_register_open on private.cash_outside_register(restaurant_id, operational_day_id) where movement_id is null;
alter table private.cash_outside_register enable row level security;
revoke all on private.cash_outside_register from public, anon, authenticated, service_role;

alter table public.cash_register_movements add column before_opening boolean not null default false;

create or replace function private.cash_record(p_restaurant uuid, p_type text, p_cents bigint, p_description text, p_tx uuid default null, p_order uuid default null)
returns uuid language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_session public.cash_register_sessions; v_delta bigint; v_id uuid; v_name text;
begin
  select * into v_session from public.cash_register_sessions where restaurant_id = p_restaurant and status = 'open' for update;
  select full_name into v_name from public.profiles where id = auth.uid();
  if v_session.id is null then
    insert into private.cash_outside_register(restaurant_id, operational_day_id, type, amount_cents, description, order_id, gateway_transaction_id, actor_id, created_by)
      values (p_restaurant, (private.operational_day_current(p_restaurant)).id, p_type, p_cents, p_description, p_order, p_tx, auth.uid(), coalesce(v_name, auth.uid()::text, 'sistema'));
    perform private.log_system_audit(p_restaurant, 'cash.outside_register', 'payment', p_tx, 'Dinheiro lançado sem caixa aberto',
      null, jsonb_build_object('type', p_type, 'amountCents', p_cents));
    return null;
  end if;
  v_delta := case p_type when 'sale' then p_cents when 'reforco' then p_cents else -p_cents end;
  insert into public.cash_register_movements(session_id, type, amount, amount_cents, is_cash, description, order_id, created_by, actor_id, gateway_transaction_id, created_at)
    values (v_session.id, p_type, p_cents::numeric / 100, p_cents, true, p_description, p_order, coalesce(v_name, auth.uid()::text, 'sistema'), auth.uid(), p_tx, now())
    returning id into v_id;
  update public.cash_register_sessions set expected_cents = expected_cents + v_delta, expected_balance = (expected_cents + v_delta)::numeric / 100 where id = v_session.id;
  return v_id;
end $$;

-- Ao abrir o caixa, o que foi lançado antes no mesmo dia operacional entra nele, com quem lançou e a hora.
create or replace function private.cash_attach_before_opening()
returns trigger language plpgsql security definer set search_path = public, private, pg_temp as $$
declare o private.cash_outside_register; v_id uuid; v_total bigint := 0;
begin
  if new.status <> 'open' then return new; end if;
  for o in select * from private.cash_outside_register where restaurant_id = new.restaurant_id and movement_id is null
      and operational_day_id is not distinct from new.operational_day_id order by created_at for update loop
    insert into public.cash_register_movements(session_id, type, amount, amount_cents, is_cash, description, order_id, created_by, actor_id, gateway_transaction_id, created_at, before_opening)
      values (new.id, o.type, o.amount_cents::numeric / 100, o.amount_cents, true, coalesce(o.description || ' · ', '') || 'Lançado antes da abertura',
        o.order_id, o.created_by, o.actor_id, o.gateway_transaction_id, o.created_at, true)
      returning id into v_id;
    update private.cash_outside_register set movement_id = v_id where id = o.id;
    v_total := v_total + case o.type when 'sale' then o.amount_cents when 'reforco' then o.amount_cents else -o.amount_cents end;
  end loop;
  if v_total <> 0 then
    update public.cash_register_sessions set expected_cents = expected_cents + v_total, expected_balance = (expected_cents + v_total)::numeric / 100 where id = new.id;
    perform private.log_system_audit(new.restaurant_id, 'cash.before_opening_attached', 'cash_register_session', new.id, 'Dinheiro lançado antes da abertura',
      null, jsonb_build_object('netCents', v_total));
  end if;
  return new;
end $$;
create trigger trg_cash_attach_before_opening after insert on public.cash_register_sessions
  for each row execute function private.cash_attach_before_opening();

-- 2. Escala do dia fechado não muda mais: o rateio daquele dia já foi feito. Até fechar, o Gerente inclui quem trabalhou,
-- e o fechamento do dia rateia com a escala como estiver.
create or replace function private.shift_day_still_open()
returns trigger language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  if exists (select 1 from public.operational_days d where d.restaurant_id = new.restaurant_id and d.status = 'closed'
      and d.business_date in ((new.date at time zone 'America/Sao_Paulo')::date,
        case when tg_op = 'UPDATE' then (old.date at time zone 'America/Sao_Paulo')::date end)) then
    raise exception 'Este dia já foi fechado: a escala dele não muda mais' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger trg_shift_day_still_open before insert or update of date, staff_id, status, start_time, end_time, role on public.shifts
  for each row execute function private.shift_day_still_open();

-- 3. Quem vê a escala. Editar segue com Dono e Gerente (restaurant_get_shifts e as funções de edição não mudam).
create or replace function private.shift_json(s public.shifts)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('id', s.id, 'staff_id', s.staff_id, 'staff_name', p.full_name, 'date', s.date, 'start_time', s.start_time,
    'end_time', s.end_time, 'role', s.role, 'area', s.area, 'station_id', s.station_id,
    'station_name', (select coalesce(c.display_name, c.name) from public.cook_stations c where c.id = s.station_id), 'status', s.status)
  from public.profiles p where p.id = s.staff_id
$$;
revoke all on function private.shift_json(public.shifts) from public, anon, authenticated;

-- Cada pessoa vê a própria escala.
create or replace function public.restaurant_get_my_shifts(p_restaurant_id uuid, p_from timestamptz default null, p_to timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare v_from timestamptz := coalesce(p_from, date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo');
  v_to timestamptz := coalesce(p_to, v_from + interval '14 days');
begin
  perform private.require_restaurant_role(p_restaurant_id,
    array['owner','manager','chef','waiter','barman','maitre','cook','cashier','host']::public.user_roles_role_enum[]);
  return coalesce((select jsonb_agg(private.shift_json(s) order by s.date, s.start_time) from public.shifts s
    where s.restaurant_id = p_restaurant_id and s.staff_id = auth.uid() and s.date >= v_from and s.date < v_to and s.status not in ('cancelled', 'canceled')), '[]'::jsonb);
end $$;
revoke all on function public.restaurant_get_my_shifts(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.restaurant_get_my_shifts(uuid, timestamptz, timestamptz) to authenticated;

-- Maître vê a escala do salão no dia (para distribuir as mesas); Chef, a da cozinha.
create or replace function public.restaurant_get_day_team_shifts(p_restaurant_id uuid, p_area text)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare v_day date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if p_area = 'floor' then
    perform private.require_restaurant_role(p_restaurant_id, array['owner','manager','maitre']::public.user_roles_role_enum[]);
  elsif p_area = 'kitchen' then
    perform private.require_restaurant_role(p_restaurant_id, array['owner','manager','chef']::public.user_roles_role_enum[]);
  else
    raise exception 'Área inválida' using errcode = '22023';
  end if;
  return coalesce((select jsonb_agg(private.shift_json(s) order by s.start_time, s.staff_id) from public.shifts s
    where s.restaurant_id = p_restaurant_id and s.status not in ('cancelled', 'canceled') and (s.date at time zone 'America/Sao_Paulo')::date = v_day
      and case p_area when 'floor' then s.role in ('waiter', 'maitre', 'host') or (s.area is not null and s.station_id is null)
                      else s.role in ('chef', 'cook') or s.station_id is not null end), '[]'::jsonb);
end $$;
revoke all on function public.restaurant_get_day_team_shifts(uuid, text) from public, anon;
grant execute on function public.restaurant_get_day_team_shifts(uuid, text) to authenticated;
