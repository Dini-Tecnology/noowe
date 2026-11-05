-- Aditivo item G: só o Dono muda os métodos de pagamento aceitos; o Gerente continua editando o resto.
begin;
select plan(3);
create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;
create temp table _ctx(k text primary key, v uuid);
do $$
declare r uuid := 'c1000000-0000-4000-8000-000000000002'; m uuid := gen_random_uuid();
begin
  insert into _ctx values ('r', r), ('dono', 'c1000000-0000-4000-8000-000000000001'), ('gerente', m);
  insert into auth.users(id, email) values (m, m || '@metodos.test');
  insert into public.profiles(id) values (m) on conflict do nothing;
  insert into public.user_roles(user_id, restaurant_id, role, is_active) values (m, r, 'manager', true);
end $$;
grant select on _ctx to authenticated;
set local role authenticated;

do $$
declare r uuid := (select v from _ctx where k='r'); v_ok boolean := false;
begin
  perform pg_temp.act((select v from _ctx where k='gerente'));
  begin
    perform public.restaurant_update_profile(r, '{"settings":{"payment_methods":{"pix":false}}}'::jsonb);
  exception when sqlstate '42501' then v_ok := true; end;
  assert v_ok, 'Gerente não pode mudar os métodos aceitos';
end $$;
select pass('Gerente é recusado ao mudar métodos aceitos');

do $$
declare r uuid := (select v from _ctx where k='r'); s jsonb;
begin
  perform pg_temp.act((select v from _ctx where k='gerente'));
  select settings into s from public.restaurants where id = r;
  perform public.restaurant_update_profile(r, jsonb_build_object('phone', '11999990000',
    'settings', coalesce(s, '{}'::jsonb)));
  -- Taxa e gorjeta moram no mesmo bloco e seguem com o Gerente.
  perform public.restaurant_update_profile(r, jsonb_build_object('settings', jsonb_set(coalesce(s, '{}'::jsonb),
    '{payment_methods,tipsEnabled}', 'false'::jsonb, true)));
end $$;
select pass('Gerente segue editando o resto do perfil, com os métodos como estavam');

do $$
declare r uuid := (select v from _ctx where k='r'); n int;
begin
  perform pg_temp.act((select v from _ctx where k='dono'));
  perform public.restaurant_update_profile(r, '{"settings":{"payment_methods":{"pix":true}}}'::jsonb);
  select count(*) into n from public.audit_logs where restaurant_id = r and action = 'payment_methods_changed'
    and user_id = (select v from _ctx where k='dono');
  assert n = 1, 'Dono muda e deixa rastro: ' || n;
end $$;
select pass('Dono muda os métodos aceitos e a mudança fica na auditoria');
select * from finish();
rollback;
