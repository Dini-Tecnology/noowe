-- N4 / P0: cliente não escreve em gateway_transactions nem lê gateway_configs;
-- a confirmação de pagamento não pode nascer de um INSERT feito pelo app.
begin;
select plan(7);

create temp table lockdown_ctx as
  select gen_random_uuid() as customer_id,
         gen_random_uuid() as other_id,
         gen_random_uuid() as restaurant_id;
grant select on lockdown_ctx to authenticated;

insert into auth.users(id, email)
  select customer_id, customer_id || '@lockdown.test' from lockdown_ctx
  union all select other_id, other_id || '@lockdown.test' from lockdown_ctx;
insert into public.profiles(id)
  select customer_id from lockdown_ctx union all select other_id from lockdown_ctx
  on conflict do nothing;

-- Linha legítima, criada pelo "servidor" (papel do teste, fora do RLS).
insert into public.gateway_transactions(
  restaurant_id, provider, payment_method, amount_cents, status,
  idempotency_key, customer_id, created_at, updated_at)
select restaurant_id, 'asaas', 'pix', 1000, 'pending', 'lockdown-own', customer_id, now(), now()
  from lockdown_ctx;

select _test.as_user((select customer_id from lockdown_ctx));

select throws_ok(
  $$ insert into public.gateway_transactions(
       restaurant_id, provider, payment_method, amount_cents, status,
       idempotency_key, customer_id, created_at, updated_at)
     select restaurant_id, 'x', 'pix', 1, 'completed', 'forged', customer_id, now(), now()
       from lockdown_ctx $$,
  '42501', null, 'cliente não insere transação concluída');

select throws_ok(
  $$ update public.gateway_transactions set status = 'completed' $$,
  '42501', null, 'cliente não altera status de transação');

select throws_ok(
  $$ delete from public.gateway_transactions $$,
  '42501', null, 'cliente não apaga transação');

select is(
  (select count(*)::int from public.gateway_transactions where idempotency_key = 'lockdown-own'),
  1, 'cliente lê a própria transação');

select throws_ok(
  $$ select count(*) from public.gateway_configs $$,
  '42501', null, 'cliente não lê gateway_configs');

select _test.as_user((select other_id from lockdown_ctx));
select is(
  (select count(*)::int from public.gateway_transactions where idempotency_key = 'lockdown-own'),
  0, 'outro cliente não vê a transação');

select _test.as_anon();
select throws_ok(
  $$ select count(*) from public.gateway_transactions $$,
  '42501', null, 'anônimo não lê transações');

select * from finish();
rollback;
