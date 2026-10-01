-- G2b / ADR-011 — convite para a mesa por @username.
--
-- Migration separada de propósito: um valor novo de enum criado com
-- `alter type ... add value` não pode ser usado na mesma transação em que nasce.
-- As migrations seguintes gravam notificações com estes valores.

alter type public.notifications_notification_type_enum add value if not exists 'table_invite';
alter type public.notifications_notification_type_enum add value if not exists 'table_invite_update';
alter type public.notifications_related_type_enum add value if not exists 'table_session';

do $$
begin
  if not exists (select 1 from pg_type where typname = 'noowe_table_user_invite_status') then
    create type public.noowe_table_user_invite_status as enum (
      'pending',            -- aguardando resposta do convidado
      'awaiting_capacity',  -- convidado aceitou; a mesa estourou e a recepção decide (ADR-007)
      'accepted',
      'declined',
      'cancelled',
      'expired',
      'capacity_rejected'   -- recusado pela recepção, não pelo convidado
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'noowe_capacity_request_status') then
    create type public.noowe_capacity_request_status as enum (
      'pending', 'approved', 'rejected', 'expired', 'cancelled'
    );
  end if;

  -- Motivos de decisão do ADR-007.
  if not exists (select 1 from pg_type where typname = 'noowe_capacity_decision_reason') then
    create type public.noowe_capacity_decision_reason as enum (
      'crianca_colo', 'cadeira_extra', 'juncao_mesas', 'troca_de_mesa', 'recusado'
    );
  end if;
end $$;
