-- QA 25/11/2026 — P2-3: a mesma receita em painel, Relatórios e Financeiro. OP-04: comanda encerrada fecha as tarefas dela.
begin;
select plan(4);
create temp table _c(k text primary key, v uuid);
create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;
create function pg_temp.panels() returns bigint[] language sql as $$
  select array[
    (public.restaurant_get_dashboard_snapshot('c1000000-0000-4000-8000-000000000002')->>'revenue_today')::numeric * 100,
    (public.restaurant_get_financial_summary('c1000000-0000-4000-8000-000000000002')->>'total_revenue')::numeric * 100,
    (public.restaurant_get_financial_dashboard('c1000000-0000-4000-8000-000000000002')->>'gross_revenue')::numeric * 100,
    (public.restaurant_get_reports('c1000000-0000-4000-8000-000000000002', private.restaurant_day_start(), private.restaurant_day_start() + interval '1 day')->'revenue'->>'total')::numeric * 100
  ]::bigint[] $$;
do $$
declare r uuid := 'c1000000-0000-4000-8000-000000000002'; t uuid; s uuid; o uuid; cust uuid := gen_random_uuid();
begin
  insert into auth.users(id, email) values (cust, cust || '@rev95.test');
  insert into public.profiles(id) values (cust) on conflict do nothing;
  insert into public.tables(restaurant_id, table_number, seats, status) values (r, 'R95-' || left(gen_random_uuid()::text, 8), 4, 'occupied') returning id into t;
  insert into public.table_sessions(restaurant_id, table_id, status, guest_count, service_model) values (r, t, 'active', 1, 'fine_dining') returning id into s;
  insert into public.orders(restaurant_id, table_id, table_session_id, customer_id, status, payment_status, total_cents, total_amount, order_type)
    values (r, t, s, cust, 'preparing', 'pending', 8800, 88, 'dine_in') returning id into o;
  insert into public.staff_tasks(restaurant_id, kind, task_type, title, dedupe_key, audience_roles, order_id, table_id)
    values (r, 'order.created', 'action', 'Novo pedido: Mesa 95', 'order.created:' || o, array['waiter']::public.user_roles_role_enum[], o, t);
  -- A abertura da mesa já gera a tarefa "table.opened:<sessão>".
  assert exists (select 1 from public.staff_tasks where dedupe_key = 'table.opened:' || s and status = 'open'), 'tarefa da abertura existe';
  insert into _c values ('s', s), ('o', o);
  perform pg_temp.act('c1000000-0000-4000-8000-000000000001');
  insert into _c select 'base' || i, ('00000000-0000-0000-0000-' || lpad(x::text, 12, '0'))::uuid from unnest(pg_temp.panels()) with ordinality u(x, i);
end $$;
create function pg_temp.delta() returns bigint[] language sql as $$
  select array_agg(x - right((select v from _c where k = 'base' || i)::text, 12)::bigint order by i) from unnest(pg_temp.panels()) with ordinality u(x, i) $$;

insert into public.bill_shares(restaurant_id, table_session_id, round_no, mode, base_cents, service_fee_cents, amount_cents, tip_cents, status, paid_at, idempotency_key)
  values ('c1000000-0000-4000-8000-000000000002', (select v from _c where k = 's'), 1, 'fixed_amount', 3200, 320, 3520, 0, 'paid', now(), gen_random_uuid());
select is(pg_temp.delta(), array[3200, 3200, 3200, 3200]::bigint[], 'comanda aberta com R$ 32 pagos: os quatro painéis somam R$ 32');

select set_config('noowe.deriving_order_status', 'on', true);
update public.orders set status = 'completed' where id = (select v from _c where k = 'o');
select set_config('noowe.manual_close', '1', true);
update public.table_sessions set status = 'closed', ended_at = now() where id = (select v from _c where k = 's');
select is(pg_temp.delta(), array[8800, 8800, 8800, 8800]::bigint[], 'ao encerrar, os quatro painéis somam o pedido uma vez só');

select is((select count(*) from public.staff_tasks where status = 'open'
  and dedupe_key in ('order.created:' || (select v from _c where k = 'o'), 'table.opened:' || (select v from _c where k = 's'))), 0::bigint,
  'comanda encerrada fecha "Novo pedido" e a abertura da mesa');
select is((select count(*) from public.staff_tasks where status = 'done'
  and dedupe_key in ('order.created:' || (select v from _c where k = 'o'), 'table.opened:' || (select v from _c where k = 's'))), 2::bigint,
  'as tarefas ficam como feitas');
select * from finish();
rollback;
