-- Tipos de notificação usados pela decisão do maître sobre abrir mesa (ADR-016) e
-- pelas próximas entregas (aviso à equipe, troca de mesa). Sem eles, o cast em
-- private.create_notification falha e a decisão do maître faz rollback.
-- Valores de enum ficam em migration própria: não podem ser usados na transação que os cria.
do $$
declare v_label text;
begin
  foreach v_label in array array['table_open_approved','table_open_update','table_moved',
                                  'staff_table_check_in','capacity_request_pending'] loop
    if not exists (
      select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
      where t.typname = 'notifications_notification_type_enum' and e.enumlabel = v_label
    ) then
      execute format('alter type public.notifications_notification_type_enum add value %L', v_label);
    end if;
  end loop;

  foreach v_label in array array['capacity_request','table'] loop
    if not exists (
      select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
      where t.typname = 'notifications_related_type_enum' and e.enumlabel = v_label
    ) then
      execute format('alter type public.notifications_related_type_enum add value %L', v_label);
    end if;
  end loop;
end $$;
