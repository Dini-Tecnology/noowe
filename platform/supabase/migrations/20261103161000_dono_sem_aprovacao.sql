-- Resposta 32 do Pedro (ADR-022): o Dono é a função máxima e nunca precisa de aprovação, esteja sozinho ou não.
-- O pedido dele é aplicado direto e fica registrado. A regra de não aprovar o próprio pedido vale para os demais.
-- Quem acumula funções conta como Dono: basta ter a função de Dono na unidade.

-- O efeito de uma aprovação, separado para valer igual quando o Dono pede e quando outra pessoa aprova.
create or replace function private.apply_approval_effect(p_approval public.approvals)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
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
  end if;
end $$;
revoke all on function private.apply_approval_effect(public.approvals) from public, anon, authenticated;

create or replace function public.restaurant_resolve_approval(p_approval_id uuid, p_status text, p_resolution_note text DEFAULT NULL::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'private', 'pg_temp'
as $function$
declare
  v_status text := lower(trim(coalesce(p_status, '')));
  v_approval public.approvals%rowtype;
  v_updated public.approvals%rowtype;
begin
  select * into v_approval from public.approvals where id = p_approval_id for update;
  if v_approval.id is null then
    raise exception 'Approval not found' using errcode = 'P0002';
  end if;

  perform private.require_restaurant_role(v_approval.restaurant_id, array['owner','manager']::public.user_roles_role_enum[]);

  if v_status not in ('approved','rejected') then
    raise exception 'Invalid resolution status: %', p_status using errcode = '22023';
  end if;
  if v_approval.status <> 'pending' then
    raise exception 'Approval has already been resolved' using errcode = '23514';
  end if;
  -- Ninguém aprova o próprio pedido, menos o Dono (pendência 32). Desistir qualquer um pode.
  if v_status = 'approved' and v_approval.requester_id = auth.uid()
     and not private.has_restaurant_role(v_approval.restaurant_id, array['owner']::public.user_roles_role_enum[]) then
    raise exception 'Você não pode aprovar o próprio pedido' using errcode = '42501';
  end if;

  if v_status = 'approved' then
    perform private.apply_approval_effect(v_approval);
  end if;

  update public.approvals
  set status = v_status, resolver_id = auth.uid(),
      resolution_note = nullif(trim(coalesce(p_resolution_note, '')), ''),
      resolved_at = now(), updated_at = now()
  where id = p_approval_id
  returning * into v_updated;

  perform private.log_audit(v_approval.restaurant_id, 'approval.' || v_status, 'approval', v_approval.id,
    coalesce(nullif(trim(coalesce(p_resolution_note, '')), ''), v_approval.reason),
    jsonb_build_object('status', v_approval.status, 'type', v_approval.type, 'amountCents', v_approval.amount_cents),
    jsonb_build_object('status', v_status, 'orderId', v_approval.order_id));
  if v_approval.requester_id is not null then
    perform private.create_notification(v_approval.requester_id,
      case when v_status = 'approved' then 'Pedido aprovado' else 'Pedido recusado' end,
      v_approval.item_name, 'system', v_approval.id, 'approval',
      jsonb_build_object('kind', 'approval_resolved', 'approvalId', v_approval.id, 'status', v_status,
        'restaurant_id', v_approval.restaurant_id));
  end if;

  return to_jsonb(v_updated);
end;
$function$;

create or replace function public.restaurant_request_approval(
  p_restaurant_id uuid,
  p_type text,
  p_item_name text,
  p_reason text,
  p_amount numeric default 0,
  p_table_id uuid default null,
  p_order_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
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
    amount, status, order_id, resolver_id, resolution_note, resolved_at, created_at, updated_at
  ) values (
    p_restaurant_id, v_type, trim(p_item_name), p_table_id, auth.uid(), trim(p_reason),
    coalesce(p_amount, 0), case when v_owner then 'approved' else 'pending' end, p_order_id,
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
$$;
