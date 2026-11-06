import { getSupabaseClient } from '@/shared/services/supabase';

/** Passar a titularidade da mesa (resposta 49): o titular oferece a quem está na mesa, e só quem recebeu aceita. */
export type HostCandidate = { participantId: string; name: string };
export type PendingHostTransfer = { transferId: string; incoming: boolean; fromName: string; toName: string };

async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await getSupabaseClient().rpc(name, args);
  if (error) throw error;
  return data;
}

export const hostTransfer = {
  async candidates(tableSessionId: string): Promise<HostCandidate[]> {
    const data = await rpc('customer_list_host_candidates', { p_table_session_id: tableSessionId });
    return Array.isArray(data) ? (data as HostCandidate[]) : [];
  },
  async offer(tableSessionId: string, participantId: string): Promise<{ toName: string }> {
    const data = (await rpc('customer_offer_host_transfer', { p_table_session_id: tableSessionId, p_to_participant_id: participantId })) as { toName?: string } | null;
    return { toName: data?.toName ?? 'Convidado' };
  },
  async pending(tableSessionId: string): Promise<PendingHostTransfer | null> {
    const data = (await rpc('customer_pending_host_transfer', { p_table_session_id: tableSessionId })) as PendingHostTransfer | null;
    return data && data.transferId ? data : null;
  },
  async respond(transferId: string, accept: boolean): Promise<{ accepted: boolean }> {
    const data = (await rpc('customer_respond_host_transfer', { p_transfer_id: transferId, p_accept: accept })) as { accepted?: boolean } | null;
    return { accepted: data?.accepted === true };
  },
};
