-- Substitui as mensagens de erro em inglês do place_order por textos em pt-BR
-- e distingue "item de outro restaurante" de "item indisponível". O texto
-- passa direto pelo Supabase até o Alert do cliente, então precisa estar
-- pronto para exibição.
--
-- Diagnóstico do bug observado ("Menu item <uuid> is not available at this
-- restaurant"): o carrinho do cliente ainda tem itens do restaurante A quando
-- ele já tem uma sessão de mesa aberta no restaurante B. O place_order procura
-- o item por (id, restaurant_id, is_available) e, sem match, joga o mesmo erro
-- para as três causas possíveis (não existe, é de outro estabelecimento, está
-- indisponível). Passa a diferenciar para o cliente entender o que fazer.

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

    v_unit_price := v_menu_item.price;

    insert into public.order_items (
      order_id, menu_item_id, quantity, unit_price, total_price,
      special_instructions, customizations, diner_id
    )
    values (
      v_order_id, v_menu_item.id, v_quantity, v_unit_price, v_unit_price * v_quantity,
      v_item->>'special_instructions',
      v_item->'customizations',
      nullif(v_item->>'diner_id', '')::uuid
    );

    v_subtotal := v_subtotal + (v_unit_price * v_quantity);
    v_item_count := v_item_count + 1;
    v_estimated_time := v_estimated_time + coalesce(v_menu_item.preparation_time, 0) * v_quantity;
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
