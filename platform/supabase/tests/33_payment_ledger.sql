-- N4 / P1: livro-razão de pagamentos e fronteira única de confirmação.
-- N4 #1 (sem cobrança duplicada), #2 (confirmação só pela fronteira do provedor).
begin;
select plan(11);

create temp table ledger_ctx as
  select 'c1000000-0000-4000-8000-000000000002'::uuid as restaurant_id,
         gen_random_uuid() as tx_id,
         gen_random_uuid() as customer_id;
grant select on ledger_ctx to authenticated;

insert into public.gateway_transactions(
  id, restaurant_id, provider, payment_method, amount_cents, status, idempotency_key,
  created_at, updated_at)
select tx_id, restaurant_id, 'asaas', 'pix', 1000, 'pending', 'ledger-k1', now(), now() from ledger_ctx;

select is(
  (select data_type from information_schema.columns
    where table_schema = 'public' and table_name = 'gateway_transactions' and column_name = 'amount_cents'),
  'bigint', 'amount_cents é bigint');

select is(
  (select amount from public.gateway_transactions where idempotency_key = 'ledger-k1'),
  10::numeric, 'amount legado é preenchido a partir de amount_cents');

select throws_ok(
  $$ insert into public.gateway_transactions(
       restaurant_id, provider, payment_method, amount_cents, status, idempotency_key, created_at, updated_at)
     select restaurant_id, 'asaas', 'pix', 1, 'pending', 'ledger-k1', now(), now() from ledger_ctx $$,
  '23505', null, 'mesma chave de idempotência não gera segunda cobrança');

select throws_ok(
  $$ update public.gateway_transactions set status = 'bogus' where idempotency_key = 'ledger-k1' $$,
  '23514', null, 'status fora do conjunto é rejeitado');

select is(
  (select private.apply_payment_event(tx_id, 'asaas', 'ev-1', 'PAYMENT_RECEIVED', 'confirmed', 999)->>'ignored'
     from ledger_ctx),
  'amount_mismatch', 'valor divergente não confirma');
select is(
  (select status from public.gateway_transactions where idempotency_key = 'ledger-k1'),
  'pending', 'transação segue pendente após divergência');

select is(
  (select private.apply_payment_event(tx_id, 'asaas', 'ev-2', 'PAYMENT_RECEIVED', 'confirmed', 1000)
            ->>'idempotentReplay' from ledger_ctx),
  'false', 'evento válido confirma');
select is(
  (select status from public.gateway_transactions where idempotency_key = 'ledger-k1'),
  'completed', 'transação confirmada pelo evento');

select is(
  (select private.apply_payment_event(tx_id, 'asaas', 'ev-2', 'PAYMENT_RECEIVED', 'confirmed', 1000)
            ->>'idempotentReplay' from ledger_ctx),
  'true', 'evento repetido é replay idempotente');

select is(
  (select count(*)::int from public.payment_provider_events where provider_event_id in ('ev-1', 'ev-2')),
  2, 'cada evento é gravado uma única vez');

-- Cliente não confirma pagamento: a fronteira não é executável por authenticated.
select _test.as_user((select customer_id from ledger_ctx));
select throws_ok(
  $$ select private.apply_payment_event(
       (select tx_id from ledger_ctx), 'asaas', 'ev-x', 'x', 'confirmed') $$,
  '42501', null, 'cliente não executa apply_payment_event');

select * from finish();
rollback;
