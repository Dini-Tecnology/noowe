-- Pendência 87: com a comanda aberta, a receita é o consumo já pago. Ao encerrar, é o pedido.
begin;
select plan(4);
create temp table _c(k text primary key, v uuid);
create function pg_temp.rev() returns bigint language sql as $$
  select private.revenue_cents('c1000000-0000-4000-8000-000000000002', now() - interval '1 hour', now() + interval '1 hour') $$;
do $$
declare r uuid := 'c1000000-0000-4000-8000-000000000002'; t uuid; s uuid; o uuid; base bigint; cust uuid := gen_random_uuid();
begin
  delete from public.bill_shares where restaurant_id = r and paid_at >= now() - interval '1 hour';
  update public.orders set created_at = now() - interval '2 days', status = status where restaurant_id = r and created_at >= now() - interval '2 hours';
  base := pg_temp.rev();
  insert into auth.users(id, email) values (cust, cust || '@rev.test');
  insert into public.profiles(id) values (cust) on conflict do nothing;
  insert into public.tables(restaurant_id, table_number, seats, status) values (r, 'REV-' || left(gen_random_uuid()::text, 8), 4, 'occupied') returning id into t;
  insert into public.table_sessions(restaurant_id, table_id, status, guest_count, service_model) values (r, t, 'active', 1, 'fine_dining') returning id into s;
  insert into public.orders(restaurant_id, table_id, table_session_id, customer_id, status, payment_status, total_cents, total_amount, order_type)
    values (r, t, s, cust, 'preparing', 'pending', 8800, 88, 'dine_in') returning id into o;
  insert into _c values ('t', t), ('s', s), ('o', o);
  insert into _c select 'base', ('00000000-0000-0000-0000-' || lpad(base::text, 12, '0'))::uuid;
end $$;
create function pg_temp.base() returns bigint language sql as $$ select right((select v from _c where k = 'base')::text, 12)::bigint $$;

select is(pg_temp.rev() - pg_temp.base(), 0::bigint, 'comanda aberta sem pagamento não soma');

do $$
begin
  insert into public.bill_shares(restaurant_id, table_session_id, round_no, mode, base_cents, service_fee_cents, amount_cents, tip_cents, status, paid_at, idempotency_key)
    values ('c1000000-0000-4000-8000-000000000002', (select v from _c where k = 's'), 1, 'fixed_amount', 2200, 220, 2420, 0, 'paid', now(), gen_random_uuid());
  insert into public.bill_shares(restaurant_id, table_session_id, round_no, mode, base_cents, service_fee_cents, amount_cents, tip_cents, status, paid_at, idempotency_key)
    values ('c1000000-0000-4000-8000-000000000002', (select v from _c where k = 's'), 1, 'fixed_amount', 1000, 0, 1000, 500, 'paid', now(), gen_random_uuid());
  insert into public.bill_shares(restaurant_id, table_session_id, round_no, mode, base_cents, service_fee_cents, amount_cents, tip_cents, status, idempotency_key)
    values ('c1000000-0000-4000-8000-000000000002', (select v from _c where k = 's'), 1, 'fixed_amount', 1000, 0, 1000, 0, 'pending_payment', gen_random_uuid());
end $$;
select is(pg_temp.rev() - pg_temp.base(), 3200::bigint, 'pagamento parcial soma só o consumo pago, sem taxa nem gorjeta, e o que não foi pago fica de fora');

select set_config('noowe.deriving_order_status', 'on', true);
update public.orders set status = 'completed' where id = (select v from _c where k = 'o');
select is(pg_temp.rev() - pg_temp.base(), 3200::bigint, 'pedido concluído em comanda aberta não soma inteiro');

select set_config('noowe.manual_close', '1', true);
update public.table_sessions set status = 'closed', ended_at = now() where id = (select v from _c where k = 's');
select is(pg_temp.rev() - pg_temp.base(), 8800::bigint, 'ao encerrar, entra o pedido uma vez só');
select * from finish();
rollback;
