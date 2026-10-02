-- ADR-013: o pedido Quick já notifica o cliente em cada etapa por private.quick_order_notify
-- (pago, aceito, em preparo, pronto com o código, retirado, não retirado, estornado).
-- O trigger genérico trg_customer_order_notification, que escuta orders.status, mandava um
-- segundo aviso por transição ("Atualização do pedido ... foi entregue"). Para Quick ele agora
-- não faz nada; reservas, filas e os demais modelos seguem como antes.

create or replace function private.notify_customer_state_change()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'private', 'pg_temp'
as $function$
declare v_title text; v_kind text; v_customer uuid;
begin
  if tg_op <> 'UPDATE' or new.status::text = old.status::text then return new; end if;
  if tg_table_name = 'orders' then
    if new.service_model = 'quick_service' then return new; end if;
    v_title := 'Atualização do pedido'; v_kind := 'order';
  elsif tg_table_name = 'reservations' then v_title := 'Atualização da reserva'; v_kind := 'reservation';
  else v_title := 'Atualização da fila'; v_kind := 'waitlist'; end if;
  v_customer := new.customer_id;
  if v_customer is not null then
    perform private.create_notification(v_customer, v_title,
      private.customer_status_message(v_kind, new.status::text),
      'system', new.id, case when v_kind = 'waitlist' then null else v_kind end,
      jsonb_build_object('screen', v_kind, 'id', new.id, 'status', new.status::text));
  end if;
  return new;
end $function$;
