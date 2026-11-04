-- Item G: a matriz de quem faz e quem vê, perfil por perfil, e o isolamento entre estabelecimentos.
begin;
select plan(9);
create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;
create function pg_temp.state_of(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok'; exception when sqlstate 'P0004' then return 'P0004'; when others then return sqlstate; end $$;
create temp table _ctx(k text primary key, v uuid);
create function pg_temp.ctx(p text) returns uuid language sql as $$ select v from _ctx where k = p $$;
-- Quantas linhas a pessoa enxerga lendo direto, como o app.
create function pg_temp.seen(p_uid uuid, p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  perform pg_temp.act(p_uid);
  set local role authenticated;
  execute 'select count(*) from ' || p_sql into n;
  reset role;
  return n;
exception when others then
  reset role;
  return 0;
end $$;
create function pg_temp.new_customer() returns uuid language plpgsql as $$
declare u uuid := gen_random_uuid();
begin
  insert into auth.users(id, email) values (u, u || '@g.test');
  insert into public.profiles(id) values (u) on conflict do nothing;
  return u;
end $$;
-- Negado é 42501. Qualquer outro desfecho, inclusive erro de negócio, passou da porta.
create function pg_temp.allowed(p_uid uuid, p_sql text) returns boolean language plpgsql as $$
begin
  perform pg_temp.act(p_uid);
  return pg_temp.state_of(p_sql) <> '42501';
end $$;

do $$
declare r uuid := 'c1000000-0000-4000-8000-000000000002'; dono uuid := 'c1000000-0000-4000-8000-000000000001'; o2 uuid := gen_random_uuid(); r2 uuid; papel text; u uuid;
begin
  insert into _ctx values ('r', r), ('owner', dono);
  perform pg_temp.act(dono);
  foreach papel in array array['manager','maitre','waiter','chef','cook','barman'] loop
    u := gen_random_uuid();
    insert into auth.users(id, email) values (u, u || '@g.test');
    insert into public.profiles(id) values (u) on conflict do nothing;
    insert into public.user_roles(user_id, restaurant_id, role, is_active) values (u, r, papel::public.user_roles_role_enum, true);
    insert into _ctx values (papel, u);
  end loop;
  u := gen_random_uuid();
  insert into auth.users(id, email) values (u, u || '@g.test');
  insert into public.profiles(id) values (u) on conflict do nothing;
  insert into _ctx values ('customer', u);
  -- Outro estabelecimento, com dono e gerente próprios.
  insert into auth.users(id, email) values (o2, o2 || '@g.test');
  insert into public.profiles(id) values (o2) on conflict do nothing;
  insert into public.restaurants(owner_id, name, address, city, state, zip_code, phone, email, service_type)
    values (o2, 'Outra casa', 'Rua', 'SP', 'SP', '01000-000', '11999999999', 'o@g.test', 'casual_dining') returning id into r2;
  perform pg_temp.act(o2);
  insert into public.user_roles(user_id, restaurant_id, role, is_active) values (o2, r2, 'owner', true) on conflict do nothing;
  insert into _ctx values ('r2', r2), ('owner2', o2);
end $$;

-- Quem configura: só o Dono.
do $$
declare r uuid := pg_temp.ctx('r'); papel text; v_call text;
begin
  foreach v_call in array array[
    format($q$select public.restaurant_get_plan_summary(%L)$q$, r), format($q$select public.restaurant_list_invoices(%L)$q$, r), format($q$select public.restaurant_get_credits(%L)$q$, r),
    format($q$select public.restaurant_get_payment_statement(%L)$q$, r), format($q$select public.restaurant_set_accepted_vouchers(%L, '{}')$q$, r),
    format($q$select public.restaurant_set_convenience_absorbed(%L, false)$q$, r)] loop
    assert pg_temp.allowed(pg_temp.ctx('owner'), v_call), 'Dono: ' || v_call;
    foreach papel in array array['manager','maitre','waiter','chef','cook','barman','customer'] loop
      assert not pg_temp.allowed(pg_temp.ctx(papel), v_call), papel || ' não pode: ' || v_call;
    end loop;
  end loop;
end $$;
select pass('só o Dono: plano, faturas, créditos em R$, extrato com a taxa, vales aceitos e conveniência');

-- Dono e Gerente.
do $$
declare r uuid := pg_temp.ctx('r'); papel text; v_call text;
begin
  foreach v_call in array array[
    format($q$select public.restaurant_get_charge_policies(%L)$q$, r), format($q$select public.restaurant_get_tip_rules(%L)$q$, r), format($q$select public.restaurant_get_cash_settings(%L)$q$, r),
    format($q$select public.restaurant_get_credit_index(%L)$q$, r), format($q$select public.restaurant_upsert_coupon(%L, '{}')$q$, r)] loop
    assert pg_temp.allowed(pg_temp.ctx('owner'), v_call), 'Dono: ' || v_call;
    assert pg_temp.allowed(pg_temp.ctx('manager'), v_call), 'Gerente: ' || v_call;
    foreach papel in array array['maitre','waiter','chef','cook','barman','customer'] loop
      assert not pg_temp.allowed(pg_temp.ctx(papel), v_call), papel || ' não pode: ' || v_call;
    end loop;
  end loop;
end $$;
select pass('Dono e Gerente: taxa e gorjeta, rateio, caixa, índice e cupons');

-- Cobrar e registrar: Garçom (mesas dele), Maître e Gerente. Chef, Cozinheiro e Barman não abrem a conta da mesa.
do $$
declare r uuid := pg_temp.ctx('r'); tbl jsonb; sid uuid; papel text; g2 uuid := gen_random_uuid(); bills jsonb; oid uuid; m uuid; c uuid := pg_temp.new_customer();
begin
  perform pg_temp.act(pg_temp.ctx('owner'));
  insert into auth.users(id, email) values (g2, g2 || '@g.test');
  insert into public.profiles(id) values (g2) on conflict do nothing;
  insert into public.user_roles(user_id, restaurant_id, role, is_active) values (g2, r, 'waiter', true);
  tbl := public.restaurant_create_table(r, 'g-' || gen_random_uuid(), 4);
  update public.tables set assigned_waiter_id = pg_temp.ctx('waiter') where id = (tbl->>'id')::uuid;
  perform pg_temp.act(c);
  sid := (public.customer_open_table_session(tbl->>'qr_code')->>'tableSessionId')::uuid;
  select id into m from public.menu_items where restaurant_id = r limit 1;
  insert into public.orders(restaurant_id, customer_id, table_session_id, table_id) values (r, c, sid, (tbl->>'id')::uuid) returning id into oid;
  -- Quem pode ver a conta
  foreach papel in array array['owner','manager','maitre','waiter'] loop
    assert pg_temp.allowed(pg_temp.ctx(papel), format($q$select public.restaurant_get_session_bill(%L)$q$, sid)), papel || ' vê a conta';
  end loop;
  foreach papel in array array['chef','cook','barman','customer'] loop
    assert not pg_temp.allowed(pg_temp.ctx(papel), format($q$select public.restaurant_get_session_bill(%L)$q$, sid)), papel || ' não vê a conta';
    assert not pg_temp.allowed(pg_temp.ctx(papel), format($q$select public.restaurant_record_bill_payment(%L, 'cash', %L)$q$, sid, gen_random_uuid())), papel || ' não cobra';
  end loop;
  -- Mesa de outro garçom
  assert not pg_temp.allowed(g2, format($q$select public.restaurant_get_session_bill(%L)$q$, sid)), 'outro garçom não abre a conta';
  assert not pg_temp.allowed(g2, format($q$select public.restaurant_record_bill_payment(%L, 'cash', %L)$q$, sid, gen_random_uuid())), 'outro garçom não cobra';
  assert pg_temp.seen(g2, format('public.bill_shares where table_session_id = %L', sid)) = 0, 'nem pela tabela';
  perform pg_temp.act(g2);
  bills := public.restaurant_get_table_bills(r);
  assert not exists (select 1 from jsonb_array_elements(bills) x where (x->>'table_id')::uuid = (tbl->>'id')::uuid), 'nem na lista';
end $$;
select pass('cobrar: Garçom nas mesas dele, Maître e Gerente; a cozinha não abre a conta');

-- O que cada um vê do pagamento.
do $$
declare r uuid := pg_temp.ctx('r'); sid uuid; tbl jsonb; oid uuid; papel text; j jsonb; m uuid; c uuid := pg_temp.new_customer();
begin
  perform pg_temp.act(pg_temp.ctx('owner'));
  tbl := public.restaurant_create_table(r, 'g-' || gen_random_uuid(), 4);
  update public.tables set assigned_waiter_id = pg_temp.ctx('waiter') where id = (tbl->>'id')::uuid;
  perform pg_temp.act(c);
  sid := (public.customer_open_table_session(tbl->>'qr_code')->>'tableSessionId')::uuid;
  select id into m from public.menu_items where restaurant_id = r limit 1;
  insert into public.orders(restaurant_id, customer_id, table_session_id, table_id) values (r, c, sid, (tbl->>'id')::uuid) returning id into oid;
  insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price, total_price_cents) values (oid, m, 1, 100, 100, 10000);
  perform pg_temp.act(pg_temp.ctx('waiter'));
  perform public.restaurant_record_bill_payment(sid, 'cash', gen_random_uuid(), 2000);
  -- Maître: status, sem valor.
  perform pg_temp.act(pg_temp.ctx('maitre'));
  j := public.restaurant_get_session_bill(sid);
  assert jsonb_array_length(j->'payers') = 1 and j->'payers'->0->>'baseCents' is null, 'maître não vê o valor de cada pagamento';
  assert (select x->>'total_amount' from jsonb_array_elements(public.restaurant_get_table_bills(r)) x where x->>'order_id' = oid::text) is null, 'nem na lista das mesas';
  assert exists (select 1 from jsonb_array_elements(public.restaurant_get_table_bills(r)) x where x->>'order_id' = oid::text), 'mas vê a mesa';
  -- Garçom: quem pagou, quanto e como.
  perform pg_temp.act(pg_temp.ctx('waiter'));
  j := public.restaurant_get_session_bill(sid);
  assert (j->'payers'->0->>'baseCents')::bigint = 2000, 'garçom vê o valor';
  -- Ninguém lê a tabela de pagamentos: é onde está a taxa NOOWE.
  foreach papel in array array['owner','manager','maitre','waiter','chef','cook','barman','customer'] loop
    assert pg_temp.seen(pg_temp.ctx(papel), format('public.gateway_transactions where restaurant_id = %L', r)) = 0, papel || ' não lê a tabela de pagamentos';
  end loop;
  -- A cozinha não lê nada de dinheiro.
  foreach papel in array array['chef','cook','barman'] loop
    assert pg_temp.seen(pg_temp.ctx(papel), format('public.bill_shares where restaurant_id = %L', r)) = 0, papel || ': contas';
    assert pg_temp.seen(pg_temp.ctx(papel), format('public.approvals where restaurant_id = %L', r)) = 0, papel || ': aprovações';
    assert pg_temp.seen(pg_temp.ctx(papel), format('public.cash_register_sessions where restaurant_id = %L', r)) = 0, papel || ': caixa';
    assert pg_temp.seen(pg_temp.ctx(papel), format('public.fiscal_documents where restaurant_id = %L', r)) = 0, papel || ': notas';
    assert pg_temp.seen(pg_temp.ctx(papel), format('public.tip_distributions where restaurant_id = %L', r)) = 0, papel || ': rateio';
  end loop;
  -- Gerente: sem faturas, sem assinatura.
  assert pg_temp.seen(pg_temp.ctx('manager'), format('public.subscription_invoices where restaurant_id = %L', r)) = 0, 'gerente não lê faturas';
  assert pg_temp.seen(pg_temp.ctx('manager'), format('public.restaurant_subscriptions where restaurant_id = %L', r)) = 0, 'gerente não lê a assinatura';
  assert pg_temp.seen(pg_temp.ctx('manager'), format('public.restaurant_payment_accounts where restaurant_id = %L', r)) = 0, 'gerente não lê a subconta';
end $$;
select pass('o que cada perfil vê do pagamento, e a tabela com a taxa NOOWE fechada para todos');

-- Toda a tripulação vê a própria gorjeta; ninguém vê a dos outros.
do $$
declare r uuid := pg_temp.ctx('r'); papel text;
begin
  foreach papel in array array['maitre','waiter','chef','cook','barman'] loop
    assert pg_temp.allowed(pg_temp.ctx(papel), format($q$select public.restaurant_my_tips(%L)$q$, r)), papel || ': Minha gorjeta';
    assert not pg_temp.allowed(pg_temp.ctx(papel), format($q$select public.restaurant_tip_report(%L, %L)$q$, r, gen_random_uuid())), papel || ': rateio da equipe';
  end loop;
end $$;
select pass('Minha gorjeta para todos; o rateio da equipe, só para Dono e Gerente');

-- O rastro não se apaga, e aprovação não se resolve pela tabela.
do $$
declare r uuid := pg_temp.ctx('r'); gerente uuid := pg_temp.ctx('manager'); a uuid; n int; log uuid := gen_random_uuid();
begin
  insert into public.audit_logs(id, user_id, restaurant_id, action, entity_type, success, created_at) values (log, gerente, r, 'g.test', 'test', true, now());
  perform pg_temp.act(gerente);
  set local role authenticated;
  begin delete from public.audit_logs where id = log; get diagnostics n = row_count; exception when insufficient_privilege then n := 0; end;
  assert n = 0, 'ninguém apaga o próprio rastro';
  begin update public.audit_logs set action = 'x' where id = log; get diagnostics n = row_count; exception when insufficient_privilege then n := 0; end;
  assert n = 0, 'nem altera';
  begin
    insert into public.audit_logs(user_id, restaurant_id, action, entity_type, success, created_at) values (gerente, r, 'forjado', 'test', true, now());
    n := 1;
  exception when insufficient_privilege then n := 0;
  end;
  assert n = 0, 'nem forja';
  begin update public.approvals set status = 'approved' where restaurant_id = r; get diagnostics n = row_count; exception when insufficient_privilege then n := 0; end;
  assert n = 0, 'aprovação só pela função, que recusa o próprio pedido';
  reset role;
end $$;
select pass('o rastro não se apaga nem se forja, e aprovação só pela função');

-- Incentivo do garçom: percentual, sem valores.
do $$
declare r uuid := pg_temp.ctx('r'); sid uuid; tbl jsonb; oid uuid; m uuid; j jsonb; c uuid := pg_temp.new_customer(); d public.operational_days;
begin
  perform pg_temp.act(pg_temp.ctx('owner'));
  d := private.operational_day_current(r);
  tbl := public.restaurant_create_table(r, 'g-' || gen_random_uuid(), 4);
  update public.tables set assigned_waiter_id = pg_temp.ctx('waiter') where id = (tbl->>'id')::uuid;
  perform pg_temp.act(c);
  sid := (public.customer_open_table_session(tbl->>'qr_code')->>'tableSessionId')::uuid;
  select id into m from public.menu_items where restaurant_id = r limit 1;
  insert into public.orders(restaurant_id, customer_id, table_session_id, table_id) values (r, c, sid, (tbl->>'id')::uuid) returning id into oid;
  insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price, total_price_cents) values (oid, m, 1, 100, 100, 10000);
  perform pg_temp.act(pg_temp.ctx('waiter'));
  perform public.restaurant_record_bill_payment(sid, 'cash', gen_random_uuid(), 2500);
  j := public.restaurant_my_app_share(r);
  assert (j->>'percent')::int = 0 and (select count(*) from jsonb_object_keys(j)) = 1, 'só o percentual: ' || j;
  update public.gateway_transactions g set provider = 'asaas' from public.bill_shares b where b.restaurant_id = r and g.id = b.payment_id and g.provider = 'manual';
  assert (public.restaurant_my_app_share(r)->>'percent')::int = 100, 'tudo pelo app';
  assert not pg_temp.allowed(pg_temp.ctx('cook'), format($q$select public.restaurant_my_app_share(%L)$q$, r)), 'só o garçom';
end $$;
select pass('garçom vê o percentual das mesas dele pagas pelo app, sem valores');

-- Entre estabelecimentos: nada do outro restaurante chega por função ou por tabela.
do $$
declare r uuid := pg_temp.ctx('r'); o2 uuid := pg_temp.ctx('owner2'); v_call text; t record; n bigint; v_leak text[] := '{}';
  -- Vitrine do app: o cliente vê sem precisar de vínculo.
  v_public text[] := array['restaurants','restaurant_model_configs','restaurant_model_policies','restaurant_service_configs','menu_categories','menu_items','reviews','promotions','restaurant_photos','restaurant_hours','business_hours','service_configs','restaurant_operating_hours','tables','restaurant_profiles','qr_codes','table_qr_codes'];
begin
  foreach v_call in array array[
    format($q$select public.restaurant_get_plan_summary(%L)$q$, r), format($q$select public.restaurant_get_payment_statement(%L)$q$, r), format($q$select public.restaurant_list_coupons(%L)$q$, r),
    format($q$select public.restaurant_get_table_bills(%L)$q$, r), format($q$select public.restaurant_get_cash_settings(%L)$q$, r), format($q$select public.restaurant_get_credits(%L)$q$, r),
    format($q$select public.restaurant_get_tip_rules(%L)$q$, r), format($q$select public.restaurant_my_app_share(%L)$q$, r)] loop
    assert not pg_temp.allowed(o2, v_call), 'dono de outra casa: ' || v_call;
  end loop;
  for t in select c.table_name from information_schema.columns c join pg_class k on k.relname = c.table_name and k.relnamespace = 'public'::regnamespace and k.relkind = 'r'
      where c.table_schema = 'public' and c.column_name = 'restaurant_id' order by 1 loop
    if not t.table_name = any(v_public) then
      n := pg_temp.seen(o2, format('public.%I where restaurant_id = %L', t.table_name, r));
      if n > 0 then v_leak := v_leak || t.table_name; end if;
    end if;
  end loop;
  assert cardinality(v_leak) = 0, 'o dono de outra casa lê: ' || array_to_string(v_leak, ', ');
end $$;
select pass('entre estabelecimentos: nada chega ao dono de outra casa, por função ou por tabela');

-- Invariante 9: nenhuma tabela de negócio sem RLS.
select is((select string_agg(c.relname, ', ') from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and not c.relrowsecurity), null, 'RLS ligado em toda tabela');

select * from finish();
rollback;
