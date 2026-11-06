-- Notas da NOOWE (respostas 34 e 91): dados da empresa, três tipos de nota e as notas avulsas da taxa NOOWE Pay e da conveniência.
begin;
select plan(8);
create temp table _c(k text primary key, v uuid);

do $$
declare c private.noowe_company;
begin
  select * into c from private.noowe_company;
  assert c.legal_name = 'DINI & CIA. TECNOLOGIA LTDA' and c.cnpj = '64159447000190' and c.municipal_registration = '0.112.566-4'
    and c.tax_regime = 'simples_nacional' and c.address like 'Av. José Ribeiro Junqueira, 220%', 'empresa: ' || to_jsonb(c)::text;
  assert c.nfse_notes = 'Empresa optante pelo Simples Nacional. Não gera direito a crédito fiscal de IPI, PIS e COFINS.', 'texto fixo';
  assert not exists (select 1 from public.restaurants r where r.settings->>'cnpj' = '64.159.447/0001-90'), 'nenhum restaurante com o CNPJ da NOOWE';
end $$;
select pass('dados da empresa preenchidos, com o texto das informações complementares, e nenhum restaurante usa o CNPJ da NOOWE');

do $$
begin
  assert (select array_agg(kind order by kind) from private.noowe_nfse_types) = array['convenience', 'noowe_pay', 'subscription'], 'três tipos';
  assert not exists (select 1 from private.noowe_nfse_types where pis_bps + cofins_bps + csll_bps + inss_bps + ir_bps > 0 or retain_iss), 'retenções zeradas';
end $$;
select pass('três tipos de nota, cada um com o próprio registro, e todas as retenções zeradas');

-- Cena: pagamento real de R$ 100 com R$ 3 de split da NOOWE (R$ 1 de conveniência) na semana passada, e outro com o split devolvido.
do $$
declare r uuid := 'c1000000-0000-4000-8000-000000000002'; g1 uuid := gen_random_uuid(); g2 uuid := gen_random_uuid(); w record;
begin
  perform set_config('noowe.param_author', 'teste', true);
  update private.noowe_nfse_types set municipal_service_code = null, municipal_service_id = null, municipal_service_name = null, service_description = null, iss_bps = null;
  select * into w from private.noowe_week_bounds(now());
  insert into public.gateway_transactions(id, restaurant_id, provider, amount_cents, status, payment_method, idempotency_key, purpose, confirmed_at, convenience_cents, created_at, updated_at)
    values (g1, r, 'asaas', 10000, 'completed', 'pix', 'n-' || g1, 'order', (w.week_start::timestamp + interval '12 hours') at time zone 'America/Sao_Paulo', 100, now(), now()),
           (g2, r, 'asaas', 5000, 'completed', 'pix', 'n-' || g2, 'order', (w.week_start::timestamp + interval '13 hours') at time zone 'America/Sao_Paulo', 0, now(), now());
  insert into private.noowe_pay_transaction_fees(gateway_transaction_id, restaurant_id, payment_method, rate_bps, amount_cents, fee_cents, tariff_cents, split_cents, convenience_cents, fee_returned)
    values (g1, r, 'pix', 99, 10000, 99, 0, 300, 100, false), (g2, r, 'pix', 99, 5000, 50, 0, 50, 0, true);
  insert into _c values ('g1', g1), ('r', r);
  perform private.fee_notes_generate(w.week_end::timestamp at time zone 'America/Sao_Paulo' + interval '1 day 13 hours');
end $$;
select is((select amount_cents from private.noowe_fee_notes where kind = 'noowe_pay' and restaurant_id = (select v from _c where k = 'r')), 200::bigint,
  'nota semanal: só a margem da NOOWE, sem a conveniência e sem o split devolvido no estorno');
select is((select amount_cents from private.noowe_fee_notes where kind = 'convenience' and gateway_transaction_id = (select v from _c where k = 'g1')), 100::bigint,
  'conveniência: uma nota por pagamento, no valor da taxa');

do $$
declare w record; n integer;
begin
  select * into w from private.noowe_week_bounds(now());
  perform private.fee_notes_generate(w.week_end::timestamp at time zone 'America/Sao_Paulo' + interval '1 day 14 hours');
  select count(*) into n from private.noowe_fee_notes where restaurant_id = (select v from _c where k = 'r') and kind = 'noowe_pay';
  assert n = 1, 'repetir não duplica: ' || n;
end $$;
select pass('gerar de novo não duplica a nota da semana');

do $$
declare n private.noowe_fee_notes;
begin
  perform private.fee_notes_tick();
  select * into n from private.noowe_fee_notes where kind = 'noowe_pay' and restaurant_id = (select v from _c where k = 'r');
  assert n.status = 'waiting_data' and n.waiting_reason like 'Faltam o código de serviço%', 'espera o contador: ' || coalesce(n.waiting_reason, '-');
  assert not (public.service_fee_note_claim(n.id)->>'claimed')::boolean, 'não sai sem código';
  select * into n from private.noowe_fee_notes where kind = 'convenience' and gateway_transaction_id = (select v from _c where k = 'g1');
  assert n.status = 'waiting_data', 'conveniência espera';
end $$;
select pass('sem código de serviço do tipo, a nota espera com o motivo e não vai ao Asaas');

do $$
declare n private.noowe_fee_notes; j jsonb;
begin
  perform set_config('noowe.param_author', 'teste', true);
  update private.noowe_nfse_types set municipal_service_code = '01.03', municipal_service_name = 'Intermediação', service_description = 'Taxa NOOWE Pay', iss_bps = 200;
  update private.noowe_fee_notes set taker_document = '11222333000181' where kind = 'noowe_pay' and restaurant_id = (select v from _c where k = 'r');
  perform private.fee_notes_tick();
  select * into n from private.noowe_fee_notes where kind = 'noowe_pay' and restaurant_id = (select v from _c where k = 'r');
  assert n.status = 'requested', 'liberou: ' || n.status;
  j := public.service_fee_note_claim(n.id);
  assert (j->>'claimed')::boolean and (j->>'totalCents')::bigint = 200 and j->>'takerDocument' = '11222333000181'
    and j->>'serviceDescription' = 'Taxa NOOWE Pay' and j->>'observations' like 'Empresa optante%', 'pedido: ' || j::text;
  perform public.service_fee_note_attach(n.id, 'inv_9', 'cus_1');
  perform public.service_fee_note_result(n.id, 'issued', 'https://nota/9.pdf');
  select * into n from private.noowe_fee_notes where id = n.id;
  assert n.status = 'issued' and n.customer_ref = 'cus_1' and n.url = 'https://nota/9.pdf', 'emitida';
  select * into n from private.noowe_fee_notes where kind = 'convenience' and gateway_transaction_id = (select v from _c where k = 'g1');
  assert n.status = 'waiting_data' and n.waiting_reason like 'Cliente sem CPF%', 'sem CPF o Asaas não emite: ' || coalesce(n.waiting_reason, '-');
end $$;
select pass('com o código, a nota semanal vai ao Asaas com o texto fixo e vale quando autorizada; conveniência sem CPF espera outro emissor');

do $$
declare ok boolean := false;
begin
  set local role authenticated;
  begin perform public.service_fee_note_claim(gen_random_uuid()); exception when insufficient_privilege then ok := true; end;
  reset role;
  assert ok, 'só o servidor';
end $$;
select pass('só o servidor pede nota avulsa');
select * from finish();
rollback;
