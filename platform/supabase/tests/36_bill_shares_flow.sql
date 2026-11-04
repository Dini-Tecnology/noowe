-- G3 #3 a #7 e G5, critério 1: propriedade nas 4 formas sobre uma sessão real, com o saldo único (ADR-032).
-- Pagamento parcial mantém a mesa aberta, só o saldo zero encerra, quem abandona deixa a parte para o titular,
-- walk-out alerta o gerente, reabertura não estorna sozinha.
begin;
select plan(3);

create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;
create function pg_temp.state_of(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok'; exception when sqlstate 'P0004' then return 'P0004'; when others then return sqlstate; end $$;
create function pg_temp.reserved_sum(p_sid uuid) returns bigint language sql as $$
  select coalesce(sum(base_cents), 0) from public.bill_shares
  where table_session_id = p_sid and status in ('pending_payment', 'paid') $$;
-- Item coberto além do valor: só o que está pago ou em pagamento trava.
create function pg_temp.over_covered(p_sid uuid) returns int language sql as $$
  select count(*)::int from private.session_balances(p_sid) b
  where (select coalesce(sum(bl.base_cents), 0) from public.bill_share_lines bl
         join public.bill_shares s on s.id = bl.bill_share_id
         where bl.order_item_id = b.order_item_id and s.status in ('pending_payment', 'paid')) > b.open_cents $$;
-- As contas de cada parcela: valor = consumo + taxa, e nunca taxa com gorjeta.
create function pg_temp.bad_shares(p_sid uuid) returns int language sql as $$
  select count(*)::int from public.bill_shares
  where table_session_id = p_sid and (amount_cents <> base_cents - coupon_discount_cents + service_fee_cents or (service_fee_cents > 0 and tip_cents > 0)) $$;

create temp table _ctx(k text primary key, v uuid);

update public.restaurant_model_policies set fee_or_tip_mode = 'service_fee', service_fee_bps = 1000,
    split_modes = '{by_owner,equal,by_item,fixed_amount}'
  where restaurant_id = 'c1000000-0000-4000-8000-000000000002' and not prepaid_required;

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
  total bigint; prev jsonb; key uuid := gen_random_uuid(); sh public.bill_shares; i2 uuid;
begin
  select total_all into total from private.session_totals(sid);
  assert total = 6000, 'o total da comanda é o consumo';

  perform pg_temp.act(a);
  prev := public.customer_bill_split_preview(sid, 'equal');
  assert (prev->>'balanceCents')::bigint = total, 'preview mostra o saldo';
  assert (select sum((x->>'baseCents')::bigint) from jsonb_array_elements(prev->'shares') x) = total, 'preview igual: soma exata';
  assert pg_temp.state_of(format($q$select public.customer_bill_split_commit(%L, 'equal', '{}', 'versao-velha', %L)$q$, sid, gen_random_uuid())) = 'P0012', 'versão desatualizada é recusada';

  perform public.customer_bill_split_commit(sid, 'equal', '{}', prev->>'version', key);
  assert (select sum(base_cents) from public.bill_shares where table_session_id = sid and status = 'open') = total, 'igual: soma == consumo (G3 #1)';
  assert (select max(base_cents) - min(base_cents) from public.bill_shares where table_session_id = sid and status = 'open') <= 1, 'igual: diferença <= 1 centavo (G3 #2)';
  perform public.customer_bill_split_commit(sid, 'equal', '{}', null, key);
  assert (select count(*) from public.bill_shares where table_session_id = sid and status = 'open') = 2, 'commit repetido não duplica parcelas';

  perform public.customer_bill_split_commit(sid, 'by_owner', '{}', null, gen_random_uuid());
  assert (select sum(base_cents) from public.bill_shares where table_session_id = sid and status = 'open') = total, 'por pessoa: soma == consumo';
  assert (select count(*) from public.bill_shares where table_session_id = sid and status = 'superseded') = 2, 'rodada anterior foi substituída';

  select oi.id into i2 from public.order_items oi where oi.order_id = (select v from _ctx where k = 'o1') and oi.total_price = 30;
  perform public.customer_bill_split_commit(sid, 'by_item', jsonb_build_object('assignments', jsonb_build_array(
    jsonb_build_object('orderItemId', i2, 'participantIds', jsonb_build_array(pa, pb)))), null, gen_random_uuid());
  assert (select sum(base_cents) from public.bill_shares where table_session_id = sid and status = 'open') = 3000, 'por item: item compartilhado soma o valor do item';

  perform public.customer_bill_split_commit(sid, 'fixed_amount', '{"amountCents":1500}', null, gen_random_uuid());
  assert (select amount_cents from public.bill_shares where table_session_id = sid and participant_id = pa and status = 'open') = 1500, 'pagante paga exatamente o valor pedido';
  assert (select base_cents + service_fee_cents from public.bill_shares where table_session_id = sid and participant_id = pa and status = 'open') = 1500, 'consumo e taxa saem de dentro do valor';

  -- Rodada final igual para o restante do teste
  perform public.customer_bill_split_commit(sid, 'equal', '{}', null, gen_random_uuid());
  select * into sh from public.bill_shares where table_session_id = sid and participant_id = pa and status = 'open';

  -- Simulado desligado: nenhum cliente confirma o próprio pagamento (invariante 6)
  update private.dev_flags f set enabled = false where f.key = 'simulate_share_payment';
  assert pg_temp.state_of(format($q$select public.customer_pay_share(%L, 'pix', %L)$q$, sh.id, gen_random_uuid())) = '42501', 'pagamento simulado só com a flag';
  update private.dev_flags f set enabled = true where f.key = 'simulate_share_payment';

  perform public.customer_pay_share(sh.id, 'pix', key);
  assert (select amount_cents from public.gateway_transactions where bill_share_id = sh.id) = sh.amount_cents, 'cobrança = consumo + taxa da parcela';
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
  assert (select status::text from public.tables where id = (select v from _ctx where k = 'table')) = 'cleaning', 'paga, a mesa vai a Limpeza (ADR-024)';
  assert (select sum(base_cents) from public.bill_shares where table_session_id = sid and status = 'paid') = total, 'consumo pago == consumo, sem centavo perdido';
  assert (select count(*) from public.gateway_transactions where table_session_id = sid) = 2, 'uma cobrança por parcela';
end $$;
select pass('4 modos, versão, idempotência, pagamento parcial e fechamento em saldo zero');

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
  assert (res->>'movedToHost')::boolean, 'a parte fica com o titular';
  assert (select count(*) from public.bill_shares where table_session_id = sid and status = 'open') = 2, 'as outras parcelas não mudam de valor';
  assert private.session_consumption_balance(sid) = total, 'o valor abandonado continua no saldo';

  -- O titular responde pela comanda: não abandona.
  perform pg_temp.act(a);
  select * into sh from public.bill_shares where table_session_id = sid and participant_id =
    (select id from public.table_session_participants where table_session_id = sid and user_id = a) and status = 'open';
  assert pg_temp.state_of(format($q$select public.customer_abandon_share(%L)$q$, sh.id)) = 'P0004', 'titular não abandona';

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
select pass('abandono deixa a parte para o titular; walk-out mantém billing e alerta; reabertura sem estorno automático');

-- Propriedade (G5, critério 1): contas aleatórias, qualquer combinação das 4 formas, com e sem taxa retirada, com falhas no meio.
do $$
declare
  sid uuid; r uuid := (select v from _ctx where k = 'r'); menu uuid := (select v from _ctx where k = 'menu');
  owner_id uuid := (select v from _ctx where k = 'owner');
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); tbl jsonb; o uuid; g int; n int; k int; step int;
  pa uuid; pb uuid; total bigint; amt bigint; bal bigint; who uuid; pw uuid; mode int; sh public.bill_shares; tx public.gateway_transactions;
  v_key uuid; v_before int; v_paid_before int;
begin
  perform setseed(0.77);
  insert into auth.users(id, email) values (a, a || '@bill-prop.test'), (b, b || '@bill-prop.test');
  insert into public.profiles(id) values (a), (b) on conflict do nothing;
  for g in 1 .. 25 loop
    perform pg_temp.act(owner_id);
    tbl := public.restaurant_create_table(r, 'test-prop-' || g || '-' || a, 4);
    perform pg_temp.act(a); sid := (public.customer_open_table_session(tbl->>'qr_code')->>'tableSessionId')::uuid;
    perform pg_temp.act(b); perform public.customer_open_table_session(tbl->>'qr_code');
    select id into pa from public.table_session_participants where table_session_id = sid and user_id = a;
    select id into pb from public.table_session_participants where table_session_id = sid and user_id = b;
    insert into public.orders(restaurant_id, customer_id, table_session_id) values (r, a, sid) returning id into o;
    n := 1 + (random() * 5)::int;
    for k in 1 .. n loop
      amt := 1 + (random() * 60000)::int;
      insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price, total_price_cents, diner_id)
        values (o, menu, 1, amt::numeric / 100, amt::numeric / 100, amt,
                case (random() * 2)::int when 0 then pa when 1 then pb else null end);
    end loop;
    select total_all into total from private.session_totals(sid);

    -- Algumas rodadas aleatórias e depois o que faltar: a conta sempre fecha.
    step := 0;
    while (select status from public.table_sessions where id = sid) = 'active' loop
      step := step + 1;
      assert step < 40, 'a conta não fechou #' || g;
      bal := private.session_consumption_balance(sid);
      if random() < 0.5 then who := a; pw := pa; else who := b; pw := pb; end if;
      mode := case when step > 8 then 1 else (random() * 3)::int end;
      perform pg_temp.act(who);
      case mode
        when 0 then
          perform public.customer_bill_split_commit(sid, 'fixed_amount', jsonb_build_object('amountCents', 1 + (random() * greatest(bal, 1))::bigint), null, gen_random_uuid());
        when 1 then
          perform public.customer_bill_split_commit(sid, 'equal', case when random() < 0.3 then '{"people":3}'::jsonb else '{}'::jsonb end, null, gen_random_uuid());
        when 2 then
          perform public.customer_bill_split_commit(sid, 'by_owner', '{}', null, gen_random_uuid());
        else
          begin
            perform public.customer_bill_split_commit(sid, 'by_item', jsonb_build_object('assignments', (
              select jsonb_agg(jsonb_build_object('orderItemId', oi.id, 'participantIds',
                case (random() * 2)::int when 0 then jsonb_build_array(pa) when 1 then jsonb_build_array(pb) else jsonb_build_array(pa, pb) end))
              from public.order_items oi where oi.order_id = o)), null, gen_random_uuid());
          exception when sqlstate '22023' then null;  -- item já todo pago
          end;
      end case;
      assert pg_temp.bad_shares(sid) = 0, 'contas da parcela #' || g;

      for sh in select * from public.bill_shares where table_session_id = sid and status = 'open' order by random() loop
        exit when (select status from public.table_sessions where id = sid) <> 'active';
        who := (select user_id from public.table_session_participants where id = sh.participant_id);
        perform pg_temp.act(who);
        if random() < 0.3 then
          perform public.customer_set_share_fee_waived(sh.id, true);
          select * into sh from public.bill_shares where id = sh.id;
        end if;
        begin
          tx := private.reserve_share_payment(who, sh.id, 'pix', 0, gen_random_uuid(), 'simulated');
        exception when sqlstate 'P0012' then continue;  -- ficou velha: outra pessoa pagou antes
        end;
        assert pg_temp.reserved_sum(sid) <= total, 'reservado além do consumo #' || g;
        assert pg_temp.over_covered(sid) = 0, 'item coberto além do valor #' || g;
        if random() < 0.25 then
          perform private.apply_payment_event(tx.id, 'simulated', 'falha:' || tx.id, 'FAILED', 'failed');
        else
          perform private.apply_payment_event(tx.id, 'simulated', 'ok:' || tx.id, 'RECEIVED', 'confirmed', tx.amount_cents);
          -- Reenvio do mesmo evento não abate de novo.
          v_paid_before := (select count(*) from public.bill_shares where table_session_id = sid and status = 'paid');
          perform private.apply_payment_event(tx.id, 'simulated', 'ok:' || tx.id, 'RECEIVED', 'confirmed', tx.amount_cents);
          assert (select count(*) from public.bill_shares where table_session_id = sid and status = 'paid') = v_paid_before, 'reenvio #' || g;
        end if;
      end loop;
    end loop;
    assert (select sum(base_cents) from public.bill_shares where table_session_id = sid and status = 'paid') = total,
      'consumo pago = consumo total #' || g;
    assert pg_temp.over_covered(sid) = 0, 'item coberto além do valor no fim #' || g;
    assert pg_temp.bad_shares(sid) = 0, 'contas da parcela no fim #' || g;
    assert (select count(*) from public.gateway_transactions where table_session_id = sid and status = 'refund_pending') = 0, 'nada para estornar #' || g;
  end loop;
end $$;
select pass('propriedade: contas aleatórias, 4 formas em qualquer ordem, com taxa retirada e falhas: o consumo pago fecha exato');

select * from finish();
rollback;
