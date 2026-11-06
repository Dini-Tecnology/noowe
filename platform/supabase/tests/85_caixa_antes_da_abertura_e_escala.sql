-- Respostas 45, 58 e 60 (05/11/2026).
begin;
select plan(6);
create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;
create function pg_temp.state_of(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok'; exception when others then return sqlstate; end $$;
create temp table _ctx(k text primary key, v uuid);
create function pg_temp.ctx(p text) returns uuid language sql as $$ select v from _ctx where k = p $$;

do $$
declare r uuid := 'c1000000-0000-4000-8000-000000000002'; u uuid; k text;
begin
  insert into _ctx values ('r', r), ('dono', 'c1000000-0000-4000-8000-000000000001');
  foreach k in array array['waiter', 'maitre', 'chef', 'cook'] loop
    u := gen_random_uuid();
    insert into auth.users(id, email) values (u, u || '@escala.test');
    insert into public.profiles(id, full_name) values (u, initcap(k)) on conflict (id) do update set full_name = excluded.full_name;
    insert into public.user_roles(user_id, restaurant_id, role, is_active) values (u, r, k::public.user_roles_role_enum, true);
    insert into _ctx values (k, u);
  end loop;
  update public.cash_register_sessions set status = 'closed', closed_at = now() where restaurant_id = r and status = 'open';
  delete from public.shifts where restaurant_id = r and (date at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date;
end $$;

do $$
declare r uuid := pg_temp.ctx('r'); j jsonb; v public.cash_register_sessions; m public.cash_register_movements;
begin
  perform pg_temp.act(pg_temp.ctx('waiter'));
  perform private.cash_record(r, 'sale', 2500, 'Mesa 3');
  assert exists (select 1 from private.cash_outside_register where restaurant_id = r and movement_id is null and amount_cents = 2500), 'guardado até abrir';
  perform pg_temp.act(pg_temp.ctx('dono'));
  j := public.restaurant_open_cash_register(r, 100);
  select * into v from public.cash_register_sessions where id = (j->>'id')::uuid;
  assert v.expected_cents = 10000 + 2500, 'entra no esperado: ' || v.expected_cents;
  select * into m from public.cash_register_movements where session_id = v.id and before_opening;
  assert m.amount_cents = 2500 and m.actor_id = pg_temp.ctx('waiter') and m.description like '%Lançado antes da abertura', 'marcado, com quem lançou';
  assert private.cash_in_hand_cents(v.id, pg_temp.ctx('waiter')) = 2500, 'conta no dinheiro em mãos de quem recebeu';
  assert not exists (select 1 from private.cash_outside_register where restaurant_id = r and movement_id is null), 'nada fica para trás';
end $$;
select pass('dinheiro sem caixa aberto entra no caixa quando ele abre, marcado como lançado antes da abertura');

do $$
declare r uuid := pg_temp.ctx('r');
begin
  insert into public.operational_days(restaurant_id, business_date, status, started_at, ended_at, closed_at)
    values (r, date '2026-01-10', 'closed', timestamptz '2026-01-10 09:00-03', timestamptz '2026-01-11 02:00-03', timestamptz '2026-01-11 02:00-03');
  perform pg_temp.act(pg_temp.ctx('dono'));
  assert pg_temp.state_of(format($q$select public.restaurant_create_shift(%L, %L, timestamptz '2026-01-10 12:00-03', '10:00', '18:00', 'waiter')$q$,
    r, pg_temp.ctx('waiter'))) = 'P0001', 'dia fechado não muda';
  assert pg_temp.state_of(format($q$select public.restaurant_create_shift(%L, %L, now(), '10:00', '18:00', 'waiter')$q$,
    r, pg_temp.ctx('waiter'))) = 'ok', 'hoje, antes de fechar, inclui';
end $$;
select pass('até o fechamento, o Gerente inclui quem trabalhou na escala do dia; dia fechado não muda');

do $$
declare r uuid := pg_temp.ctx('r'); j jsonb;
begin
  perform pg_temp.act(pg_temp.ctx('dono'));
  perform public.restaurant_create_shift(r, pg_temp.ctx('maitre'), now(), '10:00', '18:00', 'maitre');
  perform public.restaurant_create_shift(r, pg_temp.ctx('cook'), now(), '10:00', '18:00', 'cook');
  perform public.restaurant_create_shift(r, pg_temp.ctx('chef'), now(), '09:00', '17:00', 'chef');
  perform pg_temp.act(pg_temp.ctx('waiter'));
  j := public.restaurant_get_my_shifts(r);
  assert jsonb_array_length(j) = 1 and (j->0->>'staff_id')::uuid = pg_temp.ctx('waiter'), 'só a própria: ' || j::text;
  assert pg_temp.state_of(format($q$select public.restaurant_get_shifts(%L)$q$, r)) = '42501', 'a escala inteira não';
  assert pg_temp.state_of(format($q$select public.restaurant_get_day_team_shifts(%L, 'floor')$q$, r)) = '42501', 'nem a do salão';
end $$;
select pass('cada pessoa vê a própria escala, e o Garçom não vê a dos outros');

do $$
declare r uuid := pg_temp.ctx('r'); j jsonb;
begin
  perform pg_temp.act(pg_temp.ctx('maitre'));
  j := public.restaurant_get_day_team_shifts(r, 'floor');
  assert (select array_agg(x->>'role' order by x->>'role') from jsonb_array_elements(j) x) = array['maitre', 'waiter'], 'salão do dia: ' || j::text;
  assert pg_temp.state_of(format($q$select public.restaurant_get_day_team_shifts(%L, 'kitchen')$q$, r)) = '42501', 'Maître não vê a cozinha';
  assert pg_temp.state_of(format($q$select public.restaurant_create_shift(%L, %L, now(), '10:00', '18:00', 'waiter')$q$, r, pg_temp.ctx('maitre'))) = '42501', 'nem edita';
  perform pg_temp.act(pg_temp.ctx('chef'));
  j := public.restaurant_get_day_team_shifts(r, 'kitchen');
  assert (select array_agg(x->>'role' order by x->>'role') from jsonb_array_elements(j) x) = array['chef', 'cook'], 'cozinha do dia: ' || j::text;
  assert pg_temp.state_of(format($q$select public.restaurant_get_day_team_shifts(%L, 'floor')$q$, r)) = '42501', 'Chef não vê o salão';
end $$;
select pass('Maître vê a escala do salão no dia, e o Chef a da cozinha; editar segue com Dono e Gerente');

select ok(not has_table_privilege('authenticated', 'private.cash_outside_register', 'SELECT'), 'dinheiro fora do caixa não abre para o app');
-- Validação das notas de 06/11: o pagamento em dinheiro da comanda, pelo caminho real, sem caixa aberto.
do $$
declare r uuid := pg_temp.ctx('r'); c uuid := gen_random_uuid(); tbl jsonb; sid uuid; o uuid; menu uuid; res jsonb; tx uuid;
begin
  update public.cash_register_sessions set status = 'closed', closed_at = now() where restaurant_id = r and status = 'open';
  insert into auth.users(id, email) values (c, c || '@caixa85.test');
  insert into public.profiles(id) values (c) on conflict do nothing;
  perform pg_temp.act(pg_temp.ctx('dono'));
  tbl := public.restaurant_create_table(r, 'cx85-' || c, 4);
  select id into menu from public.menu_items where restaurant_id = r limit 1;
  perform pg_temp.act(c);
  sid := (public.customer_open_table_session(tbl->>'qr_code')->>'tableSessionId')::uuid;
  insert into public.orders(restaurant_id, customer_id, table_session_id) values (r, c, sid) returning id into o;
  insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price, total_price_cents) values (o, menu, 1, 30, 30, 3000);
  perform pg_temp.act(pg_temp.ctx('dono'));
  res := public.restaurant_record_bill_payment(sid, 'cash', gen_random_uuid(), 3000);
  tx := (res->>'transactionId')::uuid;
  assert (select status from public.gateway_transactions where id = tx) = 'completed', 'o pagamento vale';
  assert private.session_consumption_balance(sid) = 0, 'abate o saldo: ' || private.session_consumption_balance(sid);
  assert exists (select 1 from private.cash_outside_register where restaurant_id = r and movement_id is null and gateway_transaction_id = tx), 'fica guardado até o caixa abrir';
end $$;
select pass('sem caixa aberto, o dinheiro recebido na comanda vale, abate o saldo e espera a abertura do caixa');
select * from finish();
rollback;
