-- QA 27/11: no balcão o número falado é o código curto do dia (pickup_code), não o order_number longo.
begin;
select plan(2);
update private.dev_flags set enabled = false where key in ('simulate_order_payment', 'simulate_pix_payment');

create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;
create function pg_temp.state_of(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok'; exception when others then return sqlstate; end $$;
create temp table _ctx(k text primary key, v uuid);
create function pg_temp.ctx(p text) returns uuid language sql as $$ select v from _ctx where k = p $$;

do $$
declare r uuid := 'c1000000-0000-4000-8000-000000000002'; c uuid := gen_random_uuid(); b uuid := gen_random_uuid(); acc uuid; m1 uuid;
begin
  insert into public.restaurant_payment_accounts(restaurant_id, provider, status) values (r, 'asaas', 'active') on conflict do nothing;
  update public.restaurant_payment_accounts set status = 'active' where restaurant_id = r;
  select id into acc from public.restaurant_payment_accounts where restaurant_id = r;
  insert into auth.users(id, email) values (c, c || '@q114.test'), (b, b || '@q114.test');
  insert into public.profiles(id, full_name) values (c, 'Cliente'), (b, 'Barman') on conflict do nothing;
  insert into public.user_roles(user_id, restaurant_id, role, is_active) values (b, r, 'barman', true);
  update public.restaurant_model_configs set service_models = array['casual_dining','quick_service']::public.noowe_service_model[],
    pickup_capacity_per_slot = 5 where restaurant_id = r;
  update public.restaurants set opening_hours = (
    select jsonb_object_agg(d, jsonb_build_object('closed', false, 'shifts', jsonb_build_array(jsonb_build_object('open', '00:00', 'close', '23:59'))))
    from unnest(array['sunday','monday','tuesday','wednesday','thursday','friday','saturday']) d) where id = r;
  update public.restaurant_model_policies set close_orders_before_min = 0, accept_mode = 'auto', orders_paused = false, prepaid_required = true
    where restaurant_id = r and service_model = 'quick_service';
  select id into m1 from public.menu_items where restaurant_id = r and is_available order by id limit 1;
  insert into _ctx values ('r', r), ('c', c), ('b', b), ('acc', acc), ('m1', m1);
end $$;


do $$
declare o uuid; j jsonb; code text;
begin
  perform pg_temp.act(pg_temp.ctx('c'));
  o := (public.customer_create_order_v2(pg_temp.ctx('r'), 'quick_service',
    jsonb_build_array(jsonb_build_object('menu_item_id', pg_temp.ctx('m1'), 'quantity', 1)),
    gen_random_uuid(), null, null, null, 'Ana', 'takeaway', true)->>'id')::uuid;
  update public.orders set total_cents = greatest(private.online_minimum_cents() - 1, 1) where id = o;
  select pickup_code into code from public.orders where id = o;
  j := public.customer_quick_pay_at_counter(o);
  assert code is not null and length(code) <= 8, 'pedido Quick tem código curto';
  assert j->>'orderNumber' = code, j::text;
  insert into _ctx values ('o', o);
end $$;
select pass('o cliente recebe o código curto do dia como número do balcão');

do $$
begin
  perform pg_temp.act(pg_temp.ctx('b'));
  assert exists (select 1 from jsonb_array_elements(public.restaurant_list_counter_orders(pg_temp.ctx('r'))) e
    where (e->>'orderId')::uuid = pg_temp.ctx('o') and e->>'counterCode' = (select pickup_code from public.orders where id = pg_temp.ctx('o'))), 'balcão vê o mesmo código';
end $$;
select pass('o painel do balcão mostra o mesmo código');

select * from finish();
rollback;
