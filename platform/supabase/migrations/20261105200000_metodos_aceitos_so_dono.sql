-- Gerente não muda os métodos de pagamento aceitos (aditivo, item G).
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
  v_old_methods jsonb;
  v_new_methods jsonb;
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

  -- Métodos de pagamento aceitos mudam o que o cliente pode usar: só o Dono decide, e fica registrado.
  if p_patch ? 'settings' then
    select settings->'payment_methods' into v_old_methods from public.restaurants where id = p_restaurant_id;
    v_new_methods := p_patch->'settings'->'payment_methods';
    -- Só as chaves dos métodos aceitos: taxa, gorjeta e divisão continuam com o Gerente.
    if (select jsonb_object_agg(k, v_new_methods->k) from unnest(array['pix','creditCard','debitCard','cash','applePay','googlePay','tapToPay']) k where v_new_methods ? k)
       is distinct from
       (select jsonb_object_agg(k, v_old_methods->k) from unnest(array['pix','creditCard','debitCard','cash','applePay','googlePay','tapToPay']) k where v_new_methods ? k) then
      perform private.require_restaurant_role(p_restaurant_id, array['owner']::public.user_roles_role_enum[]);
      insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, reason,
        "before", "after", success, metadata, created_at)
      values (p_restaurant_id, auth.uid(), 'payment_methods_changed', 'restaurant', p_restaurant_id,
        'Métodos de pagamento aceitos alterados', v_old_methods, v_new_methods, true,
        jsonb_build_object('audit_kind', 'operational'), now());
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
