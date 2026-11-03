-- T1, critério 1: sem fornecedor de Tap ativo, o servidor recusa pagamento por aproximação.
begin;
select plan(2);

select throws_ok(
  $$select public.customer_pay_table_bill(gen_random_uuid(), 0, 'tap_to_pay', null, 'mine', gen_random_uuid(), null)$$,
  '22023', 'Pagamento por aproximação indisponível',
  'critério 1: tap_to_pay é recusado antes de qualquer outra checagem');

-- Outros meios seguem o caminho de antes: aqui chegam à checagem da sessão.
select throws_ok(
  $$select public.customer_pay_table_bill(gen_random_uuid(), 0, 'pix', null, 'mine', gen_random_uuid(), null)$$,
  'P0001', 'Sessão da mesa indisponível',
  'pix não é afetado');

select * from finish();
rollback;
