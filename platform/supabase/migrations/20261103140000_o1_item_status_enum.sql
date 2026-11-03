-- O1 (ADR-024) — estados novos do item. Valores de enum ficam em migration própria: não podem ser usados na
-- transação que os cria. `pending` é "Recebido": o rótulo vem do módulo statusLabel, a chave não muda.
alter type public.order_items_status_enum add value if not exists 'awaiting_payment';
alter type public.order_items_status_enum add value if not exists 'on_hold';
alter type public.order_items_status_enum add value if not exists 'fired';
