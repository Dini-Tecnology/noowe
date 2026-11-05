-- Aditivo G: Gerente vê plano atual, caixa do turno por forma de pagamento (líquido) e gorjeta e rateio da equipe.
-- Sem preço do plano, faturas nem taxa por pagamento. "Turno" é o dia operacional aberto (pendência 83).
create or replace function public.restaurant_manager_summary(p_restaurant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare v_day public.operational_days; v_blind boolean; v_dist public.tip_distributions; v_plan text; v_status text;
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner','manager']::public.user_roles_role_enum[]);
  select n.name, s.status into v_plan, v_status from public.restaurant_subscriptions s
    join private.noowe_plans n on n.code = s.plan_code
    where s.restaurant_id = p_restaurant_id and s.status <> 'canceled';
  select * into v_day from public.operational_days where restaurant_id = p_restaurant_id and status = 'open' order by started_at desc limit 1;
  -- Fechamento cego: com o caixa aberto, o dinheiro não aparece, ou o Gerente saberia o esperado na gaveta (pendência 82).
  v_blind := exists (select 1 from public.cash_register_sessions c where c.restaurant_id = p_restaurant_id and c.status = 'open');
  select * into v_dist from public.tip_distributions where restaurant_id = p_restaurant_id order by created_at desc limit 1;
  return jsonb_build_object(
    'plan', jsonb_build_object('name', v_plan, 'status', v_status),
    'cash', case when v_day.id is null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object('method', x.payment_method, 'external', x.external,
          'netCents', case when v_blind and x.payment_method = 'cash' then null else x.net end) order by x.net desc)
      from (select g.payment_method, g.provider = 'manual' as external,
              sum(g.amount_cents - g.refunded_amount_cents - coalesce(f.convenience_cents, 0)
                  - case when f.fee_returned then 0 else coalesce(f.fee_cents, 0) end)::bigint as net
            from public.gateway_transactions g
            left join private.noowe_pay_transaction_fees f on f.gateway_transaction_id = g.id
            where g.restaurant_id = p_restaurant_id and g.provider <> 'simulated' and g.status in ('completed', 'refund_pending', 'refunded')
              and coalesce(g.confirmed_at, g.created_at) >= v_day.started_at
            group by 1, 2) x), '[]'::jsonb) end,
    'tips', jsonb_build_object(
      'poolTodayCents', case when v_day.id is null then 0 else private.tip_pool_cents(p_restaurant_id, v_day.started_at, now() + interval '1 minute') end,
      'last', case when v_dist.id is null then null else jsonb_build_object(
        'businessDate', (select d.business_date from public.operational_days d where d.id = v_dist.operational_day_id),
        'mode', v_dist.mode, 'poolCents', v_dist.pool_cents, 'retainedCents', v_dist.retained_cents, 'distributedCents', v_dist.distributed_cents,
        'lines', coalesce((select jsonb_agg(jsonb_build_object('name', coalesce(p.full_name, 'Sem nome'), 'role', l.role, 'amountCents', l.amount_cents) order by p.full_name)
          from public.tip_distribution_lines l left join public.profiles p on p.id = l.user_id where l.distribution_id = v_dist.id), '[]'::jsonb)) end));
end $$;
revoke all on function public.restaurant_manager_summary(uuid) from public, anon;
grant execute on function public.restaurant_manager_summary(uuid) to authenticated;
