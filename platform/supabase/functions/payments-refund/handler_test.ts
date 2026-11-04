import { test } from "node:test";
import assert from "node:assert/strict";
import { handleRefund } from "./handler.ts";
import { AsaasError } from "../_shared/payments/asaas.ts";
import type { PaymentDeps } from "../_shared/payments/deps.ts";

const REFUND = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const job = { claimed: true, refundId: REFUND, action: "send", attempt: 1, total: true, paymentId: "p1", paymentAccountId: "a1", providerRef: "pay_1", amountCents: 1500, reason: "Prato errado" };

function setup(over: { job?: any; refund?: () => Promise<void>; status?: string; apiKey?: string | null } = {}) {
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
      getCharge: async () => ({ id: "pay_1", status: over.status ?? "RECEIVED", value: 15 }),
    },
    env: () => "service-key",
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
  assert.deepEqual(refunds[0], ["key", "pay_1", 1500, "Prato errado"]);
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

test("queda de rede em estorno total tenta de novo", async () => {
  const { deps, calls } = setup({ refund: async () => { throw new AsaasError(503, {}, "fora"); } });
  await handleRefund(req(), deps);
  assert.equal(outcome(calls).p_outcome, "transient");
});

test("queda de rede em estorno parcial não repete às cegas", async () => {
  const { deps, calls } = setup({ job: { ...job, total: false }, refund: async () => { throw new Error("timeout"); } });
  await handleRefund(req(), deps);
  assert.equal(outcome(calls).p_outcome, "failed");
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
