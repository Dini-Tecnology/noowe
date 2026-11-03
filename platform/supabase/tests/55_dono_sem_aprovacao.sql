-- Resposta 32 do Pedro: o Dono nunca precisa de aprovação, e os demais não aprovam o próprio pedido.
begin;
select plan(11);
update private.dev_flags set enabled = true where key = 'simulate_order_payment';

create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.state_of(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok'; exception when others then return sqlstate; end $$;
create temp table _ctx(k text primary key, v uuid);
create function pg_temp.ctx(p_k text) returns uuid language sql as $$ select v from _ctx where k = p_k $$;
create function pg_temp.new_user(p_name text) returns uuid language plpgsql as $$
declare u uuid := gen_random_uuid();
begin
  insert into auth.users(id, email) values (u, p_name || '-' || u || '@dono.test');
  insert into public.profiles(id, full_name) values (u, p_name) on conflict (id) do update set full_name = p_name;
  insert into _ctx values (p_name, u);
  return u;
end $$;

do $$
declare r uuid := 'c1000000-0000-4000-8000-000000000002'; owner_id uuid := 'c1000000-0000-4000-8000-000000000001';
  m uuid; w uuid; both_roles uuid; c uuid; o uuid; menu uuid;
begin
  insert into _ctx values ('r', r), ('owner', owner_id);
  m := pg_temp.new_user('manager'); w := pg_temp.new_user('waiter'); both_roles := pg_temp.new_user('both'); c := pg_temp.new_user('customer');
  insert into public.user_roles(user_id, restaurant_id, role) values (m, r, 'manager'), (w, r, 'waiter'), (both_roles, r, 'owner'), (both_roles, r, 'waiter');
  select id into menu from public.menu_items where restaurant_id = r limit 1;
  insert into public.orders(restaurant_id, customer_id, order_type) values (r, c, 'dine_in') returning id into o;
  insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price) values (o, menu, 1, 100, 100);
  insert into _ctx values ('order', o);
end $$;

-- O Dono pede: nasce aprovado, aplica o efeito e audita, sem tarefa nem aviso.
select pg_temp.act(pg_temp.ctx('owner'));
select (public.restaurant_request_approval(pg_temp.ctx('r'), 'discount', 'Conta', 'Cortesia da casa', 10, null, pg_temp.ctx('order'))->>'id') as own_id \gset
select is((select status from public.approvals where id = :'own_id'), 'approved', 'o pedido do Dono nasce aprovado');
select is((select resolver_id from public.approvals where id = :'own_id'), pg_temp.ctx('owner'), 'o próprio Dono consta como quem resolveu');
select is((select discount_cents from public.orders where id = pg_temp.ctx('order')), 1000::bigint, 'o desconto vale na conta, em centavos');
select is((select count(*)::int from public.staff_tasks where entity_id = :'own_id'::uuid), 0, 'sem tarefa para quem decide');
select is((select count(*)::int from public.audit_logs where entity_id = :'own_id'::uuid and action = 'approval.approved'
  and "after"->>'direct' = 'true'), 1, 'fica registrado como aplicado direto');

-- Quem é Dono e também garçom conta como Dono.
select pg_temp.act(pg_temp.ctx('both'));
select is((public.restaurant_request_approval(pg_temp.ctx('r'), 'other', 'Item', 'Teste', 0)->>'status'), 'approved',
  'Dono que também é garçom é tratado como Dono');

-- O garçom segue pedindo e esperando.
select pg_temp.act(pg_temp.ctx('waiter'));
select (public.restaurant_request_approval(pg_temp.ctx('r'), 'other', 'Item', 'Teste', 0)->>'id') as w_id \gset
select is((select status from public.approvals where id = :'w_id'), 'pending', 'o pedido do garçom fica pendente');

-- O Gerente não aprova o próprio pedido, mas desiste; o Dono aprova o dele e o dos outros.
select pg_temp.act(pg_temp.ctx('manager'));
select (public.restaurant_request_approval(pg_temp.ctx('r'), 'other', 'Item do gerente', 'Teste', 0)->>'id') as m_id \gset
select is(pg_temp.state_of(format($q$select public.restaurant_resolve_approval(%L, 'approved')$q$, :'m_id')), '42501',
  'o Gerente não aprova o próprio pedido');
select lives_ok(format($q$select public.restaurant_resolve_approval(%L, 'rejected', 'Desisti')$q$, :'m_id'), 'o Gerente pode desistir');
select pg_temp.act(pg_temp.ctx('owner'));
select lives_ok(format($q$select public.restaurant_resolve_approval(%L, 'approved', 'Ok')$q$, :'w_id'), 'o Dono aprova o pedido do garçom');
select is((select resolver_id from public.approvals where id = :'w_id'), pg_temp.ctx('owner'), 'quem aprovou fica registrado');

select * from finish();
rollback;
