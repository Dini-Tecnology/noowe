-- M1, segunda carga: valores novos, plano sugerido, contrato, empresa e Tap, tudo em parâmetro e com histórico.
begin;
select plan(15);

select is((select order_allowance from private.noowe_plans where code = 'business'), 8000, 'Business tem 8.000 pedidos');
select is((select fee_cents from private.noowe_convenience_fees where flow = 'pickup' and restaurant_id is null), 0::bigint,
  'conveniência de retirada em R$ 0');
select is((select enabled from private.noowe_convenience_fees where flow = 'scheduled' and restaurant_id is null), false,
  'conveniência agendada desligada');
select is(private.convenience_fee_cents(null, 'pickup'), 0::bigint, 'desligada, a função não cobra nada');

select is((select trial_days from private.noowe_billing_settings), 30, 'teste de 30 dias');
select is(private.suggested_plan_code('quick_service'), 'essencial', 'Quick sugere Essencial');
select is(private.suggested_plan_code('casual_dining'), 'profissional', 'Casual sugere Profissional');
select is(private.suggested_plan_code('fine_dining'), 'business', 'Fine sugere Business');
select is((select cnpj from private.noowe_company), '64159447000190', 'CNPJ da NOOWE preenchido');
select is(private.tap_provider_active(), false, 'sem fornecedor ativo, o Tap está desligado');
select is((select enabled from private.noowe_plan_features where plan_code = 'profissional' and feature_key = 'tap_to_pay'), false,
  'Tap fora da lista do Profissional');

select throws_ok($$update private.noowe_tap_settings set active = true$$, '23514', null, 'não liga o Tap sem dizer o fornecedor');
select throws_ok($$update private.noowe_company set legal_name = 'NOOWE'$$, '22023', null, 'sem autor, a alteração é recusada');
select throws_ok($$update private.noowe_company set cnpj = '123'$$, '23514', null, 'CNPJ precisa ter 14 dígitos');

select set_config('noowe.param_author', 'teste', true);
update private.noowe_plans set order_allowance = 8100 where code = 'business';
select is((select "after"->>'order_allowance' from private.noowe_param_history where table_name = 'noowe_plans'
  and author = 'teste' order by id desc limit 1), '8100', 'a alteração fica no histórico');

select * from finish();
rollback;
