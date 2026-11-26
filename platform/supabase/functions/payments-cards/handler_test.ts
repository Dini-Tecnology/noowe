import { test } from "node:test";
import assert from "node:assert/strict";
import { handleCards } from "./handler.ts";
import { AsaasError } from "../_shared/payments/asaas.ts";
import type { PaymentDeps } from "../_shared/payments/deps.ts";

const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REST = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ACCT = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const CARD = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const NUMBER = "4111111111111111";

function setup(over: { tokenizeThrows?: unknown; account?: string | null; rpcError?: any; customerId?: string | null } = {}) {
  const calls: { fn: string; args: any }[] = [];
  const provider: any[] = [];
  const deps: PaymentDeps = {
    rpc: async (fn, args) => {
      calls.push({ fn, args });
      if (fn === "service_payment_card_account") return { data: "account" in over ? over.account : ACCT, error: null };
      if (fn === "service_payment_account_secrets") return { data: { apiKey: "ak" }, error: null };
      if (fn === "service_payment_customer") return { data: { providerCustomerId: "customerId" in over ? over.customerId : "cus_1", name: "Ana", email: "a@x.com" }, error: null };
      if (fn === "service_payment_add_card") return { data: { id: CARD, brand: args.p_brand, last4: args.p_last4, expMonth: args.p_exp_month, expYear: args.p_exp_year, isDefault: true }, error: null };
      return { data: null, error: over.rpcError ?? null };
    },
    getUser: async (t) => (t === "tok" ? { id: USER } : null),
    provider: {
      createCustomer: async (_k: string, i: any) => { provider.push({ createCustomer: i }); return { id: "cus_new" }; },
      tokenizeCard: async (_k: string, i: any) => {
        provider.push({ tokenize: i });
        if (over.tokenizeThrows) throw over.tokenizeThrows;
        return { creditCardNumber: "1111", creditCardBrand: "VISA", creditCardToken: "tok_asaas_123456" };
      },
    } as any,
    env: () => undefined,
    now: () => new Date("2026-11-26T12:00:00Z"),
  };
  return { deps, calls, provider };
}

function req(body: any, token = "tok") {
  return new Request("https://f/payments-cards", {
    method: "POST", body: JSON.stringify(body),
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "x-forwarded-for": "203.0.113.7" },
  });
}
const add = {
  action: "add", restaurantId: REST,
  card: { holderName: "ANA SILVA", number: "4111 1111 1111 1111", expiryMonth: "12", expiryYear: "2030", ccv: "123" },
  holder: { cpf: "529.982.247-25", postalCode: "01310-100", addressNumber: "100", phone: "(11) 98888-7777" },
};

test("add: tokeniza na subconta do restaurante e devolve só bandeira, final e validade", async () => {
  const { deps, calls, provider } = setup();
  const res = await handleCards(req(add), deps);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.card, { id: CARD, brand: "VISA", last4: "1111", expMonth: 12, expYear: 2030, isDefault: true });
  assert.deepEqual(calls.find((c) => c.fn === "service_payment_card_account")!.args, { p_restaurant_id: REST });
  const t = provider[0].tokenize;
  assert.equal(t.customer, "cus_1");
  assert.equal(t.creditCard.number, NUMBER);
  assert.equal(t.holderInfo.cpfCnpj, "52998224725");
  assert.equal(t.remoteIp, "203.0.113.7");
  const saved = calls.find((c) => c.fn === "service_payment_add_card")!.args;
  assert.equal(saved.p_token, "tok_asaas_123456");
  assert.equal(saved.p_account_id, ACCT);
});

test("add: número e CVV nunca vão ao banco, à resposta nem ao log", async () => {
  const logged: string[] = [];
  const orig = console.error;
  console.error = (...a: unknown[]) => { logged.push(JSON.stringify(a)); };
  try {
    for (const over of [{}, { tokenizeThrows: new AsaasError(400, { errors: [{ description: "Cartão inválido" }] }, "400") }, { tokenizeThrows: new AsaasError(500, null, "x") }]) {
      const { deps, calls } = setup(over);
      const res = await handleCards(req(add), deps);
      const text = await res.text();
      for (const blob of [JSON.stringify(calls), text, logged.join("\n")]) {
        assert.equal(blob.includes(NUMBER), false);
        assert.equal(blob.includes("4111 1111"), false);
        assert.equal(/"(ccv|p_ccv)"/.test(blob), false);
      }
    }
  } finally { console.error = orig; }
});

test("add: cliente sem cadastro na subconta é criado com o CPF do titular", async () => {
  const { deps, calls, provider } = setup({ customerId: null });
  assert.equal((await handleCards(req(add), deps)).status, 200);
  assert.equal(provider[0].createCustomer.cpfCnpj, "52998224725");
  assert.equal(calls.find((c) => c.fn === "service_payment_save_customer")!.args.p_provider_customer_id, "cus_new");
});

test("add: cartão inválido (Luhn, vencido, CVV) é 422 card_invalid sem chamar o Asaas", async () => {
  for (const c of [{ number: "4111111111111112" }, { expiryMonth: "10", expiryYear: "2026" }, { ccv: "12" }, { holderName: "" }, { expiryMonth: "13" }]) {
    const { deps, provider } = setup();
    const res = await handleCards(req({ ...add, card: { ...add.card, ...c } }), deps);
    assert.equal(res.status, 422);
    assert.equal((await res.json()).error, "card_invalid");
    assert.equal(provider.length, 0);
  }
});

test("add: titular inválido é 422 holder_invalid", async () => {
  for (const h of [{ cpf: "111.111.111-11" }, { postalCode: "123" }, { addressNumber: "" }, { phone: "123" }]) {
    const { deps, provider } = setup();
    const res = await handleCards(req({ ...add, holder: { ...add.holder, ...h } }), deps);
    assert.equal(res.status, 422);
    assert.equal((await res.json()).error, "holder_invalid");
    assert.equal(provider.length, 0);
  }
});

test("add: Asaas recusa o cartão → 422 card_invalid com a mensagem dele; nada é salvo", async () => {
  const { deps, calls } = setup({ tokenizeThrows: new AsaasError(400, { errors: [{ description: "O número do cartão é inválido." }] }, "400") });
  const res = await handleCards(req(add), deps);
  assert.equal(res.status, 422);
  assert.deepEqual(await res.json(), { error: "card_invalid", message: "O número do cartão é inválido." });
  assert.ok(!calls.some((c) => c.fn === "service_payment_add_card"));
});

test("add: restaurante sem pagamento online → 409; sem JWT → 401", async () => {
  const { deps } = setup({ account: null });
  assert.equal((await handleCards(req(add), deps)).status, 409);
  assert.equal((await handleCards(req(add, "ruim"), setup().deps)).status, 401);
});

test("remove e set_default: chamam a RPC do próprio usuário; cartão alheio é 404", async () => {
  for (const action of ["remove", "set_default"]) {
    const { deps, calls } = setup();
    const res = await handleCards(req({ action, cardId: CARD }), deps);
    assert.deepEqual(await res.json(), { ok: true });
    assert.deepEqual(calls[0].args, { p_user_id: USER, p_card_id: CARD });
    assert.equal(calls[0].fn, action === "remove" ? "service_payment_remove_card" : "service_payment_set_default_card");
    const nf = setup({ rpcError: { code: "P0002", message: "x" } });
    assert.equal((await handleCards(req({ action, cardId: CARD }), nf.deps)).status, 404);
  }
  assert.equal((await handleCards(req({ action: "remove", cardId: "x" }), setup().deps)).status, 400);
});
