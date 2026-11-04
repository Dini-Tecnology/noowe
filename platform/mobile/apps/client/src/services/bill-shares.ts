import * as Crypto from 'expo-crypto';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/shared/services/supabase';

let channelCount = 0;

/**
 * Divisão de conta (G3). O app só escolhe o modo e exibe: toda parcela, taxa e gorjeta
 * é calculada no servidor e chega em centavos. Nada aqui soma, multiplica ou arredonda dinheiro.
 */
export type SplitMode = 'by_owner' | 'equal' | 'by_item' | 'fixed_amount';
export type BillShareStatus = 'open' | 'pending_payment' | 'paid' | 'superseded' | 'abandoned' | 'refunded';

export type FeeOrTipMode = 'service_fee' | 'tip';

export type SplitPlanShare = {
  participantId: string; mode: SplitMode; baseCents: number; feeCents: number; amountCents: number; tipCents: number;
  /** O que sai do cartão: consumo, taxa e gorjeta. */
  chargeCents: number;
  feeWaived: boolean;
};
export type SplitPlan = {
  mode: SplitMode;
  /** Quanto falta pagar de consumo. Taxa e gorjeta são de cada pagamento, por cima dele. */
  balanceCents: number;
  totalRemCents: number;
  unassignedCents: number;
  version: string;
  /** Valor fixo pedido acima do saldo foi ajustado: "Restam só R$ X nesta conta". */
  adjusted: boolean;
  feeOrTipMode: FeeOrTipMode;
  feeBps: number;
  shares: SplitPlanShare[];
};

export type BillSummary = {
  consumptionCents: number;
  paidCents: number;
  pendingCents: number;
  balanceCents: number;
  settled: boolean;
  feeOrTipMode: FeeOrTipMode;
  feeBps: number;
  tipPresetsBps: number[];
  tipDefaultBps: number | null;
  /** Quem saiu sem pagar: a parte ficou com o titular. */
  leftWithoutPaying: { participantId: string; name: string }[];
  itemsRemaining: { orderItemId: string; remainingCents: number }[];
};

export type BillShare = {
  id: string;
  /** Pagamento feito no salão não tem participante. */
  participantId: string | null;
  mode: SplitMode;
  baseCents: number;
  feeCents: number;
  amountCents: number;
  tipCents: number;
  feeWaived: boolean;
  couponDiscountCents: number;
  status: BillShareStatus;
};

export type ItemClaim = { orderItemId: string; participantId: string };
export type TipOption = { percent: number; cents: number; totalCents: number };
export type TipQuote = { tipCents: number; totalCents: number };

export type SharePayment = {
  paymentId: string | null;
  status: 'pending' | 'confirmed';
  amountCents: number;
  expiresAt: string | null;
  checkoutUrl: string | null;
  pix: { payload: string; expiresAt: string | null } | null;
  alreadyPaid: boolean;
  /** Cobrado no cartão salvo: não há página para abrir; a confirmação chega pelo webhook. */
  savedCard: boolean;
};

/** Cartão salvo que dá para usar em um toque: o app vê bandeira e final, nunca o token. */
export type SavedCard = { id: string; brand: string | null; lastFour: string; isDefault: boolean };

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
    balanceCents: num(raw.balanceCents),
    totalRemCents: num(raw.totalRemCents),
    unassignedCents: num(raw.unassignedCents),
    version: String(raw.version ?? ''),
    adjusted: raw.adjusted === true,
    feeOrTipMode: raw.feeOrTipMode === 'tip' ? 'tip' : 'service_fee',
    feeBps: num(raw.feeBps),
    shares: shares.map((value) => {
      const s = obj(value);
      return {
        participantId: String(s.participantId), mode: s.mode as SplitMode, baseCents: num(s.baseCents), feeCents: num(s.feeCents),
        amountCents: num(s.amountCents), tipCents: num(s.tipCents), chargeCents: num(s.chargeCents), feeWaived: s.feeWaived === true,
      };
    }),
  };
}

/**
 * `amountCents` é o total que sai do cartão (valor fixo). `tipBps` sai de dentro dele; `tipCents` entra por cima.
 * `people` é o número de pessoas ajustado em partes iguais: quem confirma paga a própria parte, e o resto segue no saldo.
 */
export type SplitParams = { amountCents?: number; tipBps?: number; tipCents?: number; people?: number; waiveFee?: boolean };

function mapSummary(data: unknown): BillSummary {
  const raw = obj(data);
  const list = (value: unknown) => (Array.isArray(value) ? value : []);
  return {
    consumptionCents: num(raw.consumptionCents),
    paidCents: num(raw.paidCents),
    pendingCents: num(raw.pendingCents),
    balanceCents: num(raw.balanceCents),
    settled: raw.settled === true,
    feeOrTipMode: raw.feeOrTipMode === 'tip' ? 'tip' : 'service_fee',
    feeBps: num(raw.feeBps),
    tipPresetsBps: list(raw.tipPresetsBps).map(num),
    tipDefaultBps: raw.tipDefaultBps == null ? null : num(raw.tipDefaultBps),
    leftWithoutPaying: list(raw.leftWithoutPaying).map((value) => ({
      participantId: String(obj(value).participantId), name: String(obj(value).name ?? 'Convidado'),
    })),
    itemsRemaining: list(raw.itemsRemaining).map((value) => ({
      orderItemId: String(obj(value).orderItemId), remainingCents: num(obj(value).remainingCents),
    })),
  };
}

/** Cria a cobrança no provedor. A resposta nunca significa "pago": quem confirma é o webhook. */
export async function invokePaymentsCreate(body: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await getSupabaseClient().functions.invoke('payments-create', { body });
  if (error) {
    const response = (error as { context?: Response }).context;
    const parsed = response && typeof response.json === 'function' ? await response.json().catch(() => null) : null;
    const code = (parsed as { error?: string } | null)?.error;
    throw Object.assign(new Error(PAYMENT_ERRORS[code ?? ''] ?? 'Não foi possível criar a cobrança. Tente novamente.'), { code });
  }
  return data;
}

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
      .select('id, participant_id, mode, base_cents, service_fee_cents, amount_cents, tip_cents, fee_waived_at, coupon_discount_cents, status')
      .eq('table_session_id', tableSessionId).in('status', ['open', 'pending_payment', 'paid']).order('created_at');
    if (error) throw error;
    return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: String(row.id), participantId: row.participant_id == null ? null : String(row.participant_id), mode: row.mode as SplitMode,
      baseCents: num(row.base_cents), feeCents: num(row.service_fee_cents), amountCents: num(row.amount_cents), tipCents: num(row.tip_cents),
      feeWaived: row.fee_waived_at != null, couponDiscountCents: num(row.coupon_discount_cents), status: row.status as BillShareStatus,
    }));
  },

  /** Recibo do próprio cliente nesta mesa; a RLS só devolve o que é dele. */
  async latestReceiptId(tableSessionId: string): Promise<string | null> {
    const { data, error } = await client().from('casual_dining_receipts').select('id')
      .eq('table_session_id', tableSessionId).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return data ? String((data as { id: unknown }).id) : null;
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

  async summary(tableSessionId: string): Promise<BillSummary> {
    return mapSummary(await rpc('customer_bill_summary', { p_table_session_id: tableSessionId }));
  },

  /** Sem percentuais, valem as sugestões do restaurante. Em modo taxa, a lista vem vazia. */
  async tipOptions(shareId: string, percents?: number[]): Promise<TipOption[]> {
    const data = await rpc('customer_share_tip_options', { p_share_id: shareId, p_percents: percents ?? null });
    return (Array.isArray(data) ? data : []).map((value) => ({ percent: num(obj(value).percent), cents: num(obj(value).cents), totalCents: num(obj(value).totalCents) }));
  },

  /** A conta da gorjeta é do servidor: a tela só mostra. */
  async tipQuote(amountCents: number, tip: { tipBps?: number; tipCents?: number }): Promise<TipQuote> {
    const data = obj(await rpc('customer_tip_quote', { p_amount_cents: amountCents, p_tip_bps: tip.tipBps ?? 0, p_tip_cents: tip.tipCents ?? 0 }));
    return { tipCents: num(data.tipCents), totalCents: num(data.totalCents) };
  },

  /** Total do checkout, com gorjeta e conveniência. O valor cobrado sai do pedido, no servidor. */
  async checkoutQuote(restaurantId: string, amountCents: number, input: { scheduled: boolean; tipBps: number; tipCents: number }): Promise<TipQuote & { convenienceCents: number }> {
    const data = obj(await rpc('customer_checkout_quote', {
      p_restaurant_id: restaurantId, p_amount_cents: amountCents, p_scheduled: input.scheduled, p_tip_bps: input.tipBps, p_tip_cents: input.tipCents,
    }));
    return { tipCents: num(data.tipCents), totalCents: num(data.totalCents), convenienceCents: num(data.convenienceCents) };
  },

  /** O servidor valida e diz por que não vale: a mensagem do erro é para a pessoa. */
  async applyCoupon(shareId: string, code: string): Promise<void> {
    await rpc('customer_apply_coupon', { p_share_id: shareId, p_code: code });
  },
  async removeCoupon(shareId: string): Promise<void> {
    await rpc('customer_remove_coupon', { p_share_id: shareId });
  },
  async applyCouponToOrder(orderId: string, code: string): Promise<void> {
    await rpc('customer_apply_coupon_to_order', { p_order_id: orderId, p_code: code });
  },

  /** Um toque, sem aprovação, e fica registrado. Vale só para a parte da própria pessoa. */
  async setFeeWaived(shareId: string, waived: boolean): Promise<void> {
    await rpc('customer_set_share_fee_waived', { p_share_id: shareId, p_waived: waived });
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
  async pay(input: {
    /** `null` mantém a gorjeta que já está na parcela (valor fixo com gorjeta). */
    shareId: string; method: 'pix' | 'credit_card'; tipCents: number | null; idempotencyKey: string; payerCpfCnpj?: string;
    /** Só com cartão: salvar o cartão digitado no Asaas (consentimento) ou usar um cartão já salvo. */
    saveCard?: boolean; paymentMethodId?: string;
  }): Promise<SharePayment> {
    // Provedor simulado só com a flag de desenvolvimento do servidor; o normal é a cobrança real.
    if (await rpc('customer_share_payment_mode', { p_share_id: input.shareId }) === 'simulated') {
      await rpc('customer_pay_share', { p_share_id: input.shareId, p_method: input.method, p_idempotency_key: input.idempotencyKey, p_tip_cents: input.tipCents });
      return { paymentId: null, status: 'confirmed', amountCents: 0, expiresAt: null, checkoutUrl: null, pix: null, alreadyPaid: false, savedCard: false };
    }
    const data = await invokePaymentsCreate({ purpose: 'bill_share', targetId: input.shareId, method: input.method, tipCents: input.tipCents,
      idempotencyKey: input.idempotencyKey, payerCpfCnpj: input.payerCpfCnpj,
      ...(input.saveCard ? { saveCard: true } : {}), ...(input.paymentMethodId ? { paymentMethodId: input.paymentMethodId } : {}) });
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
      savedCard: raw.savedCard === true,
    };
  },

  async listSavedCards(): Promise<SavedCard[]> {
    const data = await rpc('customer_list_saved_cards', {});
    return (Array.isArray(data) ? data : []).map((value) => {
      const row = obj(value);
      return { id: String(row.id), brand: typeof row.brand === 'string' ? row.brand : null, lastFour: String(row.lastFour ?? ''), isDefault: row.isDefault === true };
    });
  },

  subscribe(tableSessionId: string, onChange: () => void): RealtimeChannel {
    const filter = `table_session_id=eq.${tableSessionId}`;
    // Duas telas da pilha assinam a mesma conta: com o mesmo nome, channel() devolveria o canal já assinado,
    // e acrescentar callbacks nele derruba a tela.
    channelCount += 1;
    return getSupabaseClient().channel(`bill-shares:${tableSessionId}:${channelCount}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bill_shares', filter }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bill_item_claims', filter }, onChange)
      .subscribe();
  },
};

export const PAYMENT_ERRORS: Record<string, string> = {
  payer_document_required: 'Informe seu CPF para gerar a cobrança.',
  payments_unavailable: 'Este restaurante ainda não aceita pagamento online.',
  payment_not_allowed: 'Este pagamento não pode ser feito agora. Atualize a tela.',
  not_found: 'Cobrança não encontrada.',
  card_not_found: 'Cartão salvo não encontrado. Escolha outro cartão.',
  invalid_request: 'Dados de pagamento inválidos.',
  provider_unavailable: 'O provedor de pagamento está indisponível. Tente novamente em instantes.',
  bill_changed: 'A conta mudou. Confira os valores atualizados.',
  below_minimum: 'O valor mínimo para pagar pelo app é R$ 5,00. Combine com a equipe no salão, ou pague um valor maior.',
};

export const SPLIT_ERRORS: Record<string, string> = {
  P0012: 'A conta mudou. Confira os valores atualizados.',
  P0011: 'Esta conta já está quitada.',
  '22023': 'Valor inválido.',
};
