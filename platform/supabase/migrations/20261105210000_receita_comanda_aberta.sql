-- Receita do dia com comanda aberta (pendência 87). Receita é o que foi pago (pendência 15).
-- Antes: comanda parcialmente paga não somava nada, e pedido concluído em comanda ainda sem pagamento somava inteiro.
-- Agora, enquanto a comanda está aberta, entra só o consumo já pago, sem taxa nem gorjeta. Ao encerrar, entra o pedido, como sempre.
create or replace function private.revenue_cents(
  p_restaurant_id uuid, p_from timestamptz, p_to timestamptz
) returns bigint language sql stable as $$
  select
    coalesce((select sum(coalesce(o.total_cents, round(coalesce(o.total_amount, o.subtotal, 0) * 100)::bigint))
      from public.orders o
      where o.restaurant_id = p_restaurant_id
        and o.created_at >= p_from
        and o.created_at <  p_to
        and private.counts_as_revenue(o.status::text, o.payment_status::text)
        and not (o.payment_status::text is distinct from 'confirmed' and exists (
          select 1 from public.table_sessions s where s.id = o.table_session_id and s.status = 'active'))), 0)::bigint
    + coalesce((select sum(b.base_cents - b.coupon_discount_cents)
      from public.bill_shares b
      join public.table_sessions s on s.id = b.table_session_id
      where b.restaurant_id = p_restaurant_id
        and b.status = 'paid'
        and s.status = 'active'
        and b.paid_at >= p_from
        and b.paid_at <  p_to), 0)::bigint
$$;
