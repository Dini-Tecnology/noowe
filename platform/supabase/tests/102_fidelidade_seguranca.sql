-- Fidelidade: cliente só lê o próprio saldo; faixas vêm da configuração; edição do programa audita; cashback só do consumo.
begin;
select plan(7);

create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;
create temp table _ctx(k text primary key, v uuid);
grant select on _ctx to authenticated;
create function pg_temp.ctx(p text) returns uuid language sql as $$ select v from _ctx where k = p $$;

do $$
declare r uuid := 'c1000000-0000-4000-8000-000000000002'; c uuid := gen_random_uuid();
begin
  insert into auth.users(id, email) values (c, c || '@fidseg.test');
  insert into public.loyalty_programs(user_id, restaurant_id, points, total_visits, total_spent, tier, last_visit, rewards_claimed, available_rewards, awarded_order_ids, is_active, created_at, updated_at)
    values (c, r, 10, 1, 10, 'bronze', now(), '[]', '[]', '', true, now(), now());
  insert into _ctx values ('c', c);
end $$;

-- 1. Cliente tenta dar pontos a si mesmo: RLS não deixa alterar nada.
select pg_temp.act(pg_temp.ctx('c'));
set local role authenticated;
update public.loyalty_programs set points = 999999, tier = 'platinum', total_spent = 99999 where user_id = pg_temp.ctx('c');
reset role;
select ok((select points = 10 and tier = 'bronze' from public.loyalty_programs where user_id = pg_temp.ctx('c')),
  'cliente não altera pontos/faixa/totais do próprio programa');

-- 2. Nem cria um programa com pontos inventados.
set local role authenticated;
select throws_ok(format($q$insert into public.loyalty_programs(user_id, restaurant_id, points, total_visits, total_spent, tier, is_active, created_at, updated_at)
  values (%L, 'c1000000-0000-4000-8000-000000000003', 999999, 0, 0, 'platinum', true, now(), now())$q$, pg_temp.ctx('c')),
  '42501', null, 'cliente não insere programa de fidelidade');
-- 3. Mas continua lendo o próprio saldo.
select is((select points from public.loyalty_programs where user_id = pg_temp.ctx('c'))::bigint, 10::bigint, 'cliente lê o próprio saldo');
reset role;

-- 4. Faixas crescentes são obrigatórias no servidor.
select pg_temp.act('c1000000-0000-4000-8000-000000000001');
select throws_ok($q$select public.restaurant_upsert_loyalty_config('c1000000-0000-4000-8000-000000000002',
  '{"points_enabled": true, "points_per_real": 1, "tier_silver_min_cents": 10000, "tier_gold_min_cents": 10000, "tier_platinum_min_cents": 30000}')$q$,
  '22023', null, 'faixas fora de ordem são recusadas');

-- 5. Edição grava audit_log com antes/depois e autor, e as faixas novas valem no cálculo.
select public.restaurant_upsert_loyalty_config('c1000000-0000-4000-8000-000000000002',
  '{"points_enabled": true, "points_per_real": 1, "cashback_enabled": true, "cashback_percentage": 10, "tier_silver_min_cents": 10000, "tier_gold_min_cents": 20000, "tier_platinum_min_cents": 30000}');
select ok(exists (select 1 from public.audit_logs where action = 'loyalty_config.updated'
    and restaurant_id = 'c1000000-0000-4000-8000-000000000002' and user_id = 'c1000000-0000-4000-8000-000000000001'
    and ("after"->>'tier_gold_min_cents')::bigint = 20000 and created_at = now()),
  'edição do programa grava audit_log na mesma transação');
select ok((select private.loyalty_tier_for(99.99, lc) = 'bronze' and private.loyalty_tier_for(100, lc) = 'silver'
    and private.loyalty_tier_for(250, lc) = 'gold' and private.loyalty_tier_for(300, lc) = 'platinum'
    from public.loyalty_configs lc where restaurant_id = 'c1000000-0000-4000-8000-000000000002'),
  'faixa calculada pelos cortes do restaurante');

-- 6. Cashback de 10% sobre R$ 100 de consumo, com R$ 15 de gorjeta e R$ 2 de conveniência: R$ 10, não R$ 11,70.
do $$
begin
  insert into public.gateway_transactions(restaurant_id, customer_id, provider, payment_method, amount_cents, tip_cents, convenience_cents,
      status, idempotency_key, created_at, updated_at)
    values ('c1000000-0000-4000-8000-000000000002', pg_temp.ctx('c'), 'asaas', 'pix', 11700, 1500, 200,
      'completed', 'fidseg-' || gen_random_uuid(), now(), now());
end $$;
select is((select wt.amount from public.wallet_transactions wt join public.wallets w on w.id = wt.wallet_id
            where w.user_id = pg_temp.ctx('c') and wt.transaction_type = 'cashback'), 10.00::numeric,
  'cashback sai do consumo, sem gorjeta nem conveniência');

select * from finish();
rollback;
