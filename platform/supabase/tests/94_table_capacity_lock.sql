-- QA 2026-11-25 (invariante 7): lotação nunca silenciosa, nem pelo atalho de teste nem na corrida.
-- Concorrência real não cabe no pgTAP: conferimos que o lock da mesa vem antes da contagem
-- e que a entrada acima de tables.seats vira solicitação, em todos os caminhos.
begin;
select plan(7);

create temp table r94(label text primary key, ok boolean not null);

do $$
declare
  r uuid := 'c1000000-0000-4000-8000-000000000002';
  owner_id uuid := 'c1000000-0000-4000-8000-000000000001';
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid(); d uuid := gen_random_uuid();
  u uuid; qr text; v jsonb; tnum text := 'cap94-' || gen_random_uuid();
begin
  foreach u in array array[a, b, c, d] loop
    insert into auth.users(id, email) values (u, u || '@cap94.test');
    insert into public.profiles(id) values (u) on conflict do nothing;
  end loop;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', owner_id, 'role', 'authenticated')::text, true);
  perform public.restaurant_create_table(r, tnum, 2);
  select q.qr_code_data into qr from public.table_qr_codes q join public.tables t on t.id = q.table_id
    where t.restaurant_id = r and t.table_number = tnum and q.is_active limit 1;

  update private.dev_flags set enabled = true, updated_at = now() where key = 'simulate_table_scan';
  update public.restaurants set opening_hours = (
    select jsonb_object_agg(x, jsonb_build_object('closed', false,
      'shifts', jsonb_build_array(jsonb_build_object('open', '00:00', 'close', '23:59'))))
    from unnest(array['sunday','monday','tuesday','wednesday','thursday','friday','saturday']) x
  ) where id = r;
  update public.restaurant_model_configs
  set service_models = array['fine_dining','casual_dining']::public.noowe_service_model[],
      reservation_enabled = true, queue_enabled = true, enforce_table_capacity = true,
      capacity_request_ttl_min = 15
  where restaurant_id = r;
  delete from public.waitlist_entries where restaurant_id = r and status = 'waiting';

  -- Atalho de teste com grupo maior que a mesa: vira pedido de abertura, não comanda.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', d, 'role', 'authenticated')::text, true);
  v := public.customer_dev_check_in(qr, 'casual_dining', 3);
  insert into r94 values ('dev shortcut: party above seats becomes a pending request',
    v->>'status' = 'awaiting_capacity' and v->>'tableSessionId' is null
    and exists (select 1 from public.capacity_requests where id = (v->>'capacityRequestId')::uuid and status = 'pending'));

  perform set_config('request.jwt.claims', jsonb_build_object('sub', a, 'role', 'authenticated')::text, true);
  v := public.customer_check_in(qr, 'casual_dining', 1);
  insert into r94 values ('first QR check-in opens the table', v->>'tableSessionId' is not null);

  perform set_config('request.jwt.claims', jsonb_build_object('sub', b, 'role', 'authenticated')::text, true);
  v := public.customer_check_in(qr, 'casual_dining', 1);
  insert into r94 values ('second QR check-in takes the last seat', v->>'tableSessionId' is not null);

  perform set_config('request.jwt.claims', jsonb_build_object('sub', c, 'role', 'authenticated')::text, true);
  v := public.customer_check_in(qr, 'casual_dining', 1);
  insert into r94 values ('third QR check-in becomes a pending capacity request',
    v->>'status' = 'awaiting_capacity' and v->>'tableSessionId' is null
    and exists (select 1 from public.capacity_requests where id = (v->>'capacityRequestId')::uuid and status = 'pending'));

  perform set_config('request.jwt.claims', jsonb_build_object('sub', d, 'role', 'authenticated')::text, true);
  v := public.customer_dev_check_in(qr, 'casual_dining', 1);
  insert into r94 values ('dev shortcut join above seats becomes a pending request',
    v->>'status' = 'awaiting_capacity' and v->>'tableSessionId' is null);
end $$;

-- O lock da linha da mesa precisa vir antes da contagem de lugares ocupados.
insert into r94 select 'table_check_in locks the table row before counting seats',
  position('from public.tables where id=v_root for update' in s) > 0
  and position('from public.tables where id=v_root for update' in s) < position('sum(seat_count)' in s)
  from (select pg_get_functiondef('private.table_check_in(text,public.noowe_service_model,boolean,integer)'::regprocedure) s) f;
insert into r94 select 'join_by_invite locks the table row before counting seats',
  position('from public.tables where id = (select table_id' in s) > 0
  and position('from public.tables where id = (select table_id' in s) < position('sum(seat_count)' in s)
  from (select pg_get_functiondef('private.join_by_invite(uuid,uuid)'::regprocedure) s) f;

select ok(ok, label) from r94 order by label;
select * from finish();
rollback;
