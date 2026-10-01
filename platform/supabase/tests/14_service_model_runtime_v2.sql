-- Contract V2 and the critical Quick Service payment/quality/pickup invariants.
begin;
select plan(6);

create temp table _runtime(k text primary key,v uuid);
create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',jsonb_build_object('sub',p_uid,'role','authenticated')::text,true)
$$;
create function pg_temp.state_of(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok'; exception when others then return sqlstate; end $$;

do $$
declare r uuid:='c1000000-0000-4000-8000-000000000002'; c uuid:=gen_random_uuid();
  models public.noowe_service_model[]; menu uuid; result jsonb;
begin
  insert into auth.users(id,email) values(c,c||'@runtime.test');
  insert into public.profiles(id) values(c) on conflict do nothing;
  insert into _runtime values('customer',c),('restaurant',r);
  update public.restaurant_model_configs set
    service_models=array['casual_dining','quick_service']::public.noowe_service_model[],
    pickup_capacity_per_slot=2,loyalty_mode='mixed' where restaurant_id=r;
  select service_models into models from public.restaurant_model_configs where restaurant_id=r;
  assert 'quick_service'::public.noowe_service_model=any(models);
  select id into menu from public.menu_items where restaurant_id=r and is_available limit 1;
  insert into _runtime values('menu',menu);

  perform pg_temp.act(c);
  result:=public.customer_create_order_v2(r,'quick_service',
    jsonb_build_array(jsonb_build_object('menu_item_id',menu,'quantity',1)),gen_random_uuid());
  insert into _runtime values('order',(result->>'id')::uuid);
end $$;

do $$ declare caps jsonb;
begin
  caps:=public.get_restaurant_model_capabilities_v2(
    (select v from _runtime where k='restaurant'),'quick_service');
  assert caps->>'contractVersion'='2';
  assert (caps->'capabilities'->>'prepaidRequired')::boolean;
  assert (caps->'capabilities'->>'qualityCheck')::boolean;
  assert not (caps->'capabilities'->>'tableSession')::boolean;
end $$;
select pass('V2 exposes the canonical Quick capabilities');

select is(
  (select payment_status::text||'/'||fulfillment_status::text from public.orders where id=(select v from _runtime where k='order')),
  'pending/received','new Quick order is unpaid and received');

select is(
  pg_temp.state_of(format($q$select public.restaurant_update_order_status(%L,'preparing',null)$q$,
    (select v from _runtime where k='order'))),
  '42501','customer cannot move a Quick order into production');

do $$ declare result jsonb;
begin
  perform pg_temp.act((select v from _runtime where k='customer'));
  result:=public.customer_start_payment((select v from _runtime where k='order'),'pix',gen_random_uuid());
  assert result->>'paymentStatus'='confirmed';
  assert (select payment_status from public.orders where id=(select v from _runtime where k='order'))='confirmed';
  assert (select count(*) from public.payment_provider_events where gateway_transaction_id=(result->>'transactionId')::uuid)=1;
end $$;
select pass('simulated provider confirms through an idempotent server event');

do $$ declare owner_id uuid:='c1000000-0000-4000-8000-000000000001'; item_id uuid; v_order_id uuid;
begin
  v_order_id:=(select v from _runtime where k='order');
  select id into item_id from public.order_items where order_items.order_id=v_order_id limit 1;
  perform pg_temp.act(owner_id);
  perform public.restaurant_update_order_item_status(item_id,'preparing');
  perform public.restaurant_update_order_item_status(item_id,'ready');
  assert (select fulfillment_status from public.orders where id=v_order_id)='checking';
  assert pg_temp.state_of(format($q$select public.restaurant_update_order_status(%L,'ready',null)$q$,v_order_id))='23514';
  perform public.restaurant_complete_quality_check(v_order_id,true,'{"items":true,"packaging":true,"pickupCode":true}',null);
  assert (select fulfillment_status from public.orders where id=v_order_id)='ready';
end $$;
select pass('Quick requires a real quality check before ready');

do $$ declare owner_id uuid:='c1000000-0000-4000-8000-000000000001'; v_order_id uuid; code text;
begin
  v_order_id:=(select v from _runtime where k='order');
  select pickup_code into code from public.orders where id=v_order_id;
  perform pg_temp.act(owner_id);
  perform public.restaurant_confirm_pickup(v_order_id,code);
  assert (select fulfillment_status from public.orders where id=v_order_id)='picked_up';
  assert (select count(*) from public.quick_stamp_events where quick_stamp_events.order_id=v_order_id)=1;
end $$;
select pass('pickup code completes the order and awards one idempotent stamp');

select * from finish();
rollback;
