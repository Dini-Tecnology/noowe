-- ADR-030 — tipos do aviso de nota fiscal parada. Valores de enum ficam em migration própria:
-- não podem ser usados na transação que os cria.
alter type public.notifications_notification_type_enum add value if not exists 'fiscal_document_issue';
alter type public.notifications_related_type_enum add value if not exists 'fiscal_document';
