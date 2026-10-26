import { test } from "node:test";
import assert from "node:assert/strict";
import { handleWebhook } from "./handler.ts";
import { sha256Hex } from "../_shared/payments/crypto.ts";
import type { PaymentDeps } from "../_shared/payments/deps.ts";

const ACCT = "11111111-1111-4111-8111-111111111111";
const PAY = "22222222-2222-4222-8222-222222222222";
const TOKEN = "segredo-da-subconta";

async function setup(over: { chargeStatus?: string; chargeThrows?: boolean; local?: any; chargeCard?: any; saveCardError?: boolean } = {}) {
  const calls: { fn: string; args: any }[] = [];
  const deps: PaymentDeps = {
    rpc: async (fn, args) => {
      calls.push({ fn, args });
      if (fn === "service_payment_account_secrets") {
        return { data: { id: ACCT, apiKey: "ak", webhookTokenHash: await sha256Hex(TOKEN) }, error: null };
      }
      if (fn === "service_payment_get") {
        return { data: "local" in over ? over.local : { paymentId: PAY, provider: "asaas", paymentAccountId: ACCT, providerRef: "pay_asaas", status: "pending" }, error: null };
      }
      if (fn === "service_payment_apply_event") return { data: { ignored: undefined }, error: null };
      if (fn === "service_payment_save_card") return over.saveCardError ? { data: null, error: { message: "falhou" } } : { data: { saved: true }, error: null };
      return { data: null, error: null };
    },
    getUser: async () => null,
    provider: {
      getCharge: async () => {
        if (over.chargeThrows) throw new Error("rede");
        return { id: "pay_asaas", status: over.chargeStatus ?? "RECEIVED", value: 12.34, creditCard: over.chargeCard };
      },
    } as any,
    env: () => undefined,
  };
  return { deps, calls, applied: () => calls.filter((c) => c.fn === "service_payment_apply_event") };
}

function req(event: string, opts: { token?: string | null; acct?: string; ref?: string; id?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.token !== null) headers["asaas-access-token"] = opts.token ?? TOKEN;
  return new Request(`https://f/payments-webhook-asaas?acct=${opts.acct ?? ACCT}`, {
    method: "POST", headers,
    body: JSON.stringify({ id: opts.id ?? "evt_1", event, payment: { id: "pay_asaas", externalReference: opts.ref ?? PAY, status: "RECEIVED", value: 12.34 } }),
  });
}

test("token errado ou ausente: 401 e nada é aplicado", async () => {
  for (const token of ["errado", null]) {
    const { deps, applied } = await setup();
    const res = await handleWebhook(req("PAYMENT_RECEIVED", { token }), deps);
    assert.equal(res.status, 401);
    assert.equal(applied().length, 0);
  }
  const { deps } = await setup();
  assert.equal((await handleWebhook(req("PAYMENT_RECEIVED", { acct: "nao-e-uuid" }), deps)).status, 401);
});

test("confirmação válida: reconsulta o Asaas e aplica com o valor em centavos", async () => {
  const { deps, applied } = await setup();
  const res = await handleWebhook(req("PAYMENT_RECEIVED"), deps);
  assert.equal(res.status, 200);
  assert.equal(applied().length, 1);
  const a = applied()[0].args;
  assert.equal(a.p_payment_id, PAY);
  assert.equal(a.p_outcome, "confirmed");
  assert.equal(a.p_amount_cents, 1234);
  assert.equal(a.p_provider_event_id, "evt_1");
  assert.equal(a.p_gateway_status, "completed");
});

test("reconsulta discorda do corpo do webhook: não confirma", async () => {
  const { deps, applied, calls } = await setup({ chargeStatus: "PENDING" });
  const res = await handleWebhook(req("PAYMENT_RECEIVED"), deps);
  assert.equal(res.status, 200);
  assert.equal(applied().length, 0);
  assert.ok(calls.some((c) => c.fn === "service_payment_record_orphan_event"));
});

test("falha na reconsulta: 200, nada é confirmado", async () => {
  const { deps, applied } = await setup({ chargeThrows: true });
  const res = await handleWebhook(req("PAYMENT_RECEIVED"), deps);
  assert.equal(res.status, 200);
  assert.equal(applied().length, 0);
});

test("externalReference desconhecido, de outra conta ou com provider_ref diferente: não aplica", async () => {
  const unknown = await setup({ local: null });
  assert.equal((await handleWebhook(req("PAYMENT_RECEIVED"), unknown.deps)).status, 200);
  assert.equal(unknown.applied().length, 0);

  const otherAcct = await setup({ local: { paymentId: PAY, provider: "asaas", paymentAccountId: "99999999-9999-4999-8999-999999999999", providerRef: "pay_asaas" } });
  await handleWebhook(req("PAYMENT_RECEIVED"), otherAcct.deps);
  assert.equal(otherAcct.applied().length, 0);

  const otherRef = await setup({ local: { paymentId: PAY, provider: "asaas", paymentAccountId: ACCT, providerRef: "pay_outra" } });
  await handleWebhook(req("PAYMENT_RECEIVED"), otherRef.deps);
  assert.equal(otherRef.applied().length, 0);

  const badRef = await setup();
  await handleWebhook(req("PAYMENT_RECEIVED", { ref: "texto-livre" }), badRef.deps);
  assert.equal(badRef.applied().length, 0);
});

test("vencimento vira falha/expirada sem reconsulta; chargeback só alerta", async () => {
  const overdue = await setup();
  await handleWebhook(req("PAYMENT_OVERDUE", { id: "evt_2" }), overdue.deps);
  assert.equal(overdue.applied().length, 1);
  assert.equal(overdue.applied()[0].args.p_outcome, "failed");
  assert.equal(overdue.applied()[0].args.p_gateway_status, "expired");
  assert.equal(overdue.applied()[0].args.p_amount_cents, null);

  const cb = await setup();
  const res = await handleWebhook(req("PAYMENT_CHARGEBACK_REQUESTED", { id: "evt_3" }), cb.deps);
  assert.equal(res.status, 200);
  assert.equal(cb.applied().length, 0);
});

test("evento não tratado ou sem id usa id derivado e é ignorado com 200", async () => {
  const { deps, applied } = await setup();
  const res = await handleWebhook(req("PAYMENT_CREATED"), deps);
  assert.equal(res.status, 200);
  assert.equal(applied().length, 0);
});

// ---- F6: token do cartão ---------------------------------------------------------------------
const CARD = { creditCardToken: "tok_abcdefgh", creditCardBrand: "VISA", creditCardNumber: "4242" };

test("pagamento com cartão confirmado: guarda o token (vindo da reconsulta) depois de aplicar o evento", async () => {
  const { deps, calls, applied } = await setup({ chargeCard: CARD });
  const res = await handleWebhook(req("PAYMENT_CONFIRMED"), deps);
  assert.equal(res.status, 200);
  assert.equal(applied().length, 1);
  const save = calls.find((c) => c.fn === "service_payment_save_card")!;
  assert.deepEqual(save.args, { p_payment_id: PAY, p_token: "tok_abcdefgh", p_brand: "VISA", p_last4: "4242" });
  assert.ok(calls.indexOf(save) > calls.indexOf(applied()[0]), "só depois de aplicar");
});

test("o token do corpo do webhook não vale: só o da reconsulta", async () => {
  const { deps, calls } = await setup();
  const forged = new Request(`https://f/payments-webhook-asaas?acct=${ACCT}`, {
    method: "POST", headers: { "content-type": "application/json", "asaas-access-token": TOKEN },
    body: JSON.stringify({ id: "evt_f", event: "PAYMENT_CONFIRMED", payment: { id: "pay_asaas", externalReference: PAY, status: "RECEIVED", value: 12.34, creditCard: CARD } }),
  });
  assert.equal((await handleWebhook(forged, deps)).status, 200);
  assert.equal(calls.filter((c) => c.fn === "service_payment_save_card").length, 0);
});

test("sem cartão na reconsulta, ou cartão sem final válido: não tenta guardar", async () => {
  for (const chargeCard of [undefined, { ...CARD, creditCardNumber: "12" }, { ...CARD, creditCardToken: "" }]) {
    const { deps, calls } = await setup({ chargeCard });
    await handleWebhook(req("PAYMENT_RECEIVED"), deps);
    assert.equal(calls.filter((c) => c.fn === "service_payment_save_card").length, 0);
  }
});

test("falha ao guardar o cartão nunca derruba o webhook nem desfaz a confirmação", async () => {
  const { deps, applied } = await setup({ chargeCard: CARD, saveCardError: true });
  const res = await handleWebhook(req("PAYMENT_CONFIRMED"), deps);
  assert.equal(res.status, 200);
  assert.equal(applied().length, 1);
});

test("pagamento não confirmado não guarda cartão", async () => {
  const { deps, calls } = await setup({ chargeCard: CARD, chargeStatus: "PENDING" });
  await handleWebhook(req("PAYMENT_RECEIVED"), deps);
  assert.equal(calls.filter((c) => c.fn === "service_payment_save_card").length, 0);
});
