-- Behavioral regression: real RPCs, real signed QR codes, rolled back fixtures.
begin;
select plan(1);
do $$
declare
  r uuid := 'c1000000-0000-4000-8000-000000000002';
  owner_id uuid := 'c1000000-0000-4000-8000-000000000001';
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  t1 jsonb; t2 jsonb; visit jsonb; result jsonb; replay jsonb;
  sid uuid; menu uuid; o1 uuid; o2 uuid; i1 uuid; i2 uuid;
  key1 uuid := gen_random_uuid(); key2 uuid := gen_random_uuid();
  n integer;
begin
  insert into auth.users(id,email) values (a,a||'@checkout.test'),(b,b||'@checkout.test');
  insert into public.profiles(id) values (a),(b) on conflict do nothing;
  perform set_config('request.jwt.claims', jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
  t1 := public.restaurant_create_table(r, 'test-checkout-'||a, 4);
  t2 := public.restaurant_create_table(r, 'test-checkout-'||b, 4);
  select id into menu from public.menu_items where restaurant_id=r limit 1;
  perform set_config('request.jwt.claims', jsonb_build_object('sub',a,'role','authenticated')::text,true);
  visit := public.customer_open_table_session(t1->>'qr_code');
  sid := (visit->>'tableSessionId')::uuid;
  assert (public.customer_open_table_session(t1->>'qr_code')->>'tableSessionId')::uuid = sid, 'same QR is idempotent';
  perform set_config('request.jwt.claims', jsonb_build_object('sub',b,'role','authenticated')::text,true);
  perform public.customer_open_table_session(t1->>'qr_code');
  insert into public.orders(restaurant_id,customer_id,table_session_id) values(r,a,sid) returning id into o1;
  insert into public.orders(restaurant_id,customer_id,table_session_id) values(r,b,sid) returning id into o2;
  insert into public.order_items(order_id,menu_item_id,quantity,unit_price,total_price) values(o1,menu,1,20,20) returning id into i1;
  insert into public.order_items(order_id,menu_item_id,quantity,unit_price,total_price) values(o2,menu,1,30,30) returning id into i2;
  perform set_config('request.jwt.claims', jsonb_build_object('sub',a,'role','authenticated')::text,true);
  begin
    perform public.customer_open_table_session(t2->>'qr_code');
    raise exception 'unpaid diner was allowed to switch tables';
  exception when sqlstate 'P0004' then null; end;
  begin
    perform public.customer_leave_table_session(sid);
    raise exception 'unpaid diner was allowed to leave';
  exception when sqlstate 'P0004' then null; end;
  begin
    perform public.customer_pay_table_bill(sid,0,'pix',999,'fixed',gen_random_uuid());
    raise exception 'overpayment was accepted';
  exception when sqlstate '22023' then null; end;
  result := public.customer_pay_table_bill(sid,0,'wallet',5,'fixed',key1);
  assert (result->>'charged')::numeric=5.5, 'server calculates fee';
  assert not (result->>'sessionReleased')::boolean, 'partial payment retains visit';
  replay := public.customer_pay_table_bill(sid,0,'wallet',5,'fixed',key1);
  assert replay->>'receiptId'=result->>'receiptId', 'replay returns same receipt';
  assert (public.customer_get_table_bill(sid)->>'subtotal')::numeric=45, 'partial balance is reduced';
  result := public.customer_pay_table_bill(sid,10,'pix',15,'mine',key2);
  assert (result->>'charged')::numeric=18, 'remaining own items only';
  assert (result->>'sessionReleased')::boolean, 'paid diner is released';
  assert not (result->>'tableClosed')::boolean, 'other diners remain active';
  assert (select status::text from public.orders where id=o1)='completed', 'own order finalized';
  assert (select status::text from public.orders where id=o2)<>'completed', 'other order unchanged';
  replay := public.customer_pay_table_bill(sid,10,'pix',15,'mine',key2);
  assert replay->>'receiptId'=result->>'receiptId', 'replay works after leaving';
  assert public.customer_get_active_visit() is null, 'no stale visit after payment';
  assert (public.customer_get_receipt((result->>'receiptId')::uuid)->>'simulated')::boolean, 'receipt records simulation';
  visit := public.customer_open_table_session(t2->>'qr_code');
  assert visit->>'tableId'=t2->>'id', 'paid diner can scan next table while others owe';
  perform public.customer_leave_table_session((visit->>'tableSessionId')::uuid);
  perform set_config('request.jwt.claims', jsonb_build_object('sub',b,'role','authenticated')::text,true);
  result := public.customer_pay_table_bill(sid,0,'credit_card',30,'byItem',gen_random_uuid(),array[i2]);
  assert (result->>'tableClosed')::boolean, 'last payment ends session';
  assert (select status::text from public.tables where id=(t1->>'id')::uuid)='available', 'table released';
  assert public.customer_get_active_visit() is null, 'restart will not restore closed visit';
  select count(*) into n from public.gateway_transactions where metadata->>'table_session_id'=sid::text;
  assert n=3, 'retries did not duplicate payments';
  assert not exists (select 1 from public.wallet_transactions wt join public.wallets w on w.id=wt.wallet_id
    where w.user_id in(a,b)), 'simulation neither debits wallet nor grants spendable cashback';

  -- Reusing the same physical QR after closing creates a fresh session.
  visit := public.customer_open_table_session(t1->>'qr_code');
  assert (visit->>'tableSessionId')::uuid <> sid, 'new visit has a fresh session';
  sid := (visit->>'tableSessionId')::uuid;
  perform set_config('request.jwt.claims', jsonb_build_object('sub',a,'role','authenticated')::text,true);
  perform public.customer_open_table_session(t1->>'qr_code');
  insert into public.orders(restaurant_id,customer_id,table_session_id) values(r,a,sid) returning id into o1;
  insert into public.orders(restaurant_id,customer_id,table_session_id) values(r,b,sid) returning id into o2;
  insert into public.order_items(order_id,menu_item_id,quantity,unit_price,total_price) values(o1,menu,1,10,10),(o2,menu,1,10.01,10.01);
  result := public.customer_pay_table_bill(sid,0,'pix',10.01,'equal',gen_random_uuid());
  assert (result->>'sessionReleased')::boolean, 'equal split covers caller first';
  perform set_config('request.jwt.claims', jsonb_build_object('sub',b,'role','authenticated')::text,true);
  assert (public.customer_get_table_bill(sid)->>'subtotal')::numeric=10, 'odd cent preserved';
  result := public.customer_pay_table_bill(sid,0,'pix',10,'equal',gen_random_uuid());
  assert (result->>'tableClosed')::boolean, 'equal split completes table';
  assert not has_table_privilege('authenticated', 'public.table_payment_allocations', 'INSERT'), 'client cannot forge allocations';
  assert not has_function_privilege('anon', 'public.customer_pay_table_bill(uuid,numeric,text,numeric,text,uuid,uuid[])', 'EXECUTE'), 'anonymous payment is forbidden';
  assert (select sum(a.amount_cents) from public.table_payment_allocations a join public.gateway_transactions g
    on g.id=a.gateway_transaction_id where g.metadata->>'table_session_id'=sid::text)=2001, 'no missing or extra cent';
  -- Recover a paid legacy visit whose old flow never ended the session.
  visit := public.customer_open_table_session(t2->>'qr_code');
  sid := (visit->>'tableSessionId')::uuid;
  insert into public.orders(restaurant_id,customer_id,table_session_id,status) values(r,b,sid,'completed');
  assert public.customer_get_active_visit() is null, 'legacy completed account is recovered on startup';
  assert (select status from public.table_sessions where id=sid)='ended', 'legacy session is ended';
end $$;
select pass('simulated checkout: partial, mine, equal, by item, retries, QR switching and closure');
select * from finish();
rollback;
