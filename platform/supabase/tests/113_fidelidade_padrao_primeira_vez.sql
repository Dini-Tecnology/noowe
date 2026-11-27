-- Primeira configuração da Fidelidade: sem programa salvo, a tela recebe as faixas padrão da tabela.
begin;
select plan(3);

delete from public.loyalty_configs where restaurant_id = 'c1000000-0000-4000-8000-000000000002';
select set_config('request.jwt.claims', jsonb_build_object('sub', 'c1000000-0000-4000-8000-000000000001', 'role', 'authenticated')::text, true);

select is(
  (select (c->>'tier_silver_min_cents')::bigint || '/' || (c->>'tier_gold_min_cents')::bigint || '/' || (c->>'tier_platinum_min_cents')::bigint
     from public.restaurant_get_loyalty_config('c1000000-0000-4000-8000-000000000002') c),
  (select string_agg(pg_get_expr(d.adbin, d.adrelid), '/' order by a.attnum)
     from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
    where d.adrelid = 'public.loyalty_configs'::regclass and a.attname like 'tier\_%\_min\_cents'),
  'sem programa salvo, devolve as faixas padrão da tabela');
select is((public.restaurant_get_loyalty_config('c1000000-0000-4000-8000-000000000002')->>'points_enabled')::boolean, false,
  'programa novo começa desligado');
select is((select count(*) from public.loyalty_configs where restaurant_id = 'c1000000-0000-4000-8000-000000000002')::int, 0,
  'ler o padrão não cria programa');

select * from finish();
rollback;
