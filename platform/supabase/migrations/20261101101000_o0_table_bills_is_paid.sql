-- O0: "Cobrar" do garçom marcava como pago o pedido apenas entregue e não via a parcela paga.
-- `is_paid` passa a vir do estado de pagamento: pagamento confirmado (parcelas, Pix, cartão), pedido
-- concluído por pagamento registrado, ou transação de pagamento concluída. Pedido cancelado nunca é pago.
-- É leitura de estado; nenhum valor é calculado aqui (invariante 2).
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
      'payment_status', o.payment_status,
      'is_paid', private.order_is_paid(o),
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

create or replace function private.order_is_paid(p_order public.orders)
returns boolean
language sql
stable
as $$
  select p_order.status::text <> 'cancelled'
     and (
       p_order.payment_status::text = 'confirmed'
       or p_order.status::text = 'completed'
       or exists (
         select 1 from public.gateway_transactions g
         where g.order_id = p_order.id and g.status::text = 'completed'
       )
     )
$$;

revoke all on function public.restaurant_get_table_bills(uuid) from public;
grant execute on function public.restaurant_get_table_bills(uuid) to authenticated, service_role;
