-- restaurant_get_bills (20260624211000_payment_rpc.sql) was written with the intent of
-- "bills for table" (per its own header comment) but actually queries public.bills, an
-- unrelated accounts-payable-to-suppliers table (description/supplier/due_date/category)
-- created earlier in 20260430180000_generated_rest_platform_tables.sql. There is no
-- table_id on that table, so it cannot power a per-table payment tracking screen.
--
-- This adds a correctly-scoped RPC over public.orders (which does carry table_id,
-- total_amount, payment_method, status) for the restaurant-side "Pagamentos" screen.

create or replace function public.restaurant_get_table_bills(
  p_restaurant_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare
  result jsonb;
begin
  perform private.require_restaurant_role(
    p_restaurant_id,
    array['owner', 'manager', 'waiter']::public.user_roles_role_enum[]
  );

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'order_id', o.id,
      'table_id', o.table_id,
      'table_number', t.table_number,
      'total_amount', o.total_amount,
      'payment_method', o.payment_method,
      'status', o.status,
      'is_paid', o.status::text in ('completed', 'delivered'),
      'created_at', o.created_at
    ) order by o.created_at desc
  ), '[]'::jsonb)
  into result
  from public.orders o
  left join public.tables t on t.id = o.table_id
  where o.restaurant_id = p_restaurant_id
    and o.table_id is not null
    and o.created_at > now() - interval '24 hours';

  return result;
end;
$$;

revoke all on function public.restaurant_get_table_bills(uuid) from public;
grant execute on function public.restaurant_get_table_bills(uuid) to authenticated, service_role;
