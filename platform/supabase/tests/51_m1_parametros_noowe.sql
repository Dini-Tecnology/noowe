-- Fatia M1 (docs/fatias/M1-parametros-noowe.md). A varredura do critério 1 nos apps e nas Edge Functions está em
-- platform/mobile/apps/restaurant/src/__tests__/commercialLiterals.test.ts.
begin;
select plan(31);

create function pg_temp.state_of(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok'; exception when others then return sqlstate; end $$;

create temp view _params as
  select c.oid, c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'private' and c.relkind = 'r' and c.relname like 'noowe\_%';

select set_config('noowe.param_author', 'teste M1', true);

-- ---------------------------------------------------------------------------
-- Critério 1: nenhum literal comercial nas funções do banco
-- ---------------------------------------------------------------------------
select is_empty($q$
  select n.nspname || '.' || p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  -- `seed_*` monta restaurante de demonstração: os números lá são preços de prato.
  where n.nspname in ('public', 'private') and p.prokind = 'f' and p.proname not like 'seed\_%'
    and p.prosrc ~ '\m(349|149|360|19900|34900|64900|800000|1500000|3000000)\M'
$q$, 'critério 1: nenhuma função do banco carrega taxa, preço ou volume comercial');

-- ---------------------------------------------------------------------------
-- Critério 2: cliente e equipe não leem nem escrevem
-- ---------------------------------------------------------------------------
select cmp_ok((select count(*) from _params), '>=', 11::bigint, 'as tabelas de parâmetros existem');
select is_empty($q$ select relname from _params where not relrowsecurity $q$, 'critério 2: RLS ligado em todas');
select is_empty($q$
  select p.relname, r.role, m.priv from _params p
  cross join unnest(array['anon', 'authenticated', 'service_role']) as r(role)
  cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) as m(priv)
  where has_table_privilege(r.role, p.oid, m.priv)
$q$, 'critério 2: nenhum perfil do app tem privilégio em tabela de parâmetros');
select ok(not has_table_privilege('authenticated', 'private.noowe_report_payment_margin', 'SELECT'),
  'critério 2: a consulta de margem também fica fora do app');
select is_empty($q$
  select p.proname, r.role from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  cross join unnest(array['anon', 'authenticated']) as r(role)
  where n.nspname = 'private' and p.proname in ('noowe_pay_rate_bps', 'convenience_fee_cents')
    and has_function_privilege(r.role, p.oid, 'EXECUTE')
$q$, 'critério 2: as funções de leitura não são chamadas pelo app');

-- ---------------------------------------------------------------------------
-- Critério 3: valor do restaurante prevalece
-- ---------------------------------------------------------------------------
create temp table _r as select id from public.restaurants order by id limit 2;
create function pg_temp.r(p_n integer) returns uuid language sql as $$
  select id from _r order by id offset p_n - 1 limit 1
$$;

select is(private.noowe_pay_rate_bps(pg_temp.r(1), 'credit_card'),
  (select rate_bps from private.noowe_pay_rates where payment_method = 'credit_card' and restaurant_id is null),
  'sem valor próprio, vale o padrão');
insert into private.noowe_pay_rates(payment_method, restaurant_id, rate_bps) values ('credit_card', pg_temp.r(1), 111);
select is(private.noowe_pay_rate_bps(pg_temp.r(1), 'credit_card'), 111, 'critério 3: o valor do restaurante prevalece');
select isnt(private.noowe_pay_rate_bps(pg_temp.r(2), 'credit_card'), 111, 'critério 3: não vaza para outro restaurante');
select is(private.noowe_pay_rate_bps(pg_temp.r(1), 'cash'), 0, 'dinheiro não tem taxa');
select is(private.noowe_pay_rate_bps(pg_temp.r(1), 'house_terminal'), 0, 'maquininha da casa não tem taxa');
select is(private.noowe_pay_rate_bps(pg_temp.r(1), 'tap_card'), null, 'meio sem valor definido devolve null, não zero');
select is(private.noowe_pay_rate_bps(pg_temp.r(1), 'desconhecido'), null, 'meio desconhecido devolve null');
select is(pg_temp.state_of($q$insert into private.noowe_pay_rates(payment_method, rate_bps) values ('cash', 10)$q$),
  '23514', 'dinheiro recusa linha de taxa');

insert into private.noowe_convenience_fees(flow, restaurant_id, fee_cents) values ('pickup', pg_temp.r(1), 7);
select is(private.convenience_fee_cents(pg_temp.r(1), 'pickup'), 7::bigint, 'critério 3: conveniência própria prevalece');
insert into private.noowe_convenience_fees(flow, restaurant_id, fee_cents, enabled) values ('scheduled', pg_temp.r(1), 7, false);
select is(private.convenience_fee_cents(pg_temp.r(1), 'scheduled'), 0::bigint, 'restaurante pode ficar sem o fluxo');
select is(private.convenience_fee_cents(pg_temp.r(1), 'dine_in'), 0::bigint, 'fluxo fora da tabela não cobra');

-- ---------------------------------------------------------------------------
-- Critério 4: teto do vale
-- ---------------------------------------------------------------------------
create function pg_temp.voucher_cap() returns integer language sql as $$
  select max_rate_bps from private.noowe_pay_methods where code = 'voucher'
$$;
select is(pg_temp.state_of(format($q$insert into private.noowe_pay_rates(payment_method, rate_bps) values ('voucher', %s)$q$,
  pg_temp.voucher_cap())), 'ok', 'critério 4: vale no teto é aceito');
select is(pg_temp.state_of(format($q$update private.noowe_pay_rates set rate_bps = %s where payment_method = 'voucher'$q$,
  pg_temp.voucher_cap() + 1)), '23514', 'critério 4: vale acima do teto é recusado');
select is(pg_temp.state_of(format($q$insert into private.noowe_pay_rates(payment_method, restaurant_id, rate_bps)
  values ('voucher', %L, %s)$q$, pg_temp.r(1), pg_temp.voucher_cap() + 1)), '23514',
  'critério 4: valor por restaurante também respeita o teto');
select is(pg_temp.state_of(format($q$update private.noowe_pay_methods set max_rate_bps = %s where code = 'voucher'$q$,
  pg_temp.voucher_cap() - 1)), '23514', 'critério 4: baixar o teto exige ajustar a taxa antes');

-- ---------------------------------------------------------------------------
-- Critério 5: alterar parâmetro não muda o que já foi gerado
-- ---------------------------------------------------------------------------
do $$
declare v_customer uuid := gen_random_uuid(); v_order uuid; v_tx uuid;
begin
  insert into auth.users(id, email) values (v_customer, v_customer || '@m1.test');
  insert into public.profiles(id) values (v_customer) on conflict do nothing;
  insert into public.orders(restaurant_id, customer_id, total_cents)
    values (pg_temp.r(1), v_customer, 11000) returning id into v_order;
  insert into public.gateway_transactions(restaurant_id, order_id, customer_id, provider, status, payment_method,
      amount_cents, idempotency_key, created_at, updated_at)
    values (pg_temp.r(1), v_order, v_customer, 'asaas', 'completed', 'credit_card', 11000, gen_random_uuid()::text, now(), now())
    returning id into v_tx;
  insert into private.noowe_pay_transaction_fees(gateway_transaction_id, restaurant_id, payment_method, rate_bps, amount_cents, fee_cents, tariff_cents, split_cents)
    values (v_tx, pg_temp.r(1), 'credit_card', 349, 11000, 384, 378, 6);
  create temp table _tx on commit drop as select v_tx as id;
end $$;
update private.noowe_pay_rates set rate_bps = 999 where payment_method = 'credit_card';
select is((select split_cents from private.noowe_pay_transaction_fees where gateway_transaction_id = (select id from _tx)), 6::bigint,
  'critério 5: a cobrança gerada guarda o valor dela');
select is((select noowe_split_cents from private.noowe_report_payment_margin where payment_id = (select id from _tx)), 6::bigint,
  'a consulta de margem lê o valor gravado, não a tabela atual');

-- ---------------------------------------------------------------------------
-- Critério 6: autor, horário, antes e depois
-- ---------------------------------------------------------------------------
select set_config('noowe.param_author', 'Maria da NOOWE', true);
update private.noowe_plans set order_allowance = 1234 where code = 'essencial';
select results_eq($q$
  select author, "before"->>'order_allowance', "after"->>'order_allowance', changed_at is not null
  from private.noowe_param_history where table_name = 'noowe_plans' and "after"->>'order_allowance' = '1234'
$q$, $q$ values ('Maria da NOOWE'::text, '1000'::text, '1234'::text, true) $q$, 'critério 6: autor, horário, antes e depois');

select set_config('noowe.param_author', '', true);
select is(pg_temp.state_of($q$update private.noowe_plans set order_allowance = 1 where code = 'essencial'$q$), '22023',
  'critério 6: sem autor, a alteração é recusada');
select set_config('noowe.param_author', 'teste M1', true);
select is(pg_temp.state_of($q$delete from private.noowe_param_history$q$), '42501', 'critério 6: o histórico não é apagado');

-- ---------------------------------------------------------------------------
-- Carga inicial e o que o documento ensina
-- ---------------------------------------------------------------------------
select results_eq($q$
  select payment_method, rate_bps from private.noowe_pay_rates
  where restaurant_id is null and payment_method in ('credit_card', 'debit_card', 'pix')
    and rate_bps <> 999 order by payment_method
$q$, $q$ values ('debit_card'::text, 149), ('pix'::text, 99) $q$, 'carga inicial: as taxas do aditivo');

select is(pg_temp.state_of($q$insert into private.noowe_promo_codes(code, kind, duration_months, valid_until, max_uses, new_restaurants_only)
  values ('FUNDADORES', 'free_months', 6, '2027-06-30', 20, true)$q$), 'ok', 'o exemplo de código promocional do documento funciona');
select is(pg_temp.state_of($q$insert into private.noowe_promo_codes(code, kind, duration_months)
  values ('SEMVALOR', 'percent_off', 6)$q$), '23514', 'código de percentual exige o percentual');

-- Excluir o restaurante não pode travar por falta de autor, e a exclusão fica no histórico.
do $$
declare v_owner uuid := gen_random_uuid(); v_restaurant uuid;
begin
  perform set_config('noowe.param_author', 'teste M1', true);
  insert into auth.users(id, email) values (v_owner, v_owner || '@m1.test');
  insert into public.profiles(id) values (v_owner) on conflict do nothing;
  insert into public.restaurants(owner_id, name, address, city, state, zip_code, phone, email, service_type)
    values (v_owner, 'Casa M1', 'Rua A', 'São Paulo', 'SP', '01310100', '11900000000', 'a@m1.test', 'casual_dining')
    returning id into v_restaurant;
  insert into private.noowe_pay_rates(payment_method, restaurant_id, rate_bps, note)
    values ('pix', v_restaurant, 79, 'será excluída');
  perform set_config('noowe.param_author', '', true);
  delete from public.restaurants where id = v_restaurant;
end $$;
select results_eq($q$
  select author from private.noowe_param_history where action = 'DELETE' and "before"->>'note' = 'será excluída'
$q$, $q$ values ('cascata: restaurante excluído'::text) $q$, 'excluir o restaurante não trava e fica registrado');
select is(pg_temp.state_of(format($q$delete from private.noowe_pay_rates where restaurant_id = %L$q$, pg_temp.r(1))), '22023',
  'apagar a taxa de um restaurante que existe continua exigindo autor');

select * from finish();
rollback;
