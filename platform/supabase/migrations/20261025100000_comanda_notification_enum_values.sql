-- G4 (ADR-021) — tipos de notificação da comanda. Valores de enum ficam em migration própria:
-- não podem ser usados na transação que os cria.
do $$
declare v_label text;
begin
  foreach v_label in array array['table_session_closed', 'staff_session_idle'] loop
    if not exists (
      select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
      where t.typname = 'notifications_notification_type_enum' and e.enumlabel = v_label
    ) then
      execute format('alter type public.notifications_notification_type_enum add value %L', v_label);
    end if;
  end loop;
end $$;
