-- RV-09 (QA 2026-11-25): o CPF só fica guardado com consentimento, que é registrado, e o cliente pode excluir.
begin;
select plan(5);

create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;
create temp table _u(k text primary key, v uuid);
insert into _u values ('a', gen_random_uuid()), ('b', gen_random_uuid());
insert into auth.users(id, email) select v, v || '@consent.test' from _u;

select ok(not public.service_customer_save_tax_document((select v from _u where k = 'a'), '529.982.247-25', 'payment')
  and not public.service_customer_save_tax_document((select v from _u where k = 'a'), '529.982.247-25', 'payment', true, null)
  and not exists (select 1 from private.customer_tax_documents where user_id = (select v from _u where k = 'a')),
  'sem consentimento (ou sem o texto aceito) o CPF não é guardado');

select public.service_customer_save_tax_document((select v from _u where k = 'a'), '529.982.247-25', 'payment', true, 'Salvar meu CPF v1');
select ok(exists (select 1 from private.customer_tax_documents where user_id = (select v from _u where k = 'a')
    and consent_at is not null and consent_text = 'Salvar meu CPF v1'),
  'com consentimento guarda e registra quando e o texto aceito');

-- Linha antiga, sem consentimento: não aparece para o cliente.
insert into private.customer_tax_documents(user_id, document, source) values ((select v from _u where k = 'b'), '12345678909', 'payment');
select pg_temp.act((select v from _u where k = 'b'));
select ok(public.customer_get_tax_document() is null, 'CPF guardado sem consentimento não é oferecido');

select pg_temp.act((select v from _u where k = 'a'));
select is(public.customer_get_tax_document(), '52998224725', 'o cliente vê o próprio CPF salvo');
select public.customer_delete_tax_document();
select ok(public.customer_get_tax_document() is null
  and exists (select 1 from private.customer_tax_documents where user_id = (select v from _u where k = 'b')),
  'e exclui só o próprio');

select * from finish();
rollback;
