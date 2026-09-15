-- "Monte seu Combo": quick service build-your-own-combo (1 lanche + 1
-- acompanhamento + 1 bebida at 20% off). There is no combo entity in the
-- schema — this reuses the existing menu_items/menu_categories the
-- restaurant already manages, matching component items to their pool by
-- category name ('Burgers' / 'Acompanhamentos' / 'Bebidas'). That keeps this
-- MVP-scoped (single quick_service restaurant, fixed category names) without
-- a schema change; a future iteration could let the restaurant flag which
-- category is which pool instead of matching by name.
--
-- Pricing must be enforced server-side (never trust a client-computed
-- discount), so this wraps the existing, tested public.place_order — which
-- already validates each item belongs to the restaurant and is available —
-- and then applies the 20% discount to the resulting order_items/orders
-- rows, rather than duplicating order-creation logic.

create or replace function public.customer_order_custom_combo(
  p_restaurant_id uuid,
  p_lanche_item_id uuid,
  p_acompanhamento_item_id uuid,
  p_bebida_item_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_lanche public.menu_items%rowtype;
  v_acomp public.menu_items%rowtype;
  v_bebida public.menu_items%rowtype;
  v_discount_pct constant numeric := 20;
  v_items jsonb;
  v_result jsonb;
  v_order_id uuid;
  v_subtotal numeric(10,2);
  v_total numeric(10,2);
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.restaurants r
    where r.id = p_restaurant_id and r.is_active and r.service_type = 'quick_service'
  ) then
    raise exception 'Monte seu Combo está disponível apenas para restaurantes quick service' using errcode = 'P0001';
  end if;

  select mi.* into v_lanche from public.menu_items mi
    join public.menu_categories mc on mc.id = mi.category_id
  where mi.id = p_lanche_item_id and mi.restaurant_id = p_restaurant_id
    and mi.is_available and mc.name = 'Burgers';
  if v_lanche.id is null then
    raise exception 'Selecione um lanche válido' using errcode = '22023';
  end if;

  select mi.* into v_acomp from public.menu_items mi
    join public.menu_categories mc on mc.id = mi.category_id
  where mi.id = p_acompanhamento_item_id and mi.restaurant_id = p_restaurant_id
    and mi.is_available and mc.name = 'Acompanhamentos';
  if v_acomp.id is null then
    raise exception 'Selecione um acompanhamento válido' using errcode = '22023';
  end if;

  select mi.* into v_bebida from public.menu_items mi
    join public.menu_categories mc on mc.id = mi.category_id
  where mi.id = p_bebida_item_id and mi.restaurant_id = p_restaurant_id
    and mi.is_available and mc.name = 'Bebidas';
  if v_bebida.id is null then
    raise exception 'Selecione uma bebida válida' using errcode = '22023';
  end if;

  v_items := jsonb_build_array(
    jsonb_build_object('menu_item_id', v_lanche.id, 'quantity', 1),
    jsonb_build_object('menu_item_id', v_acomp.id, 'quantity', 1),
    jsonb_build_object('menu_item_id', v_bebida.id, 'quantity', 1)
  );

  -- pickup: quick service orders placed from the menu are always counter
  -- pickup, same order_type customer_place_order uses when there is no
  -- table session (see 20260815200000_casual_dining_experience.sql).
  v_result := public.place_order(p_restaurant_id, 'pickup', v_items, null, null, 'Monte seu Combo (-20%)', null);
  v_order_id := (v_result->>'id')::uuid;

  update public.order_items
  set unit_price = round(unit_price * (1 - v_discount_pct / 100), 2),
      total_price = round(total_price * (1 - v_discount_pct / 100), 2)
  where order_id = v_order_id;

  select o.subtotal into v_subtotal from public.orders o where o.id = v_order_id;
  select coalesce(sum(oi.total_price), 0) into v_total from public.order_items oi where oi.order_id = v_order_id;

  update public.orders
  set total_amount = v_total,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'custom_combo', true,
        'combo_discount_percent', v_discount_pct,
        'combo_original_subtotal', v_subtotal
      ),
      updated_at = now()
  where id = v_order_id;

  return jsonb_build_object(
    'id', v_order_id,
    'restaurant_id', p_restaurant_id,
    'status', 'pending',
    'subtotal', v_subtotal,
    'total_amount', v_total,
    'discount_percent', v_discount_pct,
    'order_items', private.order_items_json(v_order_id)
  );
end $$;

revoke all on function public.customer_order_custom_combo(uuid, uuid, uuid, uuid) from public;
grant execute on function public.customer_order_custom_combo(uuid, uuid, uuid, uuid) to authenticated;
