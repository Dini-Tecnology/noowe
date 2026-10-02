-- ADR-013: o atalho de teste "pular preparo" marcava orders.status = 'ready' sem passar por
-- aceite, preparo e conferência. No Quick Service isso deixa o pedido incoerente (status
-- 'ready' com fulfillment_status 'accepted') e fura o critério Q1 #3 (conferência no KDS).
-- O atalho continua valendo para os demais modelos.

create or replace function public.customer_dev_skip_prep(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'private', 'pg_temp'
as $function$
declare
  v_order public.orders;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not exists (
    select 1 from private.dev_flags where key = 'simulate_table_scan' and enabled
  ) then
    raise exception 'O atalho de teste está desligado no banco.' using errcode = '42501';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;

  if v_order.id is null
    or (
      v_order.customer_id is distinct from auth.uid()
      and not exists (
        select 1 from public.table_session_participants p
        where p.table_session_id = v_order.table_session_id and p.user_id = auth.uid()
      )
    )
  then
    raise exception 'Pedido não encontrado' using errcode = 'P0002';
  end if;

  if v_order.service_model = 'quick_service' then
    raise exception 'Pedido Quick passa por preparo e conferência no app do restaurante.'
      using errcode = '22023';
  end if;

  if v_order.status::text = 'cancelled' then
    raise exception 'Este pedido foi cancelado.' using errcode = '22023';
  end if;

  if v_order.status::text in ('ready', 'delivering', 'delivered', 'completed') then
    return jsonb_build_object('orderId', v_order.id, 'status', v_order.status);
  end if;

  perform private.log_audit(
    v_order.restaurant_id, 'dev_skip_prep', 'order', v_order.id,
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
  set expected_ready_at = now(), updated_at = now()
  where order_id = v_order.id and status::text <> 'cancelled';

  return jsonb_build_object('orderId', v_order.id, 'status', 'ready');
end;
$function$;
