-- O2 (ADR-022, ADR-023) — motor de eventos e tarefas: evento -> regra -> tarefa -> responsável.
--
-- Os eventos nascem de gatilhos nas tabelas, na mesma transação da ação: qualquer caminho que mude o estado gera o
-- evento, sem depender de cada RPC lembrar. Falha do motor nunca derruba a ação do cliente: vira audit_log.
-- Painel e lista de tarefas ficam para a O4; atribuição de garçom, para a O5.

-- ---------------------------------------------------------------------------
-- 1. Parâmetros
-- ---------------------------------------------------------------------------
alter table public.restaurant_model_configs
  add column engine_item_late_margin_min integer not null default 5 check (engine_item_late_margin_min >= 0),
  add column engine_reservation_unconfirmed_hours integer not null default 24 check (engine_reservation_unconfirmed_hours > 0),
  add column engine_notice_ttl_min integer not null default 60 check (engine_notice_ttl_min > 0),
  add column engine_low_review_max_rating integer not null default 2 check (engine_low_review_max_rating between 1 and 5),
  add column engine_item_default_prep_min integer not null default 15 check (engine_item_default_prep_min > 0),
  add column engine_shift_notice_window_min integer not null default 15 check (engine_shift_notice_window_min > 0);

-- Regra provisória (ADR-022): nenhuma regra por tempo olha para trás além disto, para dado antigo não virar tarefa.
create or replace function private.engine_lookback()
returns interval language sql immutable as $$ select interval '1 day' $$;
revoke all on function private.engine_lookback() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Tabelas
-- ---------------------------------------------------------------------------
-- O catálogo de eventos (PDF p.14-16) como dado. Sem task_type, o evento só fica no log.
create table private.event_catalog (
  event_type text primary key,
  task_type text check (task_type in ('action', 'notice')),
  primary_roles public.user_roles_role_enum[] not null default '{}',
  manager_joins boolean not null default true,
  push_policy text not null default 'never' check (push_policy in ('always', 'unassigned', 'never')),
  priority integer not null default 2 check (priority between 1 and 3),
  -- Como a tarefa fecha: manual (ciente), act (concluir faz o ato) ou domain (só o ato fecha, com uma decisão na tela dela).
  completion text not null default 'manual' check (completion in ('manual', 'act', 'domain'))
);
alter table private.event_catalog enable row level security;
revoke all on private.event_catalog from public, anon, authenticated, service_role;

insert into private.event_catalog(event_type, task_type, primary_roles, manager_joins, push_policy, priority) values
  ('reservation.created', null, '{}', false, 'never', 3),
  ('reservation.pending', 'action', '{maitre}', true, 'unassigned', 2),
  ('reservation.changed', 'notice', '{maitre}', true, 'never', 3),
  ('reservation.cancelled', 'notice', '{maitre}', true, 'never', 3),
  ('reservation.unconfirmed', 'action', '{maitre}', true, 'unassigned', 2),
  ('reservation.arriving', 'action', '{maitre}', false, 'never', 2),
  ('reservation.late', 'action', '{maitre}', true, 'always', 1),
  ('table.opened', 'action', '{waiter,maitre}', true, 'never', 2),
  ('queue.joined', 'notice', '{maitre}', true, 'never', 3),
  ('table.released', 'action', '{maitre}', false, 'unassigned', 2),
  ('queue.call_expired', 'notice', '{maitre}', false, 'never', 3),
  ('order.created', 'action', '{chef,cook,barman}', true, 'never', 2),
  ('course.fired', 'action', '{chef,cook}', true, 'never', 2),
  ('item.late', 'action', '{chef}', true, 'always', 1),
  ('item.ready', 'action', '{waiter}', true, 'unassigned', 1),
  ('order.checking', 'action', '{waiter,cashier}', true, 'unassigned', 1),
  ('order.ready_pickup', 'action', '{waiter,cashier}', true, 'never', 2),
  ('call.created', 'action', '{waiter}', true, 'unassigned', 1),
  ('item.unavailable', 'action', '{waiter}', true, 'unassigned', 2),
  ('bill.requested', 'action', '{waiter}', true, 'unassigned', 1),
  ('payment.app_approved', 'notice', '{waiter}', false, 'never', 3),
  ('payment.in_person', 'notice', '{manager}', false, 'never', 3),
  ('table.cleaning', 'action', '{waiter,maitre}', true, 'unassigned', 2),
  ('session.idle', 'action', '{waiter}', true, 'never', 2),
  ('approval.requested', 'action', '{manager,owner}', false, 'always', 1),
  ('shift.started', 'notice', '{maitre}', true, 'never', 3),
  ('review.low', 'action', '{manager,owner}', false, 'always', 2);
update private.event_catalog set completion = 'act' where event_type in ('call.created', 'table.cleaning', 'item.ready');
update private.event_catalog set completion = 'domain' where event_type in
  ('approval.requested', 'reservation.pending', 'order.created', 'course.fired', 'order.checking', 'order.ready_pickup');

create table public.domain_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  event_type text not null,
  idempotency_key text not null,
  actor_id uuid,
  entity_type text,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  unique (restaurant_id, idempotency_key)
);
create index domain_events_restaurant_idx on public.domain_events(restaurant_id, created_at desc);

create table public.staff_tasks (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  event_id uuid references public.domain_events(id) on delete set null,
  kind text not null,
  task_type text not null check (task_type in ('action', 'notice')),
  title text not null,
  detail text,
  priority integer not null default 2 check (priority between 1 and 3),
  status text not null default 'open' check (status in ('open', 'done', 'cancelled')),
  dedupe_key text not null,
  audience_roles public.user_roles_role_enum[] not null,
  responsible_user_id uuid references auth.users(id) on delete set null,
  table_id uuid references public.tables(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  entity_type text,
  entity_id uuid,
  claimed_by uuid references auth.users(id) on delete set null,
  claimed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
-- Uma linha por tarefa, não por pessoa: quem agir primeiro fecha para todos.
create unique index staff_tasks_one_open on public.staff_tasks(restaurant_id, dedupe_key) where status = 'open';
create index staff_tasks_open_idx on public.staff_tasks(restaurant_id, priority, created_at) where status = 'open';
create index staff_tasks_order_idx on public.staff_tasks(order_id) where status = 'open';

create or replace function private.domain_events_append_only()
returns trigger language plpgsql set search_path = pg_temp as $$
begin
  raise exception 'O log de eventos não pode ser alterado' using errcode = '42501';
end $$;
revoke all on function private.domain_events_append_only() from public, anon, authenticated;
create trigger domain_events_append_only before update on public.domain_events
  for each row execute function private.domain_events_append_only();

alter table public.domain_events enable row level security;
alter table public.staff_tasks enable row level security;
revoke all on public.domain_events, public.staff_tasks from public, anon, authenticated;
grant select on public.domain_events, public.staff_tasks to authenticated;
create policy domain_events_management_select on public.domain_events for select to authenticated
  using (private.has_restaurant_role(restaurant_id, array['owner', 'manager']::public.user_roles_role_enum[]));
-- O dono lê tudo da unidade dele; a lista de cada um é filtrada em restaurant_list_tasks.
create policy staff_tasks_audience_select on public.staff_tasks for select to authenticated
  using (responsible_user_id = auth.uid()
    or private.has_restaurant_role(restaurant_id, audience_roles || 'owner'::public.user_roles_role_enum));

alter publication supabase_realtime add table public.staff_tasks;
alter publication supabase_realtime add table public.approvals;

-- ---------------------------------------------------------------------------
-- 3. Quem recebe
-- ---------------------------------------------------------------------------
-- Horário de turno é texto livre: valor inválido vale como turno inexistente, sem derrubar o motor.
create or replace function private.shift_time(p_value text)
returns time language plpgsql immutable as $$
begin
  if p_value ~ '^([01]?\d|2[0-3]):[0-5]\d(:[0-5]\d)?$' then return p_value::time; end if;
  return null;
end $$;
revoke all on function private.shift_time(text) from public, anon, authenticated;

-- Turno que passa da meia-noite termina no dia seguinte.
create or replace function private.shift_covers(p_date date, p_start text, p_end text, p_at timestamp)
returns boolean language sql immutable set search_path = private, pg_temp as $$
  select p_at >= p_date + private.shift_time(p_start)
    and p_at <= p_date + private.shift_time(p_end)
      + case when private.shift_time(p_end) > private.shift_time(p_start) then interval '0' else interval '1 day' end
$$;
revoke all on function private.shift_covers(date, text, text, timestamp) from public, anon, authenticated;

create or replace function private.manager_on_shift(p_restaurant uuid)
returns boolean language sql stable security definer set search_path = public, private, pg_temp as $$
  with agora as (select (now() at time zone private.restaurant_time_zone()) as local)
  select exists (
    select 1 from public.shifts s, agora
    where s.restaurant_id = p_restaurant and s.status in ('scheduled', 'in_progress')
      and s.date::date in (agora.local::date, agora.local::date - 1)
      and private.shift_covers(s.date::date, s.start_time, s.end_time, agora.local)
      and (s.role = 'manager' or exists (select 1 from public.user_roles ur
        where ur.user_id = s.staff_id and ur.restaurant_id = p_restaurant and ur.role = 'manager' and ur.is_active))
  )
$$;
revoke all on function private.manager_on_shift(uuid) from public, anon, authenticated;

-- Regra provisória (ADR-022, pendência 7): sem Gerente em turno, entram todos os gerentes ativos e o Dono.
create or replace function private.manager_fallback_roles(p_restaurant uuid)
returns public.user_roles_role_enum[] language sql stable security definer set search_path = public, private, pg_temp as $$
  select case when private.manager_on_shift(p_restaurant)
    then array['manager']::public.user_roles_role_enum[]
    else array['manager', 'owner']::public.user_roles_role_enum[] end
$$;
revoke all on function private.manager_fallback_roles(uuid) from public, anon, authenticated;

create or replace function private.task_audience(p_restaurant uuid, p_rule private.event_catalog)
returns public.user_roles_role_enum[] language sql stable security definer set search_path = public, private, pg_temp as $$
  select array(select distinct r from unnest(p_rule.primary_roles || case when p_rule.manager_joins
    then private.manager_fallback_roles(p_restaurant) else '{}'::public.user_roles_role_enum[] end) r)
$$;
revoke all on function private.task_audience(uuid, private.event_catalog) from public, anon, authenticated;

-- Quem acumula funções aparece uma vez só.
create or replace function private.task_recipients(p_restaurant uuid, p_roles public.user_roles_role_enum[])
returns setof uuid language sql stable security definer set search_path = public, pg_temp as $$
  select ur.user_id from public.user_roles ur
    where ur.restaurant_id = p_restaurant and ur.is_active and ur.role = any(p_roles)
  union
  select pr.user_id from public.profile_roles pr
    where pr.restaurant_id = p_restaurant and pr.is_active and pr.role_key = any(p_roles::text[])
  union
  select r.owner_id from public.restaurants r
    where r.id = p_restaurant and r.owner_id is not null and 'owner'::public.user_roles_role_enum = any(p_roles)
$$;
revoke all on function private.task_recipients(uuid, public.user_roles_role_enum[]) from public, anon, authenticated;

-- Regra provisória (ADR-022, pendência 6): tudo na lista; push só para aprovações, atrasos e tarefa sem responsável.
create or replace function private.task_push_policy(p_rule private.event_catalog, p_responsible uuid)
returns boolean language sql immutable as $$
  select case p_rule.push_policy when 'always' then true
    when 'unassigned' then p_responsible is null else false end
$$;
revoke all on function private.task_push_policy(private.event_catalog, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Único ponto de entrada
-- ---------------------------------------------------------------------------
-- p_task: title, detail, dedupeKey, tableId, orderId, responsibleUserId, category.
create or replace function private.emit_event(
  p_restaurant uuid, p_type text, p_key text, p_entity_type text, p_entity_id uuid, p_task jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  v_event uuid; v_rule private.event_catalog; v_task uuid; v_roles public.user_roles_role_enum[];
  v_responsible uuid := nullif(p_task->>'responsibleUserId', '')::uuid; v_actor uuid := auth.uid();
  v_user uuid; v_recipients uuid[]; v_title text := p_task->>'title'; v_detail text := p_task->>'detail';
begin
  insert into public.domain_events(restaurant_id, event_type, idempotency_key, actor_id, entity_type, entity_id, payload)
  values (p_restaurant, p_type, p_key, v_actor, p_entity_type, p_entity_id, p_task)
  on conflict (restaurant_id, idempotency_key) do nothing
  returning id into v_event;
  -- Reenvio do mesmo evento: nem tarefa nem aviso.
  if v_event is null then return null; end if;

  select * into v_rule from private.event_catalog where event_type = p_type;
  if v_rule.event_type is null or v_rule.task_type is null then return v_event; end if;

  v_roles := private.task_audience(p_restaurant, v_rule);
  insert into public.staff_tasks(restaurant_id, event_id, kind, task_type, title, detail, priority, dedupe_key, audience_roles,
      responsible_user_id, table_id, order_id, entity_type, entity_id)
  values (p_restaurant, v_event, p_type, v_rule.task_type, v_title, v_detail, v_rule.priority,
    coalesce(p_task->>'dedupeKey', p_key), v_roles, v_responsible,
    nullif(p_task->>'tableId', '')::uuid, nullif(p_task->>'orderId', '')::uuid, p_entity_type, p_entity_id)
  on conflict (restaurant_id, dedupe_key) where status = 'open' do nothing
  returning id into v_task;
  if v_task is null or not private.task_push_policy(v_rule, v_responsible) then return v_event; end if;

  select array_agg(r) into v_recipients from private.task_recipients(p_restaurant,
    case when v_rule.push_policy = 'always' then v_roles else v_rule.primary_roles end) r
    where r is distinct from v_actor;
  -- Ninguém na função primária: quem recebe junto assume, para a tarefa não ficar sem dono.
  if v_recipients is null and v_rule.push_policy <> 'always' then
    select array_agg(r) into v_recipients from private.task_recipients(p_restaurant, private.manager_fallback_roles(p_restaurant)) r
      where r is distinct from v_actor;
  end if;
  foreach v_user in array coalesce(v_recipients, '{}') loop
    perform private.create_notification(v_user, v_title, coalesce(v_detail, v_title), 'staff_task', v_task, 'staff_task',
      jsonb_build_object('kind', 'staff_task', 'taskId', v_task, 'taskKind', p_type, 'restaurant_id', p_restaurant,
        'recipientId', v_user, 'approvalId', p_task->>'approvalId',
        'category', coalesce(p_task->>'category', case when v_rule.completion = 'domain' then 'staff_task_claim' else 'staff_task' end)));
  end loop;
  return v_event;
end $$;
revoke all on function private.emit_event(uuid, text, text, text, uuid, jsonb) from public, anon, authenticated;

-- A ação do cliente nunca cai por causa do motor.
create or replace function private.emit_event_safe(
  p_restaurant uuid, p_type text, p_key text, p_entity_type text, p_entity_id uuid, p_task jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  perform private.emit_event(p_restaurant, p_type, p_key, p_entity_type, p_entity_id, p_task);
exception when others then
  perform private.log_system_audit(p_restaurant, 'engine.emit_failed', coalesce(p_entity_type, 'event'), p_entity_id,
    p_type || ': ' || sqlerrm, null, null);
end $$;
revoke all on function private.emit_event_safe(uuid, text, text, text, uuid, jsonb) from public, anon, authenticated;

-- A tarefa fecha pelo ato de domínio.
create or replace function private.close_task(p_restaurant uuid, p_dedupe_key text)
returns void language sql security definer set search_path = public, pg_temp as $$
  update public.staff_tasks set status = 'done', completed_at = clock_timestamp(), updated_at = clock_timestamp()
    where restaurant_id = p_restaurant and dedupe_key = p_dedupe_key and status = 'open'
$$;
revoke all on function private.close_task(uuid, text) from public, anon, authenticated;

create or replace function private.table_label(p_table uuid)
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select case when t.table_number ~* '^mesa' then t.table_number else 'Mesa ' || t.table_number end
  from public.tables t where t.id = p_table
$$;
revoke all on function private.table_label(uuid) from public, anon, authenticated;

create or replace function private.order_label(p_order public.orders)
returns text language sql stable security definer set search_path = public, private, pg_temp as $$
  select coalesce(private.table_label(p_order.table_id), nullif(p_order.call_name, ''), 'Pedido sem mesa')
$$;
revoke all on function private.order_label(public.orders) from public, anon, authenticated;

-- O garçom da mesa, quando houver (atribuição: O5).
create or replace function private.table_waiter(p_table uuid)
returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select t.assigned_waiter_id from public.tables t where t.id = p_table
$$;
revoke all on function private.table_waiter(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Gatilhos: o catálogo de eventos
-- ---------------------------------------------------------------------------
create or replace function private.engine_on_reservation()
returns trigger language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_when text := to_char(new.reservation_time at time zone private.restaurant_time_zone(), 'DD/MM HH24:MI');
  v_detail text := new.party_size || ' pessoas, ' || v_when;
begin
  if tg_op = 'INSERT' then
    perform private.emit_event_safe(new.restaurant_id, 'reservation.created', 'reservation.created:' || new.id,
      'reservation', new.id);
    if new.status::text = 'pending' then
      perform private.emit_event_safe(new.restaurant_id, 'reservation.pending', 'reservation.pending:' || new.id,
        'reservation', new.id, jsonb_build_object('title', 'Reserva para aprovar', 'detail', v_detail));
    end if;
    return null;
  end if;
  if new.status::text is distinct from old.status::text then
    if old.status::text = 'pending' then
      perform private.close_task(new.restaurant_id, 'reservation.pending:' || new.id);
      perform private.close_task(new.restaurant_id, 'reservation.unconfirmed:' || new.id);
    end if;
    if new.status::text in ('seated', 'cancelled', 'no_show', 'completed') then
      perform private.close_task(new.restaurant_id, 'reservation.pending:' || new.id);
      perform private.close_task(new.restaurant_id, 'reservation.unconfirmed:' || new.id);
      perform private.close_task(new.restaurant_id, 'reservation.arriving:' || new.id);
      perform private.close_task(new.restaurant_id, 'reservation.late:' || new.id);
    end if;
    if new.status::text = 'cancelled' then
      perform private.emit_event_safe(new.restaurant_id, 'reservation.cancelled', 'reservation.cancelled:' || new.id,
        'reservation', new.id, jsonb_build_object('title', 'Reserva cancelada', 'detail', v_detail));
    end if;
  end if;
  -- Outro horário, outras janelas: o que valia para o horário antigo sai, e o tick cria de novo na hora certa.
  if new.reservation_time is distinct from old.reservation_time then
    perform private.close_task(new.restaurant_id, 'reservation.unconfirmed:' || new.id);
    perform private.close_task(new.restaurant_id, 'reservation.arriving:' || new.id);
    perform private.close_task(new.restaurant_id, 'reservation.late:' || new.id);
  end if;
  if new.reservation_time is distinct from old.reservation_time or new.party_size is distinct from old.party_size then
    perform private.emit_event_safe(new.restaurant_id, 'reservation.changed',
      'reservation.changed:' || new.id || ':' || new.reservation_time || ':' || new.party_size,
      'reservation', new.id, jsonb_build_object('title', 'Reserva alterada', 'detail', v_detail,
        'dedupeKey', 'reservation.changed:' || new.id));
  end if;
  return null;
end $$;
revoke all on function private.engine_on_reservation() from public, anon, authenticated;
create trigger zz_engine_events after insert or update on public.reservations
  for each row execute function private.engine_on_reservation();

create or replace function private.engine_on_waitlist()
returns trigger language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    perform private.emit_event_safe(new.restaurant_id, 'queue.joined', 'queue.joined:' || new.id, 'waitlist', new.id,
      jsonb_build_object('title', 'Entrada na fila', 'detail', new.customer_name || ', ' || new.party_size || ' pessoas'));
    return null;
  end if;
  if new.status::text is distinct from old.status::text then
    if new.status::text in ('seated', 'cancelled', 'no_show') then
      perform private.close_task(new.restaurant_id, 'queue.joined:' || new.id);
    end if;
    if old.status::text = 'called' and new.status::text in ('waiting', 'no_show') then
      perform private.emit_event_safe(new.restaurant_id, 'queue.call_expired',
        'queue.call_expired:' || new.id || ':' || coalesce(new.missed_calls, 0) || ':' || new.status::text, 'waitlist', new.id,
        jsonb_build_object('title', 'Chamado da fila expirou', 'detail', new.customer_name
          || case when new.status::text = 'no_show' then ' saiu da fila' else ' recuou uma posição' end,
          'dedupeKey', 'queue.call_expired:' || new.id));
    end if;
  end if;
  return null;
end $$;
revoke all on function private.engine_on_waitlist() from public, anon, authenticated;
create trigger zz_engine_events after insert or update on public.waitlist_entries
  for each row execute function private.engine_on_waitlist();

create or replace function private.engine_on_service_call()
returns trigger language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    perform private.emit_event_safe(new.restaurant_id, 'call.created', 'call.created:' || new.id, 'service_call', new.id,
      jsonb_build_object('title', coalesce(private.table_label(new.table_id), 'Mesa') || ' chamou',
        'detail', coalesce(nullif(new.message, ''), new.call_type), 'tableId', new.table_id,
        'responsibleUserId', private.table_waiter(new.table_id)));
  elsif new.status is distinct from old.status and new.status in ('resolved', 'cancelled') then
    perform private.close_task(new.restaurant_id, 'call.created:' || new.id);
  end if;
  return null;
end $$;
revoke all on function private.engine_on_service_call() from public, anon, authenticated;
create trigger zz_engine_events after insert or update on public.service_calls
  for each row execute function private.engine_on_service_call();

create or replace function private.engine_on_order_item()
returns trigger language plpgsql security definer set search_path = public, private, pg_temp as $$
declare o public.orders;
begin
  if new.status is not distinct from old.status then return null; end if;
  select * into o from public.orders where id = new.order_id;
  if o.id is null then return null; end if;
  if new.status::text = 'ready' and not private.order_requires_quality_check(o) then
    perform private.emit_event_safe(o.restaurant_id, 'item.ready', 'item.ready:' || new.id, 'order', o.id,
      jsonb_build_object('title', 'Retirar no passe: ' || private.order_label(o), 'tableId', o.table_id, 'orderId', o.id,
        'responsibleUserId', private.table_waiter(o.table_id), 'dedupeKey', 'item.ready:' || o.id));
  elsif new.status::text = 'fired' then
    perform private.emit_event_safe(o.restaurant_id, 'course.fired', 'course.fired:' || o.id || ':' || coalesce(new.course, ''),
      'order', o.id, jsonb_build_object('title', 'Curso disparado: ' || private.order_label(o), 'detail', new.course,
        'tableId', o.table_id, 'orderId', o.id));
  elsif new.status::text in ('delivered', 'cancelled')
    and not exists (select 1 from public.order_items i where i.order_id = o.id and i.status::text = 'ready') then
    perform private.close_task(o.restaurant_id, 'item.ready:' || o.id);
  end if;
  if new.status::text in ('ready', 'delivered', 'cancelled') then
    perform private.close_task(o.restaurant_id, 'item.late:' || new.id);
  end if;
  if new.status::text in ('preparing', 'ready') then
    perform private.close_task(o.restaurant_id, 'course.fired:' || o.id || ':' || coalesce(new.course, ''));
  end if;
  return null;
end $$;
revoke all on function private.engine_on_order_item() from public, anon, authenticated;
create trigger zz_engine_events after update of status on public.order_items
  for each row execute function private.engine_on_order_item();

create or replace function private.engine_on_order()
returns trigger language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_label text := private.order_label(new);
begin
  if new.status is distinct from old.status then
    if new.status::text = 'preparing' then
      perform private.emit_event_safe(new.restaurant_id, 'order.created',
        -- Item novo volta o pedido a preparo e é outro evento; o mesmo estado reenviado, não.
        'order.created:' || new.id || ':' || (select count(*) from public.order_items i where i.order_id = new.id), 'order', new.id,
        jsonb_build_object('title', 'Novo pedido: ' || v_label, 'tableId', new.table_id, 'orderId', new.id,
          'dedupeKey', 'order.created:' || new.id));
      if new.table_session_id is not null then
        perform private.close_task(new.restaurant_id, 'table.opened:' || new.table_session_id);
      end if;
    elsif new.status::text in ('ready', 'delivered', 'completed') then
      perform private.close_task(new.restaurant_id, 'order.created:' || new.id);
    end if;
    if new.status::text in ('cancelled', 'completed') then
      update public.staff_tasks set status = 'cancelled', updated_at = clock_timestamp()
        where order_id = new.id and status = 'open';
    end if;
  end if;
  if new.fulfillment_status is distinct from old.fulfillment_status then
    if old.fulfillment_status::text = 'checking' then perform private.close_task(new.restaurant_id, 'order.checking:' || new.id); end if;
    if new.fulfillment_status::text = 'checking' then
      perform private.emit_event_safe(new.restaurant_id, 'order.checking', 'order.checking:' || new.id || ':' || clock_timestamp(),
        'order', new.id, jsonb_build_object('title', 'Conferir: ' || v_label, 'orderId', new.id,
          'dedupeKey', 'order.checking:' || new.id));
    elsif new.fulfillment_status::text = 'ready' and private.order_requires_quality_check(new) then
      perform private.emit_event_safe(new.restaurant_id, 'order.ready_pickup', 'order.ready_pickup:' || new.id, 'order', new.id,
        jsonb_build_object('title', 'Pronto para retirada: ' || v_label, 'orderId', new.id));
    elsif new.fulfillment_status::text in ('picked_up', 'not_picked_up', 'cancelled') then
      perform private.close_task(new.restaurant_id, 'order.ready_pickup:' || new.id);
    end if;
  end if;
  return null;
end $$;
revoke all on function private.engine_on_order() from public, anon, authenticated;
create trigger orders_zzz_engine_events after update of status, fulfillment_status on public.orders
  for each row execute function private.engine_on_order();

create or replace function private.engine_on_session()
returns trigger language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_label text := coalesce(private.table_label(new.table_id), 'Mesa');
begin
  if tg_op = 'INSERT' then
    if new.status = 'active' then
      perform private.emit_event_safe(new.restaurant_id, 'table.opened', 'table.opened:' || new.id, 'table_session', new.id,
        jsonb_build_object('title', 'Mesa nova: ' || v_label, 'tableId', new.table_id,
          'responsibleUserId', private.table_waiter(new.table_id)));
    end if;
    return null;
  end if;
  if new.billing_status is distinct from old.billing_status and new.billing_status::text = 'billing' then
    perform private.emit_event_safe(new.restaurant_id, 'bill.requested', 'bill.requested:' || new.id || ':' || new.reopened_count,
      'table_session', new.id, jsonb_build_object('title', 'Conta pedida: ' || v_label, 'tableId', new.table_id,
        'responsibleUserId', private.table_waiter(new.table_id), 'dedupeKey', 'bill.requested:' || new.id));
  end if;
  -- Reabriu a conta ou a mesa voltou a ter movimento: a tarefa deixa de valer.
  if new.billing_status is distinct from old.billing_status and new.billing_status::text = 'open' then
    perform private.close_task(new.restaurant_id, 'bill.requested:' || new.id);
  end if;
  if new.last_activity is distinct from old.last_activity and new.idle_alerted_at < new.last_activity then
    perform private.close_task(new.restaurant_id, 'session.idle:' || new.id);
  end if;
  if new.idle_alerted_at is distinct from old.idle_alerted_at and new.idle_alerted_at is not null then
    perform private.emit_event_safe(new.restaurant_id, 'session.idle', 'session.idle:' || new.id || ':' || new.idle_alerted_at,
      'table_session', new.id, jsonb_build_object('title', 'Comanda parada: ' || v_label, 'tableId', new.table_id,
        'responsibleUserId', private.table_waiter(new.table_id), 'dedupeKey', 'session.idle:' || new.id));
  end if;
  if new.status is distinct from old.status and new.status <> 'active' then
    perform private.close_task(new.restaurant_id, 'table.opened:' || new.id);
    perform private.close_task(new.restaurant_id, 'bill.requested:' || new.id);
    perform private.close_task(new.restaurant_id, 'session.idle:' || new.id);
  end if;
  return null;
end $$;
revoke all on function private.engine_on_session() from public, anon, authenticated;
create trigger zz_engine_events after insert or update on public.table_sessions
  for each row execute function private.engine_on_session();

create or replace function private.engine_on_table()
returns trigger language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_label text := coalesce(private.table_label(new.id), 'Mesa');
begin
  if new.status is not distinct from old.status then return null; end if;
  if new.status = 'cleaning' then
    perform private.emit_event_safe(new.restaurant_id, 'table.cleaning', 'table.cleaning:' || new.id || ':' || clock_timestamp(),
      'table', new.id, jsonb_build_object('title', 'Liberar mesa: ' || v_label, 'tableId', new.id,
        'responsibleUserId', new.assigned_waiter_id, 'dedupeKey', 'table.cleaning:' || new.id));
  elsif old.status = 'cleaning' then
    perform private.close_task(new.restaurant_id, 'table.cleaning:' || new.id);
    if new.status = 'available' and exists (select 1 from public.waitlist_entries w
        where w.restaurant_id = new.restaurant_id and w.status::text = 'waiting') then
      perform private.emit_event_safe(new.restaurant_id, 'table.released', 'table.released:' || new.id || ':' || clock_timestamp(),
        'table', new.id, jsonb_build_object('title', v_label || ' livre: chame o próximo da fila', 'tableId', new.id,
          'dedupeKey', 'table.released:' || new.id));
    end if;
  elsif old.status = 'available' then
    perform private.close_task(new.restaurant_id, 'table.released:' || new.id);
  end if;
  return null;
end $$;
revoke all on function private.engine_on_table() from public, anon, authenticated;
create trigger zz_engine_events after update of status on public.tables
  for each row execute function private.engine_on_table();

create or replace function private.engine_on_bill_share()
returns trigger language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  if new.status = 'paid' and old.status is distinct from 'paid' then
    perform private.emit_event_safe(new.restaurant_id, 'payment.app_approved', 'payment.app_approved:' || new.id,
      'bill_share', new.id, jsonb_build_object('title', 'Pagamento pelo app aprovado',
        'dedupeKey', 'payment.app_approved:' || new.table_session_id));
  end if;
  return null;
end $$;
revoke all on function private.engine_on_bill_share() from public, anon, authenticated;
create trigger zz_engine_events after update of status on public.bill_shares
  for each row execute function private.engine_on_bill_share();

create or replace function private.engine_on_gateway_tx()
returns trigger language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  if new.provider = 'manual' and new.status = 'completed' then
    perform private.emit_event_safe(new.restaurant_id, 'payment.in_person', 'payment.in_person:' || new.id,
      'payment', new.id, jsonb_build_object('title', 'Pagamento presencial lançado', 'detail', new.payment_method,
        'orderId', new.order_id));
  end if;
  return null;
end $$;
revoke all on function private.engine_on_gateway_tx() from public, anon, authenticated;
create trigger zz_engine_events after insert on public.gateway_transactions
  for each row execute function private.engine_on_gateway_tx();

create or replace function private.engine_on_approval()
returns trigger language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'pending' then
      perform private.emit_event_safe(new.restaurant_id, 'approval.requested', 'approval.requested:' || new.id, 'approval', new.id,
        jsonb_build_object('title', 'Aprovação pendente: ' || new.item_name, 'detail', new.reason, 'tableId', new.table_id,
          'orderId', new.order_id, 'category', 'approval', 'approvalId', new.id));
    end if;
  elsif new.status is distinct from old.status and new.status <> 'pending' then
    perform private.close_task(new.restaurant_id, 'approval.requested:' || new.id);
  end if;
  return null;
end $$;
revoke all on function private.engine_on_approval() from public, anon, authenticated;
create trigger zz_engine_events after insert or update on public.approvals
  for each row execute function private.engine_on_approval();

create or replace function private.engine_on_review()
returns trigger language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  if new.rating <= (select c.engine_low_review_max_rating from public.restaurant_model_configs c
      where c.restaurant_id = new.restaurant_id) then
    perform private.emit_event_safe(new.restaurant_id, 'review.low', 'review.low:' || new.id, 'review', new.id,
      jsonb_build_object('title', 'Avaliação baixa: ' || trunc(new.rating) || ' estrela(s)', 'detail', new.comment));
  end if;
  return null;
end $$;
revoke all on function private.engine_on_review() from public, anon, authenticated;
create trigger zz_engine_events after insert on public.reviews
  for each row execute function private.engine_on_review();

create or replace function private.engine_on_menu_item()
returns trigger language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_tables text;
begin
  if new.is_available is not distinct from old.is_available then return null; end if;
  if new.is_available then
    perform private.close_task(new.restaurant_id, 'item.unavailable:' || new.id);
    return null;
  end if;
  select string_agg(distinct private.order_label(o), ', ') into v_tables
    from public.order_items i join public.orders o on o.id = i.order_id
    where i.menu_item_id = new.id and i.status::text in ('pending', 'preparing', 'on_hold', 'fired', 'awaiting_payment')
      and o.status::text not in ('cancelled', 'completed', 'delivered') and o.created_at > now() - private.engine_lookback();
  if v_tables is not null then
    perform private.emit_event_safe(new.restaurant_id, 'item.unavailable', 'item.unavailable:' || new.id || ':' || clock_timestamp(),
      'menu_item', new.id, jsonb_build_object('title', 'Indisponível: ' || new.name, 'detail', 'Pedidos afetados: ' || v_tables,
        'dedupeKey', 'item.unavailable:' || new.id));
  end if;
  return null;
end $$;
revoke all on function private.engine_on_menu_item() from public, anon, authenticated;
create trigger zz_engine_events after update of is_available on public.menu_items
  for each row execute function private.engine_on_menu_item();

-- ---------------------------------------------------------------------------
-- 6. Regras por tempo e tick
-- ---------------------------------------------------------------------------
create or replace function private.engine_time_rules()
returns integer language plpgsql security definer set search_path = public, private, pg_temp as $$
declare r record; v_count integer := 0; v_when text; v_now timestamp := now() at time zone private.restaurant_time_zone();
begin
  for r in
    select x.*, c.engine_reservation_unconfirmed_hours as hours,
      w.opens_at, w.closes_at
    from public.reservations x
    join public.restaurant_model_configs c on c.restaurant_id = x.restaurant_id
    cross join lateral private.reservation_check_in_window(x.restaurant_id, x.reservation_time) w
    where x.status::text in ('pending', 'confirmed') and x.reservation_time > now() - private.engine_lookback()
  loop
    v_when := to_char(r.reservation_time at time zone private.restaurant_time_zone(), 'HH24:MI');
    if r.status::text = 'pending' and r.reservation_time > now()
       and r.reservation_time <= now() + make_interval(hours => r.hours) then
      perform private.emit_event_safe(r.restaurant_id, 'reservation.unconfirmed', 'reservation.unconfirmed:' || r.id || ':' || r.reservation_time, 'reservation', r.id,
        jsonb_build_object('title', 'Reserva não confirmada', 'detail', r.party_size || ' pessoas às ' || v_when,
          'dedupeKey', 'reservation.unconfirmed:' || r.id));
    elsif r.status::text = 'confirmed' and now() >= r.opens_at and now() < r.reservation_time then
      perform private.emit_event_safe(r.restaurant_id, 'reservation.arriving', 'reservation.arriving:' || r.id || ':' || r.reservation_time, 'reservation', r.id,
        jsonb_build_object('title', 'Chegando: reserva das ' || v_when, 'detail', r.party_size || ' pessoas', 'tableId', r.table_id,
          'dedupeKey', 'reservation.arriving:' || r.id));
    elsif r.status::text = 'confirmed' and now() >= r.reservation_time + (r.closes_at - r.reservation_time) / 2 and now() < r.closes_at then
      perform private.close_task(r.restaurant_id, 'reservation.arriving:' || r.id);
      perform private.emit_event_safe(r.restaurant_id, 'reservation.late', 'reservation.late:' || r.id || ':' || r.reservation_time, 'reservation', r.id,
        jsonb_build_object('title', 'Reserva atrasada: ' || v_when, 'detail', r.party_size || ' pessoas', 'tableId', r.table_id,
          'dedupeKey', 'reservation.late:' || r.id));
    end if;
  end loop;

  -- Item atrasado: tempo de preparo mais a margem do restaurante.
  for r in
    select i.id, o.restaurant_id, o.table_id, o.id as order_id, o.call_name, coalesce(mi.name, 'Item') as name
    from public.order_items i
    join public.orders o on o.id = i.order_id
    left join public.menu_items mi on mi.id = i.menu_item_id
    join public.restaurant_model_configs c on c.restaurant_id = o.restaurant_id
    where i.status::text = 'preparing' and i.created_at > now() - private.engine_lookback()
      and now() > coalesce(i.expected_ready_at, greatest(i.created_at, i.fire_at, o.accepted_at)
        + make_interval(mins => coalesce(mi.preparation_time, c.engine_item_default_prep_min)))
        + make_interval(mins => c.engine_item_late_margin_min)
  loop
    perform private.emit_event_safe(r.restaurant_id, 'item.late', 'item.late:' || r.id, 'order', r.order_id,
      jsonb_build_object('title', 'Item atrasado: ' || r.name,
        'detail', coalesce(private.table_label(r.table_id), r.call_name), 'tableId', r.table_id, 'orderId', r.order_id));
  end loop;

  for r in
    select s.id, s.restaurant_id, s.start_time, s.date::date as day from public.shifts s
    join public.restaurant_model_configs c on c.restaurant_id = s.restaurant_id
    where s.status in ('scheduled', 'in_progress') and s.date::date in (v_now::date, v_now::date - 1)
      and s.date::date + private.shift_time(s.start_time) <= v_now
      and s.date::date + private.shift_time(s.start_time) > v_now - make_interval(mins => c.engine_shift_notice_window_min)
  loop
    perform private.emit_event_safe(r.restaurant_id, 'shift.started', 'shift.started:' || r.restaurant_id || ':' || r.day || ':' || r.start_time,
      'shift', r.id, jsonb_build_object('title', 'Início de turno: ' || r.start_time,
        'dedupeKey', 'shift.started:' || r.restaurant_id));
    v_count := v_count + 1;
  end loop;

  -- Aviso não pede ação: sai sozinho da lista.
  update public.staff_tasks t set status = 'done', completed_at = clock_timestamp(), updated_at = clock_timestamp()
    from public.restaurant_model_configs c
    where c.restaurant_id = t.restaurant_id and t.status = 'open' and t.task_type = 'notice'
      and t.created_at < now() - make_interval(mins => c.engine_notice_ttl_min);
  return v_count;
end $$;
revoke all on function private.engine_time_rules() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Push com retentativa
-- ---------------------------------------------------------------------------
alter table public.notifications add column push_attempts integer not null default 0;

-- Regra provisória (ADR-022): só insiste por um tempo, depois da primeira tentativa ter tido chance de terminar.
create or replace function private.push_retry_policy(out first_after interval, out give_up_after interval, out max_attempts integer, out batch integer)
language sql immutable as $$ select interval '2 minutes', interval '1 hour', 5, 100 $$;
revoke all on function private.push_retry_policy() from public, anon, authenticated;

-- Tarefa já fechada não vale mais um aviso atrasado.
create or replace function private.push_retry_candidates()
returns setof public.notifications language sql stable security definer set search_path = public, private, pg_temp as $$
  select n.* from public.notifications n, private.push_retry_policy() p
  where n.push_dispatched_at is null and n.push_attempts < p.max_attempts
    and n.created_at < now() - p.first_after and n.created_at > now() - p.give_up_after
    and not exists (select 1 from public.staff_tasks t where t.id = n.related_id and t.status <> 'open')
  order by n.created_at limit (select batch from private.push_retry_policy())
$$;
revoke all on function private.push_retry_candidates() from public, anon, authenticated;

create or replace function private.retry_undelivered_pushes()
returns integer language plpgsql security definer set search_path = public, private, vault, net, pg_temp as $$
declare n public.notifications; v_url text; v_key text; v_count integer := 0;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url' limit 1;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key' limit 1;
  if v_url is null or v_key is null then return 0; end if;
  for n in select * from private.push_retry_candidates() loop
    perform net.http_post(url := rtrim(v_url, '/') || '/functions/v1/send-push-notification',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
      body := jsonb_build_object('record', to_jsonb(n)));
    update public.notifications set push_attempts = push_attempts + 1 where id = n.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke all on function private.retry_undelivered_pushes() from public, anon, authenticated;

-- Uma varredura com problema não impede as outras, e dois ticks não correm juntos.
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
    v_result := v_result || jsonb_build_object('timeRules', private.engine_time_rules());
  exception when others then raise warning 'engine_tick regras: %', sqlerrm; end;
  begin
    v_result := v_result || jsonb_build_object('pushRetries', private.retry_undelivered_pushes());
  exception when others then raise warning 'engine_tick push: %', sqlerrm; end;
  return v_result;
end $$;
revoke all on function private.engine_tick() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('engine-tick', '* * * * *', 'select private.engine_tick()');
  else
    raise warning 'pg_cron indisponível: o tick do motor não foi agendado';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 8. O que a equipe chama
-- ---------------------------------------------------------------------------
create or replace function private.user_in_task_audience(p_task public.staff_tasks)
returns boolean language sql stable security definer set search_path = public, private, pg_temp as $$
  select p_task.responsible_user_id is not distinct from auth.uid()
    or private.has_restaurant_role(p_task.restaurant_id, p_task.audience_roles)
$$;
revoke all on function private.user_in_task_audience(public.staff_tasks) from public, anon, authenticated;

create or replace function public.restaurant_list_tasks(p_restaurant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
begin
  perform private.require_restaurant_role(p_restaurant_id,
    array['owner','manager','maitre','chef','cook','barman','waiter','cashier','host']::public.user_roles_role_enum[]);
  return (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'kind', t.kind, 'type', t.task_type, 'title', t.title,
      'detail', t.detail, 'priority', t.priority, 'tableId', t.table_id, 'orderId', t.order_id,
      'entityType', t.entity_type, 'entityId', t.entity_id, 'responsibleUserId', t.responsible_user_id,
      'claimedBy', t.claimed_by, 'createdAt', t.created_at) order by t.priority, t.created_at), '[]'::jsonb)
    from public.staff_tasks t
    where t.restaurant_id = p_restaurant_id and t.status = 'open' and private.user_in_task_audience(t));
end $$;
revoke all on function public.restaurant_list_tasks(uuid) from public, anon;
grant execute on function public.restaurant_list_tasks(uuid) to authenticated;

-- Concluir faz o que a tarefa pede: "Liberar mesa" que só some da lista deixaria a mesa presa em Limpeza.
create or replace function private.task_run_act(p_task public.staff_tasks)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_item uuid;
begin
  case p_task.kind
    when 'call.created' then perform public.restaurant_resolve_service_call(p_task.entity_id);
    when 'table.cleaning' then perform public.restaurant_update_table_status(p_task.table_id, 'available');
    when 'item.ready' then
      for v_item in select id from public.order_items where order_id = p_task.order_id and status::text = 'ready' loop
        perform public.restaurant_update_order_item_status(v_item, 'delivered');
      end loop;
  end case;
end $$;
revoke all on function private.task_run_act(public.staff_tasks) from public, anon, authenticated;

-- Quem conclui primeiro fecha para todos; o segundo recebe a resposta, sem erro de tela.
create or replace function public.restaurant_complete_task(p_task_id uuid)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare t public.staff_tasks; v_done public.staff_tasks; v_completion text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select * into t from public.staff_tasks where id = p_task_id;
  if t.id is null then raise exception 'Tarefa não encontrada' using errcode = 'P0002'; end if;
  if not private.user_in_task_audience(t) then raise exception 'Tarefa de outra função' using errcode = '42501'; end if;
  select completion into v_completion from private.event_catalog where event_type = t.kind;
  -- Fechar sem decidir sumiria com o que está pendente (aprovação, reserva, pedido em preparo).
  if v_completion = 'domain' and t.status = 'open' then
    raise exception 'Esta tarefa fecha quando a ação for feita na tela dela' using errcode = '23514';
  end if;
  update public.staff_tasks set status = 'done', completed_by = auth.uid(), completed_at = clock_timestamp(), updated_at = clock_timestamp()
    where id = p_task_id and status = 'open' returning * into v_done;
  if v_done.id is null then
    return jsonb_build_object('taskId', p_task_id, 'closed', false, 'alreadyClosed', true);
  end if;
  -- Depois de fechar, para guardar quem concluiu. Se o ato falhar, tudo volta e a tarefa segue aberta.
  if v_completion = 'act' then perform private.task_run_act(v_done); end if;
  return jsonb_build_object('taskId', p_task_id, 'closed', true, 'alreadyClosed', false);
end $$;
revoke all on function public.restaurant_complete_task(uuid) from public, anon;
grant execute on function public.restaurant_complete_task(uuid) to authenticated;

create or replace function public.restaurant_claim_task(p_task_id uuid)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare t public.staff_tasks; v_claimed public.staff_tasks;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select * into t from public.staff_tasks where id = p_task_id;
  if t.id is null then raise exception 'Tarefa não encontrada' using errcode = 'P0002'; end if;
  if not private.user_in_task_audience(t) then raise exception 'Tarefa de outra função' using errcode = '42501'; end if;
  update public.staff_tasks set claimed_by = auth.uid(), claimed_at = clock_timestamp(), responsible_user_id = auth.uid(),
      updated_at = clock_timestamp()
    where id = p_task_id and status = 'open' and claimed_by is null returning * into v_claimed;
  if v_claimed.id is null then
    return jsonb_build_object('taskId', p_task_id, 'claimed', false,
      'claimedBy', (select claimed_by from public.staff_tasks where id = p_task_id));
  end if;
  return jsonb_build_object('taskId', p_task_id, 'claimed', true, 'claimedBy', auth.uid());
end $$;
revoke all on function public.restaurant_claim_task(uuid) from public, anon;
grant execute on function public.restaurant_claim_task(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Aprovações: efeito real, auditoria e bloqueio de autoaprovação
-- ---------------------------------------------------------------------------
alter table public.approvals add column amount_cents bigint generated always as (round(coalesce(amount, 0) * 100)::bigint) stored;

CREATE OR REPLACE FUNCTION public.restaurant_resolve_approval(p_approval_id uuid, p_status text, p_resolution_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_status text := lower(trim(coalesce(p_status, '')));
  v_approval public.approvals%rowtype;
  v_updated public.approvals%rowtype;
begin
  select * into v_approval
  from public.approvals
  where id = p_approval_id
  for update;

  if v_approval.id is null then
    raise exception 'Approval not found' using errcode = 'P0002';
  end if;

  perform private.require_restaurant_role(
    v_approval.restaurant_id,
    array['owner','manager']::public.user_roles_role_enum[]
  );

  if v_status not in ('approved','rejected') then
    raise exception 'Invalid resolution status: %', p_status using errcode = '22023';
  end if;
  if v_approval.status <> 'pending' then
    raise exception 'Approval has already been resolved' using errcode = '23514';
  end if;
  -- Ninguém aprova o próprio pedido (ADR-022). Desistir pode: sem outro gestor na casa, ficaria pendente para sempre (pendência 32).
  if v_status = 'approved' and v_approval.requester_id = auth.uid() then
    raise exception 'Você não pode aprovar o próprio pedido' using errcode = '42501';
  end if;

  if v_status = 'approved' and v_approval.order_id is not null then
    if v_approval.type in ('cancellation', 'order_cancellation') then
      update public.orders
      set cancellation_reason = coalesce(nullif(btrim(coalesce(v_approval.reason, '')), ''), 'Cancelamento aprovado'),
          updated_at = now()
      where id = v_approval.order_id
        and restaurant_id = v_approval.restaurant_id;
      -- Aprovado, sai tudo: também o que já foi entregue, ou o pedido não ficaria cancelado.
      update public.order_items oi set status = 'cancelled', updated_at = now()
      from public.orders o
      where o.id = oi.order_id and o.id = v_approval.order_id
        and o.restaurant_id = v_approval.restaurant_id and oi.status::text <> 'cancelled';
    elsif v_approval.type = 'discount' then
      -- discount_cents é o que a conta usa: sem ele, o desconto aprovado não chegava ao que o cliente paga.
      update public.orders
      set discount_cents = greatest(coalesce(discount_cents, 0), v_approval.amount_cents),
          total_cents = greatest(total_cents - greatest(v_approval.amount_cents - coalesce(discount_cents, 0), 0), 0),
          discount_amount = greatest(coalesce(discount_amount, 0), v_approval.amount),
          total_amount = greatest(
            coalesce(subtotal, total_amount, 0)
              + coalesce(tax_amount, 0)
              + coalesce(tip_amount, 0)
              - greatest(coalesce(discount_amount, 0), v_approval.amount),
            0
          ),
          updated_at = now()
      where id = v_approval.order_id
        and restaurant_id = v_approval.restaurant_id;
    end if;
  end if;

  update public.approvals
  set status = v_status,
      resolver_id = auth.uid(),
      resolution_note = nullif(trim(coalesce(p_resolution_note, '')), ''),
      resolved_at = now(),
      updated_at = now()
  where id = p_approval_id
  returning * into v_updated;

  perform private.log_audit(v_approval.restaurant_id, 'approval.' || v_status, 'approval', v_approval.id,
    coalesce(nullif(trim(coalesce(p_resolution_note, '')), ''), v_approval.reason),
    jsonb_build_object('status', v_approval.status, 'type', v_approval.type, 'amountCents', v_approval.amount_cents),
    jsonb_build_object('status', v_status, 'orderId', v_approval.order_id));
  if v_approval.requester_id is not null then
    perform private.create_notification(v_approval.requester_id,
      case when v_status = 'approved' then 'Pedido aprovado' else 'Pedido recusado' end,
      v_approval.item_name, 'system', v_approval.id, 'approval',
      jsonb_build_object('kind', 'approval_resolved', 'approvalId', v_approval.id, 'status', v_status,
        'restaurant_id', v_approval.restaurant_id));
  end if;

  return to_jsonb(v_updated);
end;
$function$;
