-- Cortesia por item: a aprovação aponta o item escolhido; dois pratos iguais não se confundem mais.
alter table public.approvals add column if not exists order_item_id uuid references public.order_items(id) on delete set null;
create index if not exists approvals_order_item_id_idx on public.approvals(order_item_id) where order_item_id is not null;

drop function if exists public.restaurant_request_approval(uuid,text,text,text,numeric,uuid,uuid);
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
  if p_order_id is not null and exists (
    select 1 from public.approvals
    where restaurant_id = p_restaurant_id and order_id = p_order_id and type = v_type and status = 'pending'
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

CREATE OR REPLACE FUNCTION private.apply_approval_effect(p_approval approvals)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare v_item public.order_items; v_cents bigint;
begin
  -- Estorno aprovado: entra na fila do provedor; nada volta ao cliente sem esta aprovação (ADR-004).
  if p_approval.type = 'refund' and p_approval.gateway_transaction_id is not null then
    perform private.enqueue_refund(p_approval.gateway_transaction_id, p_approval.reason, p_approval.amount_cents,
      p_approval.requester_id, p_approval.id);
    return;
  end if;
  if p_approval.type = 'bill_reopen' and p_approval.table_session_id is not null then
    perform private.reopen_paid_session(p_approval.table_session_id, p_approval.reason);
    return;
  end if;
  if p_approval.order_id is null then return; end if;
  if p_approval.type in ('cancellation', 'order_cancellation') then
    update public.orders
    set cancellation_reason = coalesce(nullif(btrim(coalesce(p_approval.reason, '')), ''), 'Cancelamento aprovado'),
        updated_at = now()
    where id = p_approval.order_id and restaurant_id = p_approval.restaurant_id;
    -- Aprovado, sai tudo: também o que já foi entregue, ou o pedido não ficaria cancelado.
    update public.order_items oi set status = 'cancelled', updated_at = now()
    from public.orders o
    where o.id = oi.order_id and o.id = p_approval.order_id
      and o.restaurant_id = p_approval.restaurant_id and oi.status::text <> 'cancelled';
  elsif p_approval.type = 'discount' then
    -- discount_cents é o que a conta usa: sem ele, o desconto aprovado não chegava ao que o cliente paga.
    update public.orders
    set discount_cents = greatest(coalesce(discount_cents, 0), p_approval.amount_cents),
        total_cents = greatest(total_cents - greatest(p_approval.amount_cents - coalesce(discount_cents, 0), 0), 0),
        discount_amount = greatest(coalesce(discount_amount, 0), p_approval.amount),
        total_amount = greatest(
          coalesce(subtotal, total_amount, 0) + coalesce(tax_amount, 0) + coalesce(tip_amount, 0)
            - greatest(coalesce(discount_amount, 0), p_approval.amount), 0),
        updated_at = now()
    where id = p_approval.order_id and restaurant_id = p_approval.restaurant_id;
  elsif p_approval.type = 'courtesy' then
    -- Cortesia zera o item na conta: a comanda lê o valor do item; o pedido perde o mesmo valor em centavos.
    -- O item escolhido vem por id; o nome só vale para aprovações antigas, sem order_item_id.
    select oi.* into v_item from public.order_items oi
      join public.orders o on o.id = oi.order_id and o.restaurant_id = p_approval.restaurant_id
      left join public.menu_items mi on mi.id = oi.menu_item_id
      where oi.order_id = p_approval.order_id and oi.status::text <> 'cancelled'
        and coalesce(oi.total_price_cents, round(oi.total_price * 100)::bigint) > 0
        and (case when p_approval.order_item_id is not null then oi.id = p_approval.order_item_id
             else lower(btrim(coalesce(mi.name, ''))) = lower(btrim(coalesce(p_approval.item_name, ''))) end)
      order by oi.created_at, oi.id limit 1 for update of oi;
    if v_item.id is null then
      raise exception 'Cortesia: item "%" não está no pedido', p_approval.item_name using errcode = 'P0002';
    end if;
    v_cents := coalesce(v_item.total_price_cents, round(v_item.total_price * 100)::bigint);
    update public.order_items set total_price_cents = 0, total_price = 0, updated_at = now() where id = v_item.id;
    update public.orders
    set subtotal_cents = greatest(coalesce(subtotal_cents, 0) - v_cents, 0),
        total_cents = greatest(coalesce(total_cents, 0) - v_cents, 0),
        subtotal = greatest(coalesce(subtotal, 0) - v_cents / 100.0, 0),
        total_amount = greatest(coalesce(total_amount, 0) - v_cents / 100.0, 0),
        updated_at = now()
    where id = p_approval.order_id and restaurant_id = p_approval.restaurant_id;
  end if;
end $function$;
