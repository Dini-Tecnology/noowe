-- QA 27/11: no balcão o cliente mostrava "NW-261127-F577657C91E6". O número falado no caixa passa a ser
-- o código curto do dia (pickup_code, 6 caracteres, único por restaurante e dia), o mesmo da retirada.
-- Sem código (pedido que não é Quick), segue o order_number.

create or replace function public.customer_quick_pay_at_counter(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare o public.orders;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select * into o from public.orders where id = p_order_id and customer_id = auth.uid() for update;
  if o.id is null or o.service_model is distinct from 'quick_service' then raise exception 'Pedido não encontrado' using errcode = 'P0002'; end if;
  if o.payment_status <> 'pending' or o.fulfillment_status in ('cancelled', 'not_picked_up') then
    raise exception 'Este pedido não aguarda pagamento' using errcode = 'P0001'; end if;
  if coalesce(o.total_cents, 0) >= private.online_minimum_cents() then
    raise exception 'Este pedido pode ser pago pelo app' using errcode = 'P0001'; end if;
  update public.orders set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('pay_at_counter', true),
    payment_expires_at = null, updated_at = now() where id = o.id;
  return jsonb_build_object('orderId', o.id, 'orderNumber', coalesce(o.pickup_code, o.order_number), 'totalCents', o.total_cents, 'payAtCounter', true);
end $$;
revoke all on function public.customer_quick_pay_at_counter(uuid) from public, anon;
grant execute on function public.customer_quick_pay_at_counter(uuid) to authenticated;

create or replace function public.restaurant_list_counter_orders(p_restaurant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner','manager','maitre','barman']::public.user_roles_role_enum[]);
  return coalesce((select jsonb_agg(x.j order by x.created_at) from (
    select o.created_at, jsonb_build_object('orderId', o.id, 'orderNumber', o.order_number, 'counterCode', o.pickup_code, 'callName', o.call_name,
        'totalCents', coalesce(o.total_cents, round(coalesce(o.total_amount, o.subtotal, 0) * 100)::bigint), 'createdAt', o.created_at,
        'items', coalesce((select jsonb_agg(oi.quantity || 'x ' || coalesce(mi.name, 'Item')) from public.order_items oi
          left join public.menu_items mi on mi.id = oi.menu_item_id where oi.order_id = o.id), '[]'::jsonb)) as j
    from public.orders o
    where o.restaurant_id = p_restaurant_id and o.table_id is null and o.table_session_id is null
      and o.payment_status::text = 'pending' and o.status::text not in ('cancelled', 'completed')
      and (o.payment_expires_at is null or o.payment_expires_at > now())
      and o.created_at >= now() - interval '1 day') x), '[]'::jsonb);
end $$;
revoke all on function public.restaurant_list_counter_orders(uuid) from public, anon;
grant execute on function public.restaurant_list_counter_orders(uuid) to authenticated, service_role;
