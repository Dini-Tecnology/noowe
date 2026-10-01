-- Backfill de perfil para restaurantes que nasceram incompletos.
--
-- A 20260921120000 completou o Atelier Noowe por id e criou a Noowe Express.
-- Isso não cobre restaurantes criados pelo onboarding antes daquela migration
-- (ex.: ZoeBrender), que continuam sem descrição, ticket médio, horários e
-- tags — e por isso mostram uma tela de detalhes pela metade.
--
-- IMPORTANTE, e por isso o marcador abaixo existe: descrição, ticket médio e
-- horário de funcionamento NÃO são deriváveis do que está no banco. O que esta
-- migration escreve nesses três campos é PLACEHOLDER, não informação real.
-- Horário em especial alimenta o selo "Aberto até …" na tela do cliente: até
-- o dono corrigir no painel, esse selo é uma suposição. Cada linha preenchida
-- fica marcada em settings->'profile_placeholder' justamente para que dê para
-- achar e corrigir depois:
--
--   select id, name, service_type
--   from public.restaurants
--   where settings #> '{profile_placeholder,pending}' = 'true'::jsonb;
--
-- Nada é sobrescrito: só campos vazios são preenchidos.

-- ── Conjunto de tags padrão por modelo ──────────────────────────────────────
-- Estas sim são deriváveis: descrevem o que o modelo de serviço faz, não o
-- estabelecimento. Casual dining usa o vocabulário validado da RPC própria;
-- fine dining recebe o seu (private.fine_dining_amenity_keys) mais texto livre.
create or replace function private.default_profile_amenities(p_service_type text)
returns jsonb
language sql
immutable
as $$
  select case p_service_type
    when 'fine_dining' then jsonb_build_array(
      'bar', 'Menu degustação', 'Carta de vinhos', 'Reserva recomendada', 'Wi-Fi', 'Acessível'
    )
    when 'quick_service' then jsonb_build_array(
      'Retirada no balcão', 'Pedido pelo app', 'Wi-Fi', 'Acessível', 'Ar-condicionado'
    )
    when 'casual_dining' then jsonb_build_array(
      'table_service', 'optional_reservation', 'kids_friendly', 'wifi', 'accessible'
    )
    else '[]'::jsonb
  end;
$$;

comment on function private.default_profile_amenities(text) is
  'Tags padrão por modelo de serviço. Descrevem o modelo, não o estabelecimento — deriváveis, ao contrário de descrição/ticket/horário.';

revoke all on function private.default_profile_amenities(text) from public;

-- ── Horário e ticket placeholder por modelo ─────────────────────────────────
create or replace function private.placeholder_opening_hours(p_service_type text)
returns jsonb
language sql
immutable
as $$
  select case p_service_type
    when 'fine_dining' then '{
      "monday":{"closed":true},
      "tuesday":{"open":"19:00","close":"23:30"},
      "wednesday":{"open":"19:00","close":"23:30"},
      "thursday":{"open":"19:00","close":"23:30"},
      "friday":{"open":"19:00","close":"00:30"},
      "saturday":{"open":"12:30","close":"00:30"},
      "sunday":{"open":"12:30","close":"17:00"}
    }'::jsonb
    when 'quick_service' then '{
      "monday":{"open":"10:00","close":"22:00"},
      "tuesday":{"open":"10:00","close":"22:00"},
      "wednesday":{"open":"10:00","close":"22:00"},
      "thursday":{"open":"10:00","close":"22:00"},
      "friday":{"open":"10:00","close":"23:00"},
      "saturday":{"open":"11:00","close":"23:00"},
      "sunday":{"open":"11:00","close":"21:00"}
    }'::jsonb
    else '{
      "monday":{"open":"11:30","close":"23:00"},
      "tuesday":{"open":"11:30","close":"23:00"},
      "wednesday":{"open":"11:30","close":"23:00"},
      "thursday":{"open":"11:30","close":"23:00"},
      "friday":{"open":"11:30","close":"23:30"},
      "saturday":{"open":"12:00","close":"23:30"},
      "sunday":{"open":"12:00","close":"22:00"}
    }'::jsonb
  end;
$$;

revoke all on function private.placeholder_opening_hours(text) from public;

create or replace function private.placeholder_average_ticket(p_service_type text)
returns numeric
language sql
immutable
as $$
  select case p_service_type
    when 'fine_dining' then 180
    when 'quick_service' then 38
    else 85
  end;
$$;

revoke all on function private.placeholder_average_ticket(text) from public;

-- ── Backfill ────────────────────────────────────────────────────────────────
do $backfill$
declare
  v_row record;
  v_touched int := 0;
begin
  for v_row in
    select id, name, service_type, city, cuisine_type, description, average_ticket,
           price_range, opening_hours, cuisine_types, service_config, settings
    from public.restaurants
    where service_type in ('fine_dining', 'casual_dining', 'quick_service')
      and (
        nullif(trim(coalesce(description, '')), '') is null
        or average_ticket is null
        or coalesce(opening_hours, '{}'::jsonb) = '{}'::jsonb
        or jsonb_array_length(coalesce(service_config->'amenities', '[]'::jsonb)) = 0
      )
  loop
    update public.restaurants set
      -- Derivada do que já existe (cozinha + cidade), nunca prosa inventada
      -- sobre o estabelecimento.
      description = coalesce(
        nullif(trim(coalesce(description, '')), ''),
        case
          when nullif(trim(coalesce(v_row.cuisine_type, '')), '') is not null
               and nullif(trim(coalesce(v_row.city, '')), '') is not null
            then format('Cozinha %s em %s.', v_row.cuisine_type, v_row.city)
          when nullif(trim(coalesce(v_row.cuisine_type, '')), '') is not null
            then format('Cozinha %s.', v_row.cuisine_type)
          else format('%s — peça pelo app e acompanhe seu pedido em tempo real.', v_row.name)
        end
      ),
      average_ticket = coalesce(average_ticket, private.placeholder_average_ticket(v_row.service_type)),
      price_range = coalesce(nullif(trim(coalesce(price_range, '')), ''),
        case v_row.service_type
          when 'fine_dining' then '$$$$'
          when 'quick_service' then '$'
          else '$$'
        end),
      opening_hours = case
        when coalesce(opening_hours, '{}'::jsonb) = '{}'::jsonb
          then private.placeholder_opening_hours(v_row.service_type)
        else opening_hours
      end,
      service_config = coalesce(service_config, '{}'::jsonb)
        || jsonb_build_object(
             'primary_type', coalesce(service_config->>'primary_type', v_row.service_type),
             'active_types', coalesce(service_config->'active_types', jsonb_build_array(v_row.service_type))
           )
        || case
             when jsonb_array_length(coalesce(service_config->'amenities', '[]'::jsonb)) = 0
               then jsonb_build_object('amenities', private.default_profile_amenities(v_row.service_type))
             else '{}'::jsonb
           end,
      settings = coalesce(settings, '{}'::jsonb)
        || jsonb_build_object('profile_placeholder', jsonb_build_object(
             'pending', true,
             'filled_at', to_jsonb(now()),
             'migration', '20260922120000',
             -- Exatamente quais campos são suposição, para o painel poder
             -- cobrar a correção de um por um.
             'fields', (
               select coalesce(jsonb_agg(f), '[]'::jsonb) from (
                 select 'description' as f where nullif(trim(coalesce(v_row.description, '')), '') is null
                 union all select 'average_ticket' where v_row.average_ticket is null
                 union all select 'opening_hours' where coalesce(v_row.opening_hours, '{}'::jsonb) = '{}'::jsonb
                 union all select 'amenities'
                   where jsonb_array_length(coalesce(v_row.service_config->'amenities', '[]'::jsonb)) = 0
               ) fields
             )
           )),
      updated_at = now()
    where id = v_row.id;

    v_touched := v_touched + 1;
  end loop;

  raise notice 'Perfis completados com placeholder: %', v_touched;
end $backfill$;
