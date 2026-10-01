-- Paridade de perfil entre modelos de serviço (20260921120000).
-- A tela de detalhes é única para os três modelos; estes testes garantem que
-- o dado que ela lê existe para todos eles, e que o esqueleto de
-- service_config não inventa valor de negócio nenhum.

begin;
select plan(8);

select ok(
  (select private.default_service_config('fine_dining') ? 'amenities')
  and (select private.default_service_config('casual_dining') ? 'amenities')
  and (select private.default_service_config('quick_service') ? 'amenities'),
  'todo modelo nasce com a lista de amenities presente'
);

select ok(
  (select jsonb_typeof(private.default_service_config('quick_service') -> 'amenities') = 'array'),
  'amenities nasce como array, não como null'
);

select ok(
  (select private.default_service_config('casual_dining') ? 'casual_dining')
  and not (select private.default_service_config('fine_dining') ? 'casual_dining')
  and not (select private.default_service_config('quick_service') ? 'casual_dining'),
  'só casual dining carrega o bloco de config do casual dining'
);

-- Preço é parametrização do estabelecimento, nunca default de código.
select ok(
  (select private.default_service_config('casual_dining')
            #> '{casual_dining,price_per_person_min}' = 'null'::jsonb)
  and (select private.default_service_config('casual_dining')
            #> '{casual_dining,price_per_person_max}' = 'null'::jsonb),
  'o esqueleto não inventa faixa de preço por pessoa'
);

select ok(
  exists (
    select 1 from public.restaurants
    where service_type = 'quick_service' and is_active
  ),
  'existe restaurante quick service para o app exercitar'
);

select ok(
  exists (
    select 1 from public.restaurants
    where id = 'd1000000-0000-4000-8000-000000000002'
      and nullif(trim(coalesce(description, '')), '') is not null
      and average_ticket is not null
      and coalesce(opening_hours, '{}'::jsonb) <> '{}'::jsonb
      and jsonb_array_length(coalesce(cuisine_types, '[]'::jsonb)) > 0
  ),
  'o quick service de demonstração tem o mesmo perfil preenchido do casual dining'
);

select ok(
  exists (
    select 1 from public.menu_items where restaurant_id = 'd1000000-0000-4000-8000-000000000002'
  ),
  'o quick service de demonstração tem cardápio'
);

-- O Atelier Noowe pode não existir em um banco recém-criado; o que não pode é
-- existir com o perfil pela metade.
select ok(
  not exists (
    select 1 from public.restaurants
    where id = 'b1000000-0000-4000-8000-000000000001'
      and (
        nullif(trim(coalesce(description, '')), '') is null
        or coalesce(opening_hours, '{}'::jsonb) = '{}'::jsonb
        or average_ticket is null
      )
  ),
  'o fine dining de demonstração não fica com o perfil pela metade'
);

select * from finish();
rollback;
