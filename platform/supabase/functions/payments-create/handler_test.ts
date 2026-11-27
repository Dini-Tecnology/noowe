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

function setup(over: { secrets?: any; reserved?: any; reserveError?: any; customerId?: string | null; existing?: any; createThrows?: boolean; pixKeyMissing?: boolean; cardToken?: string | null; optionsError?: any; hasTaxDocument?: boolean; getCustomer?: any } = {}) {
  const calls: { fn: string; args: any }[] = [];
  const provider: string[] = [];
  const deps: PaymentDeps = {
    rpc: async (fn, args) => {
      calls.push({ fn, args });
      if (fn === "service_payment_reserve_order" || fn === "service_pay_share") {
        if (over.reserveError) return { data: null, error: over.reserveError };
        return { data: over.reserved ?? { paymentId: PAY, orderId: ORDER, status: "creating", method: "pix", amountCents: 5000,
          paymentAccountId: ACCT, providerRef: null, pixPayload: null, expiresAt: null, alreadyPaid: false }, error: null };
      }
      if (fn === "service_payment_set_split") return over.splitError ? { data: null, error: over.splitError } : { data: { splitCents: over.splitCents ?? 250 }, error: null };
      if (fn === "service_payment_set_card_options") return { data: null, error: over.optionsError ?? null };
      if (fn === "service_payment_card_token") return { data: over.cardToken ?? null, error: null };
      if (fn === "service_payment_account_secrets") return { data: { apiKey: "$aact_hmlg_ak", environment: "sandbox", pixProvider: "asaas", ...over.secrets }, error: null };
      if (fn === "service_payment_customer") return { data: { providerCustomerId: over.customerId ?? null, name: "Ana", email: "a@x.com", phone: null, hasTaxDocument: over.hasTaxDocument }, error: null };
      return { data: null, error: null };
    },
    getUser: async (t) => (t === "tok" ? { id: USER } : null),
    provider: {
      createCustomer: async (_k: string, i: any) => { provider.push("createCustomer:" + i.cpfCnpj); return { id: "cus_1" }; },
      getCustomer: async (_k: string, id: string) => {
        provider.push("getCustomer:" + id);
        if (over.getCustomer instanceof Error) throw over.getCustomer;
        return over.getCustomer ?? { id, cpfCnpj: "52998224725" };
      },
      findChargeByExternalRef: async () => { provider.push("find"); return over.existing ?? null; },
      createCharge: async (_k: string, i: any) => {
        provider.push("createCharge");
        if (over.createThrows) throw new AsaasError(500, null, "boom");
        (provider as any).input = i;
        return { id: "pay_asaas", status: "PENDING", value: 50, netValue: 49.01, invoiceUrl: "https://asaas/i/1" };
      },
      payWithToken: async (_k: string, id: string, token: string, ip: string | null) => {
        provider.push(`pay:${id}`);
        (provider as any).paid = { token, ip };
        if (over.payThrows) throw over.payThrows;
        return { id, status: over.payStatus ?? "CONFIRMED", value: 50 };
      },
      setSplit: async (_k: string, _id: string, wallet: string, cents: number) => {
        if (over.setSplitThrows) throw new AsaasError(500, null, "boom");
        provider.push(`setSplit:${wallet}:${cents}`);
      },
      cancelCharge: async (_k: string, id: string) => { provider.push(`cancel:${id}`); },
      getPixQrCode: async () => {
        if (over.pixKeyMissing) throw new AsaasError(400, { errors: [{ code: "invalid_action", description: "Não há nenhuma chave Pix cadastrada na conta." }] }, "400");
        provider.push("pix"); return { payload: "000201-copia-e-cola", expirationDate: "2026-10-23 23:59:59" }; },
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

test("sem JWT válido: 401; corpo inválido: 400; gorjeta inválida: 400", async () => {
  const { deps } = setup();
  assert.equal((await handleCreate(req(valid, "ruim"), deps)).status, 401);
  assert.equal((await handleCreate(req({ ...valid, method: "apple_pay" }), deps)).status, 400);
  assert.equal((await handleCreate(req({ ...valid, idempotencyKey: "x" }), deps)).status, 400);
  assert.equal((await handleCreate(req({ ...valid, purpose: "bill_share", tipCents: -5 }), deps)).status, 400);
  assert.equal((await handleCreate(req({ ...valid, purpose: "bill_share", tipCents: 1.5 }), deps)).status, 400);
});

test("PIX: cria cliente, cobrança com split NOOWE e QR; devolve pendente (nunca confirmado)", async () => {
  const { deps, calls, provider } = setup();
  const res = await handleCreate(req(valid), deps);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, "pending");
  assert.equal(body.pix.payload, "000201-copia-e-cola");
  assert.deepEqual(provider.slice(0, 5), ["createCustomer:12345678909", "find", "createCharge", "setSplit:wallet-noowe:250", "pix"]);
  const input = (provider as any).input;
  assert.equal(input.valueCents, 5000);
  assert.equal(input.dueDate, "2026-10-23");
  assert.equal(input.split, undefined);
  assert.equal(calls.find((c) => c.fn === "service_payment_set_split")?.args.p_net_cents, 4901);
  assert.equal(input.externalReference, PAY);
  assert.ok(calls.some((c) => c.fn === "service_payment_attach_provider" && c.args.p_provider_ref === "pay_asaas"));
  assert.ok(!calls.some((c) => c.fn === "service_payment_apply_event"));
});

test("documento do pagador é exigido só na primeira vez", async () => {
  const first = setup();
  const res = await handleCreate(req({ ...valid, payerCpfCnpj: undefined }), first.deps);
  assert.equal(res.status, 422);
  assert.equal((await res.json()).error, "payer_document_required");

  // QA 26/11: o "CPF na nota" serve de documento do pagador, sem pedir de novo.
  const viaReceipt = setup();
  assert.equal((await handleCreate(req({ ...valid, payerCpfCnpj: undefined, receiptDocument: "529.982.247-25" }), viaReceipt.deps)).status, 200);
  assert.ok(viaReceipt.provider.includes("createCustomer:52998224725"));

  const returning = setup({ customerId: "cus_old" });
  assert.equal((await handleCreate(req({ ...valid, ...consent, payerCpfCnpj: undefined }), returning.deps)).status, 200);
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
  const { deps, provider } = setup({ existing: { id: "pay_asaas", status: "PENDING", value: 50, netValue: 49.01, invoiceUrl: "https://asaas/i/1" } });
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
  assert.equal((await handleCreate(req(valid), setup({ reserveError: { code: "P0012", message: "x" } }).deps)).status, 409);
  assert.equal((await handleCreate(req(valid), setup({ reserveError: { code: "P0002", message: "x" } }).deps)).status, 404);
  const paid = setup({ reserved: { alreadyPaid: true, orderId: ORDER } });
  const res = await handleCreate(req(valid), paid.deps);
  assert.equal((await res.json()).alreadyPaid, true);
  assert.equal(paid.provider.length, 0);
});

test("parcela da conta: reserva por service_pay_share com gorjeta em centavos e cobra no provedor", async () => {
  const { deps, calls, provider } = setup({ customerId: "cus_1" });
  const res = await handleCreate(req({ ...valid, purpose: "bill_share", tipCents: 300 }), deps);
  assert.equal(res.status, 200);
  const reserve = calls.find((c) => c.fn === "service_pay_share");
  assert.ok(reserve && reserve.args.p_share_id === ORDER && reserve.args.p_tip_cents === 300 && reserve.args.p_user_id === USER);
  assert.ok(!calls.some((c) => c.fn === "service_payment_reserve_order"));
  assert.equal((await res.json()).status, "pending");
  assert.ok(provider.includes("createCharge"));
});

// ---- F6: cartão salvo (checkout hospedado do Asaas) ----------------------------------------
const card = { ...valid, method: "credit_card" };
const SAVED = "ffffffff-ffff-4fff-8fff-ffffffffffff";
function reqIp(body: any, ip: string | null = "203.0.113.7") {
  const headers: Record<string, string> = { authorization: "Bearer tok", "content-type": "application/json" };
  if (ip) headers["x-forwarded-for"] = `${ip}, 10.0.0.1`;
  return new Request("https://f/payments-create", { method: "POST", headers, body: JSON.stringify(body) });
}

test("cartão: salvar/usar cartão só vale com método cartão e nunca os dois juntos", async () => {
  const { deps } = setup();
  assert.equal((await handleCreate(req({ ...valid, saveCard: true }), deps)).status, 400);
  assert.equal((await handleCreate(req({ ...valid, paymentMethodId: SAVED }), deps)).status, 400);
  assert.equal((await handleCreate(reqIp({ ...card, saveCard: true, paymentMethodId: SAVED }), deps)).status, 400);
  assert.equal((await handleCreate(reqIp({ ...card, paymentMethodId: "nao-e-uuid" }), deps)).status, 400);
  assert.equal((await handleCreate(reqIp({ ...card, paymentMethodId: SAVED }, null), deps)).status, 400);
});

test("cartão salvo: cobra com o token do servidor, depois do split e da referência gravada, sem página do Asaas", async () => {
  const { deps, calls, provider } = setup({ cardToken: "tok_secreto_1", customerId: "cus_1" });
  const res = await handleCreate(reqIp({ ...card, paymentMethodId: SAVED }), deps);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, "pending");
  assert.equal(body.savedCard, true);
  assert.equal(body.checkoutUrl, null);
  assert.deepEqual((provider as any).paid, { token: "tok_secreto_1", ip: "203.0.113.7" });
  assert.equal((provider as any).input.billingType, "CREDIT_CARD");
  assert.equal((provider as any).input.creditCardToken, undefined);
  const order = provider as unknown as string[];
  assert.ok(order.findIndex((x) => x.startsWith("setSplit")) < order.indexOf("pay:pay_asaas"), "split antes de cobrar");
  assert.ok(calls.some((c) => c.fn === "service_payment_attach_provider"), "referência gravada");
  assert.equal(JSON.stringify(body).includes("tok_secreto_1"), false);
  assert.deepEqual(calls.find((c) => c.fn === "service_payment_card_token")!.args,
    { p_user_id: USER, p_payment_method_id: SAVED, p_account_id: ACCT });
  assert.equal(calls.find((c) => c.fn === "service_payment_set_card_options")!.args.p_payment_method_id, SAVED);
});

test("cartão salvo inexistente, de outro usuário ou removido: 404 e nada é cobrado", async () => {
  const none = setup({ cardToken: null, customerId: "cus_1" });
  const res = await handleCreate(reqIp({ ...card, paymentMethodId: SAVED }), none.deps);
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error, "card_not_found");
  assert.equal(none.provider.includes("createCharge"), false);

  const rejected = setup({ optionsError: { code: "P0002", message: "Payment method not found" } });
  const res2 = await handleCreate(reqIp({ ...card, paymentMethodId: SAVED }), rejected.deps);
  assert.equal(res2.status, 404);
  assert.equal(rejected.provider.includes("createCharge"), false);
});

test("split: taxa menor que a tarifa não mexe na cobrança, e o cliente recebe como pagar", async () => {
  const { deps, provider } = setup({ splitCents: 0 });
  const res = await handleCreate(req(valid), deps);
  assert.equal(res.status, 200);
  assert.ok(!provider.some((p) => p.startsWith("setSplit")));
});

test("split: sem conseguir definir, o cliente não recebe o QR, e repetir retoma", async () => {
  const { deps, provider, calls } = setup({ setSplitThrows: true });
  const res = await handleCreate(req(valid), deps);
  assert.equal(res.status, 502);
  assert.ok(!provider.includes("pix"));
  assert.ok(!calls.some((c) => c.fn === "service_payment_attach_provider"));
});

test("abaixo do mínimo: resposta própria, sem chamar o provedor", async () => {
  const { deps, provider } = setup({ reserveError: { code: "P0013", message: "x" } });
  const res = await handleCreate(req(valid), deps);
  assert.equal(res.status, 422);
  assert.equal((await res.json()).error, "below_minimum");
  assert.equal(provider.length, 0);
});

test("CPF na nota: inválido é recusado antes de reservar; válido é gravado antes da cobrança; null desmarca", async () => {
  const bad = setup();
  const res = await handleCreate(req({ ...valid, receiptDocument: "123.456.789-00" }), bad.deps);
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, "invalid_receipt_document");
  assert.ok(!bad.calls.some((c) => c.fn === "service_payment_reserve_order"));

  const good = setup();
  assert.equal((await handleCreate(req({ ...valid, receiptDocument: "529.982.247-25" }), good.deps)).status, 200);
  const set = good.calls.findIndex((c) => c.fn === "service_payment_set_receipt_document");
  assert.deepEqual(good.calls[set].args, { p_payment_id: PAY, p_user_id: USER, p_document: "52998224725" });
  assert.ok(set < good.calls.findIndex((c) => c.fn === "service_payment_attach_provider"));

  const off = setup();
  await handleCreate(req({ ...valid, receiptDocument: null }), off.deps);
  assert.equal(off.calls.find((c) => c.fn === "service_payment_set_receipt_document")?.args.p_document, null);

  const old = setup();
  await handleCreate(req(valid), old.deps);
  assert.ok(!old.calls.some((c) => c.fn === "service_payment_set_receipt_document"), "app antigo não mexe");
});

const consent = { saveTaxDocument: true, taxDocumentConsentText: "Salvar meu CPF para as próximas compras" };

test("sem o consentimento (RV-09) o CPF serve só a este pagamento e não é guardado", async () => {
  const off = setup();
  assert.equal((await handleCreate(req(valid), off.deps)).status, 200);
  assert.ok(!off.calls.some((c) => c.fn === "service_customer_save_tax_document"));
  const noText = setup();
  await handleCreate(req({ ...valid, saveTaxDocument: true }), noText.deps);
  assert.ok(!noText.calls.some((c) => c.fn === "service_customer_save_tax_document"), "sem o texto aceito não há registro de consentimento");
  const receipt = setup();
  await handleCreate(req({ ...valid, ...consent, receiptDocument: "529.982.247-25" }), receipt.deps);
  assert.equal(receipt.calls.find((c) => c.fn === "service_customer_save_tax_document")?.args.p_document, "52998224725", "guarda o CPF da nota");
});

test("Pix que falha antes do Asaas (CT-06) libera a parcela na hora; depois da cobrança, retoma", async () => {
  const early = setup({ getCustomer: new Error("x") });
  early.deps.provider.createCustomer = async () => { throw new AsaasError(500, null, "boom"); };
  const res = await handleCreate(req({ ...valid, purpose: "bill_share" }), early.deps);
  assert.equal(res.status, 502);
  assert.ok(early.calls.some((c) => c.fn === "service_payment_abort_unsent" && c.args.p_payment_id === PAY));
  const late = setup({ createThrows: true });
  await handleCreate(req({ ...valid, purpose: "bill_share" }), late.deps);
  assert.ok(!late.calls.some((c) => c.fn === "service_payment_abort_unsent"));
  const order = setup();
  order.deps.provider.createCustomer = async () => { throw new AsaasError(500, null, "boom"); };
  await handleCreate(req(valid), order.deps);
  assert.ok(!order.calls.some((c) => c.fn === "service_payment_abort_unsent"), "pedido segue retomável");
});

test("CPF da cobrança fica guardado com consentimento; quem já tinha cadastro tem o CPF lido do Asaas uma vez", async () => {
  const first = setup();
  await handleCreate(req({ ...valid, ...consent }), first.deps);
  assert.deepEqual(first.calls.find((c) => c.fn === "service_customer_save_tax_document")?.args,
    { p_user_id: USER, p_document: "12345678909", p_source: "payment", p_consent: true, p_consent_text: consent.taxDocumentConsentText });

  const returning = setup({ customerId: "cus_old", hasTaxDocument: false });
  assert.equal((await handleCreate(req({ ...valid, ...consent, payerCpfCnpj: undefined }), returning.deps)).status, 200);
  assert.ok(returning.provider.includes("getCustomer:cus_old"));
  assert.deepEqual(returning.calls.find((c) => c.fn === "service_customer_save_tax_document")?.args,
    { p_user_id: USER, p_document: "52998224725", p_source: "provider", p_consent: true, p_consent_text: consent.taxDocumentConsentText });

  const known = setup({ customerId: "cus_old", hasTaxDocument: true });
  await handleCreate(req({ ...valid, ...consent, payerCpfCnpj: undefined }), known.deps);
  assert.ok(!known.provider.some((p) => p.startsWith("getCustomer")));
  assert.ok(!known.calls.some((c) => c.fn === "service_customer_save_tax_document"));

  const down = setup({ customerId: "cus_old", hasTaxDocument: false, getCustomer: new Error("asaas fora") });
  assert.equal((await handleCreate(req({ ...valid, ...consent, payerCpfCnpj: undefined }), down.deps)).status, 200, "nunca atrapalha o pagamento");
});

test("subconta sem chave Pix: 422 pix_unavailable, não 'provedor indisponível' (PAG-06)", async () => {
  const { deps } = setup({ pixKeyMissing: true });
  const res = await handleCreate(req(valid), deps);
  assert.equal(res.status, 422);
  const body = await res.json();
  assert.equal(body.error, "pix_unavailable");
  assert.equal(body.retryable, false);
});

// ---- QA PAG-02: cartão só salvo, resultado síncrono ------------------------------------------
test("cartão sem cartão salvo: 422 card_required_saved, sem reservar nem ir ao Asaas", async () => {
  for (const body of [card, { ...card, saveCard: true }]) {
    const { deps, calls, provider } = setup();
    const res = await handleCreate(reqIp(body), deps);
    assert.equal(res.status, 422);
    const out = await res.json();
    assert.equal(out.error, "card_required_saved");
    assert.equal(out.checkoutUrl, undefined);
    assert.equal(calls.length, 0);
    assert.equal(provider.length, 0);
  }
});

test("cartão salvo aprovado: cardResult approved, sem checkoutUrl e sem confirmar fora do webhook", async () => {
  const { deps, calls } = setup({ cardToken: "tok_secreto_1", customerId: "cus_1" });
  const body = await (await handleCreate(reqIp({ ...card, paymentMethodId: SAVED }), deps)).json();
  assert.equal(body.cardResult, "approved");
  assert.equal(body.checkoutUrl, null);
  assert.equal(body.declineReason, undefined);
  assert.ok(!calls.some((c) => c.fn === "service_payment_apply_event" || c.fn === "service_payment_card_declined"));
});

test("cartão salvo em análise: cardResult pending", async () => {
  const { deps } = setup({ cardToken: "tok_secreto_1", customerId: "cus_1", payStatus: "AWAITING_RISK_ANALYSIS" });
  assert.equal((await (await handleCreate(reqIp({ ...card, paymentMethodId: SAVED }), deps)).json()).cardResult, "pending");
});

test("cartão salvo recusado: declined com motivo, reserva liberada na hora e cobrança cancelada", async () => {
  const refusal = new AsaasError(400, { errors: [{ code: "invalid_creditCard", description: "Transação não autorizada. Verifique os dados do cartão." }] }, "400");
  for (const purpose of ["order", "bill_share"]) {
    const { deps, calls, provider } = setup({ cardToken: "tok_secreto_1", customerId: "cus_1", payThrows: refusal });
    const res = await handleCreate(reqIp({ ...card, purpose, paymentMethodId: SAVED }), deps);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.cardResult, "declined");
    assert.equal(body.status, "failed");
    assert.equal(body.declineReason, "Transação não autorizada. Verifique os dados do cartão.");
    assert.equal(body.checkoutUrl, null);
    assert.deepEqual(calls.find((c) => c.fn === "service_payment_card_declined")!.args,
      { p_payment_id: PAY, p_user_id: USER, p_reason: body.declineReason });
    assert.ok(provider.includes("cancel:pay_asaas"));
    assert.ok(!calls.some((c) => c.fn === "service_payment_mark_failed"));
  }
});

test("cartão salvo sem resposta do Asaas (rede/5xx): pending, nada é liberado", async () => {
  const { deps, calls } = setup({ cardToken: "tok_secreto_1", customerId: "cus_1", payThrows: new AsaasError(0, null, "timeout") });
  const body = await (await handleCreate(reqIp({ ...card, paymentMethodId: SAVED }), deps)).json();
  assert.equal(body.cardResult, "pending");
  assert.ok(!calls.some((c) => c.fn === "service_payment_card_declined"));
});

test("cartão: reenvio com a mesma chave devolve o mesmo resultado, sem cobrar de novo", async () => {
  const { deps, provider } = setup({ reserved: { paymentId: PAY, orderId: ORDER, status: "failed", method: "credit_card", amountCents: 5000,
    paymentAccountId: ACCT, providerRef: "pay_asaas", alreadyPaid: false } });
  const body = await (await handleCreate(reqIp({ ...card, paymentMethodId: SAVED }), deps)).json();
  assert.equal(body.cardResult, "declined");
  assert.equal(body.checkoutUrl, null);
  assert.equal(provider.length, 0);
});

test("RV-18: chave de outro ambiente não cobra, responde 409 e avisa o Dono", async () => {
  for (const secrets of [{ environment: "production" }, { apiKey: "$aact_prod_x" }, { apiKey: "sem-prefixo" }, { environment: null }]) {
    const { deps, calls, provider } = setup({ secrets });
    const res = await handleCreate(req(valid), deps);
    assert.equal(res.status, 409);
    assert.equal((await res.json()).error, "environment_mismatch");
    assert.deepEqual(provider, []);
    assert.ok(calls.some((c) => c.fn === "service_payment_environment_mismatch" && c.args.p_account_id === ACCT));
  }
  const prod = setup({ secrets: { apiKey: "$aact_prod_x", environment: "production" } });
  assert.equal((await handleCreate(req(valid), prod.deps)).status, 200);
});

test("RV-01: Pix só no provedor parametrizado que existe; outro valor é erro claro e nada é cobrado", async () => {
  const { deps, provider } = setup({ secrets: { pixProvider: "mercadopago" } });
  const res = await handleCreate(req(valid), deps);
  assert.equal(res.status, 409);
  assert.equal((await res.json()).error, "pix_provider_unsupported");
  assert.deepEqual(provider, []);
});
