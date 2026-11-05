-- Acerto do garçom (ADR-029): zera o saldo da pessoa, é cego para o Gerente e deixa rastro.
begin;
select plan(7);
create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;
create temp table _ctx(k text primary key, v uuid);
do $$
declare r uuid := 'c1000000-0000-4000-8000-000000000002'; w uuid := gen_random_uuid(); w2 uuid := gen_random_uuid(); m uuid := gen_random_uuid(); own uuid; sid uuid;
begin
  select ur.user_id into own from public.user_roles ur where ur.restaurant_id = r and ur.role = 'owner' and ur.is_active limit 1;
  insert into _ctx values ('r', r), ('w', w), ('w2', w2), ('m', m), ('own', own);
  insert into auth.users(id, email) values (w, w || '@acerto.test'), (w2, w2 || '@acerto.test'), (m, m || '@acerto.test');
  insert into public.profiles(id, full_name) values (w, 'Ana'), (w2, 'Beto'), (m, 'Gerente') on conflict (id) do update set full_name = excluded.full_name;
  insert into public.user_roles(user_id, restaurant_id, role, is_active) values (w, r, 'waiter', true), (w2, r, 'waiter', true), (m, r, 'manager', true);
  update public.cash_register_sessions set status = 'closed', closed_at = now() where restaurant_id = r and status = 'open';
  insert into public.cash_register_sessions(restaurant_id, status, opened_at, opened_by, opening_balance, opening_cents, expected_balance, expected_cents)
    values (r, 'open', now(), 'x', 100, 10000, 180, 18000) returning id into sid;
  insert into _ctx values ('sid', sid);
  insert into public.cash_register_movements(session_id, type, amount, amount_cents, is_cash, actor_id, created_by, created_at)
    values (sid, 'sale', 50, 5000, true, w, 'Ana', now()), (sid, 'sale', 30, 3000, true, w2, 'Beto', now());
end $$;
grant select on _ctx to authenticated;
create function pg_temp.c(p_k text) returns uuid language sql as $$ select v from _ctx where k = p_k $$;
create function pg_temp.expected() returns bigint language sql security definer as $$ select expected_cents from public.cash_register_sessions where id = (select v from _ctx where k = 'sid') $$;
set local role authenticated;

do $$
declare j jsonb;
begin
  perform pg_temp.act(pg_temp.c('m'));
  j := public.restaurant_cash_team_in_hand(pg_temp.c('r'));
  assert jsonb_array_length(j) = 2, 'lista quem tem dinheiro: ' || j::text;
  assert not exists (select 1 from jsonb_array_elements(j) e where e->>'cents' is not null), 'o Gerente não vê valor: ' || j::text;
  perform pg_temp.act(pg_temp.c('own'));
  j := public.restaurant_cash_team_in_hand(pg_temp.c('r'));
  assert (select sum((e->>'cents')::bigint) from jsonb_array_elements(j) e) = 8000, 'o Dono vê: ' || j::text;
end $$;
select pass('o Gerente vê quem tem acerto a fazer, sem valor; o Dono vê o valor');

do $$
begin
  perform pg_temp.act(pg_temp.c('m'));
  perform public.restaurant_settle_staff_cash(pg_temp.c('r'), pg_temp.c('w'), 5000);
  perform pg_temp.act(pg_temp.c('w'));
  assert (public.restaurant_my_cash_in_hand(pg_temp.c('r'))->>'cents')::bigint = 0, 'zerou';
  perform pg_temp.act(pg_temp.c('w2'));
  assert (public.restaurant_my_cash_in_hand(pg_temp.c('r'))->>'cents')::bigint = 3000, 'o outro segue';
  assert pg_temp.expected() = 18000, 'valor certo não muda o esperado da gaveta';
end $$;
select pass('acerto certo zera só o saldo daquela pessoa e não muda o esperado');

do $$
declare ok boolean := false;
begin
  perform pg_temp.act(pg_temp.c('m'));
  begin perform public.restaurant_settle_staff_cash(pg_temp.c('r'), pg_temp.c('w'), 5000); exception when invalid_parameter_value then ok := true; end;
  assert ok, 'repetir é recusado';
end $$;
select pass('repetir o acerto é recusado');

do $$
declare ok boolean := false; j jsonb;
begin
  perform pg_temp.act(pg_temp.c('m'));
  begin perform public.restaurant_settle_staff_cash(pg_temp.c('r'), pg_temp.c('w2'), 2000); exception when invalid_parameter_value then ok := true; end;
  assert ok, 'diferença sem motivo é recusada';
  j := public.restaurant_settle_staff_cash(pg_temp.c('r'), pg_temp.c('w2'), 2000, 'faltou troco');
  assert (j->>'hasDifference')::boolean and j->>'differenceCents' is null, 'avisa da diferença, sem o valor: ' || j::text;
  assert pg_temp.expected() = 17000, 'a falta sai do esperado, para não virar quebra duas vezes: ' || pg_temp.expected();
  perform pg_temp.act(pg_temp.c('w2'));
  assert (public.restaurant_my_cash_in_hand(pg_temp.c('r'))->>'cents')::bigint = 0, 'zerou também';
end $$;
select pass('diferença exige motivo, ajusta o esperado e não revela o valor ao Gerente');

reset role;
select ok(exists (select 1 from public.audit_logs a where a.action = 'cash.staff_settled' and a.reason = 'faltou troco' and (a."after"->>'differenceCents')::bigint = -1000), 'o acerto grava autor, motivo e diferença');

set local role authenticated;
do $$
declare ok boolean := false;
begin
  perform pg_temp.act(pg_temp.c('w'));
  begin perform public.restaurant_settle_staff_cash(pg_temp.c('r'), pg_temp.c('w2'), 1); exception when insufficient_privilege then ok := true; end;
  assert ok, 'Garçom não acerta';
  ok := false;
  begin perform public.restaurant_cash_team_in_hand(pg_temp.c('r')); exception when insufficient_privilege then ok := true; end;
  assert ok, 'Garçom não vê a lista';
end $$;
select pass('Garçom não acerta nem vê a lista da equipe');

reset role;
do $$
begin
  perform set_config('request.jwt.claims', '', true);
  insert into public.user_roles(user_id, restaurant_id, role, is_active) values (pg_temp.c('m'), pg_temp.c('r'), 'waiter', true);
  insert into public.cash_register_movements(session_id, type, amount, amount_cents, is_cash, actor_id, created_by, created_at)
    values (pg_temp.c('sid'), 'sale', 10, 1000, true, pg_temp.c('m'), 'Gerente', now());
end $$;
set local role authenticated;
do $$
declare ok boolean := false;
begin
  perform pg_temp.act(pg_temp.c('m'));
  begin perform public.restaurant_settle_staff_cash(pg_temp.c('r'), pg_temp.c('m'), 1000); exception when insufficient_privilege then ok := true; end;
  assert ok, 'não acerta o próprio';
end $$;
select pass('Gerente que também recebeu não acerta o próprio dinheiro');
select * from finish();
rollback;
