-- Emulator shortcut. The customer cannot mark a dish ready — that belongs to
-- the kitchen — so a development build can skip the prep wait and continue
-- the visit (ready screen, payment). The order status update is what the
-- restaurant status RPC already does; the existing trigger fans that out to
-- the items.
--
-- Shares the dev switch with the table-scan shortcut. Leave it off wherever
-- real customers use the database:
--   update private.dev_flags set enabled = false, updated_at = now()
--   where key = 'simulate_table_scan';

create or replace function public.customer_dev_skip_prep(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_order public.orders;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not exists (
    select 1
    from private.dev_flags
    where key = 'simulate_table_scan'
      and enabled
  ) then
    raise exception 'O atalho de teste está desligado no banco.'
      using errcode = '42501';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if v_order.id is null
    or (
      v_order.customer_id is distinct from auth.uid()
      and not exists (
        select 1
        from public.table_session_participants p
        where p.table_session_id = v_order.table_session_id
          and p.user_id = auth.uid()
      )
    )
  then
    raise exception 'Pedido não encontrado' using errcode = 'P0002';
  end if;

  if v_order.status::text = 'cancelled' then
    raise exception 'Este pedido foi cancelado.' using errcode = '22023';
  end if;

  if v_order.status::text in ('ready', 'delivering', 'delivered', 'completed') then
    return jsonb_build_object('orderId', v_order.id, 'status', v_order.status);
  end if;

  perform private.log_audit(
    v_order.restaurant_id,
    'dev_skip_prep',
    'order',
    v_order.id,
    'Atalho de teste: pular tempo de preparo',
    jsonb_build_object('status', v_order.status),
    jsonb_build_object('status', 'ready')
  );

  update public.orders
  set status = 'ready'::public.orders_status_enum,
      actual_ready_at = coalesce(actual_ready_at, now()),
      estimated_ready_at = now(),
      updated_at = now()
  where id = v_order.id;

  update public.order_items
  set expected_ready_at = now(),
      updated_at = now()
  where order_id = v_order.id
    and status::text <> 'cancelled';

  return jsonb_build_object('orderId', v_order.id, 'status', 'ready');
end;
$$;

revoke all on function public.customer_dev_skip_prep(uuid) from public, anon;
grant execute on function public.customer_dev_skip_prep(uuid) to authenticated;
