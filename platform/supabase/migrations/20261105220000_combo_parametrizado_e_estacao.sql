-- O desconto do combo vinha fixo em 20% no código: agora é o parâmetro combo_discount_bps do restaurante (regra de convenção de valores).
-- E a estação do item passa a ser gravada a partir do cardápio: place_order deixava order_items.station_id vazio.
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
  v_bps integer;
  v_discount_pct numeric;
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

  select p.combo_discount_bps into v_bps from public.restaurant_model_policies p
    where p.restaurant_id = p_restaurant_id and p.service_model = 'quick_service';
  v_bps := coalesce(v_bps, 0);
  v_discount_pct := v_bps / 100.0;

  v_items := jsonb_build_array(
    jsonb_build_object('menu_item_id', v_lanche.id, 'quantity', 1),
    jsonb_build_object('menu_item_id', v_acomp.id, 'quantity', 1),
    jsonb_build_object('menu_item_id', v_bebida.id, 'quantity', 1)
  );

  -- pickup: quick service orders placed from the menu are always counter
  -- pickup, same order_type customer_place_order uses when there is no
  -- table session (see 20260815200000_casual_dining_experience.sql).
  v_result := public.place_order(p_restaurant_id, 'pickup', v_items, null, null, 'Monte seu Combo (-' || trim(trailing '.' from trim(trailing '0' from to_char(v_discount_pct, 'FM990.00'))) || '%)', null);
  v_order_id := (v_result->>'id')::uuid;

  update public.order_items
  set unit_price = round(unit_price * (10000 - v_bps) / 10000, 2),
      total_price = round(total_price * (10000 - v_bps) / 10000, 2)
  where order_id = v_order_id;

  select o.subtotal into v_subtotal from public.orders o where o.id = v_order_id;
  select coalesce(sum(oi.total_price), 0) into v_total from public.order_items oi where oi.order_id = v_order_id;

  update public.orders
  set total_amount = v_total,
      total_cents = case when total_cents is not null then round(v_total * 100)::bigint end,
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

create or replace function private.order_items_fill_station()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.station_id is null and new.menu_item_id is not null then
    select mi.station_id into new.station_id from public.menu_items mi where mi.id = new.menu_item_id;
  end if;
  return new;
end $$;
revoke all on function private.order_items_fill_station() from public, anon, authenticated;
create trigger order_items_fill_station before insert on public.order_items
  for each row execute function private.order_items_fill_station();
