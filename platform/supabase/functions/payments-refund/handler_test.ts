import { test } from "node:test";
import assert from "node:assert/strict";
import { handleRefund } from "./handler.ts";
import { AsaasError } from "../_shared/payments/asaas.ts";
import type { PaymentDeps } from "../_shared/payments/deps.ts";

const REFUND = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const job = { claimed: true, refundId: REFUND, action: "send", attempt: 1, total: true, paymentId: "p1", paymentAccountId: "a1", providerRef: "pay_1", amountCents: 1500, reason: "Prato errado" };

function setup(over: { job?: any; refund?: () => Promise<void>; status?: string; apiKey?: string | null; refunds?: any[]; split?: any[] } = {}) {
  const calls: { fn: string; args: any }[] = [];
  const refunds: any[] = [];
  const deps = {
    rpc: async (fn: string, args: any) => {
      calls.push({ fn, args });
      if (fn === "service_refund_claim") return { data: over.job ?? job, error: null };
      if (fn === "service_payment_account_secrets") return { data: { apiKey: over.apiKey === null ? undefined : "key" }, error: null };
      return { data: {}, error: null };
    },
    provider: {
      refund: async (...a: unknown[]) => { refunds.push(a); if (over.refund) await over.refund(); },
      getCharge: async () => ({ id: "pay_1", status: over.status ?? "RECEIVED", value: 15, refunds: over.refunds ?? null, split: over.split ?? null }),
    },
    env: (name: string) => name === "NOOWE_ASAAS_WALLET_ID" ? "w_noowe" : "service-key",
    getUser: async () => null,
  } as unknown as PaymentDeps;
  return { deps, calls, refunds };
}
const req = (body: unknown = { refundId: REFUND }, token = "service-key") =>
  new Request("http://x", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
const outcome = (calls: { fn: string; args: any }[]) => calls.find((c) => c.fn === "service_refund_record")?.args;

test("só a service role chama", async () => {
  const { deps } = setup();
  assert.equal((await handleRefund(req({ refundId: REFUND }, "x.e30.y"), deps)).status, 401);
});

test("envia em centavos e marca como enviado, sem dizer que foi devolvido", async () => {
  const { deps, calls, refunds } = setup();
  assert.equal((await handleRefund(req(), deps)).status, 200);
  assert.deepEqual(refunds[0], ["key", "pay_1", 1500, "Prato errado", undefined]);
  assert.equal(outcome(calls).p_outcome, "sent");
  assert.equal(calls.some((c) => c.fn === "service_payment_apply_event"), false);
});

test("estorno que outro processo já pegou não é enviado", async () => {
  const { deps, refunds } = setup({ job: { claimed: false } });
  await handleRefund(req(), deps);
  assert.equal(refunds.length, 0);
});

test("recusa da Asaas é definitiva e vai para uma pessoa", async () => {
  const { deps, calls } = setup({ refund: async () => { throw new AsaasError(400, {}, "saldo insuficiente"); } });
  await handleRefund(req(), deps);
  assert.equal(outcome(calls).p_outcome, "failed");
});

test("estorno parcial no mesmo dia espera o dia seguinte, sem virar falha", async () => {
  const body = { errors: [{ code: "invalid_action", description: "Esta transação só pode ser estornada parcialmente no próximo dia." }] };
  const { deps, calls } = setup({ job: { ...job, total: false }, refund: async () => { throw new AsaasError(400, body, "x"); } });
  await handleRefund(req(), deps);
  assert.equal(outcome(calls).p_outcome, "deferred");
});

test("queda de rede em estorno total tenta de novo", async () => {
  const { deps, calls } = setup({ refund: async () => { throw new AsaasError(503, {}, "fora"); } });
  await handleRefund(req(), deps);
  assert.equal(outcome(calls).p_outcome, "transient");
});

test("queda de rede em estorno parcial tenta de novo, porque a próxima tentativa confere antes", async () => {
  const { deps, calls } = setup({ job: { ...job, total: false }, refund: async () => { throw new Error("timeout"); } });
  await handleRefund(req(), deps);
  assert.equal(outcome(calls).p_outcome, "transient");
});

test("parcial retomado depois de queda: se o provedor já registra, não devolve de novo", async () => {
  const { deps, calls, refunds } = setup({ job: { ...job, total: false, attempt: 2, settledCents: 0 }, refunds: [{ status: "PENDING", value: 15 }] });
  await handleRefund(req(), deps);
  assert.equal(refunds.length, 0);
  assert.equal(outcome(calls).p_outcome, "sent");
});

test("parcial retomado: o que o provedor registra é de estorno anterior, então envia", async () => {
  const { deps, refunds } = setup({ job: { ...job, total: false, attempt: 2, settledCents: 1000 }, refunds: [{ status: "DONE", value: 10 }, { status: "CANCELLED", value: 15 }] });
  await handleRefund(req(), deps);
  assert.equal(refunds.length, 1);
});

test("conferência conclui parcial cujo aviso se perdeu, sem dar por feito o que não terminou", async () => {
  const done = setup({ job: { ...job, action: "verify", total: false, settledCents: 0 }, refunds: [{ status: "DONE", value: 15 }] });
  await handleRefund(req(), done.deps);
  const event = done.calls.find((c) => c.fn === "service_payment_apply_event")?.args;
  assert.equal(event.p_gateway_status, "partially_refunded");
  assert.equal(event.p_provider_event_id, `sync-refund:${REFUND}`);
  const pending = setup({ job: { ...job, action: "verify", total: false, settledCents: 0 }, refunds: [{ status: "PENDING", value: 15 }] });
  await handleRefund(req(), pending.deps);
  assert.equal(pending.calls.some((c) => c.fn === "service_payment_apply_event"), false);
});

test("nova tentativa confere antes: se já foi devolvido, não devolve de novo", async () => {
  const { deps, calls, refunds } = setup({ job: { ...job, attempt: 2 }, status: "REFUNDED" });
  await handleRefund(req(), deps);
  assert.equal(refunds.length, 0);
  assert.equal(outcome(calls).p_outcome, "sent");
});

test("conferência aplica a devolução que o webhook não trouxe, pela mesma fronteira", async () => {
  const { deps, calls, refunds } = setup({ job: { ...job, action: "verify" }, status: "REFUNDED" });
  await handleRefund(req(), deps);
  assert.equal(refunds.length, 0);
  const event = calls.find((c) => c.fn === "service_payment_apply_event")?.args;
  assert.equal(event.p_outcome, "refunded");
  assert.equal(event.p_provider_event_id, "sync:p1:REFUNDED");
});

test("sem credencial, tenta de novo depois", async () => {
  const { deps, calls } = setup({ apiKey: null });
  await handleRefund(req(), deps);
  assert.equal(outcome(calls).p_outcome, "transient");
});

test("pagamento por aproximação estorna pelo fornecedor dele, nunca pelo Asaas", async () => {
  const tapRefunds: any[] = [];
  const { deps, calls, refunds } = setup({ job: { ...job, provider: "tap" } });
  (deps as any).tapProvider = () => ({ refund: async (input: unknown) => { tapRefunds.push(input); } });
  await handleRefund(req(), deps);
  assert.equal(refunds.length, 0);
  assert.equal(tapRefunds[0].amountCents, 1500);
  assert.equal(tapRefunds[0].reference, REFUND);
  assert.equal(outcome(calls).p_outcome, "sent");
});

test("sem fornecedor de aproximação, espera em vez de falhar", async () => {
  const { deps, calls } = setup({ job: { ...job, provider: "tap" } });
  await handleRefund(req(), deps);
  assert.equal(outcome(calls).p_outcome, "transient");
});


test("estorno total no mesmo dia devolve o split da NOOWE, sem passar do que existe na cobrança", async () => {
  const { deps, refunds } = setup({ job: { ...job, returnSplitCents: 80 }, split: [{ id: "spl_1", walletId: "w_noowe", totalValue: 0.6 }, { id: "spl_2", walletId: "outra", totalValue: 9 }] });
  await handleRefund(req(), deps);
  assert.deepEqual(refunds[0][4], [{ id: "spl_1", value: 60 }]);
});

test("parcial ou depois do dia: sem splitRefunds", async () => {
  const { deps, refunds } = setup({ job: { ...job, total: false, returnSplitCents: 0 }, split: [{ id: "spl_1", walletId: "w_noowe", totalValue: 0.6 }] });
  await handleRefund(req(), deps);
  assert.equal(refunds[0][4], undefined);
});

test("Pix sem saldo fica aguardando saldo, e não como recusa definitiva", async () => {
  const { deps, calls } = setup({ job: { ...job, paymentMethod: "pix" }, refund: async () => { throw new AsaasError(400, { errors: [{ description: "Saldo insuficiente para realizar o estorno" }] }, "x"); } });
  await handleRefund(req(), deps);
  assert.equal(outcome(calls).p_outcome, "no_balance");
});

test("outro 400 com a palavra saldo, ou cartão sem saldo, é recusa definitiva", async () => {
  const other = setup({ job: { ...job, paymentMethod: "pix" }, refund: async () => { throw new AsaasError(400, { errors: [{ description: "Valor maior que o saldo da cobrança" }] }, "x"); } });
  await handleRefund(req(), other.deps);
  assert.equal(outcome(other.calls).p_outcome, "failed");
  const card = setup({ job: { ...job, paymentMethod: "credit_card" }, refund: async () => { throw new AsaasError(400, { errors: [{ description: "Saldo insuficiente" }] }, "x"); } });
  await handleRefund(req(), card.deps);
  assert.equal(outcome(card.calls).p_outcome, "failed");
});

test("estorno total depois do dia também registra quanto do split saiu da NOOWE", async () => {
  const { deps, calls } = setup({ job: { ...job, action: "verify", returnSplitCents: 0 }, status: "REFUNDED", split: [{ id: "spl_1", walletId: "w_noowe", totalValue: 0.8 }], refunds: [{ status: "DONE", value: 15 }] });
  await handleRefund(req(), deps);
  assert.equal(calls.find((c) => c.fn === "service_refund_split_returned")!.args.p_cents, 0);
});

test("ao confirmar o estorno total, registra só o split devolvido com done = true, em todos os estornos", async () => {
  const { deps, calls } = setup({
    job: { ...job, action: "verify", returnSplitCents: 80 }, status: "REFUNDED",
    split: [{ id: "spl_1", walletId: "w_noowe", totalValue: 0.8 }],
    refunds: [
      { status: "DONE", value: 10, refundedSplits: [{ splitId: "spl_1", value: 0.5, done: true }] },
      { status: "DONE", value: 5, refundedSplits: [{ splitId: "spl_1", value: 0.3, done: false }] },
      { status: "PENDING", value: 1, refundedSplits: [{ splitId: "spl_1", value: 0.2, done: true }] },
    ],
  });
  await handleRefund(req(), deps);
  assert.equal(calls.find((c) => c.fn === "service_refund_split_returned")!.args.p_cents, 50);
  assert.ok(calls.findIndex((c) => c.fn === "service_refund_split_returned") < calls.findIndex((c) => c.fn === "service_payment_apply_event"));
});
