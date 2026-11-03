-- O2 (ADR-022) — tipos de aviso do motor. Valores de enum ficam em migration própria: não podem ser usados na
-- transação que os cria.
alter type public.notifications_notification_type_enum add value if not exists 'staff_task';
alter type public.notifications_related_type_enum add value if not exists 'staff_task';
alter type public.notifications_related_type_enum add value if not exists 'approval';
