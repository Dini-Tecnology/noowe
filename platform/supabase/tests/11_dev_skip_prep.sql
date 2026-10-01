-- The prep shortcut stays off with the dev flag, and when it is on it marks
-- the caller's order ready so the visit can continue.
begin;
select plan(1);
do $$
declare
  r uuid := 'c1000000-0000-4000-8000-000000000002';
  customer_id uuid := gen_random_uuid();
  menu uuid;
  order_id uuid;
  item_id uuid;
  result jsonb;
begin
  insert into auth.users(id, email) values (customer_id, customer_id || '@dev-prep.test');
  insert into public.profiles(id) values (customer_id) on conflict do nothing;
  select id into menu from public.menu_items where restaurant_id = r limit 1;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', customer_id, 'role', 'authenticated')::text, true);
  insert into public.orders(restaurant_id, customer_id, status)
  values (r, customer_id, 'pending')
  returning id into order_id;
  insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price, status)
  values (order_id, menu, 1, 20, 20, 'pending')
  returning id into item_id;

  begin
    perform public.customer_dev_skip_prep(order_id);
    raise exception 'prep skip ran while the flag was off';
  exception when sqlstate '42501' then null;
  end;

  update private.dev_flags
  set enabled = true, updated_at = now()
  where key = 'simulate_table_scan';

  result := public.customer_dev_skip_prep(order_id);
  assert result->>'status' = 'ready', 'skip reports the order ready';
  assert (select status::text from public.orders where id = order_id) = 'ready', 'order status is ready';
  assert (select status::text from public.order_items where id = item_id) = 'ready', 'items follow the order';
  assert (select actual_ready_at from public.orders where id = order_id) is not null, 'ready timestamp is set';

  result := public.customer_dev_skip_prep(order_id);
  assert result->>'status' = 'ready', 'a second skip is a no-op';
end $$;
select pass('dev prep skip stays gated and marks the order ready');
select * from finish();
rollback;
