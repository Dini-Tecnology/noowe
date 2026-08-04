begin;
select plan(12);

select has_function('public', 'customer_open_table_session', array['text'], 'QR validation RPC exists');
select has_function('public', 'customer_place_order', array['uuid','uuid','jsonb','uuid'], 'idempotent order RPC exists');
select has_function('public', 'customer_cancel_order', array['uuid','text'], 'state-aware cancellation exists');
select has_function('public', 'customer_cancel_reservation', array['uuid','text'], 'reservation cancellation exists');
select has_function('public', 'customer_join_waitlist', array['uuid','integer','text','boolean'], 'waitlist RPC exists');
select has_function('public', 'customer_call_waiter', array['uuid','uuid','text'], 'deduplicated waiter call exists');
select has_function('public', 'customer_register_push_token', array['text','text','jsonb'], 'push registration exists');
select is((select relrowsecurity from pg_class where oid = 'public.favorites'::regclass), true, 'favorites RLS enabled');
select is((select relrowsecurity from pg_class where oid = 'public.reviews'::regclass), true, 'reviews RLS enabled');
select is((select relrowsecurity from pg_class where oid = 'public.table_sessions'::regclass), true, 'table sessions RLS enabled');
select is((select relrowsecurity from pg_class where oid = 'public.device_push_tokens'::regclass), true, 'push tokens RLS enabled');
select is((select relrowsecurity from pg_class where oid = 'public.promotion_redemptions'::regclass), true, 'redemptions RLS enabled');

select * from finish();
rollback;
