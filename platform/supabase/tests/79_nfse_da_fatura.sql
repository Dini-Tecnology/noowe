-- NFS-e da fatura: nada sai sem os dados da empresa; quando entram, as faturas pagas são liberadas, e a nota só vale autorizada.
begin;
select plan(6);
create temp table _c(k text primary key, v uuid);
create function pg_temp.fill() returns void language plpgsql as $$
begin
  perform set_config('noowe.param_author', 'teste', true);
  update private.noowe_company set legal_name = 'Noowe Ltda', address = 'Rua A, 1', municipal_registration = '123', tax_regime = 'simples',
    nfse_notes = 'Empresa optante pelo Simples Nacional.';
  update private.noowe_nfse_types set municipal_service_code = '01.03', municipal_service_name = 'Licenciamento de software',
    service_description = 'Assinatura NOOWE', iss_bps = 200 where kind = 'subscription';
end $$;
do $$
declare r uuid := 'c1000000-0000-4000-8000-000000000002'; i uuid; c private.noowe_company;
begin
  perform set_config('noowe.param_author', 'teste', true);
  update private.noowe_company set legal_name = null, address = null, municipal_registration = null, tax_regime = null, nfse_notes = null;
  update private.noowe_nfse_types set municipal_service_code = null, municipal_service_id = null, municipal_service_name = null, service_description = null, iss_bps = null;
  insert into public.subscription_invoices(restaurant_id, kind, period_start, period_end, subtotal_cents, total_cents, status, due_at, provider_ref, nfse_status)
    values (r, 'renewal', now(), now() + interval '30 days', 19900, 19900, 'open', now() + interval '3 days', 'pay_1', 'waiting_company_data') returning id into i;
  insert into _c values ('i', i);
end $$;
create function pg_temp.inv() returns public.subscription_invoices language sql as $$ select * from public.subscription_invoices where id = (select v from _c where k = 'i') $$;

do $$
declare j jsonb;
begin
  perform public.service_invoice_paid((select v from _c where k = 'i'));
  assert (pg_temp.inv()).nfse_status = 'waiting_company_data', 'espera os dados: ' || (pg_temp.inv()).nfse_status;
  j := public.service_nfse_claim((select v from _c where k = 'i'));
  assert not (j->>'claimed')::boolean and j->>'reason' = 'company_data_missing', 'não pega: ' || j::text;
end $$;
select pass('sem os dados da empresa, a fatura paga espera e nenhuma nota é pedida');

do $$
begin
  perform pg_temp.fill();
  perform private.nfse_tick();
  assert (pg_temp.inv()).nfse_status = 'requested', 'liberou: ' || (pg_temp.inv()).nfse_status;
end $$;
select pass('quando os dados entram, a varredura libera as faturas que esperavam');

do $$
declare j jsonb;
begin
  j := public.service_nfse_claim((select v from _c where k = 'i'));
  assert (j->>'claimed')::boolean and j->>'paymentRef' = 'pay_1' and (j->>'totalCents')::bigint = 19900 and (j->'taxes'->>'issBps')::int = 200
    and j->>'observations' = 'Empresa optante pelo Simples Nacional.' and j->>'municipalServiceCode' = '01.03', 'dados: ' || j::text;
  assert not (public.service_nfse_claim((select v from _c where k = 'i'))->>'claimed')::boolean, 'duas ao mesmo tempo não';
end $$;
select pass('o pedido leva cobrança, valor e tributos dos parâmetros, e duas chamadas não pegam a mesma fatura');

do $$
begin
  perform public.service_nfse_attach((select v from _c where k = 'i'), 'inv_1');
  assert (pg_temp.inv()).nfse_provider_ref = 'inv_1' and (pg_temp.inv()).nfse_status = 'requested', 'agendada ainda não é emitida';
  perform public.service_nfse_result((select v from _c where k = 'i'), 'issued', 'https://nota/1.pdf');
  assert (pg_temp.inv()).nfse_status = 'issued' and (pg_temp.inv()).nfse_url = 'https://nota/1.pdf', 'autorizou';
  perform public.service_nfse_result((select v from _c where k = 'i'), 'failed', null, 'atrasado');
  assert (pg_temp.inv()).nfse_status = 'issued', 'aviso fora de ordem não desfaz';
end $$;
select pass('a nota só vale depois de autorizada, e aviso fora de ordem não desfaz');

do $$
begin
  update public.subscription_invoices set nfse_status = 'requested', nfse_provider_ref = null, nfse_url = null, nfse_attempts = 5 where id = (select v from _c where k = 'i');
  perform public.service_nfse_attach((select v from _c where k = 'i'), null, 'Asaas recusou');
  assert (pg_temp.inv()).nfse_status = 'failed', 'esgotou: ' || (pg_temp.inv()).nfse_status;
  assert exists (select 1 from public.audit_logs a where a.action = 'billing.nfse_failed' and a.entity_id = (select v from _c where k = 'i')), 'deixa rastro';
end $$;
select pass('esgotadas as tentativas, a nota fica como falha e deixa rastro');

do $$
declare ok boolean := false;
begin
  set local role authenticated;
  begin perform public.service_nfse_claim((select v from _c where k = 'i')); exception when insufficient_privilege then ok := true; end;
  reset role;
  assert ok, 'só o servidor';
end $$;
select pass('só o servidor pede nota');
select * from finish();
rollback;
