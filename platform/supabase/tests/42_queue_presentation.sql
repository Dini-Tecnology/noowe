-- G4 / ADR-021 + ADR-002 — porta Fila: prazo para se apresentar; 1ª falta recua, 2ª tira da fila.
begin;
select plan(1);
do $$
declare
  r uuid := 'c1000000-0000-4000-8000-000000000002';
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  ea uuid; eb uuid; row_a public.waitlist_entries; pos_a integer; pos_b integer; st_a text; miss_a integer;
begin
  insert into auth.users(id,email) values (a,a||'@queue.test'),(b,b||'@queue.test');
  insert into public.profiles(id) values (a),(b) on conflict do nothing;
  insert into public.restaurant_model_configs(restaurant_id, service_models) values (r, '{casual_dining}') on conflict (restaurant_id) do nothing;
  update public.restaurant_model_configs set queue_call_tolerance_min = 8 where restaurant_id = r;
  delete from public.waitlist_entries where restaurant_id = r;
  insert into public.waitlist_entries(restaurant_id, customer_id, party_size, status, customer_name, position)
    values (r, a, 2, 'waiting', 'A', 1) returning id into ea;
  insert into public.waitlist_entries(restaurant_id, customer_id, party_size, status, customer_name, position)
    values (r, b, 2, 'waiting', 'B', 2) returning id into eb;

  -- Chamar define o prazo a partir da tolerância configurada.
  update public.waitlist_entries set status = 'called' where id = ea;
  select * into row_a from public.waitlist_entries where id = ea;
  assert row_a.present_until is not null and row_a.present_until > now() + interval '7 minutes'
    and row_a.present_until < now() + interval '9 minutes', 'prazo = chamada + tolerância';

  -- Dentro do prazo, a leitura não mexe.
  perform set_config('request.jwt.claims', jsonb_build_object('sub',a,'role','authenticated')::text,true);
  perform public.customer_my_waitlist();
  assert (select status::text from public.waitlist_entries where id = ea) = 'called', 'dentro do prazo continua chamado';

  -- 1ª falta: volta a esperar uma posição abaixo (troca com o próximo).
  update public.waitlist_entries set present_until = now() - interval '1 minute' where id = ea;
  perform public.customer_my_waitlist();
  select status::text, position, missed_calls into st_a, pos_a, miss_a from public.waitlist_entries where id = ea;
  select position into pos_b from public.waitlist_entries where id = eb;
  assert st_a = 'waiting' and miss_a = 1 and pos_a > pos_b, '1ª falta recua uma posição';

  -- 2ª falta: sai da fila.
  update public.waitlist_entries set status = 'called' where id = ea;
  update public.waitlist_entries set present_until = now() - interval '1 minute' where id = ea;
  perform public.customer_my_waitlist();
  assert (select status::text from public.waitlist_entries where id = ea) = 'no_show', '2ª falta tira da fila';
end $$;
select pass('fila: prazo de apresentação, 1ª falta recua, 2ª sai (ADR-002)');
select * from finish();
rollback;
