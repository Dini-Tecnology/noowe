import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import customerBackend, {
  type TableInviteChange,
  type TableUserInvite,
  type TableUserInviteStatus,
} from '../services/customer-backend';

/** Query keys shared by the inviter sheet, the invitee banner and notifications. */
export const tableInviteKeys = {
  session: (tableSessionId: string | null | undefined) => ['table-user-invites', tableSessionId] as const,
  incoming: ['incoming-table-invites'] as const,
  byIds: (ids: readonly string[]) => ['table-user-invites-by-id', ...ids] as const,
};

/**
 * One realtime channel per screen: invites addressed to me and, when I'm at a
 * table, every invite of that table. Any change refreshes the lists and the
 * table bill (a new participant appears there once an invite is accepted).
 */
export function useTableInvitesRealtime(
  tableSessionId: string | null | undefined,
  enabled = true,
  onChange?: (change: TableInviteChange | null) => void,
) {
  const queryClient = useQueryClient();
  // Latest callback without resubscribing the channel on every render.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  useEffect(() => {
    if (!enabled) return undefined;
    let channel: Awaited<ReturnType<typeof customerBackend.subscribeToTableInvites>> | undefined;
    let cancelled = false;
    customerBackend.subscribeToTableInvites(tableSessionId ?? null, (change) => {
      onChangeRef.current?.(change);
      void queryClient.invalidateQueries({ queryKey: tableInviteKeys.incoming });
      void queryClient.invalidateQueries({ queryKey: ['table-user-invites-by-id'] });
      if (tableSessionId) {
        void queryClient.invalidateQueries({ queryKey: tableInviteKeys.session(tableSessionId) });
        void queryClient.invalidateQueries({ queryKey: ['table-bill', tableSessionId] });
        void queryClient.invalidateQueries({ queryKey: ['table-diners', tableSessionId] });
      }
    }).then((value) => {
      if (cancelled) void value.unsubscribe();
      else channel = value;
    }).catch(() => {
      // The lists still refresh on focus and pull-to-refresh without Realtime.
    });
    return () => {
      cancelled = true;
      void channel?.unsubscribe();
    };
  }, [enabled, queryClient, tableSessionId]);
}

/** Invites someone sent me that I can still answer (or am waiting on the host stand for). */
export function useIncomingTableInvites(
  enabled = true,
  onChange?: (change: TableInviteChange | null) => void,
) {
  useTableInvitesRealtime(null, enabled, onChange);
  return useQuery({
    queryKey: tableInviteKeys.incoming,
    queryFn: () => customerBackend.listIncomingTableInvites(),
    enabled,
  });
}

/** Invites of the table I'm at (the inviter's "Convites enviados"). */
export function useTableSessionUserInvites(tableSessionId: string | null | undefined, enabled = true) {
  useTableInvitesRealtime(tableSessionId, enabled && !!tableSessionId);
  return useQuery({
    queryKey: tableInviteKeys.session(tableSessionId),
    queryFn: () => customerBackend.listTableSessionUserInvites(tableSessionId!),
    enabled: enabled && !!tableSessionId,
  });
}

export const TABLE_INVITE_STATUS_LABELS: Record<TableUserInviteStatus, string> = {
  pending: 'Aguardando resposta',
  awaiting_capacity: 'Aguardando liberação da recepção',
  accepted: 'Entrou na mesa',
  declined: 'Recusou',
  cancelled: 'Cancelado',
  expired: 'Expirou',
  capacity_rejected: 'Mesa sem lugar',
};

/** Why an invite I received is no longer answerable, in the invitee's words. */
export function describeClosedInvite(invite: Pick<TableUserInvite, 'status' | 'closedReason'>): string {
  switch (invite.closedReason) {
    case 'inviter_cancelled': return 'Quem te convidou cancelou o convite.';
    case 'inviter_left': return 'Quem te convidou já saiu da mesa.';
    case 'session_closed': return 'Essa mesa já foi encerrada.';
    case 'feature_disabled': return 'O restaurante desativou convites por @.';
    case 'capacity_ttl': return 'A recepção não respondeu a tempo. Fale com a recepção.';
    case 'joined_otherwise': return 'Você já está nessa mesa.';
    case 'joined_other_table': return 'Você entrou em outra mesa.';
    case 'ttl': return 'O convite expirou.';
    default: break;
  }
  switch (invite.status) {
    case 'accepted': return 'Você entrou na mesa.';
    case 'declined': return 'Você recusou esse convite.';
    case 'capacity_rejected': return 'A recepção não liberou sua entrada: a mesa está lotada.';
    case 'expired': return 'O convite expirou.';
    case 'cancelled': return 'O convite foi cancelado.';
    default: return TABLE_INVITE_STATUS_LABELS[invite.status];
  }
}

/** Server messages are already in Portuguese; a few codes get friendlier wording. */
export function describeTableInviteError(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;
  const message = error instanceof Error ? error.message : (error as { message?: string } | null)?.message;
  switch (code) {
    case 'P0004': return 'Quite sua conta na mesa atual antes de entrar em outra.';
    case 'P0009': return 'Este restaurante não aceita convites por @.';
    case 'P0002': return message && /usu[aá]rio/i.test(message) ? 'Não encontramos ninguém com esse @.' : 'Convite não encontrado.';
    default: return message || 'Não foi possível concluir agora. Tente novamente.';
  }
}
