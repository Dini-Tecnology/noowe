-- Resposta 73 (05/11/2026): cupom das 22h às 2h vale até a hora final do dia seguinte e conta como o dia em que começou.
begin;
select plan(3);
create function pg_temp.msg_of(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok'; exception when others then return sqlerrm; end $$;

do $$
declare r uuid := 'c1000000-0000-4000-8000-000000000002';
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', 'c1000000-0000-4000-8000-000000000001', 'role', 'authenticated')::text, true);
  assert pg_temp.msg_of(format($q$select public.restaurant_upsert_coupon(%L, %L)$q$, r, jsonb_build_object('code', 'NOITE' || upper(substr(md5(random()::text), 1, 4)),
    'title', 'Happy hour', 'discountKind', 'percent', 'discountBps', 1000, 'hoursFrom', '22:00', 'hoursUntil', '02:00', 'validFrom', now(), 'validUntil', now() + interval '1 day'))) = 'ok', 'aceita 22h às 2h';
  assert pg_temp.msg_of(format($q$select public.restaurant_upsert_coupon(%L, %L)$q$, r, jsonb_build_object('title', 'x', 'discountKind', 'percent', 'discountBps', 1000,
    'hoursFrom', '22:00', 'hoursUntil', '22:00', 'validFrom', now(), 'validUntil', now() + interval '1 day'))) like 'O início e o fim%', 'iguais não';
end $$;
select pass('o cadastro aceita a janela que passa da meia-noite e recusa início igual ao fim');

do $$
declare p public.promotions;
begin
  p.hours_from := '22:00'; p.hours_until := '02:00';
  assert private.coupon_in_window(p, timestamp '2026-11-06 23:30'), '23h30 vale';
  assert private.coupon_in_window(p, timestamp '2026-11-07 01:59'), '1h59 do dia seguinte vale';
  assert not private.coupon_in_window(p, timestamp '2026-11-07 02:00'), '2h já não';
  assert not private.coupon_in_window(p, timestamp '2026-11-06 21:59'), 'antes das 22h não';
  p.hours_from := '15:00'; p.hours_until := '18:00';
  assert private.coupon_in_window(p, timestamp '2026-11-06 15:00') and not private.coupon_in_window(p, timestamp '2026-11-06 18:00'), 'janela do dia segue igual';
end $$;
select pass('a janela vale até a hora final do dia seguinte');

do $$
declare p public.promotions;
begin
  p.hours_from := '22:00'; p.hours_until := '02:00';
  -- 07/11/2026 é sábado: à 1h30, ainda é a sexta da janela.
  assert extract(dow from private.coupon_window_day(p, timestamp '2026-11-07 01:30')) = 5, 'depois da meia-noite, conta a sexta';
  assert extract(dow from private.coupon_window_day(p, timestamp '2026-11-07 23:00')) = 6, 'às 23h de sábado, é sábado';
end $$;
select pass('o que passa da meia-noite conta como o dia em que a janela começou');
select * from finish();
rollback;
