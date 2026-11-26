-- QA 25/11/2026 — EQ-07: a escala de hoje, gravada como 00:00 UTC, aparece hoje para todos.
begin;
select plan(3);
create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;
create temp table _ctx(k text primary key, v uuid);
create function pg_temp.ctx(p text) returns uuid language sql as $$ select v from _ctx where k = p $$;
do $$
declare r uuid := 'c1000000-0000-4000-8000-000000000002'; u uuid := gen_random_uuid();
  today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  insert into auth.users(id, email) values (u, u || '@esc97.test');
  insert into public.profiles(id, full_name) values (u, 'Garçom 97') on conflict (id) do nothing;
  insert into public.user_roles(user_id, restaurant_id, role, is_active) values (u, r, 'waiter', true);
  insert into _ctx values ('r', r), ('garcom', u);
  delete from public.shifts where restaurant_id = r and private.shift_day(date) = today;
  -- Como o app grava: a data de hoje às 00:00 UTC (21:00 de ontem em São Paulo).
  insert into public.shifts(staff_id, restaurant_id, date, start_time, end_time, role, status, is_overtime, created_at, updated_at)
    values (u, r, (today::text || ' 00:00+00')::timestamptz, '10:00', '18:00', 'waiter', 'scheduled', false, now(), now());
end $$;

select pg_temp.act(pg_temp.ctx('garcom'));
select is(jsonb_array_length(public.restaurant_get_my_shifts(pg_temp.ctx('r'))), 1, 'a pessoa vê o turno de hoje');
select pg_temp.act('c1000000-0000-4000-8000-000000000001');
select ok(exists (select 1 from jsonb_array_elements(public.restaurant_get_day_team_shifts(pg_temp.ctx('r'), 'floor')) x where (x->>'staff_id')::uuid = pg_temp.ctx('garcom')),
  'a escala do salão de hoje traz o turno');
select ok(exists (select 1 from jsonb_array_elements(public.restaurant_get_shifts(pg_temp.ctx('r'),
    date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo',
    date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' + interval '1 day')) x where (x->>'staff_id')::uuid = pg_temp.ctx('garcom')),
  'a escala de hoje do Gerente traz o turno');
select * from finish();
rollback;
