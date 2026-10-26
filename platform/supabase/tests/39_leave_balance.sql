-- G4 / ADR-021 — sair da mesa só sem consumo ou com a parte da pessoa paga; saldo por pessoa.
begin;
select plan(1);
do $$
declare
  r uuid := 'c1000000-0000-4000-8000-000000000002';
  owner_id uuid := 'c1000000-0000-4000-8000-000000000001';
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  t jsonb; sid uuid; menu uuid; o uuid; bal jsonb;
begin
  insert into auth.users(id,email) values (a,a||'@bal.test'),(b,b||'@bal.test');
  insert into public.profiles(id) values (a),(b) on conflict do nothing;
  select id into menu from public.menu_items where restaurant_id = r limit 1;
  perform set_config('request.jwt.claims', jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
  t := public.restaurant_create_table(r, 'bal-'||a, 4);

  perform set_config('request.jwt.claims', jsonb_build_object('sub',a,'role','authenticated')::text,true);
  sid := (public.customer_open_table_session(t->>'qr_code')->>'tableSessionId')::uuid;
  perform set_config('request.jwt.claims', jsonb_build_object('sub',b,'role','authenticated')::text,true);
  perform public.customer_open_table_session(t->>'qr_code');

  -- Sem consumo: saldo zero e pode sair.
  bal := public.customer_my_table_balance(sid);
  assert (bal->>'owedCents')::bigint = 0 and not (bal->>'hasConsumption')::boolean, 'sem consumo não deve nada';

  -- Com consumo: saldo > 0, só da própria pessoa, e sair é recusado (P0004).
  insert into public.orders(restaurant_id,customer_id,table_session_id) values(r,b,sid) returning id into o;
  insert into public.order_items(order_id,menu_item_id,quantity,unit_price,total_price) values(o,menu,1,20,20);
  bal := public.customer_my_table_balance(sid);
  assert (bal->>'owedCents')::bigint > 0 and (bal->>'hasConsumption')::boolean, 'consumo gera saldo';
  begin
    perform public.customer_leave_table_session(sid);
    raise exception 'saiu com saldo em aberto';
  exception when sqlstate 'P0004' then null; end;

  perform set_config('request.jwt.claims', jsonb_build_object('sub',a,'role','authenticated')::text,true);
  assert (public.customer_my_table_balance(sid)->>'owedCents')::bigint = 0, 'quem não consumiu não deve a parte do outro';
  perform public.customer_leave_table_session(sid);

  -- Visita ativa expõe o necessário para o app se reconstruir.
  perform set_config('request.jwt.claims', jsonb_build_object('sub',b,'role','authenticated')::text,true);
  assert public.customer_get_active_visit() ? 'restaurantName', 'visita ativa traz o nome do restaurante';
end $$;
select pass('saldo por pessoa: sair exige parte quitada; get_active_visit traz o contexto');
select * from finish();
rollback;
