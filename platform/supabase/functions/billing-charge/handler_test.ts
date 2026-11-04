import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleBillingCharge } from "./handler.ts";
import { handleBillingWebhook } from "../billing-webhook/handler.ts";

const INV = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const job = { claimed: true, invoiceId: INV, restaurantId: "r1", name: "Casa", cnpj: "12345678000123", email: "a@b.c", customerId: null, totalCents: 19900, dueDate: "2026-11-10" };
const req = (body: unknown = { invoiceId: INV }, token = "svc") => new Request("http://x", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });

function setup(over: { job?: any; existing?: any; root?: string | null; throws?: boolean } = {}) {
  const calls: { fn: string; args: any }[] = [];
  const created: any[] = [];
  const deps: any = {
    rpc: async (fn: string, args: any) => {
      calls.push({ fn, args });
      if (fn === "service_invoice_claim") return { data: over.job ?? job, error: null };
      return { data: null, error: null };
    },
    env: (name: string) => name === "ASAAS_ROOT_API_KEY" ? (over.root === null ? undefined : "root") : name === "SUPABASE_SERVICE_ROLE_KEY" ? "svc" : name === "BILLING_WEBHOOK_TOKEN" ? "tok" : undefined,
    provider: {
      createCustomer: async () => ({ id: "cus_1" }),
      findChargeByExternalRef: async () => over.existing ?? null,
      createCharge: async (_k: string, input: any) => { if (over.throws) throw new Error("x"); created.push(input); return { id: "pay_1", status: "PENDING", value: 199, invoiceUrl: "https://asaas/i/1" }; },
    },
  };
  return { deps, calls, created };
}

Deno.test("cobra na conta da NOOWE, com o valor da fatura, e guarda a referência", async () => {
  const { deps, calls, created } = setup();
  assertEquals((await handleBillingCharge(req(), deps)).status, 200);
  assertEquals(created[0].valueCents, 19900);
  assertEquals(created[0].externalReference, `inv:${INV}`);
  assertEquals(created[0].billingType, "UNDEFINED");
  const attach = calls.find((c) => c.fn === "service_invoice_attach")!.args;
  assertEquals([attach.p_customer_id, attach.p_provider_ref, attach.p_checkout_url], ["cus_1", "pay_1", "https://asaas/i/1"]);
});

Deno.test("repetir não cria segunda cobrança", async () => {
  const { deps, created } = setup({ existing: { id: "pay_old", status: "PENDING", value: 199, invoiceUrl: "u" } });
  await handleBillingCharge(req(), deps);
  assertEquals(created.length, 0);
});

Deno.test("só a service role, e sem chave raiz não tenta", async () => {
  assertEquals((await handleBillingCharge(req({ invoiceId: INV }, "x.e30.y"), setup().deps)).status, 401);
  assertEquals((await handleBillingCharge(req(), setup({ root: null }).deps)).status, 503);
});

Deno.test("sem CNPJ, registra o motivo e não chama o Asaas", async () => {
  const { deps, created, calls } = setup({ job: { ...job, cnpj: "" } });
  assertEquals((await handleBillingCharge(req(), deps)).status, 422);
  assertEquals(created.length, 0);
  assertEquals(calls.find((c) => c.fn === "service_invoice_attach")!.args.p_error, "Restaurante sem CNPJ para gerar a fatura");
});

const hook = (body: unknown, token = "tok") => new Request("http://x", { method: "POST", headers: { "asaas-access-token": token }, body: JSON.stringify(body) });

Deno.test("webhook: token errado não muda nada", async () => {
  const { deps, calls } = setup();
  assertEquals((await handleBillingWebhook(hook({}, "errado"), deps)).status, 401);
  assertEquals(calls.length, 0);
});

Deno.test("webhook: só fatura paga marca como paga", async () => {
  const a = setup();
  await handleBillingWebhook(hook({ event: "PAYMENT_RECEIVED", payment: { externalReference: `inv:${INV}` } }), a.deps);
  assertEquals(a.calls.find((c) => c.fn === "service_invoice_paid")?.args.p_invoice_id, INV);
  const b = setup();
  await handleBillingWebhook(hook({ event: "PAYMENT_OVERDUE", payment: { externalReference: `inv:${INV}` } }), b.deps);
  await handleBillingWebhook(hook({ event: "PAYMENT_RECEIVED", payment: { externalReference: "outra-coisa" } }), b.deps);
  assertEquals(b.calls.length, 0);
});
