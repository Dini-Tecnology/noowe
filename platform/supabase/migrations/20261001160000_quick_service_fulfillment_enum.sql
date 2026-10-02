-- ADR-013 — estados novos do cumprimento do pedido Quick Service.
--
-- Separada da migration principal porque um valor de enum adicionado numa
-- transação só pode ser usado depois do commit (mesmo padrão de
-- 20260928100000_user_invite_enums.sql).
--
--   accepted       pedido pago e aceito pelo restaurante (automático ou manual)
--   not_picked_up  pronto, mas a tolerância de retirada venceu

alter type public.noowe_fulfillment_status add value if not exists 'accepted' before 'preparing';
alter type public.noowe_fulfillment_status add value if not exists 'not_picked_up';
