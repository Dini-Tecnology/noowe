-- G3 #1 e #2 / ADR-001: testes de PROPRIEDADE das funções puras de divisão.
-- Não são exemplos: milhares de entradas aleatórias reproduzíveis (setseed).
begin;
select plan(11);
select setseed(0.42);

create temp table _eq as
  select g, (random() * 30)::int + 1 as n, (random() * 10000000)::bigint as total
  from generate_series(1, 3000) g;
create temp table _w as
  select g, (random() * 10000000)::bigint as total,
         (select array_agg((random() * 1000000)::bigint + 1) from generate_series(1, (random() * 20)::int + 1)) as w
  from generate_series(1, 3000) g;
create temp table _dc as
  select g, a, (select sum(x) from unnest(a) x)::bigint as tot,
         (random() * 0.9 * (select sum(x) from unnest(a) x))::bigint as base_rem
  from (select g, (select array_agg((random() * 100000)::bigint + 1) from generate_series(1, (random() * 15)::int + 1)) a
        from generate_series(1, 3000) g) q;

select is((select count(*)::int from _eq c where
    (select sum(cents) from private.split_equal(c.total, (select array_agg(gen_random_uuid()) from generate_series(1, c.n)))) <> c.total),
  0, 'split_equal: sum(parcelas) == total para qualquer total e N');

select is((select count(*)::int from _eq c where
    (select max(cents) - min(cents) from private.split_equal(c.total, (select array_agg(gen_random_uuid()) from generate_series(1, c.n)))) > 1),
  0, 'split_equal: max(parcela) - min(parcela) <= 1 (ADR-001)');

select is((select count(*)::int from _eq c where
    (select array_agg(cents) from private.split_equal(c.total, (select array_agg(gen_random_uuid()) from generate_series(1, c.n))))
    is distinct from private.allocate_proportional(c.total, (select array_agg(1::bigint) from generate_series(1, c.n)))),
  0, 'split_equal equivale a allocate_proportional com pesos iguais');

select is((select string_agg(cents::text, ',') from private.split_equal(10001, array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid()])),
  '3334,3334,3333', 'exemplo do ADR-001: 10001 / 3');

select is((select count(*)::int from _w where
    (select sum(x) from unnest(private.allocate_proportional(total, w)) x) <> total),
  0, 'allocate_proportional: a soma é exatamente o total');

select is((select count(*)::int from _w where
    (select min(x) from unnest(private.allocate_proportional(total, w)) x) < 0),
  0, 'allocate_proportional: nenhuma parcela negativa');

select is((select count(*)::int from _w where exists (
    select 1 from unnest(private.allocate_proportional(total, w), w) as t(v, wt)
    where abs(v - total::numeric * wt / (select sum(x) from unnest(w) x)) >= 1)),
  0, 'allocate_proportional: cada parcela a menos de 1 centavo do ideal');

select is((select count(*)::int from _dc where
    (select sum(base_cents) from private.decompose_amounts(a, base_rem)) <> base_rem),
  0, 'decompose_amounts: as bases somam a base restante');

select is((select count(*)::int from _dc where
    (select min(fee_cents) from private.decompose_amounts(a, base_rem)) < 0
    or (select sum(fee_cents) from private.decompose_amounts(a, base_rem)) <> tot - base_rem),
  0, 'decompose_amounts: taxas não negativas e somam o resto');

select is(private.allocate_proportional(0, array[0, 0, 0]::bigint[]), array[0, 0, 0]::bigint[],
  'allocate_proportional: pesos zerados com total zero');

select is(array[private.service_fee_cents(10001, 1000), private.service_fee_cents(5, 1000),
                private.service_fee_cents(4, 1000), private.service_fee_cents(15, 1000), private.service_fee_cents(0, 1000)],
  array[1000, 1, 0, 2, 0]::bigint[], 'service_fee_cents: meio para cima, em inteiros');

select * from finish();
rollback;
