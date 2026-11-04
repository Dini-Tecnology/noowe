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

test("createCharge envia valor em reais exato e callback; o split vem depois, com a tarifa real", async () => {
  let sent: any;
  const fetchImpl = (async (_u: string, init: RequestInit) => {
    sent = JSON.parse(String(init.body));
    return new Response(JSON.stringify({ id: "pay_1", status: "PENDING", value: 10.05 }), { status: 200 });
  }) as unknown as typeof fetch;
  const client = new AsaasClient({ baseUrl: "https://x", fetchImpl });
  await client.createCharge("k", {
    customer: "cus_1", billingType: "CREDIT_CARD", valueCents: 1005, dueDate: "2026-10-23",
    externalReference: "ext", description: "d", successUrl: "https://app/return",
  });
  assert.equal(sent.value, 10.05);
  assert.equal(sent.split, undefined);
  assert.deepEqual(sent.callback, { successUrl: "https://app/return", autoRedirect: true });
  assert.equal(sent.externalReference, "ext");
});

test("setSplit envia o valor em reais; zero remove o split", async () => {
  const sent: any[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    sent.push({ url, method: init.method, body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify({ id: "pay_1", status: "PENDING", value: 110 }), { status: 200 });
  }) as unknown as typeof fetch;
  const client = new AsaasClient({ baseUrl: "https://x", fetchImpl });
  await client.setSplit("k", "pay_1", "w1", 6);
  await client.setSplit("k", "pay_1", "w1", 0);
  assert.equal(sent[0].method, "PUT");
  assert.match(sent[0].url, /\/payments\/pay_1$/);
  assert.deepEqual(sent[0].body.split, [{ walletId: "w1", fixedValue: 0.06 }]);
  assert.deepEqual(sent[1].body.split, []);
});

import { asaasBaseUrlForKey } from "./environment.ts";

test("ambiente do Asaas vem da chave: sandbox e produção usam segredos distintos", () => {
  const env = (n: string) => ({
    ASAAS_SANDBOX_API_BASE_URL: "https://api-sandbox.asaas.com/v3/", ASAAS_PRODUCTION_API_BASE_URL: "https://api.asaas.com/v3",
  } as Record<string, string>)[n];
  assert.equal(asaasBaseUrlForKey("$aact_hmlg_abc", env), "https://api-sandbox.asaas.com/v3");
  assert.equal(asaasBaseUrlForKey("$aact_prod_abc", env), "https://api.asaas.com/v3");
});

test("ambiente do Asaas: chave desconhecida, segredo ausente ou URL não-https falham fechado", () => {
  const env = (n: string) => ({ ASAAS_SANDBOX_API_BASE_URL: "http://inseguro", ASAAS_PRODUCTION_API_BASE_URL: undefined } as Record<string, string | undefined>)[n];
  assert.throws(() => asaasBaseUrlForKey("chave-sem-prefixo", env), /ambiente reconhecível/);
  assert.throws(() => asaasBaseUrlForKey("$aact_hmlg_x", env), /ASAAS_SANDBOX_API_BASE_URL/);
  assert.throws(() => asaasBaseUrlForKey("$aact_prod_x", env), /ASAAS_PRODUCTION_API_BASE_URL/);
});

test("AsaasClient resolve a URL pela chave a cada chamada", async () => {
  const urls: string[] = [];
  const fetchImpl = (async (url: string) => { urls.push(url); return new Response("{}", { status: 200 }); }) as unknown as typeof fetch;
  const client = new AsaasClient({ baseUrl: (k) => (k.includes("_hmlg_") ? "https://sb" : "https://prod"), fetchImpl });
  await client.getCharge("$aact_hmlg_1", "p1");
  await client.getCharge("$aact_prod_1", "p2");
  assert.deepEqual(urls, ["https://sb/payments/p1", "https://prod/payments/p2"]);
});
