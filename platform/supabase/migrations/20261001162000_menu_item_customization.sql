-- ADR-013 §2.9 — personalização de itens: modificadores obrigatórios/opcionais,
-- ingredientes removíveis e upsell.
--
-- O servidor valida a escolha do cliente e precifica os extras (invariante 2): o app
-- só envia ids de opção e nomes de ingredientes, nunca preço.  Item sem nenhuma
-- configuração segue exatamente o comportamento anterior de place_order.

-- ---------------------------------------------------------------------------
-- 1. Modelo
-- ---------------------------------------------------------------------------

create table if not exists public.menu_item_option_groups (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  -- Obrigatório = min_select >= 1.
  min_select integer not null default 0 check (min_select >= 0),
  max_select integer not null default 1 check (max_select >= 1),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint menu_item_option_groups_range check (min_select <= max_select)
);
create index if not exists idx_option_groups_item on public.menu_item_option_groups(menu_item_id, sort_order);

create table if not exists public.menu_item_options (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.menu_item_option_groups(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  -- Dinheiro em centavos (invariante 1). Extra nunca é negativo: desconto é outra ação, auditada.
  price_delta_cents bigint not null default 0 check (price_delta_cents >= 0),
  is_available boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_options_group on public.menu_item_options(group_id, sort_order);

alter table public.menu_items
  add column if not exists removable_ingredients text[] not null default '{}',
  add column if not exists upsell_item_ids uuid[] not null default '{}';

alter table public.menu_item_option_groups enable row level security;
alter table public.menu_item_options enable row level security;
revoke insert, update, delete on public.menu_item_option_groups, public.menu_item_options from anon, authenticated;

-- O cardápio é público para quem pode ver o restaurante; a edição passa pela RPC.
drop policy if exists option_groups_read on public.menu_item_option_groups;
create policy option_groups_read on public.menu_item_option_groups
  for select to anon, authenticated using (
    exists (select 1 from public.restaurants r where r.id = restaurant_id and r.is_active));
drop policy if exists options_read on public.menu_item_options;
create policy options_read on public.menu_item_options
  for select to anon, authenticated using (
    exists (select 1 from public.menu_item_option_groups g join public.restaurants r on r.id = g.restaurant_id
      where g.id = group_id and r.is_active));

-- ---------------------------------------------------------------------------
-- 2. Validação e preço no servidor
-- ---------------------------------------------------------------------------

-- Seleção do cliente: { "options": ["<option uuid>", ...], "removed": ["cebola", ...] }.
-- Devolve { configured, deltaCents, normalized, summary }. `normalized` guarda um snapshot legível
-- (nome do grupo, nome da opção, extra em centavos) para a cozinha e para a contestação.
create or replace function private.price_item_customizations(p_menu_item_id uuid, p_selection jsonb)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare
  v_removable text[]; v_has_groups boolean;
  v_option_ids uuid[] := '{}'; v_removed text[] := '{}';
  v_group record; v_option record; v_count integer;
  v_delta bigint := 0; v_norm jsonb := '[]'::jsonb; v_summary text[] := '{}'; v_names text[];
  v_item_name text;
begin
  select coalesce(removable_ingredients, '{}'), name into v_removable, v_item_name
    from public.menu_items where id = p_menu_item_id;
  select exists (select 1 from public.menu_item_option_groups where menu_item_id = p_menu_item_id) into v_has_groups;

  -- Sem configuração: comportamento anterior, nada a validar nem a cobrar.
  if not v_has_groups and cardinality(v_removable) = 0 then
    return jsonb_build_object('configured', false, 'deltaCents', 0);
  end if;

  if p_selection is not null and jsonb_typeof(p_selection) = 'object' then
    if jsonb_typeof(coalesce(p_selection->'options', '[]'::jsonb)) <> 'array'
      or jsonb_typeof(coalesce(p_selection->'removed', '[]'::jsonb)) <> 'array' then
      raise exception 'Personalização inválida' using errcode = '22023';
    end if;
    select coalesce(array_agg(x::uuid), '{}') into v_option_ids
      from jsonb_array_elements_text(coalesce(p_selection->'options', '[]'::jsonb)) x;
    -- Sem repetição e em ordem fixa: o resumo e o snapshot saem iguais para a mesma escolha,
    -- o que permite ao app separar a observação original no "Pedir novamente".
    select coalesce(array_agg(distinct btrim(x) order by btrim(x)), '{}') into v_removed
      from jsonb_array_elements_text(coalesce(p_selection->'removed', '[]'::jsonb)) x where btrim(x) <> '';
  elsif p_selection is not null and jsonb_typeof(p_selection) <> 'array' then
    raise exception 'Personalização inválida' using errcode = '22023';
  end if;

  if cardinality(v_option_ids) <> (select count(distinct x) from unnest(v_option_ids) x) then
    raise exception 'Opção repetida na personalização de "%"', v_item_name using errcode = '22023';
  end if;

  -- Toda opção escolhida precisa pertencer a um grupo deste item e estar disponível.
  if exists (
    select 1 from unnest(v_option_ids) chosen(id)
    where not exists (
      select 1 from public.menu_item_options o join public.menu_item_option_groups g on g.id = o.group_id
      where o.id = chosen.id and g.menu_item_id = p_menu_item_id and o.is_available)
  ) then
    raise exception 'Opção indisponível ou inválida para "%". Atualize o cardápio e tente novamente.', v_item_name
      using errcode = '22023';
  end if;

  for v_group in
    select * from public.menu_item_option_groups where menu_item_id = p_menu_item_id order by sort_order, created_at
  loop
    select count(*) into v_count from public.menu_item_options o
      where o.group_id = v_group.id and o.id = any(v_option_ids);
    if v_count < v_group.min_select then
      raise exception 'Escolha % opção(ões) em "%" para "%"', v_group.min_select, v_group.name, v_item_name
        using errcode = '22023';
    end if;
    if v_count > v_group.max_select then
      raise exception 'Em "%" escolha no máximo % opção(ões)', v_group.name, v_group.max_select
        using errcode = '22023';
    end if;
    v_names := '{}';
    for v_option in
      select * from public.menu_item_options o where o.group_id = v_group.id and o.id = any(v_option_ids)
      order by o.sort_order, o.created_at
    loop
      v_delta := v_delta + v_option.price_delta_cents;
      v_names := v_names || v_option.name;
      v_norm := v_norm || jsonb_build_array(jsonb_build_object(
        'type', 'option', 'groupId', v_group.id, 'group', v_group.name,
        'optionId', v_option.id, 'name', v_option.name, 'priceDeltaCents', v_option.price_delta_cents));
    end loop;
    if cardinality(v_names) > 0 then
      v_summary := v_summary || (v_group.name || ': ' || array_to_string(v_names, ', '));
    end if;
  end loop;

  -- Ingredientes retirados: só os que o restaurante declarou removíveis.
  if exists (select 1 from unnest(v_removed) r(name) where r.name <> all(v_removable)) then
    raise exception 'Ingrediente não removível em "%"', v_item_name using errcode = '22023';
  end if;
  if cardinality(v_removed) > 0 then
    v_summary := v_summary || ('Sem ' || array_to_string(v_removed, ', sem '));
    v_norm := v_norm || coalesce((
      select jsonb_agg(jsonb_build_object('type', 'removed', 'name', r.name) order by r.ord)
      from unnest(v_removed) with ordinality as r(name, ord)), '[]'::jsonb);
  end if;

  return jsonb_build_object('configured', true, 'deltaCents', v_delta, 'normalized', v_norm,
    'summary', array_to_string(v_summary, ' · '));
end $$;
revoke all on function private.price_item_customizations(uuid, jsonb) from public, anon, authenticated;

-- place_order é o ponto único de preço do servidor: agora soma os extras validados.
create or replace function public.place_order(
  p_restaurant_id uuid,
  p_order_type text,
  p_items jsonb,
  p_table_id uuid default null,
  p_delivery_address jsonb default null,
  p_special_instructions text default null,
  p_customer_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_customer_id uuid;
  v_order_id uuid;
  v_item jsonb;
  v_menu_item public.menu_items%rowtype;
  v_menu_item_any public.menu_items%rowtype;
  v_quantity integer;
  v_unit_price numeric(10,2);
  v_subtotal numeric(10,2) := 0;
  v_item_count integer := 0;
  v_estimated_time integer := 0;
  v_item_id uuid;
  v_default_prep integer;
  v_pricing jsonb;
begin
  if auth.uid() is null then
    raise exception 'Autenticação necessária.' using errcode = '28000';
  end if;

  if p_customer_id is not null and p_customer_id <> auth.uid() then
    perform private.require_restaurant_role(
      p_restaurant_id,
      array['owner','manager','waiter','maitre']::public.user_roles_role_enum[]
    );
    v_customer_id := p_customer_id;
  else
    v_customer_id := auth.uid();
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'O pedido precisa ter pelo menos um item.' using errcode = '22023';
  end if;

  -- Itens sem preparation_time usam o padrão do restaurante
  -- (restaurants.settings.default_preparation_time, em minutos) para o
  -- tempo estimado nunca ficar em branco. 10 é só o último recurso.
  select coalesce(nullif((r.settings->>'default_preparation_time')::integer, 0), 10)
    into v_default_prep
  from public.restaurants r where r.id = p_restaurant_id;
  v_default_prep := coalesce(v_default_prep, 10);

  insert into public.orders (
    restaurant_id, customer_id, order_type, table_id, delivery_address,
    status, special_instructions
  )
  values (
    p_restaurant_id, v_customer_id, coalesce(p_order_type, 'dine_in')::public.orders_order_type_enum,
    p_table_id, p_delivery_address, 'pending', p_special_instructions
  )
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_quantity := greatest(1, coalesce((v_item->>'quantity')::integer, 1));
    v_item_id := (v_item->>'menu_item_id')::uuid;

    select * into v_menu_item
    from public.menu_items
    where id = v_item_id
      and restaurant_id = p_restaurant_id
      and is_available;

    if v_menu_item.id is null then
      -- Antes de reclamar, descobre por quê o item não passou no filtro para
      -- devolver uma mensagem que o cliente consiga agir (limpar carrinho,
      -- escolher outro item, etc.).
      select * into v_menu_item_any from public.menu_items where id = v_item_id;

      if v_menu_item_any.id is null then
        raise exception 'Item do cardápio não encontrado. Atualize o menu e tente novamente.'
          using errcode = '22023';
      elsif v_menu_item_any.restaurant_id <> p_restaurant_id then
        raise exception 'O item "%" pertence a outro restaurante. Limpe o carrinho e escolha itens deste estabelecimento.', v_menu_item_any.name
          using errcode = '22023';
      else
        raise exception 'O item "%" está indisponível no momento. Remova-o do carrinho para continuar.', v_menu_item_any.name
          using errcode = '22023';
      end if;
    end if;

    -- Extras e retiradas são validados e precificados aqui; o preço do cliente nunca entra.
    v_pricing := private.price_item_customizations(v_menu_item.id, v_item->'customizations');
    v_unit_price := v_menu_item.price + ((v_pricing->>'deltaCents')::bigint)::numeric / 100;

    insert into public.order_items (
      order_id, menu_item_id, quantity, unit_price, total_price,
      special_instructions, customizations, diner_id
    )
    values (
      v_order_id, v_menu_item.id, v_quantity, v_unit_price, v_unit_price * v_quantity,
      -- O resumo da personalização vai junto da observação: a cozinha lê o que já lê.
      case when (v_pricing->>'configured')::boolean
        then nullif(concat_ws(' · ', nullif(v_pricing->>'summary', ''), nullif(v_item->>'special_instructions', '')), '')
        else v_item->>'special_instructions' end,
      case when (v_pricing->>'configured')::boolean then v_pricing->'normalized' else v_item->'customizations' end,
      nullif(v_item->>'diner_id', '')::uuid
    );

    v_subtotal := v_subtotal + (v_unit_price * v_quantity);
    v_item_count := v_item_count + 1;
    v_estimated_time := v_estimated_time + coalesce(nullif(v_menu_item.preparation_time, 0), v_default_prep) * v_quantity;
  end loop;

  update public.orders
  set subtotal = v_subtotal,
      total_amount = v_subtotal,
      estimated_time = nullif(v_estimated_time, 0),
      updated_at = now()
  where id = v_order_id;

  return jsonb_build_object(
    'id', v_order_id,
    'restaurant_id', p_restaurant_id,
    'customer_id', v_customer_id,
    'table_id', p_table_id,
    'status', 'pending',
    'subtotal', v_subtotal,
    'total_amount', v_subtotal,
    'estimated_time', nullif(v_estimated_time, 0),
    'order_items', private.order_items_json(v_order_id)
  );
end;
$$;

revoke all on function public.place_order(uuid, text, jsonb, uuid, jsonb, text, uuid) from public;
grant execute on function public.place_order(uuid, text, jsonb, uuid, jsonb, text, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Leitura para o cliente e edição para o restaurante
-- ---------------------------------------------------------------------------

-- Um mapa por restaurante, uma ida só: { "<menu_item_id>": { groups, removable, upsellItemIds } }.
create or replace function public.customer_get_menu_customizations(p_restaurant_id uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_object_agg(mi.id::text, jsonb_build_object(
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id, 'name', g.name, 'minSelect', g.min_select, 'maxSelect', g.max_select,
        'options', coalesce((
          select jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'priceDeltaCents', o.price_delta_cents)
            order by o.sort_order, o.created_at)
          from public.menu_item_options o where o.group_id = g.id and o.is_available), '[]'::jsonb))
        order by g.sort_order, g.created_at)
      from public.menu_item_option_groups g where g.menu_item_id = mi.id), '[]'::jsonb),
    'removable', to_jsonb(mi.removable_ingredients),
    'upsellItemIds', to_jsonb(mi.upsell_item_ids)
  )), '{}'::jsonb)
  from public.menu_items mi
  join public.restaurants r on r.id = mi.restaurant_id and r.is_active
  where mi.restaurant_id = p_restaurant_id and mi.is_available
    and (exists (select 1 from public.menu_item_option_groups g where g.menu_item_id = mi.id)
      or cardinality(mi.removable_ingredients) > 0 or cardinality(mi.upsell_item_ids) > 0)
$$;
revoke all on function public.customer_get_menu_customizations(uuid) from public;
grant execute on function public.customer_get_menu_customizations(uuid) to anon, authenticated;

-- Uuid enviado pelo app, ou null se ausente/malformado (vira grupo/opção nova).
create or replace function private.jsonb_uuid_or_null(p_value text)
returns uuid language sql immutable as $$
  select case when p_value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_value::uuid end
$$;
revoke all on function private.jsonb_uuid_or_null(text) from public, anon, authenticated;

-- Edição completa de um item numa só transação. Grupos e opções que vêm com `id` deste item
-- são atualizados no lugar: carrinho aberto e "Pedir novamente" continuam válidos depois de
-- um ajuste de preço ou nome. O que não veio no payload é apagado.
create or replace function public.restaurant_save_item_customization(
  p_menu_item_id uuid, p_groups jsonb, p_removable text[], p_upsell uuid[]
) returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  v_item public.menu_items; v_group jsonb; v_option jsonb; v_group_id uuid; v_option_id uuid;
  v_removable text[]; v_upsell uuid[]; v_min integer; v_max integer; v_options integer; v_order integer := 0;
  v_option_order integer; v_keep_groups uuid[] := '{}'; v_keep_options uuid[];
begin
  select * into v_item from public.menu_items where id = p_menu_item_id;
  if v_item.id is null then raise exception 'Item não encontrado' using errcode = 'P0002'; end if;
  perform private.require_restaurant_role(v_item.restaurant_id,
    array['owner','manager','chef']::public.user_roles_role_enum[]);

  if p_groups is null then p_groups := '[]'::jsonb; end if;
  if jsonb_typeof(p_groups) <> 'array' or jsonb_array_length(p_groups) > 10 then
    raise exception 'Informe até 10 grupos de opções' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct btrim(x)), '{}') into v_removable
    from unnest(coalesce(p_removable, '{}')) x where btrim(x) <> '';
  if cardinality(v_removable) > 20 or exists (select 1 from unnest(v_removable) x where char_length(x) > 40) then
    raise exception 'Informe até 20 ingredientes de até 40 caracteres' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct x), '{}') into v_upsell from unnest(coalesce(p_upsell, '{}')) x;
  if cardinality(v_upsell) > 5 or p_menu_item_id = any(v_upsell) or exists (
    select 1 from unnest(v_upsell) x
    where not exists (select 1 from public.menu_items m where m.id = x and m.restaurant_id = v_item.restaurant_id)
  ) then
    raise exception 'Sugestões inválidas: até 5 itens deste restaurante, diferentes do próprio item' using errcode = '22023';
  end if;

  -- Valida todos os grupos antes de escrever qualquer um.
  for v_group in select * from jsonb_array_elements(p_groups) loop
    v_min := coalesce((v_group->>'minSelect')::integer, 0);
    v_max := coalesce((v_group->>'maxSelect')::integer, 1);
    if jsonb_typeof(coalesce(v_group->'options', '[]'::jsonb)) <> 'array' then
      raise exception 'Opções inválidas' using errcode = '22023'; end if;
    v_options := jsonb_array_length(coalesce(v_group->'options', '[]'::jsonb));
    if v_options = 0 or v_options > 30 or v_min > v_max or v_min > v_options then
      raise exception 'Grupo "%" inválido: informe de 1 a 30 opções e uma faixa de escolha possível', coalesce(v_group->>'name', '')
        using errcode = '22023';
    end if;
  end loop;

  -- Grupos que saíram do payload somem (as opções vão junto pelo cascade).
  select coalesce(array_agg(g.id), '{}') into v_keep_groups
    from public.menu_item_option_groups g
    where g.menu_item_id = p_menu_item_id
      and g.id in (select private.jsonb_uuid_or_null(x->>'id') from jsonb_array_elements(p_groups) x);
  delete from public.menu_item_option_groups
    where menu_item_id = p_menu_item_id and id <> all(v_keep_groups);

  for v_group in select * from jsonb_array_elements(p_groups) loop
    v_min := coalesce((v_group->>'minSelect')::integer, 0);
    v_max := coalesce((v_group->>'maxSelect')::integer, 1);
    v_group_id := private.jsonb_uuid_or_null(v_group->>'id');
    if v_group_id = any(v_keep_groups) then
      update public.menu_item_option_groups set name = btrim(coalesce(v_group->>'name', '')),
        min_select = v_min, max_select = v_max, sort_order = v_order, updated_at = now()
        where id = v_group_id;
    else
      insert into public.menu_item_option_groups(restaurant_id, menu_item_id, name, min_select, max_select, sort_order)
        values (v_item.restaurant_id, p_menu_item_id, btrim(coalesce(v_group->>'name', '')), v_min, v_max, v_order)
        returning id into v_group_id;
    end if;
    v_order := v_order + 1;

    select coalesce(array_agg(o.id), '{}') into v_keep_options
      from public.menu_item_options o
      where o.group_id = v_group_id
        and o.id in (select private.jsonb_uuid_or_null(x->>'id') from jsonb_array_elements(v_group->'options') x);
    delete from public.menu_item_options where group_id = v_group_id and id <> all(v_keep_options);
    v_option_order := 0;
    for v_option in select * from jsonb_array_elements(v_group->'options') loop
      v_option_id := private.jsonb_uuid_or_null(v_option->>'id');
      if v_option_id = any(v_keep_options) then
        update public.menu_item_options set name = btrim(coalesce(v_option->>'name', '')),
          price_delta_cents = coalesce((v_option->>'priceDeltaCents')::bigint, 0),
          is_available = coalesce((v_option->>'isAvailable')::boolean, true), sort_order = v_option_order
          where id = v_option_id;
      else
        insert into public.menu_item_options(group_id, name, price_delta_cents, is_available, sort_order)
          values (v_group_id, btrim(coalesce(v_option->>'name', '')), coalesce((v_option->>'priceDeltaCents')::bigint, 0),
            coalesce((v_option->>'isAvailable')::boolean, true), v_option_order);
      end if;
      v_option_order := v_option_order + 1;
    end loop;
  end loop;

  update public.menu_items set removable_ingredients = v_removable, upsell_item_ids = v_upsell, updated_at = now()
    where id = p_menu_item_id;
  return jsonb_build_object('menuItemId', p_menu_item_id, 'groups', jsonb_array_length(p_groups),
    'removable', cardinality(v_removable), 'upsell', cardinality(v_upsell));
end $$;
revoke all on function public.restaurant_save_item_customization(uuid, jsonb, text[], uuid[]) from public, anon;
grant execute on function public.restaurant_save_item_customization(uuid, jsonb, text[], uuid[]) to authenticated;

-- A tabela gerada em 20260430180000 nunca foi usada (RLS sem política, fora de place_order).
-- O modelo vigente é o desta migration (T-N1-02).
do $$
begin
  if to_regclass('public.menu_item_customization_groups') is not null then
    comment on table public.menu_item_customization_groups is
      'Legado sem uso. Substituída por menu_item_option_groups + menu_item_options (ADR-013 §2.9, T-N1-02).';
  end if;
end $$;
