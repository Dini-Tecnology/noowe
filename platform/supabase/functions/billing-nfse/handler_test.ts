import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleBillingNfse } from "./handler.ts";
import { handleBillingWebhook } from "../billing-webhook/handler.ts";

const INV = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const job = {
  claimed: true, invoiceId: INV, paymentRef: "pay_1", totalCents: 19900, effectiveDate: "2026-11-05", attempt: 1,
  serviceDescription: "Assinatura NOOWE", municipalServiceId: null, municipalServiceCode: "01.03", municipalServiceName: "Software",
  taxes: { retainIss: false, issBps: 200, pisBps: 65, cofinsBps: 300, csllBps: 0, inssBps: 0, irBps: 0 },
};
const req = (body: unknown = { invoiceId: INV }, token = "svc") => new Request("http://x", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });

function setup(over: { job?: any; existing?: any; root?: string | null; throws?: boolean } = {}) {
  const calls: { fn: string; args: any }[] = [];
  const scheduled: any[] = [];
  const deps: any = {
    rpc: async (fn: string, args: any) => {
      calls.push({ fn, args });
      if (fn === "service_nfse_claim") return { data: over.job ?? job, error: null };
      return { data: null, error: null };
    },
    env: (name: string) => name === "ASAAS_ROOT_API_KEY" ? (over.root === null ? undefined : "root") : name === "SUPABASE_SERVICE_ROLE_KEY" ? "svc" : name === "BILLING_WEBHOOK_TOKEN" ? "tok" : undefined,
    provider: {
      findInvoiceByExternalRef: async () => over.existing ?? null,
      scheduleInvoice: async (_k: string, input: any) => { if (over.throws) throw new Error("x"); scheduled.push(input); return { id: "inv_1" }; },
    },
  };
  return { deps, calls, scheduled };
}

Deno.test("agenda a nota vinculada à cobrança, com tributos dos parâmetros em percentual", async () => {
  const { deps, calls, scheduled } = setup();
  assertEquals((await handleBillingNfse(req(), deps)).status, 200);
  assertEquals(scheduled[0].payment, "pay_1");
  assertEquals(scheduled[0].valueCents, 19900);
  assertEquals(scheduled[0].externalReference, `nfse:${INV}`);
  assertEquals(scheduled[0].taxes.iss, 2);
  assertEquals(scheduled[0].taxes.pis, 0.65);
  assertEquals(calls.find((c) => c.fn === "service_nfse_attach")!.args.p_provider_ref, "inv_1");
});

Deno.test("na repetição, confere antes e não agenda segunda nota", async () => {
  const { deps, scheduled, calls } = setup({ job: { ...job, attempt: 2 }, existing: { id: "inv_old" } });
  await handleBillingNfse(req(), deps);
  assertEquals(scheduled.length, 0);
  assertEquals(calls.find((c) => c.fn === "service_nfse_attach")!.args.p_provider_ref, "inv_old");
});

Deno.test("sem dados da empresa, não chama o Asaas", async () => {
  const { deps, scheduled } = setup({ job: { claimed: false, reason: "company_data_missing" } });
  assertEquals((await handleBillingNfse(req(), deps)).status, 200);
  assertEquals(scheduled.length, 0);
});

Deno.test("só a service role, e sem chave raiz não tenta", async () => {
  assertEquals((await handleBillingNfse(req({ invoiceId: INV }, "x.e30.y"), setup().deps)).status, 401);
  assertEquals((await handleBillingNfse(req(), setup({ root: null }).deps)).status, 503);
});

Deno.test("falha no provedor fica registrada para a varredura repetir", async () => {
  const { deps, calls } = setup({ throws: true });
  assertEquals((await handleBillingNfse(req(), deps)).status, 502);
  const attach = calls.find((c) => c.fn === "service_nfse_attach")!.args;
  assertEquals(attach.p_provider_ref, null);
  assertEquals(attach.p_error, "Provedor indisponível");
});

const hook = (body: unknown, token = "tok") => new Request("http://x", { method: "POST", headers: { "asaas-access-token": token }, body: JSON.stringify(body) });

Deno.test("webhook: nota autorizada guarda o PDF", async () => {
  const { deps, calls } = setup();
  const res = await handleBillingWebhook(hook({ event: "INVOICE_AUTHORIZED", invoice: { id: "inv_1", externalReference: `nfse:${INV}`, pdfUrl: "https://p" } }), deps);
  assertEquals(res.status, 200);
  const args = calls.find((c) => c.fn === "service_nfse_result")!.args;
  assertEquals([args.p_invoice_id, args.p_status, args.p_url], [INV, "issued", "https://p"]);
});

Deno.test("webhook: erro marca falha; agendada e nota de outro sistema não mudam nada", async () => {
  const failed = setup();
  await handleBillingWebhook(hook({ event: "INVOICE_ERROR", invoice: { externalReference: `nfse:${INV}` } }), failed.deps);
  assertEquals(failed.calls.find((c) => c.fn === "service_nfse_result")!.args.p_status, "failed");
  const other = setup();
  await handleBillingWebhook(hook({ event: "INVOICE_CREATED", invoice: { externalReference: `nfse:${INV}` } }), other.deps);
  await handleBillingWebhook(hook({ event: "INVOICE_AUTHORIZED", invoice: { externalReference: "outra" } }), other.deps);
  assertEquals(other.calls.length, 0);
});
