-- ES-05/08 e CT-06 (QA 2026-11-25): valores em pt-BR nos textos do servidor, estorno total x parcial, e a parcela liberada
-- quando a cobrança falha antes de chegar ao Asaas.
begin;
select plan(6);

select is(private.format_brl(3520) || ' ' || private.format_brl(-4600) || ' ' || private.format_brl(50000) || ' ' || private.format_brl(123456789) || ' ' || private.format_brl(5),
  'R$ 35,20 -R$ 46,00 R$ 500,00 R$ 1.234.567,89 R$ 0,05', 'formato brasileiro, com sinal');

select is((select count(*)::int from pg_proc p join pg_namespace s on s.oid = p.pronamespace
  where s.nspname in ('public', 'private') and pg_get_functiondef(p.oid) like '%FM999G990D00%'), 0, 'nenhum texto usa o formato do locale "C"');

select ok(private.refund_review_reason(true, false) = 'Estorno parcial'
  and private.refund_review_reason(true, true) = 'Estorno total de um dos pagamentos da conta'
  and private.refund_review_reason(false, true) = 'Estorno fora do prazo de cancelamento da nota', 'parcial só quando o pagamento ainda tem saldo');

-- Comanda com uma parcela reservada para Pix que não chegou ao Asaas.
create temp table _ctx(k text primary key, v uuid);
do $$
declare r uuid := 'c1000000-0000-4000-8000-000000000002'; owner_id uuid := 'c1000000-0000-4000-8000-000000000001';
  a uuid := gen_random_uuid(); tbl jsonb; sid uuid; menu uuid; o uuid; sh public.bill_shares; tx public.gateway_transactions; k uuid := gen_random_uuid();
begin
  insert into public.restaurant_payment_accounts(restaurant_id, provider, status) values (r, 'asaas', 'active') on conflict do nothing;
  update public.restaurant_payment_accounts set status = 'active' where restaurant_id = r;
  insert into auth.users(id, email) values (a, a || '@ct06.test');
  perform set_config('request.jwt.claims', jsonb_build_object('sub', owner_id, 'role', 'authenticated')::text, true);
  tbl := public.restaurant_create_table(r, 'test-ct06-' || a, 4);
  select id into menu from public.menu_items where restaurant_id = r limit 1;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', a, 'role', 'authenticated')::text, true);
  sid := (public.customer_open_table_session(tbl->>'qr_code')->>'tableSessionId')::uuid;
  insert into public.orders(restaurant_id, customer_id, table_session_id) values (r, a, sid) returning id into o;
  insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price) values (o, menu, 2, 20, 40);
  perform public.customer_bill_split_commit(sid, 'equal', '{}', null, gen_random_uuid());
  select * into sh from public.bill_shares where table_session_id = sid and status = 'open' limit 1;
  tx := private.reserve_share_payment(a, sh.id, 'pix', 0, k, 'asaas');
  insert into _ctx values ('tx', tx.id), ('share', sh.id), ('a', a), ('k', k);
end $$;

select ok(public.service_payment_abort_unsent((select v from _ctx where k = 'tx'), 'asaas fora'), 'aborta a cobrança sem Asaas');
select ok((select status from public.bill_shares where id = (select v from _ctx where k = 'share')) = 'open'
  and (select status::text from public.gateway_transactions where id = (select v from _ctx where k = 'tx')) = 'failed',
  'falha antes do Asaas: a parcela volta a ficar aberta na hora');

select ok((private.reserve_share_payment((select v from _ctx where k = 'a'), (select v from _ctx where k = 'share'), 'pix', 0,
    (select v from _ctx where k = 'k'), 'asaas')).id <> (select v from _ctx where k = 'tx')
  and not public.service_payment_abort_unsent((select v from _ctx where k = 'tx'), 'de novo'),
  'a nova tentativa com a mesma chave reserva de novo, e abortar duas vezes não faz nada');

select * from finish();
rollback;
