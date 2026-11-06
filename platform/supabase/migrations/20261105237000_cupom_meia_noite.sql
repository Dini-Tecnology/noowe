-- Cupons (respostas 71, 73 e 79 de 05/11/2026).
--  73: janela que passa da meia-noite (22h às 2h) é aceita. Vale até a hora final do dia seguinte e conta como o dia em que começou.
--  71: o faturamento do cupom já era o consumo pago com o desconto, sem taxa nem gorjeta, e o desconto aparece à parte. Não muda.
--  79: o app precisa saber quando o cupom zerou o pedido, para não pedir pagamento.

-- 1. Cadastro: início e fim iguais não formam janela; fim antes do início é a janela da noite.
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('private.coupon_assert_shape(uuid, jsonb)'::regprocedure);
  if position($q$if v_from is not null and v_from >= v_until then raise exception 'O horário final precisa ser depois do inicial' using errcode = '22023'; end if;$q$ in v_def) = 0 then
    raise exception 'coupon_assert_shape mudou: revisar a janela da meia-noite';
  end if;
  execute replace(v_def, $q$if v_from is not null and v_from >= v_until then raise exception 'O horário final precisa ser depois do inicial' using errcode = '22023'; end if;$q$,
    $q$if v_from is not null and v_from = v_until then raise exception 'O início e o fim do horário não podem ser iguais' using errcode = '22023'; end if;$q$);
end $$;

-- Na janela da noite, o que passa da meia-noite pertence ao dia em que a janela começou.
create or replace function private.coupon_window_day(p public.promotions, p_local timestamp)
returns timestamp language sql immutable as $$
  select case when p.hours_from is not null and p.hours_until is not null and p.hours_from::time > p.hours_until::time
      and p_local::time < p.hours_until::time then p_local - interval '1 day' else p_local end
$$;

create or replace function private.coupon_in_window(p public.promotions, p_local timestamp)
returns boolean language sql immutable as $$
  select p.hours_from is null or p.hours_until is null
    or case when p.hours_from::time < p.hours_until::time then p_local::time >= p.hours_from::time and p_local::time < p.hours_until::time
            else p_local::time >= p.hours_from::time or p_local::time < p.hours_until::time end
$$;

-- 2. Uso: o dia da semana é o da janela, e a hora pode atravessar a meia-noite.
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('private.coupon_refusal(public.promotions, text, uuid, bigint)'::regprocedure);
  if position($q$v_dow integer := extract(dow from v_local)::integer;$q$ in v_def) = 0
     or position($q$if p.hours_from is not null and p.hours_until is not null and not (v_local::time >= p.hours_from::time and v_local::time < p.hours_until::time) then$q$ in v_def) = 0 then
    raise exception 'coupon_refusal mudou: revisar a janela da meia-noite';
  end if;
  v_def := replace(v_def, $q$v_dow integer := extract(dow from v_local)::integer;$q$,
    $q$v_dow integer := extract(dow from private.coupon_window_day(p, now() at time zone 'America/Sao_Paulo'))::integer;$q$);
  v_def := replace(v_def, $q$if p.hours_from is not null and p.hours_until is not null and not (v_local::time >= p.hours_from::time and v_local::time < p.hours_until::time) then$q$,
    $q$if not private.coupon_in_window(p, v_local) then$q$);
  execute v_def;
end $$;

-- 3. Aplicar o cupom no pedido diz se ele ficou pago (cupom que zerou o pedido).
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.customer_apply_coupon_to_order(uuid, text)'::regprocedure);
  if position($q$return jsonb_build_object('orderId', o.id, 'discountCents', v, 'totalCents', o.total_cents, 'couponTitle', p.title);$q$ in v_def) = 0 then
    raise exception 'customer_apply_coupon_to_order mudou: revisar o retorno';
  end if;
  execute replace(v_def, $q$return jsonb_build_object('orderId', o.id, 'discountCents', v, 'totalCents', o.total_cents, 'couponTitle', p.title);$q$,
    $q$return jsonb_build_object('orderId', o.id, 'discountCents', v, 'totalCents', o.total_cents, 'couponTitle', p.title, 'paymentStatus', o.payment_status);$q$);
end $$;
