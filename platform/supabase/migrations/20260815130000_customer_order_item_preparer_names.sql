-- Expose which staff member is preparing each order item to the customer who
-- placed the order, without touching public.profiles RLS (that's what caused
-- the table_session_participants recursion fixed in 20260815120000 — any new
-- policy that lets customers read arbitrary staff profiles risks the same
-- class of bug). Instead: a narrow SECURITY DEFINER RPC that only returns the
-- preparer's display name for order items the caller is actually allowed to
-- see (their own order, or an order on a shared table session they're part
-- of), and only that one field.

create or replace function public.customer_get_order_item_preparers(p_order_id uuid)
returns table(order_item_id uuid, chef_name text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select oi.id, p.full_name
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  left join public.profiles p on p.id = oi.prepared_by
  where oi.order_id = p_order_id
    and (
      o.customer_id = auth.uid()
      or exists (
        select 1
        from public.table_session_participants tsp
        where tsp.table_session_id = o.table_session_id
          and tsp.user_id = auth.uid()
      )
    );
$$;

revoke all on function public.customer_get_order_item_preparers(uuid) from public;
grant execute on function public.customer_get_order_item_preparers(uuid) to authenticated, service_role;
