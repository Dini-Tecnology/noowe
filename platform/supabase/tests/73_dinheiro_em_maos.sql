-- Aditivo G: "dinheiro em mãos" do Garçom — só o que ele mesmo recebeu no caixa aberto.
begin;
select plan(3);
create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;
create temp table _ctx(k text primary key, v uuid);
do $$
declare r uuid := 'c1000000-0000-4000-8000-000000000002'; w1 uuid := gen_random_uuid(); w2 uuid := gen_random_uuid(); sid uuid;
begin
  insert into _ctx values ('r', r), ('w1', w1), ('w2', w2);
  insert into auth.users(id, email) values (w1, w1 || '@cash.test'), (w2, w2 || '@cash.test');
  insert into public.profiles(id) values (w1), (w2) on conflict do nothing;
  insert into public.user_roles(user_id, restaurant_id, role, is_active) values (w1, r, 'waiter', true), (w2, r, 'waiter', true);
  update public.cash_register_sessions set status = 'closed', closed_at = now() where restaurant_id = r and status = 'open';
end $$;
grant select on _ctx to authenticated;
set local role authenticated;
do $$
declare r uuid := (select v from _ctx where k='r');
begin
  perform pg_temp.act((select v from _ctx where k='w1'));
  assert not (public.restaurant_my_cash_in_hand(r)->>'open')::boolean, 'sem caixa aberto não há dinheiro em mãos';
end $$;
select pass('sem caixa aberto, o Garçom vê zero e caixa fechado');
reset role;
do $$
declare r uuid := (select v from _ctx where k='r'); sid uuid; w1 uuid := (select v from _ctx where k='w1'); w2 uuid := (select v from _ctx where k='w2');
begin
  insert into public.cash_register_sessions(restaurant_id, status, opened_at, opened_by, opening_balance, opening_cents, expected_balance, expected_cents)
    values (r, 'open', now(), w1, 0, 0, 0, 0) returning id into sid;
  insert into public.cash_register_movements(session_id, type, amount, amount_cents, is_cash, actor_id, created_by, created_at)
    values (sid, 'sale', 30, 3000, true, w1, 'w1', now()), (sid, 'sale', 20, 2000, true, w1, 'w1', now()), (sid, 'sale', 99, 9900, true, w2, 'w2', now()),
           (sid, 'sangria', 10, 1000, true, w1, 'w1', now());
end $$;
set local role authenticated;
do $$
declare r uuid := (select v from _ctx where k='r');
begin
  perform pg_temp.act((select v from _ctx where k='w1'));
  assert (public.restaurant_my_cash_in_hand(r)->>'cents')::bigint = 5000, 'soma só o dele: ' || public.restaurant_my_cash_in_hand(r);
end $$;
select pass('o Garçom soma só o dinheiro que ele mesmo recebeu, sem sangria');
do $$
declare r uuid := (select v from _ctx where k='r'); c uuid := gen_random_uuid(); ok boolean := false;
begin
  reset role;
  insert into auth.users(id, email) values (c, c || '@cash.test');
  insert into public.profiles(id) values (c) on conflict do nothing;
  set local role authenticated;
  perform pg_temp.act(c);
  begin perform public.restaurant_my_cash_in_hand(r); exception when sqlstate '42501' then ok := true; end;
  assert ok, 'quem não é da equipe é recusado';
end $$;
select pass('quem não trabalha no restaurante é recusado');
select * from finish();
rollback;
