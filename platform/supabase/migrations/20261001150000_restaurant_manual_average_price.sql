-- Preço médio cadastrado pelo restaurante (ADR-014), no lugar da média do cardápio (ADR-012 §1).
--
-- A média calculada dos itens foi reprovada pelo cliente: o preço que aparece no app
-- é o que o restaurante informa no painel dele, em reais (guardado em centavos, bigint
-- — invariante 1). Sem cadastro, o app não mostra nada.
--
-- O app só exibe; o servidor valida o que o restaurante grava (invariante 2).

-- ── 1. Tira o cálculo automático ─────────────────────────────────────────────
drop trigger if exists menu_items_refresh_avg_price on public.menu_items;
drop trigger if exists menu_categories_refresh_avg_price on public.menu_categories;
drop function if exists private.menu_items_refresh_avg_price();
drop function if exists private.menu_categories_refresh_avg_price();
drop function if exists private.refresh_avg_menu_price(uuid);
drop function if exists private.compute_avg_menu_price_cents(uuid);

-- ── 2. A coluna passa a ser dado cadastrado ──────────────────────────────────
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'restaurants' and column_name = 'avg_menu_price_cents') then
    alter table public.restaurants rename column avg_menu_price_cents to average_price_cents;
  end if;
  if exists (select 1 from pg_constraint
             where conrelid = 'public.restaurants'::regclass and conname = 'restaurants_avg_menu_price_cents_check') then
    alter table public.restaurants
      rename constraint restaurants_avg_menu_price_cents_check to restaurants_average_price_cents_check;
  end if;
end $$;

-- Os valores existentes eram médias calculadas, não cadastros: ninguém informou, nada aparece
-- até o restaurante cadastrar o dele.
update public.restaurants set average_price_cents = null where average_price_cents is not null;

comment on column public.restaurants.average_price_cents is
  'Preço médio por pessoa em centavos, cadastrado pelo restaurante (ADR-014). null = não informado: o app não exibe preço.';

-- ── 3. O restaurante grava (e apaga) o próprio preço médio ───────────────────
-- Última definição: 20260713203000_restaurant_brazilian_address_fields.sql. Igual, mais
-- average_price_cents. Os outros campos usam coalesce e por isso não limpam; este precisa
-- aceitar null explícito ("não informar preço"), então usa a presença da chave no patch.
create or replace function public.restaurant_update_profile(
  p_restaurant_id uuid,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_updated record;
  v_allowed_fields text[] := array[
    'name','description','address','address_number','address_complement','neighborhood',
    'zip_code','city','state','phone','email','logo_url','cover_image_url','banner_url',
    'cuisine_type','price_range','average_price_cents','business_hours','opening_hours','features','settings',
    'service_config','max_party_size','average_prep_time','is_active'
  ];
  v_invalid text[];
  v_price_present boolean := p_patch ? 'average_price_cents';
  v_price bigint;
begin
  perform private.require_restaurant_role(
    p_restaurant_id,
    array['owner','manager']::public.user_roles_role_enum[]
  );

  select array_agg(key) into v_invalid
  from jsonb_object_keys(p_patch) key
  where key <> all(v_allowed_fields);

  if v_invalid is not null then
    raise exception 'Invalid profile fields: %', array_to_string(v_invalid, ', ')
      using errcode = '22023';
  end if;

  if v_price_present then
    if jsonb_typeof(p_patch->'average_price_cents') = 'null' then
      v_price := null;
    elsif jsonb_typeof(p_patch->'average_price_cents') = 'number'
          and (p_patch->>'average_price_cents') ~ '^[1-9][0-9]{0,11}$' then
      v_price := (p_patch->>'average_price_cents')::bigint;
    else
      raise exception 'Preço médio inválido: informe um valor em centavos maior que zero ou deixe em branco.'
        using errcode = '22023';
    end if;
  end if;

  update public.restaurants
  set
    name               = coalesce(p_patch->>'name', name),
    description        = coalesce(p_patch->>'description', description),
    address            = coalesce(p_patch->>'address', address),
    address_number     = coalesce(p_patch->>'address_number', address_number),
    address_complement = coalesce(p_patch->>'address_complement', address_complement),
    neighborhood       = coalesce(p_patch->>'neighborhood', neighborhood),
    zip_code           = coalesce(p_patch->>'zip_code', zip_code),
    city               = coalesce(p_patch->>'city', city),
    state              = coalesce(p_patch->>'state', state),
    phone              = coalesce(p_patch->>'phone', phone),
    email              = coalesce(p_patch->>'email', email),
    logo_url           = coalesce(p_patch->>'logo_url', logo_url),
    cover_image_url    = coalesce(p_patch->>'cover_image_url', cover_image_url),
    banner_url         = coalesce(p_patch->>'banner_url', banner_url),
    cuisine_type       = coalesce(p_patch->>'cuisine_type', cuisine_type),
    price_range        = coalesce(p_patch->>'price_range', price_range),
    average_price_cents = case when v_price_present then v_price else average_price_cents end,
    business_hours     = coalesce(p_patch->'business_hours', business_hours),
    opening_hours      = coalesce(p_patch->'opening_hours', opening_hours),
    features           = coalesce(p_patch->'features', features),
    settings           = coalesce(p_patch->'settings', settings),
    service_config     = coalesce(p_patch->'service_config', service_config),
    max_party_size     = coalesce((p_patch->>'max_party_size')::integer, max_party_size),
    average_prep_time  = coalesce((p_patch->>'average_prep_time')::integer, average_prep_time),
    is_active          = coalesce((p_patch->>'is_active')::boolean, is_active),
    updated_at         = now()
  where id = p_restaurant_id
  returning * into v_updated;

  return to_jsonb(v_updated);
end;
$$;

revoke all on function public.restaurant_update_profile(uuid, jsonb) from public;
grant execute on function public.restaurant_update_profile(uuid, jsonb) to authenticated, service_role;
