-- Fixes a price-fraud hole: the client used to insert directly into
-- orders/order_items and could set unit_price/total_price to anything,
-- since neither the RLS policies nor any trigger validated them against
-- menu_items.price. This migration:
--   1. Adds public.place_order(), which computes price server-side from
--      menu_items and writes the order + items in one transaction.
--   2. Revokes direct INSERT on orders/order_items from `authenticated`
--      (confirmed via grep: the only client call site was
--      supabase-api.ts::createOrder, now updated to call this RPC instead).

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
  v_quantity integer;
  v_unit_price numeric(10,2);
  v_subtotal numeric(10,2) := 0;
  v_item_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  -- Resolve who the order is placed for. Staff can place an order on behalf
  -- of a guest without an account (e.g. a table without the app); anyone
  -- else can only place orders for themselves.
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
    raise exception 'Order must contain at least one item' using errcode = '22023';
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

    select * into v_menu_item
    from public.menu_items
    where id = (v_item->>'menu_item_id')::uuid
      and restaurant_id = p_restaurant_id
      and is_available;

    if v_menu_item.id is null then
      raise exception 'Menu item % is not available at this restaurant', (v_item->>'menu_item_id')
        using errcode = '22023';
    end if;

    v_unit_price := v_menu_item.price;

    insert into public.order_items (
      order_id, menu_item_id, quantity, unit_price, total_price,
      special_instructions, customizations
    )
    values (
      v_order_id, v_menu_item.id, v_quantity, v_unit_price, v_unit_price * v_quantity,
      v_item->>'special_instructions',
      v_item->'customizations'
    );

    v_subtotal := v_subtotal + (v_unit_price * v_quantity);
    v_item_count := v_item_count + 1;
  end loop;

  update public.orders
  set subtotal = v_subtotal,
      total_amount = v_subtotal,
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
    'order_items', private.order_items_json(v_order_id)
  );
end;
$$;

revoke all on function public.place_order(uuid, text, jsonb, uuid, jsonb, text, uuid) from public;
grant execute on function public.place_order(uuid, text, jsonb, uuid, jsonb, text, uuid) to authenticated, service_role;

-- Close the hole: writes to orders/order_items must go through place_order
-- (or staff-only RPCs like restaurant_update_order_status) from now on.
drop policy if exists orders_insert_customer on public.orders;
drop policy if exists order_items_insert_accessible_order on public.order_items;

revoke insert on public.orders from authenticated;
revoke insert on public.order_items from authenticated;
