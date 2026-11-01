-- O0 (20261101100000): correções imediatas do app do restaurante.
--  * Painel, Relatórios e Financeiro somam a mesma receita, inclusive comanda paga por parcela
--    (pedido ainda não entregue com pagamento confirmado) e sem contar cancelado;
--  * "hoje" é o dia do restaurante (America/Sao_Paulo), não o do servidor;
--  * Clientes lista quem pagou ou reservou, sem depender de programa de pontos;
--  * garçom e maître leem o KDS e veem item pronto;
--  * o turno do dia aparece na Equipe pelo dia do restaurante.
begin;
select plan(9);

create temp table o0_results(label text primary key, ok boolean not null);

do $$
declare
  r uuid := 'c1000000-0000-4000-8000-000000000002';
  owner_id uuid := 'c1000000-0000-4000-8000-000000000001';
  waiter uuid := gen_random_uuid();
  maitre uuid := gen_random_uuid();
  buyer uuid := gen_random_uuid();
  booker uuid := gen_random_uuid();
  item uuid;
  paid_order uuid := gen_random_uuid();
  base_snapshot numeric;
  base_reports numeric;
  base_summary numeric;
  base_dashboard numeric;
  base_cents bigint;
  snap jsonb;
  customers jsonb;
  staff jsonb;
  kds jsonb;
  day0 timestamptz := private.restaurant_day_start();
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', owner_id, 'role', 'authenticated')::text, true);

  insert into auth.users(id, email) values
    (waiter, waiter || '@o0.test'), (maitre, maitre || '@o0.test'),
    (buyer, buyer || '@o0.test'), (booker, booker || '@o0.test');
  insert into public.profiles(id, email, full_name) values
    (waiter, waiter || '@o0.test', 'Garçom O0'), (maitre, maitre || '@o0.test', 'Maître O0'),
    (buyer, buyer || '@o0.test', 'Compradora O0'), (booker, booker || '@o0.test', 'Reservista O0')
  on conflict (id) do update set full_name = excluded.full_name;
  perform public.restaurant_upsert_staff_role(r, waiter, 'waiter');
  perform public.restaurant_upsert_staff_role(r, maitre, 'maitre');

  select id into item from public.menu_items where restaurant_id = r limit 1;

  base_snapshot := (public.restaurant_get_dashboard_snapshot(r)->>'revenue_today')::numeric;
  base_reports := (public.restaurant_get_reports(r)->'revenue'->>'total')::numeric;
  base_summary := (public.restaurant_get_financial_summary(r)->>'total_revenue')::numeric;
  base_dashboard := (public.restaurant_get_financial_dashboard(r)->>'gross_revenue')::numeric;
  base_cents := private.revenue_cents(r, day0, day0 + interval '1 day');

  -- R$ 100 entregue; R$ 190 pago por parcela mas ainda em preparo; R$ 50 cancelado.
  insert into public.orders(id, restaurant_id, customer_id, status, payment_status, total_amount, total_cents) values
    (paid_order, r, buyer, 'delivered', 'pending', 100, 10000),
    (gen_random_uuid(), r, buyer, 'preparing', 'confirmed', 190, 19000),
    (gen_random_uuid(), r, buyer, 'cancelled', 'confirmed', 50, 5000);
  -- R$ 700 de ontem à noite (antes do começo do dia do restaurante): fora de "hoje".
  insert into public.orders(restaurant_id, customer_id, status, payment_status, total_amount, total_cents, created_at)
    values (r, buyer, 'delivered', 'confirmed', 700, 70000, day0 - interval '30 minutes');

  snap := public.restaurant_get_dashboard_snapshot(r);
  insert into o0_results values ('painel soma a comanda paga por parcela e ignora cancelado e o dia anterior',
    (snap->>'revenue_today')::numeric - base_snapshot = 290);
  insert into o0_results values ('relatórios, financeiro e painel mostram a mesma receita do dia',
    (public.restaurant_get_reports(r, day0, day0 + interval '1 day')->'revenue'->>'total')::numeric - base_reports
      = (public.restaurant_get_financial_summary(r)->>'total_revenue')::numeric - base_summary
    and (public.restaurant_get_financial_summary(r)->>'total_revenue')::numeric - base_summary
      = (public.restaurant_get_financial_dashboard(r)->>'gross_revenue')::numeric - base_dashboard
    and (public.restaurant_get_financial_dashboard(r)->>'gross_revenue')::numeric - base_dashboard = 290);
  insert into o0_results values ('revenue_cents é bigint em centavos e bate com o painel',
    private.revenue_cents(r, day0, day0 + interval '1 day') - base_cents = 29000);
  insert into o0_results values ('o dia do restaurante começa em horário de Brasília',
    (day0 at time zone 'America/Sao_Paulo')::time = '00:00'::time);

  -- CRM: quem pagou aparece, com o gasto; quem só reservou também.
  insert into public.reservations(restaurant_id, customer_id, reservation_time, party_size, status, confirmation_code)
    values (r, booker, now() + interval '1 day', 2, 'confirmed', 'O0TEST');
  customers := public.restaurant_get_customers(r, 200);
  insert into o0_results values ('clientes lista quem pagou, sem programa de pontos, com o gasto em reais',
    exists (select 1 from jsonb_array_elements(customers->'customers') c
            where (c->>'user_id')::uuid = buyer and (c->>'total_spent')::numeric = 990));
  insert into o0_results values ('clientes lista quem só reservou',
    exists (select 1 from jsonb_array_elements(customers->'customers') c where (c->>'user_id')::uuid = booker));

  -- KDS: um item pronto de pedido em andamento aparece para o garçom e para o maître.
  insert into public.orders(id, restaurant_id, customer_id, status, payment_status, total_amount, total_cents)
    values (gen_random_uuid(), r, buyer, 'ready', 'confirmed', 10, 1000);
  insert into public.order_items(order_id, menu_item_id, quantity, status)
    select o.id, item, 1, 'ready' from public.orders o
    where o.restaurant_id = r and o.customer_id = buyer and o.status = 'ready';

  perform set_config('request.jwt.claims', jsonb_build_object('sub', waiter, 'role', 'authenticated')::text, true);
  kds := public.restaurant_get_kds_queue(r);
  insert into o0_results values ('garçom lê o KDS e vê item pronto',
    exists (select 1 from jsonb_array_elements(kds) k where k->>'status' = 'ready'));
  perform set_config('request.jwt.claims', jsonb_build_object('sub', maitre, 'role', 'authenticated')::text, true);
  insert into o0_results values ('maître lê o KDS',
    jsonb_typeof(public.restaurant_get_kds_queue(r)) = 'array');

  -- Turno do dia: marcado para o começo do dia do restaurante, aparece na Equipe.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', owner_id, 'role', 'authenticated')::text, true);
  insert into public.shifts(staff_id, restaurant_id, date, start_time, end_time, role, status, is_overtime, created_at, updated_at)
    values (waiter, r, day0, '18:00', '23:00', 'waiter', 'scheduled', false, now(), now());
  staff := public.restaurant_get_staff(r);
  insert into o0_results values ('equipe mostra o turno de hoje para quem está escalado',
    exists (select 1 from jsonb_array_elements(staff) s
            where (s->>'user_id')::uuid = waiter and s->'shift' is not null and s->'shift' <> 'null'::jsonb));
end $$;

select ok(ok, label) from o0_results order by label;
select * from finish();
rollback;
