import { test } from "node:test";
import assert from "node:assert/strict";
import { AsaasClient, AsaasError } from "./asaas.ts";
import { asaasValueToCents, centsToAsaasValue } from "./money.ts";
import { isChargebackEvent, mapAsaasEvent, mapAsaasPaymentStatus } from "./events.ts";

test("centavos <-> valor do Asaas: ida e volta exata", () => {
  for (let c = 0; c <= 20_000; c++) assert.equal(asaasValueToCents(centsToAsaasValue(c)), c);
  let seed = 42; // LCG determinístico: o teste é reproduzível
  for (let i = 0; i < 20_000; i++) {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    const c = seed % 1_000_000_000;
    assert.equal(asaasValueToCents(centsToAsaasValue(c)), c);
  }
});

test("centsToAsaasValue evita erros de ponto flutuante", () => {
  assert.equal(centsToAsaasValue(1005), 10.05);
  assert.equal(centsToAsaasValue(1), 0.01);
  assert.equal(centsToAsaasValue(0), 0);
  assert.equal(JSON.stringify({ v: centsToAsaasValue(1999) }), '{"v":19.99}');
  assert.throws(() => centsToAsaasValue(-1));
  assert.throws(() => centsToAsaasValue(1.5));
});

test("asaasValueToCents rejeita valores inválidos", () => {
  assert.equal(asaasValueToCents("12.3"), 1230);
  assert.equal(asaasValueToCents(12), 1200);
  assert.throws(() => asaasValueToCents(1.005));
  assert.throws(() => asaasValueToCents("abc"));
  assert.throws(() => asaasValueToCents("-1.00"));
});

test("mapeamento de eventos do Asaas", () => {
  assert.deepEqual(mapAsaasEvent("PAYMENT_RECEIVED"), { outcome: "confirmed", gatewayStatus: "completed" });
  assert.deepEqual(mapAsaasEvent("PAYMENT_CONFIRMED"), { outcome: "confirmed", gatewayStatus: "completed" });
  assert.deepEqual(mapAsaasEvent("PAYMENT_OVERDUE"), { outcome: "failed", gatewayStatus: "expired" });
  assert.deepEqual(mapAsaasEvent("PAYMENT_DELETED"), { outcome: "failed", gatewayStatus: "cancelled" });
  assert.deepEqual(mapAsaasEvent("PAYMENT_REFUNDED"), { outcome: "refunded", gatewayStatus: "refunded" });
  assert.deepEqual(mapAsaasEvent("PAYMENT_PARTIALLY_REFUNDED"), { outcome: "refunded", gatewayStatus: "partially_refunded" });
  assert.equal(mapAsaasEvent("PAYMENT_CREATED"), null);
  assert.equal(isChargebackEvent("PAYMENT_CHARGEBACK_REQUESTED"), true);
  assert.equal(mapAsaasPaymentStatus("RECEIVED")?.outcome, "confirmed");
  assert.equal(mapAsaasPaymentStatus("PENDING")?.outcome, "pending");
  assert.equal(mapAsaasPaymentStatus("WHATEVER"), null);
});

function fakeFetch(statuses: number[], calls: { method: string; url: string }[]) {
  let i = 0;
  return (async (url: string, init: RequestInit) => {
    calls.push({ method: init.method ?? "GET", url });
    const status = statuses[Math.min(i++, statuses.length - 1)];
    return new Response(JSON.stringify(status < 300 ? { id: "pay_1", data: [] } : { errors: [] }), { status });
  }) as unknown as typeof fetch;
}

test("GET é repetido em 5xx; POST de criação nunca é repetido", async () => {
  const getCalls: { method: string; url: string }[] = [];
  const client = new AsaasClient({ baseUrl: "https://x", fetchImpl: fakeFetch([503, 503, 200], getCalls), sleep: async () => {} });
  await client.getCharge("k", "pay_1");
  assert.equal(getCalls.length, 3);

  const postCalls: { method: string; url: string }[] = [];
  const post = new AsaasClient({ baseUrl: "https://x", fetchImpl: fakeFetch([500, 200], postCalls), sleep: async () => {} });
  await assert.rejects(
    post.createCharge("k", { customer: "c", billingType: "PIX", valueCents: 100, dueDate: "2026-10-23", externalReference: "e", description: "d" }),
    (err: unknown) => err instanceof AsaasError && err.status === 500,
  );
  assert.equal(postCalls.length, 1);
});

test("createCharge envia valor em reais exato, split e callback", async () => {
  let sent: any;
  const fetchImpl = (async (_u: string, init: RequestInit) => {
    sent = JSON.parse(String(init.body));
    return new Response(JSON.stringify({ id: "pay_1", status: "PENDING", value: 10.05 }), { status: 200 });
  }) as unknown as typeof fetch;
  const client = new AsaasClient({ baseUrl: "https://x", fetchImpl });
  await client.createCharge("k", {
    customer: "cus_1", billingType: "CREDIT_CARD", valueCents: 1005, dueDate: "2026-10-23",
    externalReference: "ext", description: "d", split: { walletId: "w1", feeCents: 101 }, successUrl: "https://app/return",
  });
  assert.equal(sent.value, 10.05);
  assert.deepEqual(sent.split, [{ walletId: "w1", fixedValue: 1.01 }]);
  assert.deepEqual(sent.callback, { successUrl: "https://app/return", autoRedirect: true });
  assert.equal(sent.externalReference, "ext");
});
