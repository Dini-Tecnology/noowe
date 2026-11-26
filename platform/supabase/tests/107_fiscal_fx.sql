-- QA Fiscal FX: CFOP do restaurante, disparo sem segredos vira bloqueio com aviso, NFS-e cancelada fica cancelada.
begin;
select plan(13);

create temp table _ctx(k text primary key, id uuid);

do $$
declare r uuid := 'c1000000-0000-4000-8000-000000000002'; d uuid; plain uuid; own uuid;
begin
  perform public.service_fiscal_configure(r, jsonb_build_object(
    'cnpj', '12.345.678/0001-23', 'razaoSocial', 'Casa LTDA', 'stateCode', 'SP', 'regimeTributario', 'simples_nacional',
    'taxDefaults', jsonb_build_object('ncm', '21069090', 'cfop', '5405', 'icms_origem', '0', 'icms_situacao_tributaria', '500',
      'pis_situacao_tributaria', '49', 'cofins_situacao_tributaria', '49')), 'ntaas_tok');
  insert into public.menu_items(restaurant_id, name, price) values (r, 'Sem CFOP', 1000) returning id into plain;
  insert into public.menu_items(restaurant_id, name, price, cfop) values (r, 'CFOP próprio', 1000, '5101') returning id into own;
  insert into public.fiscal_documents(restaurant_id, external_ref, snapshot)
    values (r, 'test-fx-' || gen_random_uuid(), jsonb_build_object(
      'lines', jsonb_build_array(
        jsonb_build_object('menuItemId', plain, 'description', 'Sem CFOP', 'quantity', 1, 'grossCents', 1000, 'discountCents', 0, 'feeCents', 0),
        jsonb_build_object('menuItemId', own, 'description', 'CFOP próprio', 'quantity', 1, 'grossCents', 1000, 'discountCents', 0, 'feeCents', 0)),
      'payments', jsonb_build_array(jsonb_build_object('method', 'pix', 'weightCents', 2000))))
    returning id into d;
  insert into _ctx values ('doc', d), ('r', r);
end $$;

-- FX-1
select is((select column_default from information_schema.columns where table_schema = 'public' and table_name = 'menu_items' and column_name = 'cfop'),
  null, 'item novo não nasce com CFOP fixo');
select is((select count(*)::int from public.menu_items where cfop = '5102'), 0, 'o 5102 que veio do default saiu dos itens');
create temp table _claim as select public.service_fiscal_claim((select id from _ctx where k = 'doc')) as j;
select is((select j->'items'->0->>'cfop' from _claim), '5405', 'item sem CFOP usa o CFOP padrão do restaurante');
select is((select j->'items'->1->>'cfop' from _claim), '5101', 'item com CFOP próprio mantém o dele');

-- FX-2: sem os segredos do disparo, a varredura bloqueia e avisa em vez de deixar pendente para sempre.
update public.fiscal_documents set status = 'pending', next_attempt_at = now() - interval '1 second' where id = (select id from _ctx where k = 'doc');
delete from vault.secrets where name in ('project_url', 'service_role_key');
select private.fiscal_dispatch_due();
select is((select status from public.fiscal_documents where id = (select id from _ctx where k = 'doc')), 'blocked', 'nota sem disparo fica bloqueada');
select is((select error_code from public.fiscal_documents where id = (select id from _ctx where k = 'doc')), 'dispatch_unavailable', 'com o motivo próprio');
select ok((select count(*) from public.notifications where related_id = (select id from _ctx where k = 'doc')
  and notification_type = 'fiscal_document_issue') > 0, 'e o dono é avisado');

-- FX-3
do $$
declare i uuid := gen_random_uuid();
begin
  insert into public.subscription_invoices(id, restaurant_id, kind, period_start, period_end, subtotal_cents, total_cents, status, due_at, provider_ref, paid_at, nfse_status, nfse_url)
    values (i, (select id from _ctx where k = 'r'), 'renewal', now(), now() + interval '30 days', 19900, 19900, 'paid', now(), 'pay_fx', now(), 'issued', 'https://nota');
  insert into _ctx values ('inv', i);
end $$;
select public.service_nfse_result((select id from _ctx where k = 'inv'), 'cancelled', null, null, 'inv_1');
select is((select nfse_status from public.subscription_invoices where id = (select id from _ctx where k = 'inv')), 'cancelled', 'NFS-e cancelada no Asaas fica cancelada');
select public.service_nfse_result((select id from _ctx where k = 'inv'), 'issued', 'https://nota', null, 'inv_1');
select is((select nfse_status from public.subscription_invoices where id = (select id from _ctx where k = 'inv')), 'cancelled', 'aviso atrasado de autorização não ressuscita a nota');
select ok(exists (select 1 from public.audit_logs where entity_id = (select id from _ctx where k = 'inv') and action = 'billing.nfse_cancelled'), 'o cancelamento fica no rastro');

do $$
declare n uuid := gen_random_uuid();
begin
  insert into private.noowe_fee_notes(id, restaurant_id, kind, period_start, period_end, amount_cents, status)
    values (n, (select id from _ctx where k = 'r'), 'noowe_pay', current_date - 7, current_date, 500, 'issued');
  insert into _ctx values ('note', n);
end $$;
select public.service_fee_note_result((select id from _ctx where k = 'note'), 'cancelled');
select is((select status from private.noowe_fee_notes where id = (select id from _ctx where k = 'note')), 'cancelled', 'nota avulsa cancelada fica cancelada');
select public.service_fee_note_result((select id from _ctx where k = 'note'), 'failed', null, 'x');
select is((select status from private.noowe_fee_notes where id = (select id from _ctx where k = 'note')), 'cancelled', 'e cancelada é final');
select throws_ok($$ select public.service_nfse_result(gen_random_uuid(), 'voided') $$, '22023', null, 'status desconhecido é recusado');

select * from finish();
rollback;
