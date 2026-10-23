import * as Crypto from 'expo-crypto';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/shared/services/supabase';

/**
 * Divisão de conta (G3). O app só escolhe o modo e exibe: toda parcela, taxa e gorjeta
 * é calculada no servidor e chega em centavos. Nada aqui soma, multiplica ou arredonda dinheiro.
 */
export type SplitMode = 'by_owner' | 'equal' | 'by_item' | 'fixed_amount';
export type BillShareStatus = 'open' | 'pending_payment' | 'paid' | 'superseded' | 'abandoned' | 'refunded';

export type SplitPlanShare = { participantId: string; mode: SplitMode; baseCents: number; feeCents: number; amountCents: number };
export type SplitPlan = {
  mode: SplitMode;
  totalRemCents: number;
  unassignedCents: number;
  version: string;
  shares: SplitPlanShare[];
};

export type BillShare = {
  id: string;
  participantId: string;
  mode: SplitMode;
  amountCents: number;
  tipCents: number;
  status: BillShareStatus;
};

export type ItemClaim = { orderItemId: string; participantId: string };
export type TipOption = { percent: number; cents: number; totalCents: number };

export type SharePayment = {
  paymentId: string | null;
  status: 'pending' | 'confirmed';
  amountCents: number;
  expiresAt: string | null;
  checkoutUrl: string | null;
  pix: { payload: string; expiresAt: string | null } | null;
  alreadyPaid: boolean;
};

type RpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>;
  from: (table: string) => any;
};
// database.generated.ts ainda não conhece estas RPCs; a fronteira fica tipada aqui.
const client = () => getSupabaseClient() as unknown as RpcClient;

function num(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await client().rpc(name, args);
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return data;
}

function mapPlan(data: unknown): SplitPlan {
  const raw = obj(data);
  const shares = Array.isArray(raw.shares) ? raw.shares : [];
  return {
    mode: raw.mode as SplitMode,
    totalRemCents: num(raw.totalRemCents),
    unassignedCents: num(raw.unassignedCents),
    version: String(raw.version ?? ''),
    shares: shares.map((value) => {
      const s = obj(value);
      return { participantId: String(s.participantId), mode: s.mode as SplitMode, baseCents: num(s.baseCents), feeCents: num(s.feeCents), amountCents: num(s.amountCents) };
    }),
  };
}

export type SplitParams = { amountCents?: number };

export const billShares = {
  async preview(tableSessionId: string, mode: SplitMode, params: SplitParams = {}): Promise<SplitPlan> {
    return mapPlan(await rpc('customer_bill_split_preview', { p_table_session_id: tableSessionId, p_mode: mode, p_params: params }));
  },

  /** `version` vem do preview que o usuário viu: se a conta mudou, o servidor recusa (P0012). */
  async commit(input: { tableSessionId: string; mode: SplitMode; params?: SplitParams; version: string; idempotencyKey?: string }): Promise<string[]> {
    const data = obj(await rpc('customer_bill_split_commit', {
      p_table_session_id: input.tableSessionId, p_mode: input.mode, p_params: input.params ?? {},
      p_expected_version: input.version, p_idempotency_key: input.idempotencyKey ?? Crypto.randomUUID(),
    }));
    return Array.isArray(data.shareIds) ? data.shareIds.map(String) : [];
  },

  async list(tableSessionId: string): Promise<BillShare[]> {
    const { data, error } = await client().from('bill_shares')
      .select('id, participant_id, mode, amount_cents, tip_cents, status')
      .eq('table_session_id', tableSessionId).in('status', ['open', 'pending_payment', 'paid']).order('created_at');
    if (error) throw error;
    return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: String(row.id), participantId: String(row.participant_id), mode: row.mode as SplitMode,
      amountCents: num(row.amount_cents), tipCents: num(row.tip_cents), status: row.status as BillShareStatus,
    }));
  },

  async listClaims(tableSessionId: string): Promise<ItemClaim[]> {
    const { data, error } = await client().from('bill_item_claims').select('order_item_id, participant_id')
      .eq('table_session_id', tableSessionId);
    if (error) throw error;
    return ((data ?? []) as Record<string, unknown>[]).map((row) => ({ orderItemId: String(row.order_item_id), participantId: String(row.participant_id) }));
  },

  async claimItem(orderItemId: string, claimed: boolean): Promise<void> {
    await rpc(claimed ? 'customer_claim_item' : 'customer_unclaim_item', { p_order_item_id: orderItemId });
  },

  async tipOptions(shareId: string, percents: number[]): Promise<TipOption[]> {
    const data = await rpc('customer_share_tip_options', { p_share_id: shareId, p_percents: percents });
    return (Array.isArray(data) ? data : []).map((value) => ({ percent: num(obj(value).percent), cents: num(obj(value).cents), totalCents: num(obj(value).totalCents) }));
  },

  async setTip(shareId: string, tipCents: number): Promise<void> {
    await rpc('customer_set_share_tip', { p_share_id: shareId, p_tip_cents: tipCents });
  },

  async abandon(shareId: string): Promise<void> {
    await rpc('customer_abandon_share', { p_share_id: shareId });
  },

  /**
   * Cria a cobrança da parcela no provedor. Quem confirma é o webhook (a parcela vira `paid`
   * por Realtime); a resposta aqui nunca significa "pago", só "cobrança criada".
   */
  async pay(input: { shareId: string; method: 'pix' | 'credit_card'; tipCents: number; idempotencyKey: string; payerCpfCnpj?: string }): Promise<SharePayment> {
    const { data, error } = await getSupabaseClient().functions.invoke('payments-create', {
      body: { purpose: 'bill_share', targetId: input.shareId, method: input.method, tipCents: input.tipCents,
        idempotencyKey: input.idempotencyKey, payerCpfCnpj: input.payerCpfCnpj },
    });
    if (error) {
      const response = (error as { context?: Response }).context;
      const body = response && typeof response.json === 'function' ? await response.json().catch(() => null) : null;
      const code = (body as { error?: string } | null)?.error;
      throw Object.assign(new Error(PAYMENT_ERRORS[code ?? ''] ?? 'Não foi possível criar a cobrança. Tente novamente.'), { code });
    }
    const raw = obj(data);
    const pix = obj(raw.pix);
    return {
      paymentId: typeof raw.paymentId === 'string' ? raw.paymentId : null,
      status: raw.status === 'confirmed' ? 'confirmed' : 'pending',
      amountCents: num(raw.amountCents),
      expiresAt: typeof raw.expiresAt === 'string' ? raw.expiresAt : null,
      checkoutUrl: typeof raw.checkoutUrl === 'string' ? raw.checkoutUrl : null,
      pix: typeof pix.payload === 'string' ? { payload: pix.payload, expiresAt: typeof pix.expiresAt === 'string' ? pix.expiresAt : null } : null,
      alreadyPaid: raw.alreadyPaid === true,
    };
  },

  subscribe(tableSessionId: string, onChange: () => void): RealtimeChannel {
    const filter = `table_session_id=eq.${tableSessionId}`;
    return getSupabaseClient().channel(`bill-shares:${tableSessionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bill_shares', filter }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bill_item_claims', filter }, onChange)
      .subscribe();
  },
};

const PAYMENT_ERRORS: Record<string, string> = {
  payer_document_required: 'Informe seu CPF para gerar a cobrança.',
  payments_unavailable: 'Este restaurante ainda não aceita pagamento online.',
  payment_not_allowed: 'Esta parcela não pode ser paga agora. Atualize a conta.',
  not_found: 'Parcela não encontrada.',
  invalid_request: 'Dados de pagamento inválidos.',
  provider_unavailable: 'O provedor de pagamento está indisponível. Tente novamente em instantes.',
};

export const SPLIT_ERRORS: Record<string, string> = {
  P0012: 'A conta mudou. Confira os valores atualizados.',
  P0011: 'Não há saldo a dividir.',
  '22023': 'Valor inválido.',
};
