import { test } from "node:test";
import assert from "node:assert/strict";
import { handleSync } from "./handler.ts";
import type { PaymentDeps } from "../_shared/payments/deps.ts";

const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PAY = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function setup(chargeStatus: string, local: any = { paymentId: PAY, customerId: USER, provider: "asaas", providerRef: "pay_1", status: "pending", paymentAccountId: "acct" }) {
  const calls: { fn: string; args: any }[] = [];
  const deps: PaymentDeps = {
    rpc: async (fn, args) => {
      calls.push({ fn, args });
      if (fn === "service_payment_get") return { data: local, error: null };
      if (fn === "service_payment_account_secrets") return { data: { apiKey: "ak" }, error: null };
      return { data: null, error: null };
    },
    getUser: async () => ({ id: USER }),
    provider: { getCharge: async () => ({ id: "pay_1", status: chargeStatus, value: 20.5 }) } as any,
    env: () => undefined,
  };
  return { deps, applied: () => calls.filter((c) => c.fn === "service_payment_apply_event") };
}
const req = (body: any) => new Request("https://f/payments-sync", { method: "POST", headers: { authorization: "Bearer t" }, body: JSON.stringify(body) });

test("cobrança paga no Asaas e webhook perdido: sync confirma com id determinístico", async () => {
  const { deps, applied } = setup("RECEIVED");
  const res = await handleSync(req({ paymentId: PAY }), deps);
  assert.equal(res.status, 200);
  assert.equal(applied().length, 1);
  assert.equal(applied()[0].args.p_provider_event_id, `sync:${PAY}:RECEIVED`);
  assert.equal(applied()[0].args.p_amount_cents, 2050);
});

test("ainda pendente: nada é aplicado", async () => {
  const { deps, applied } = setup("PENDING");
  await handleSync(req({ paymentId: PAY }), deps);
  assert.equal(applied().length, 0);
});

test("pagamento de outro usuário: 404; já concluído: não consulta o provedor", async () => {
  const other = setup("RECEIVED", { paymentId: PAY, customerId: "outro", provider: "asaas", providerRef: "p", status: "pending" });
  assert.equal((await handleSync(req({ paymentId: PAY }), other.deps)).status, 404);
  const done = setup("RECEIVED", { paymentId: PAY, customerId: USER, provider: "asaas", providerRef: "p", status: "completed" });
  await handleSync(req({ paymentId: PAY }), done.deps);
  assert.equal(done.applied().length, 0);
});
