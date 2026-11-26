-- ADR-033: o ID da nota na Notaas (provider_ref) vai e volta entre o banco e a Edge Function.
begin;
select plan(9);

create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;

create temp table _doc(k text primary key, id uuid);

do $$
declare r uuid := 'c1000000-0000-4000-8000-000000000002'; d uuid;
begin
  perform public.service_fiscal_configure(r, jsonb_build_object(
    'cnpj', '12.345.678/0001-23', 'razaoSocial', 'Casa LTDA', 'stateCode', 'SP', 'regimeTributario', 'simples_nacional',
    'taxDefaults', jsonb_build_object('ncm', '21069090', 'cfop', '5102', 'icms_origem', '0', 'icms_situacao_tributaria', '102',
      'pis_situacao_tributaria', '49', 'cofins_situacao_tributaria', '49')), 'ntaas_tok');
  foreach d in array array[gen_random_uuid(), gen_random_uuid()] loop
    insert into public.fiscal_documents(id, restaurant_id, external_ref, snapshot)
      values (d, r, 'test-notaas-' || d, jsonb_build_object(
        'lines', jsonb_build_array(jsonb_build_object('description', 'Pizza', 'quantity', 1, 'grossCents', 5000, 'discountCents', 0, 'feeCents', 0)),
        'payments', jsonb_build_array(jsonb_build_object('method', 'pix', 'weightCents', 5000))));
    insert into _doc values (case when exists (select 1 from _doc) then 'b' else 'a' end, d);
  end loop;
end $$;

select is(public.service_fiscal_claim((select id from _doc where k = 'a'))->>'providerRef', null, 'nota nova sai sem ID do emissor');
select is(public.service_fiscal_record_result((select id from _doc where k = 'a'), 'transient',
  '{"providerRef": "inv-1", "errorCode": "provider_processing", "errorMessage": "x"}')->>'status', 'pending', 'nota em processamento volta para a fila');
select is((select provider_ref from public.fiscal_documents where id = (select id from _doc where k = 'a')), 'inv-1', 'o resultado grava o ID do emissor');

update public.fiscal_documents set next_attempt_at = now() - interval '1 second' where id = (select id from _doc where k = 'a');
select is(public.service_fiscal_claim((select id from _doc where k = 'a'))->>'providerRef', 'inv-1', 'a próxima rodada recebe o ID para consultar');
select public.service_fiscal_record_result((select id from _doc where k = 'a'), 'rejected', '{"errorCode": "778", "errorMessage": "NCM inexistente"}');
select is((select provider_ref from public.fiscal_documents where id = (select id from _doc where k = 'a')), 'inv-1', 'resultado sem ID não apaga o ID guardado');

select pg_temp.act('c1000000-0000-4000-8000-000000000001');
select public.restaurant_fiscal_retry((select id from _doc where k = 'a'), 'NCM corrigido');
select is((select provider_ref from public.fiscal_documents where id = (select id from _doc where k = 'a')), null, 'reenvio de nota rejeitada pede nota nova');

update public.fiscal_documents set status = 'failed', provider_ref = 'inv-2' where id = (select id from _doc where k = 'b');
select public.restaurant_fiscal_retry((select id from _doc where k = 'b'), 'Emissor voltou');
select is((select provider_ref from public.fiscal_documents where id = (select id from _doc where k = 'b')), 'inv-2', 'reenvio de nota que esgotou tentativas segue a mesma nota');
select is((select status from public.fiscal_documents where id = (select id from _doc where k = 'b')), 'pending', 'e volta para a fila');

update public.fiscal_documents set status = 'authorized', cancel_status = 'requested', cancel_next_attempt_at = now() - interval '1 second',
    cancel_reason = 'Estorno ao cliente: prato errado'
  where id = (select id from _doc where k = 'b');
select is(public.service_fiscal_cancel_claim((select id from _doc where k = 'b'))->>'providerRef', 'inv-2', 'o cancelamento recebe o ID do emissor');

select * from finish();
rollback;
