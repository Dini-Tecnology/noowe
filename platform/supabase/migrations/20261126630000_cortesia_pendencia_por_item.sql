-- Decisão 11: cortesia por item pedida por garçom/gerente. Pendência única por item, não por pedido;
-- o valor da solicitação vem do item no servidor, não do app.
CREATE OR REPLACE FUNCTION public.restaurant_request_approval(p_restaurant_id uuid, p_type text, p_item_name text, p_reason text, p_amount numeric DEFAULT 0, p_table_id uuid DEFAULT NULL::uuid, p_order_id uuid DEFAULT NULL::uuid, p_order_item_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_type text := lower(trim(coalesce(p_type, '')));
  v_approval public.approvals%rowtype;
  v_owner boolean;
begin
  perform private.require_restaurant_role(
    p_restaurant_id,
    array['owner','manager','maitre','chef','cook','barman','waiter']::public.user_roles_role_enum[]
  );

  if v_type not in ('cancellation','order_cancellation','discount','refund','courtesy','other') then
    raise exception 'Invalid approval type: %', p_type using errcode = '22023';
  end if;
  if nullif(trim(coalesce(p_item_name, '')), '') is null then
    raise exception 'Item name is required' using errcode = '22023';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'Reason is required' using errcode = '22023';
  end if;
  if coalesce(p_amount, 0) < 0 then
    raise exception 'Amount cannot be negative' using errcode = '22023';
  end if;
  if p_table_id is not null and not exists (
    select 1 from public.tables where id = p_table_id and restaurant_id = p_restaurant_id
  ) then
    raise exception 'Table does not belong to this restaurant' using errcode = '23503';
  end if;
  if p_order_id is not null and not exists (
    select 1 from public.orders where id = p_order_id and restaurant_id = p_restaurant_id
  ) then
    raise exception 'Order does not belong to this restaurant' using errcode = '23503';
  end if;
  if p_order_item_id is not null and not exists (
    select 1 from public.order_items oi join public.orders o on o.id = oi.order_id
    where oi.id = p_order_item_id and o.restaurant_id = p_restaurant_id
      and (p_order_id is null or o.id = p_order_id)
  ) then
    raise exception 'Order item does not belong to this order' using errcode = '23503';
  end if;
  if p_order_item_id is not null and p_order_id is null then
    select order_id into p_order_id from public.order_items where id = p_order_item_id;
  end if;
  -- Com item: o valor é o do item no servidor, e a pendência é por item (dois itens do mesmo pedido podem ter cortesia).
  if p_order_item_id is not null then
    select coalesce(total_price_cents, round(total_price * 100)::bigint) / 100.0 into p_amount
    from public.order_items where id = p_order_item_id;
  end if;
  if p_order_id is not null and exists (
    select 1 from public.approvals
    where restaurant_id = p_restaurant_id and order_id = p_order_id and type = v_type and status = 'pending'
      and (p_order_item_id is null or order_item_id is not distinct from p_order_item_id)
  ) then
    raise exception 'A pending approval already exists for this order' using errcode = '23505';
  end if;

  v_owner := private.has_restaurant_role(p_restaurant_id, array['owner']::public.user_roles_role_enum[]);

  -- Nasce aprovado: o gatilho do motor só abre tarefa para pedido pendente, então não há tarefa nem aviso.
  insert into public.approvals(
    restaurant_id, type, item_name, table_id, requester_id, reason,
    amount, status, order_id, order_item_id, resolver_id, resolution_note, resolved_at, created_at, updated_at
  ) values (
    p_restaurant_id, v_type, trim(p_item_name), p_table_id, auth.uid(), trim(p_reason),
    coalesce(p_amount, 0), case when v_owner then 'approved' else 'pending' end, p_order_id, p_order_item_id,
    case when v_owner then auth.uid() end,
    case when v_owner then 'Aplicado direto pelo Dono' end,
    case when v_owner then now() end, now(), now()
  ) returning * into v_approval;

  if v_owner then
    perform private.apply_approval_effect(v_approval);
    perform private.log_audit(p_restaurant_id, 'approval.approved', 'approval', v_approval.id, v_approval.reason,
      jsonb_build_object('type', v_approval.type, 'amountCents', v_approval.amount_cents),
      jsonb_build_object('status', 'approved', 'orderId', v_approval.order_id, 'direct', true));
  end if;

  return to_jsonb(v_approval);
end;
$function$;
revoke all on function public.restaurant_request_approval(uuid,text,text,text,numeric,uuid,uuid,uuid) from public, anon;
grant execute on function public.restaurant_request_approval(uuid,text,text,text,numeric,uuid,uuid,uuid) to authenticated, service_role;

