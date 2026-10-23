import { test } from "node:test";
import assert from "node:assert/strict";
import { handleCreate } from "./handler.ts";
import { AsaasError } from "../_shared/payments/asaas.ts";
import type { PaymentDeps } from "../_shared/payments/deps.ts";

const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORDER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const KEY = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PAY = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ACCT = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

function setup(over: { reserved?: any; reserveError?: any; customerId?: string | null; existing?: any; createThrows?: boolean } = {}) {
  const calls: { fn: string; args: any }[] = [];
  const provider: string[] = [];
  const deps: PaymentDeps = {
    rpc: async (fn, args) => {
      calls.push({ fn, args });
      if (fn === "service_payment_reserve_order") {
        if (over.reserveError) return { data: null, error: over.reserveError };
        return { data: over.reserved ?? { paymentId: PAY, orderId: ORDER, status: "creating", method: "pix", amountCents: 5000,
          platformFeeCents: 250, paymentAccountId: ACCT, providerRef: null, pixPayload: null, expiresAt: null, alreadyPaid: false }, error: null };
      }
      if (fn === "service_payment_account_secrets") return { data: { apiKey: "ak" }, error: null };
      if (fn === "service_payment_customer") return { data: { providerCustomerId: over.customerId ?? null, name: "Ana", email: "a@x.com", phone: null }, error: null };
      return { data: null, error: null };
    },
    getUser: async (t) => (t === "tok" ? { id: USER } : null),
    provider: {
      createCustomer: async (_k: string, i: any) => { provider.push("createCustomer:" + i.cpfCnpj); return { id: "cus_1" }; },
      findChargeByExternalRef: async () => { provider.push("find"); return over.existing ?? null; },
      createCharge: async (_k: string, i: any) => {
        provider.push("createCharge");
        if (over.createThrows) throw new AsaasError(500, null, "boom");
        (provider as any).input = i;
        return { id: "pay_asaas", status: "PENDING", value: 50, invoiceUrl: "https://asaas/i/1" };
      },
      getPixQrCode: async () => { provider.push("pix"); return { payload: "000201-copia-e-cola", expirationDate: "2026-10-23 23:59:59" }; },
    } as any,
    env: (n) => ({ NOOWE_ASAAS_WALLET_ID: "wallet-noowe", PAYMENT_RETURN_URL: "https://noowebr.com/pay/return" } as any)[n],
    now: () => new Date("2026-10-23T15:00:00Z"),
  };
  return { deps, calls, provider };
}

function req(body: any, token = "tok") {
  return new Request("https://f/payments-create", {
    method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body),
  });
}
const valid = { purpose: "order", targetId: ORDER, method: "pix", idempotencyKey: KEY, payerCpfCnpj: "123.456.789-09" };

test("sem JWT válido: 401; corpo inválido: 400; bill_share ainda não implementado: 501", async () => {
  const { deps } = setup();
  assert.equal((await handleCreate(req(valid, "ruim"), deps)).status, 401);
  assert.equal((await handleCreate(req({ ...valid, method: "apple_pay" }), deps)).status, 400);
  assert.equal((await handleCreate(req({ ...valid, idempotencyKey: "x" }), deps)).status, 400);
  assert.equal((await handleCreate(req({ ...valid, purpose: "bill_share" }), deps)).status, 501);
});

test("PIX: cria cliente, cobrança com split NOOWE e QR; devolve pendente (nunca confirmado)", async () => {
  const { deps, calls, provider } = setup();
  const res = await handleCreate(req(valid), deps);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, "pending");
  assert.equal(body.pix.payload, "000201-copia-e-cola");
  assert.deepEqual(provider.slice(0, 4), ["createCustomer:12345678909", "find", "createCharge", "pix"]);
  const input = (provider as any).input;
  assert.equal(input.valueCents, 5000);
  assert.equal(input.dueDate, "2026-10-23");
  assert.deepEqual(input.split, { walletId: "wallet-noowe", feeCents: 250 });
  assert.equal(input.externalReference, PAY);
  assert.ok(calls.some((c) => c.fn === "service_payment_attach_provider" && c.args.p_provider_ref === "pay_asaas"));
  assert.ok(!calls.some((c) => c.fn === "service_payment_apply_event"));
});

test("cartão: devolve a página hospedada e não pede QR", async () => {
  const { deps, provider } = setup({ reserved: { paymentId: PAY, orderId: ORDER, status: "creating", method: "credit_card", amountCents: 5000, platformFeeCents: 0, paymentAccountId: ACCT, providerRef: null, alreadyPaid: false } });
  const res = await handleCreate(req({ ...valid, method: "credit_card" }), deps);
  const body = await res.json();
  assert.equal(body.checkoutUrl, "https://asaas/i/1");
  assert.equal(body.pix, null);
  assert.ok(!provider.includes("pix"));
  assert.equal((provider as any).input.split, null);
});

test("documento do pagador é exigido só na primeira vez", async () => {
  const first = setup();
  const res = await handleCreate(req({ ...valid, payerCpfCnpj: undefined }), first.deps);
  assert.equal(res.status, 422);
  assert.equal((await res.json()).error, "payer_document_required");

  const returning = setup({ customerId: "cus_old" });
  assert.equal((await handleCreate(req({ ...valid, payerCpfCnpj: undefined }), returning.deps)).status, 200);
  assert.ok(!returning.provider.some((p) => p.startsWith("createCustomer")));
});

test("reenvio com a mesma chave não chama o provedor de novo", async () => {
  const { deps, provider } = setup({ reserved: { paymentId: PAY, status: "pending", method: "pix", amountCents: 5000, providerRef: "pay_asaas", pixPayload: "copia", paymentAccountId: ACCT, expiresAt: null, alreadyPaid: false } });
  const res = await handleCreate(req(valid), deps);
  const body = await res.json();
  assert.equal(body.idempotentReplay, true);
  assert.equal(provider.length, 0);
});

test("recupera cobrança já criada no Asaas por externalReference sem duplicar", async () => {
  const { deps, provider } = setup({ existing: { id: "pay_asaas", status: "PENDING", value: 50, invoiceUrl: "https://asaas/i/1" } });
  const res = await handleCreate(req(valid), deps);
  assert.equal(res.status, 200);
  assert.ok(!provider.includes("createCharge"));
});

test("falha do provedor: 502 retomável e cobrança marcada com erro (N4 #6)", async () => {
  const { deps, calls } = setup({ createThrows: true });
  const res = await handleCreate(req(valid), deps);
  assert.equal(res.status, 502);
  const body = await res.json();
  assert.equal(body.retryable, true);
  assert.equal(body.paymentId, PAY);
  assert.ok(calls.some((c) => c.fn === "service_payment_mark_failed" && c.args.p_payment_id === PAY));
  assert.ok(!calls.some((c) => c.fn === "service_payment_attach_provider"));
});

test("erros da reserva viram status HTTP; pedido já pago não cobra de novo", async () => {
  assert.equal((await handleCreate(req(valid), setup({ reserveError: { code: "P0007", message: "x" } }).deps)).status, 409);
  assert.equal((await handleCreate(req(valid), setup({ reserveError: { code: "P0002", message: "x" } }).deps)).status, 404);
  const paid = setup({ reserved: { alreadyPaid: true, orderId: ORDER } });
  const res = await handleCreate(req(valid), paid.deps);
  assert.equal((await res.json()).alreadyPaid, true);
  assert.equal(paid.provider.length, 0);
});
