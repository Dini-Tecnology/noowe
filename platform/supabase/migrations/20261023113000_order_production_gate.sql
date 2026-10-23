-- N4 / T-N4-05 — gate de pagamento antes da produção, dirigido pela política.
--
-- private.quick_order_may_enter_production comparava service_model com o literal
-- 'quick_service' e era permissivo quando service_model era NULL. place_order e
-- customer_order_custom_combo criam pedidos 'pickup' sem service_model, então esses
-- pedidos chegavam à cozinha sem pagamento (invariante 6).
--
-- Agora o gate lê `prepaid_required` da política do modelo do pedido:
--   * política encontrada e prepaid_required: pagamento confirmado E pedido aceito (ADR-013);
--   * política encontrada sem prepaid_required: livre;
--   * sem política (modelo NULL ou sem linha): falha fechada — exige pagamento confirmado,
--     exceto pedido de salão (dine_in), que se paga no fechamento da conta.

create or replace function private.order_may_enter_production(p_order public.orders)
returns boolean language plpgsql stable security definer
set search_path = public, pg_temp as $$
declare v_prepaid boolean;
begin
  select prepaid_required into v_prepaid from public.restaurant_model_policies
    where restaurant_id = p_order.restaurant_id and service_model = p_order.service_model;
  if v_prepaid is null then
    -- Sem decisão de política: só o salão fica livre.
    if p_order.order_type::text = 'dine_in' then return true; end if;
    return p_order.payment_status = 'confirmed';
  end if;
  if not v_prepaid then return true; end if;
  return p_order.payment_status = 'confirmed' and p_order.accepted_at is not null;
end $$;
revoke all on function private.order_may_enter_production(public.orders) from public, anon, authenticated;

-- Mantém o nome antigo para os chamadores existentes (KDS e transições de status).
create or replace function private.quick_order_may_enter_production(p_order public.orders)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select private.order_may_enter_production(p_order)
$$;
revoke all on function private.quick_order_may_enter_production(public.orders) from public, anon, authenticated;
