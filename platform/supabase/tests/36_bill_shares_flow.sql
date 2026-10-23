-- G3 #3 a #7 + critério de propriedade nos 4 modos sobre uma sessão real:
-- pagamento parcial mantém a mesa aberta, só o saldo zero encerra, abandono redistribui,
-- walk-out alerta o gerente, reabertura não estorna sozinha.
begin;
select plan(3);

create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;
create function pg_temp.state_of(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok'; exception when others then return sqlstate; end $$;
create function pg_temp.live_sum(p_sid uuid) returns bigint language sql as $$
  select coalesce(sum(amount_cents), 0) from public.bill_shares
  where table_session_id = p_sid and status in ('open', 'pending_payment', 'paid') $$;
create function pg_temp.over_covered(p_sid uuid) returns int language sql as $$
  select count(*)::int from private.session_balances(p_sid) b
  where (select coalesce(sum(bl.base_cents), 0) from public.bill_share_lines bl
         join public.bill_shares s on s.id = bl.bill_share_id
         where bl.order_item_id = b.order_item_id and s.status in ('open', 'pending_payment', 'paid')) > b.open_cents $$;

create temp table _ctx(k text primary key, v uuid);

-- Sessão com A (anfitrião) e B; três itens: de A (R$20), de B (R$30) e sem dono (R$10).
do $$
declare
  r uuid := 'c1000000-0000-4000-8000-000000000002';
  owner_id uuid := 'c1000000-0000-4000-8000-000000000001';
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  tbl jsonb; visit jsonb; sid uuid; menu uuid; o1 uuid; pa uuid; pb uuid;
begin
  insert into auth.users(id, email) values (a, a || '@bill-shares.test'), (b, b || '@bill-shares.test');
  insert into public.profiles(id) values (a), (b) on conflict do nothing;
  perform pg_temp.act(owner_id);
  tbl := public.restaurant_create_table(r, 'test-shares-' || a, 4);
  select id into menu from public.menu_items where restaurant_id = r limit 1;
  perform pg_temp.act(a);
  visit := public.customer_open_table_session(tbl->>'qr_code');
  sid := (visit->>'tableSessionId')::uuid;
  perform pg_temp.act(b);
  perform public.customer_open_table_session(tbl->>'qr_code');
  select id into pa from public.table_session_participants where table_session_id = sid and user_id = a;
  select id into pb from public.table_session_participants where table_session_id = sid and user_id = b;
  insert into public.orders(restaurant_id, customer_id, table_session_id) values (r, a, sid) returning id into o1;
  insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price, diner_id) values
    (o1, menu, 1, 20, 20, pa), (o1, menu, 1, 30, 30, pb), (o1, menu, 1, 10, 10, null);
  insert into _ctx values ('r', r), ('owner', owner_id), ('a', a), ('b', b), ('sid', sid), ('pa', pa), ('pb', pb), ('o1', o1), ('menu', menu), ('table', (tbl->>'id')::uuid);
end $$;

-- Fluxo: 4 modos, versão velha, idempotência, pagamento parcial, trava de fechamento.
do $$
declare
  sid uuid := (select v from _ctx where k = 'sid'); a uuid := (select v from _ctx where k = 'a'); b uuid := (select v from _ctx where k = 'b');
  pa uuid := (select v from _ctx where k = 'pa'); pb uuid := (select v from _ctx where k = 'pb');
  total bigint; prev jsonb; key uuid := gen_random_uuid(); sh public.bill_shares; res jsonb; i2 uuid;
begin
  select total_all into total from private.session_totals(sid);
  assert total = 6000 + private.service_fee_cents(6000, private.session_fee_bps(sid)), 'total = base + taxa calculada uma vez';

  perform pg_temp.act(a);
  prev := public.customer_bill_split_preview(sid, 'equal');
  assert (prev->>'totalRemCents')::bigint = total, 'preview mostra o total restante';
  assert (select sum((x->>'amountCents')::bigint) from jsonb_array_elements(prev->'shares') x) = total, 'preview igual: soma exata';
  assert pg_temp.state_of(format($q$select public.customer_bill_split_commit(%L, 'equal', '{}', 'versao-velha', %L)$q$, sid, gen_random_uuid())) = 'P0012', 'versão desatualizada é recusada';

  perform public.customer_bill_split_commit(sid, 'equal', '{}', prev->>'version', key);
  assert pg_temp.live_sum(sid) = total and pg_temp.over_covered(sid) = 0, 'igual: soma == total (G3 #1)';
  assert (select max(amount_cents) - min(amount_cents) from public.bill_shares where table_session_id = sid and status = 'open') <= 1, 'igual: diferença <= 1 centavo (G3 #2)';
  perform public.customer_bill_split_commit(sid, 'equal', '{}', null, key);
  assert (select count(*) from public.bill_shares where table_session_id = sid and status = 'open') = 2, 'commit repetido não duplica parcelas';

  perform public.customer_bill_split_commit(sid, 'by_owner', '{}', null, gen_random_uuid());
  assert pg_temp.live_sum(sid) = total and pg_temp.over_covered(sid) = 0, 'por pessoa: soma == total';
  assert (select count(*) from public.bill_shares where table_session_id = sid and status = 'superseded') = 2, 'rodada anterior foi substituída';

  select oi.id into i2 from public.order_items oi where oi.order_id = (select v from _ctx where k = 'o1') and oi.total_price = 30;
  perform public.customer_bill_split_commit(sid, 'by_item', jsonb_build_object('assignments', jsonb_build_array(
    jsonb_build_object('orderItemId', i2, 'participantIds', jsonb_build_array(pa, pb)))), null, gen_random_uuid());
  assert (select sum(base_cents) from public.bill_shares where table_session_id = sid and status = 'open') = 3000, 'por item: item compartilhado soma o valor do item';
  assert pg_temp.live_sum(sid) < total and pg_temp.over_covered(sid) = 0, 'por item parcial não excede o total';

  perform public.customer_bill_split_commit(sid, 'fixed_amount', '{"amountCents":1500}', null, gen_random_uuid());
  assert pg_temp.live_sum(sid) <= total and pg_temp.over_covered(sid) = 0, 'valor customizado não excede o total';
  assert (select amount_cents from public.bill_shares where table_session_id = sid and participant_id = pa and status = 'open') = 1500, 'pagante paga exatamente o valor pedido';

  -- Rodada final igual para o restante do teste
  perform public.customer_bill_split_commit(sid, 'equal', '{}', null, gen_random_uuid());
  select * into sh from public.bill_shares where table_session_id = sid and participant_id = pa and status = 'open';

  -- Simulado desligado: nenhum cliente confirma o próprio pagamento (invariante 6)
  assert pg_temp.state_of(format($q$select public.customer_pay_share(%L, 'pix', %L)$q$, sh.id, gen_random_uuid())) = '42501', 'pagamento simulado só com a flag';
  update private.dev_flags set enabled = true where key = 'simulate_share_payment';

  perform public.customer_set_share_tip(sh.id, 300);
  res := public.customer_pay_share(sh.id, 'pix', key);
  assert (select amount_cents from public.gateway_transactions where bill_share_id = sh.id) = sh.amount_cents + 300, 'cobrança = parcela + gorjeta (fora do total)';
  assert (select status from public.bill_shares where id = sh.id) = 'paid', 'parcela paga';
  assert (select tip_recipient_kind::text from public.bill_shares where id = sh.id) =
    (select tip_allocation::text from public.restaurant_model_configs where restaurant_id = sh.restaurant_id), 'gorjeta segue tip_allocation da unidade';
  assert (select status from public.table_sessions where id = sid) = 'active', 'pagamento parcial mantém a mesa em billing (G3 #3)';
  assert (select billing_status::text from public.table_sessions where id = sid) = 'billing', 'sessão marcada como billing';
  assert pg_temp.state_of(format($q$update public.table_sessions set status = 'closed' where id = %L$q$, sid)) = 'P0010', 'fechar à força com saldo aberto é barrado no banco';

  perform pg_temp.act(b);
  select * into sh from public.bill_shares where table_session_id = sid and participant_id = pb and status = 'open';
  perform public.customer_pay_share(sh.id, 'credit_card', gen_random_uuid());
  assert (select status from public.table_sessions where id = sid) = 'ended', 'saldo zero encerra a sessão';
  assert (select status::text from public.tables where id = (select v from _ctx where k = 'table')) = 'available', 'mesa liberada';
  assert (select sum(amount_cents) from public.bill_shares where table_session_id = sid and status = 'paid') = total, 'soma paga == total, sem centavo perdido';
  assert (select count(*) from public.gateway_transactions where table_session_id = sid) = 2, 'uma cobrança por parcela';
end $$;
select pass('4 modos, versão, idempotência, pagamento parcial, gorjeta e fechamento em saldo zero');

-- Abandono, walk-out e reabertura numa sessão nova (A, B e C).
do $$
declare
  r uuid := (select v from _ctx where k = 'r'); owner_id uuid := (select v from _ctx where k = 'owner'); menu uuid := (select v from _ctx where k = 'menu');
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  tbl jsonb; sid uuid; o uuid; sh public.bill_shares; res jsonb; total bigint; pb uuid;
begin
  insert into auth.users(id, email) values (a, a || '@bill-abandon.test'), (b, b || '@bill-abandon.test'), (c, c || '@bill-abandon.test');
  insert into public.profiles(id) values (a), (b), (c) on conflict do nothing;
  perform pg_temp.act(owner_id);
  tbl := public.restaurant_create_table(r, 'test-abandon-' || a, 6);
  perform pg_temp.act(a); sid := (public.customer_open_table_session(tbl->>'qr_code')->>'tableSessionId')::uuid;
  perform pg_temp.act(b); perform public.customer_open_table_session(tbl->>'qr_code');
  perform pg_temp.act(c); perform public.customer_open_table_session(tbl->>'qr_code');
  insert into public.orders(restaurant_id, customer_id, table_session_id) values (r, a, sid) returning id into o;
  insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price) values (o, menu, 3, 30, 90);
  select total_all into total from private.session_totals(sid);

  perform pg_temp.act(a);
  perform public.customer_bill_split_commit(sid, 'equal', '{}', null, gen_random_uuid());
  assert (select count(*) from public.bill_shares where table_session_id = sid and status = 'open') = 3, 'três parcelas';

  perform pg_temp.act(c);
  select * into sh from public.bill_shares where table_session_id = sid and participant_id =
    (select id from public.table_session_participants where table_session_id = sid and user_id = c) and status = 'open';
  res := public.customer_abandon_share(sh.id);
  assert (res->>'redistributed')::boolean, 'abandono redistribui (G3 #4)';
  assert (select count(*) from public.bill_shares where table_session_id = sid and status = 'open') = 2
    and pg_temp.live_sum(sid) = total, 'o valor abandonado voltou ao pool e foi redistribuído entre os não pagos';

  -- Walk-out de B: a mesa fica em billing e o gerente é avisado com o saldo em aberto (G3 #7)
  perform pg_temp.act(owner_id);
  select id into pb from public.table_session_participants where table_session_id = sid and user_id = b;
  res := public.restaurant_mark_walkout(sid, pb, 'saiu sem pagar');
  assert (select status from public.table_sessions where id = sid) = 'active'
    and (select billing_status::text from public.table_sessions where id = sid) = 'billing', 'walk-out mantém a mesa em billing';
  assert (res->>'openCents')::bigint = total, 'saldo em aberto informado';
  assert exists (select 1 from public.audit_logs where action = 'bill.walkout' and entity_id = sid), 'walk-out deixa rastro';

  -- Reabertura (G3 #6 / ADR-004): não estorna sozinha e grava auditoria
  res := public.restaurant_reopen_bill(sid, 'cliente pediu mais um item');
  assert (select billing_status::text from public.table_sessions where id = sid) = 'open'
    and (select reopened_count from public.table_sessions where id = sid) = 1, 'conta reaberta';
  assert not exists (select 1 from public.gateway_transactions where table_session_id = sid and status like 'refund%'), 'reabrir não gera estorno automático';
  assert exists (select 1 from public.audit_logs where action = 'bill.reopened' and entity_id = sid), 'reabertura auditada';
  assert pg_temp.state_of(format($q$select public.restaurant_reopen_bill(%L, '')$q$, sid)) = '22023', 'reabertura exige motivo';
end $$;
select pass('abandono redistribui; walk-out mantém billing e alerta; reabertura sem estorno automático');

-- Propriedade sobre sessão real: contas aleatórias, todos os modos, soma exata.
do $$
declare
  sid uuid; r uuid := (select v from _ctx where k = 'r'); menu uuid := (select v from _ctx where k = 'menu');
  owner_id uuid := (select v from _ctx where k = 'owner');
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); tbl jsonb; o uuid; g int; n int; k int;
  pa uuid; pb uuid; total bigint; amt bigint;
begin
  perform setseed(0.77);
  insert into auth.users(id, email) values (a, a || '@bill-prop.test'), (b, b || '@bill-prop.test');
  insert into public.profiles(id) values (a), (b) on conflict do nothing;
  perform pg_temp.act(owner_id);
  tbl := public.restaurant_create_table(r, 'test-prop-' || a, 4);
  perform pg_temp.act(a); sid := (public.customer_open_table_session(tbl->>'qr_code')->>'tableSessionId')::uuid;
  perform pg_temp.act(b); perform public.customer_open_table_session(tbl->>'qr_code');
  select id into pa from public.table_session_participants where table_session_id = sid and user_id = a;
  select id into pb from public.table_session_participants where table_session_id = sid and user_id = b;
  for g in 1 .. 120 loop
    delete from public.bill_shares where table_session_id = sid;
    delete from public.orders where table_session_id = sid;
    insert into public.orders(restaurant_id, customer_id, table_session_id) values (r, a, sid) returning id into o;
    n := 1 + (random() * 6)::int;
    for k in 1 .. n loop
      amt := 1 + (random() * 60000)::int;
      insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price, total_price_cents, diner_id)
        values (o, menu, 1, amt::numeric / 100, amt::numeric / 100, amt,
                case (random() * 2)::int when 0 then pa when 1 then pb else null end);
    end loop;
    select total_all into total from private.session_totals(sid);
    perform pg_temp.act(a);
    perform public.customer_bill_split_commit(sid, 'equal', '{}', null, gen_random_uuid());
    assert pg_temp.live_sum(sid) = total and pg_temp.over_covered(sid) = 0, 'igual #' || g;
    perform public.customer_bill_split_commit(sid, 'by_owner', '{}', null, gen_random_uuid());
    assert pg_temp.live_sum(sid) = total and pg_temp.over_covered(sid) = 0, 'por pessoa #' || g;
    perform public.customer_bill_split_commit(sid, 'by_item', jsonb_build_object('assignments', (
      select jsonb_agg(jsonb_build_object('orderItemId', oi.id, 'participantIds',
        case (random() * 2)::int when 0 then jsonb_build_array(pa) when 1 then jsonb_build_array(pb) else jsonb_build_array(pa, pb) end))
      from public.order_items oi where oi.order_id = o)), null, gen_random_uuid());
    assert pg_temp.live_sum(sid) = total and pg_temp.over_covered(sid) = 0, 'por item #' || g;
    amt := 1 + (random() * (total - 1))::bigint;
    perform public.customer_bill_split_commit(sid, 'fixed_amount', jsonb_build_object('amountCents', amt), null, gen_random_uuid());
    assert pg_temp.live_sum(sid) <= total and pg_temp.over_covered(sid) = 0, 'valor customizado #' || g;
  end loop;
end $$;
select pass('propriedade: 120 contas aleatórias, 4 modos, soma exata e nenhum item coberto além do valor');

select * from finish();
rollback;
