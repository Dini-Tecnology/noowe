-- Backfill de perfil (20260922120000). O critério é simples: a tela de
-- detalhes é a mesma para os três modelos, então nenhum restaurante ativo
-- pode chegar nela com o perfil pela metade — e tudo que foi suposto precisa
-- estar rastreado para o dono corrigir depois.

begin;
select plan(6);

select ok(
  not exists (
    select 1 from public.restaurants
    where is_active
      and service_type in ('fine_dining', 'casual_dining', 'quick_service')
      and (
        nullif(trim(coalesce(description, '')), '') is null
        or average_ticket is null
        or coalesce(opening_hours, '{}'::jsonb) = '{}'::jsonb
        or jsonb_array_length(coalesce(service_config->'amenities', '[]'::jsonb)) = 0
      )
  ),
  'nenhum restaurante ativo fica com o perfil pela metade'
);

select ok(
  not exists (
    select 1 from public.restaurants
    where coalesce(settings #> '{profile_placeholder,pending}', 'false'::jsonb) = 'true'::jsonb
      and jsonb_array_length(coalesce(settings #> '{profile_placeholder,fields}', '[]'::jsonb)) = 0
  ),
  'toda linha marcada como placeholder diz quais campos foram supostos'
);

select ok(
  (select jsonb_array_length(private.default_profile_amenities('fine_dining')) > 0)
  and (select jsonb_array_length(private.default_profile_amenities('quick_service')) > 0)
  and (select jsonb_array_length(private.default_profile_amenities('casual_dining')) > 0),
  'todo modelo tem um conjunto de tags padrão'
);

-- As tags de fine dining precisam continuar válidas para a RPC de escrita do
-- painel, senão o dono não consegue editá-las sem erro de vocabulário.
select ok(
  (select bool_and(value = any(private.fine_dining_amenity_keys()) or value !~ '^[a-z_]+$')
   from jsonb_array_elements_text(private.default_profile_amenities('fine_dining')) value),
  'as tags padrão de fine dining ou são do vocabulário validado ou são texto livre'
);

select ok(
  (select bool_and(value = any(private.casual_dining_amenity_keys()))
   from jsonb_array_elements_text(private.default_profile_amenities('casual_dining')) value),
  'as tags padrão de casual dining são todas do vocabulário validado'
);

select ok(
  private.placeholder_average_ticket('fine_dining') > private.placeholder_average_ticket('quick_service'),
  'o ticket placeholder respeita a ordem de grandeza entre os modelos'
);

select * from finish();
rollback;
