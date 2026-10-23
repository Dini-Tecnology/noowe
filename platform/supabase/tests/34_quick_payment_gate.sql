-- N4 #3 / T-N4-05: nenhum pedido pré-pago entra em produção sem pagamento confirmado,
-- inclusive quando service_model é NULL (pedidos de place_order / custom combo).
begin;
select plan(13);

do $$
declare r uuid := 'c1000000-0000-4000-8000-000000000002';
begin
  update public.restaurant_model_configs set
    service_models = array['casual_dining','quick_service']::public.noowe_service_model[]
    where restaurant_id = r;
end $$;

-- A função só lê campos do pedido; monta-se o registro sem inserir nada.
create function pg_temp.gate(p_fields jsonb) returns boolean language sql as $$
  select private.order_may_enter_production(jsonb_populate_record(null::public.orders,
    jsonb_build_object('restaurant_id', 'c1000000-0000-4000-8000-000000000002') || p_fields))
$$;

-- Política prepaid_required (Quick)
select is(pg_temp.gate('{"service_model":"quick_service","order_type":"pickup","payment_status":"pending"}'),
  false, 'pré-pago sem pagamento não entra em produção');
select is(pg_temp.gate('{"service_model":"quick_service","order_type":"pickup","payment_status":"confirmed"}'),
  false, 'pré-pago pago mas não aceito não entra em produção');
select is(pg_temp.gate('{"service_model":"quick_service","order_type":"pickup","payment_status":"confirmed","accepted_at":"2026-10-23T12:00:00Z"}'),
  true, 'pré-pago pago e aceito entra em produção');
select is(pg_temp.gate('{"service_model":"quick_service","order_type":"pickup","payment_status":"failed","accepted_at":"2026-10-23T12:00:00Z"}'),
  false, 'pagamento falho nunca libera');
select is(pg_temp.gate('{"service_model":"quick_service","order_type":"pickup","payment_status":"refund_pending","accepted_at":"2026-10-23T12:00:00Z"}'),
  false, 'estorno em andamento não libera');

-- Política sem prepaid_required (Casual)
select is(pg_temp.gate('{"service_model":"casual_dining","order_type":"dine_in","payment_status":"pending"}'),
  true, 'modelo sem pré-pagamento segue livre');

-- service_model NULL: o bypass fechado
select is(pg_temp.gate('{"order_type":"pickup","payment_status":"pending"}'),
  false, 'pickup sem service_model e sem pagamento NÃO entra em produção');
select is(pg_temp.gate('{"order_type":"delivery","payment_status":"pending"}'),
  false, 'delivery sem service_model e sem pagamento NÃO entra em produção');
select is(pg_temp.gate('{"order_type":"pickup","payment_status":"confirmed"}'),
  true, 'pickup sem service_model entra após pagamento confirmado');
select is(pg_temp.gate('{"order_type":"dine_in","payment_status":"pending"}'),
  true, 'pedido de salão sem service_model segue livre (paga no fechamento)');

-- Sem linha de política para o par restaurante/modelo: falha fechada
select is(
  private.order_may_enter_production(jsonb_populate_record(null::public.orders,
    '{"restaurant_id":"99999999-9999-4999-8999-999999999999","service_model":"quick_service","order_type":"pickup","payment_status":"pending"}'::jsonb)),
  false, 'modelo sem linha de política exige pagamento');

-- O nome antigo continua valendo para KDS e transições de status
select is(
  private.quick_order_may_enter_production(jsonb_populate_record(null::public.orders,
    '{"restaurant_id":"c1000000-0000-4000-8000-000000000002","order_type":"pickup","payment_status":"pending"}'::jsonb)),
  false, 'função antiga delega ao novo gate');
select is(
  private.quick_order_may_enter_production(jsonb_populate_record(null::public.orders,
    '{"restaurant_id":"c1000000-0000-4000-8000-000000000002","service_model":"quick_service","order_type":"pickup","payment_status":"confirmed","accepted_at":"2026-10-23T12:00:00Z"}'::jsonb)),
  true, 'função antiga libera pedido pago e aceito');

select * from finish();
rollback;
