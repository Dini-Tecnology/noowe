-- Mapa de mesas e cobrança do Maître (respostas 76 e 86 de 05/11/2026).
--  86: o mapa mostra o consumo e quanto falta pagar ("Consumo R$ 320 · Falta R$ 110"). Para o Maître, "Pagamento parcial", sem valores.
--  76: o Maître vê quem já pagou (marcação "pago" por pessoa), sem valor nem forma de pagamento.

-- 1. Mapa: quanto falta, para quem vê a conta; e se há pagamento parcial, para todos (sem valor).
do $$
declare v_def text; v_anchor text := $q$'spent_hidden', not (v_sees_all or (v_is_waiter and private.table_is_with_user(t.id, auth.uid()))),$q$;
begin
  v_def := pg_get_functiondef('public.restaurant_get_tables(uuid)'::regprocedure);
  if position(v_anchor in v_def) = 0 then raise exception 'restaurant_get_tables mudou: revisar o falta pagar'; end if;
  execute replace(v_def, v_anchor, v_anchor || $q$
            'remaining_cents', case when v_sees_all or (v_is_waiter and private.table_is_with_user(t.id, auth.uid())) then (select x.base_rem from private.session_totals(ts.id) x) end,
            'partial_payment', coalesce((select x.paid_sum > 0 and x.base_rem > 0 from private.session_totals(ts.id) x), false),$q$);
end $$;

-- 2. Quem já pagou: o Maître vê só a marcação, sem valor nem forma. Parcela paga com cupom aparece como tal.
do $$
declare v_def text; v_old text := $q$'method', g.payment_method, 'paidAt', b.paid_at) order by b.paid_at)$q$;
begin
  v_def := pg_get_functiondef('public.restaurant_get_session_bill(uuid, bigint, text)'::regprocedure);
  if position(v_old in v_def) = 0 then raise exception 'restaurant_get_session_bill mudou: revisar a marcação de pago'; end if;
  execute replace(v_def, v_old, $q$'method', case when private.has_restaurant_role(s.restaurant_id, array['owner','manager','waiter']::public.user_roles_role_enum[])
          then coalesce(g.payment_method, case when b.payment_id is null and b.coupon_discount_cents > 0 then 'coupon' end) end,
        'paid', true, 'paidAt', b.paid_at) order by b.paid_at)$q$);
end $$;
