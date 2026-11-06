-- Respostas 62 e 81 (05/11/2026): comanda reaberta ganha NFC-e só do acréscimo; sem NFC-e no plano, nada bloqueia e o Dono exporta o dia.
begin;
select plan(4);

create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;
create function pg_temp.state_of(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok'; exception when sqlstate 'P0004' then return 'P0004'; when others then return sqlstate; end $$;

create temp table _ctx(k text primary key, v uuid);
create function pg_temp.ctx(p text) returns uuid language sql as $$ select v from _ctx where k = p $$;

-- Pagamento real concluído, ligado a uma comanda de duas pessoas já paga por inteiro.
create function pg_temp.new_paid(p_label text) returns uuid language plpgsql as $$
declare
  r uuid := 'c1000000-0000-4000-8000-000000000002'; owner_id uuid := 'c1000000-0000-4000-8000-000000000001';
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); tbl jsonb; sid uuid; menu uuid; o uuid; sh public.bill_shares; tx public.gateway_transactions; pid uuid; u uuid;
begin
  insert into auth.users(id, email) values (a, a || '@refund.test'), (b, b || '@refund.test');
  insert into public.profiles(id) values (a), (b) on conflict do nothing;
  perform pg_temp.act(owner_id);
  tbl := public.restaurant_create_table(r, 'test-refund-' || a, 4);
  select id into menu from public.menu_items where restaurant_id = r limit 1;
  perform pg_temp.act(a); sid := (public.customer_open_table_session(tbl->>'qr_code')->>'tableSessionId')::uuid;
  perform pg_temp.act(b); perform public.customer_open_table_session(tbl->>'qr_code');
  insert into public.orders(restaurant_id, customer_id, table_session_id) values (r, a, sid) returning id into o;
  insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price) values (o, menu, 3, 20, 60);
  perform pg_temp.act(a);
  perform public.customer_bill_split_commit(sid, 'equal', '{}', null, gen_random_uuid());
  foreach u in array array[a, b] loop
    select id into pid from public.table_session_participants where table_session_id = sid and user_id = u;
    select * into sh from public.bill_shares where table_session_id = sid and participant_id = pid and status = 'open';
    tx := private.reserve_share_payment(u, sh.id, 'pix', 0, gen_random_uuid(), 'asaas');
    update public.gateway_transactions set provider_ref = 'pay_' || tx.id where id = tx.id;
    perform private.apply_payment_event(tx.id, 'asaas', 'evt-' || tx.id, 'PAYMENT_RECEIVED', 'confirmed', tx.amount_cents);
    insert into _ctx values (p_label || ':tx:' || (case when u = a then 'a' else 'b' end), tx.id), (p_label || ':' || (case when u = a then 'a' else 'b' end), u);
  end loop;
  insert into _ctx values (p_label || ':sid', sid);
  return sid;
end $$;

do $$
declare r uuid := 'c1000000-0000-4000-8000-000000000002'; m uuid := gen_random_uuid();
begin
  insert into public.restaurant_payment_accounts(restaurant_id, provider, status) values (r, 'asaas', 'active') on conflict do nothing;
  update public.restaurant_payment_accounts set status = 'active' where restaurant_id = r;
  update public.restaurant_model_policies set fee_or_tip_mode = 'service_fee', service_fee_bps = 1000, split_modes = '{by_owner,equal,by_item,fixed_amount}'
    where restaurant_id = r and not prepaid_required;
  insert into auth.users(id, email) values (m, m || '@refund.test');
  insert into public.profiles(id) values (m) on conflict do nothing;
  insert into public.user_roles(user_id, restaurant_id, role, is_active) values (m, r, 'manager', true);
  insert into _ctx values ('manager', m), ('owner', 'c1000000-0000-4000-8000-000000000001');
  perform pg_temp.new_paid('main');
end $$;

do $$
declare sid uuid := pg_temp.ctx('main:sid'); d public.fiscal_documents; r uuid := 'c1000000-0000-4000-8000-000000000002';
begin
  delete from public.restaurant_subscriptions where restaurant_id = r;
  if not exists (select 1 from public.fiscal_documents where table_session_id = sid) then perform private.fiscal_enqueue_session(sid); end if;
  select * into d from public.fiscal_documents where table_session_id = sid and external_ref = 's-' || sid;
  assert d.id is not null and jsonb_array_length(d.snapshot->'lines') = 1, 'primeira nota com o item da comanda';
  insert into _ctx values ('doc1', d.id);
end $$;
select pass('a comanda fechada tem a nota dela');

do $$
declare sid uuid := pg_temp.ctx('main:sid'); r uuid := 'c1000000-0000-4000-8000-000000000002'; menu uuid; o uuid; d public.fiscal_documents; v uuid;
begin
  -- Reaberta: acrescenta a sobremesa.
  update public.table_sessions set reopened_count = reopened_count + 1, reopened_at = now() where id = sid;
  select id into menu from public.menu_items where restaurant_id = r limit 1;
  insert into public.orders(restaurant_id, customer_id, table_session_id) values (r, pg_temp.ctx('main:a'), sid) returning id into o;
  insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price) values (o, menu, 1, 15, 15);
  v := private.fiscal_enqueue_session(sid);
  select * into d from public.fiscal_documents where id = v;
  assert d.external_ref = 's-' || sid || '-r' || (select reopened_count from public.table_sessions where id = sid), 'nota nova, com referência própria: ' || coalesce(d.external_ref, '-');
  assert jsonb_array_length(d.snapshot->'lines') = 1 and (d.snapshot->'lines'->0->>'grossCents')::bigint = 1500 and d.total_cents = 1500, 'só o acréscimo: ' || d.snapshot::text;
  assert (select status from public.fiscal_documents where id = pg_temp.ctx('doc1')) <> 'failed', 'a primeira continua';
  assert private.fiscal_enqueue_session(sid) is null, 'repetir não gera terceira';
end $$;
select pass('comanda reaberta: nova NFC-e só com os itens acrescentados, e a nota emitida continua valendo');

do $$
declare j jsonb; r uuid := 'c1000000-0000-4000-8000-000000000002'; day date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  perform pg_temp.act(pg_temp.ctx('owner'));
  j := public.restaurant_export_fiscal_sales(r, day);
  assert jsonb_array_length(j) >= 2 and exists (select 1 from jsonb_array_elements(j) x where (x->>'grossCents')::bigint = 1500), 'vendas do dia: ' || left(j::text, 200);
  perform pg_temp.act(pg_temp.ctx('manager'));
  assert pg_temp.state_of(format($q$select public.restaurant_export_fiscal_sales(%L, %L)$q$, r, day)) = '42501', 'só o Dono';
end $$;
select pass('o Dono exporta as vendas do dia com itens e pagamentos; o Gerente não');

do $$
declare r uuid := 'c1000000-0000-4000-8000-000000000002'; d uuid := gen_random_uuid();
begin
  insert into public.restaurant_subscriptions(restaurant_id, plan_code, billing_cycle, status, current_period_start, current_period_end)
    values (r, 'essencial', 'monthly', 'active', now() - interval '1 day', now() + interval '29 days');
  insert into public.fiscal_documents(id, restaurant_id, order_id, external_ref, total_cents, status)
    values (d, r, null, 'x-' || d, 1000, 'pending');
  assert (select status from public.fiscal_documents where id = d) = 'external', 'plano sem NFC-e: nota do sistema do restaurante';
  assert (select error_message from public.fiscal_documents where id = d) = 'Nota fiscal emitida pelo sistema do restaurante', 'com o texto';
end $$;
select pass('plano sem NFC-e: a nota é do sistema do restaurante, sem bloqueio');
select * from finish();
rollback;
