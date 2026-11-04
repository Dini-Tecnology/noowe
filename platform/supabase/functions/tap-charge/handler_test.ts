import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleTapCharge } from "./handler.ts";
import { handleTapWebhook } from "../tap-webhook/handler.ts";
import { tapProviderFor } from "../_shared/tap/providers.ts";
import type { TapProvider } from "../_shared/tap/types.ts";

const SID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const KEY = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PAY = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const req = (body: unknown) => new Request("http://x", { method: "POST", headers: { Authorization: "Bearer tok" }, body: JSON.stringify(body) });

function setup(over: { active?: string | null; startThrows?: boolean; event?: any; begun?: Record<string, unknown> } = {}) {
  const calls: { fn: string; args: any }[] = [];
  const fake: TapProvider = {
    startCharge: async () => { calls.push({ fn: "startCharge", args: {} }); if (over.startThrows) throw new Error("x"); return { providerRef: "r1", sdkPayload: { token: "sdk" } }; },
    refund: async () => {},
    parseWebhook: async () => over.event ?? null,
  };
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    calls.push({ fn, args });
    if (fn === "service_tap_provider") return { data: over.active === undefined ? "fake" : over.active, error: null };
    if (fn === "service_tap_begin") return { data: { paymentId: PAY, amountCents: 5000, status: "pending", ...over.begun }, error: null };
    return { data: {}, error: null };
  };
  return { calls, rpc, getUser: async () => ({ id: "u1" }), provider: (name: string | null) => (name === "fake" ? fake : null) };
}

Deno.test("sem fornecedor ativo, não abre cobrança", async () => {
  const d = setup({ active: null });
  const res = await handleTapCharge(req({ tableSessionId: SID, idempotencyKey: KEY }), d);
  assertEquals(res.status, 409);
  assertEquals(d.calls.some((c) => c.fn === "service_tap_begin"), false);
});

Deno.test("nenhum fornecedor registrado ainda", () => {
  assertEquals(tapProviderFor("qualquer", () => undefined), null);
  assertEquals(tapProviderFor(null, () => undefined), null);
});

Deno.test("iniciar não confirma: só o webhook do fornecedor confirma", async () => {
  const d = setup();
  const res = await handleTapCharge(req({ tableSessionId: SID, idempotencyKey: KEY, baseCents: 5000 }), d);
  assertEquals(res.status, 200);
  assertEquals((await res.json()).sdkPayload, { token: "sdk" });
  assertEquals(d.calls.some((c) => c.fn === "service_tap_result"), false);
});

Deno.test("falha ao iniciar devolve a reserva", async () => {
  const d = setup({ startThrows: true });
  const res = await handleTapCharge(req({ tableSessionId: SID, idempotencyKey: KEY }), d);
  assertEquals(res.status, 502);
  assertEquals(d.calls.find((c) => c.fn === "service_tap_result")?.args.p_approved, false);
});

Deno.test("webhook com assinatura inválida não muda nada", async () => {
  const d = setup({ event: null });
  const res = await handleTapWebhook(new Request("http://x", { method: "POST", body: "{}" }), d);
  assertEquals(res.status, 401);
  assertEquals(d.calls.some((c) => c.fn === "service_tap_result"), false);
});

Deno.test("webhook aplica aprovado e recusado pela mesma porta", async () => {
  const d = setup({ event: { reference: PAY, eventId: "e1", approved: false, amountCents: null, tariffCents: null } });
  assertEquals((await handleTapWebhook(new Request("http://x", { method: "POST", body: "{}" }), d)).status, 200);
  assertEquals(d.calls.find((c) => c.fn === "service_tap_result")?.args.p_approved, false);
});

Deno.test("critério 7: repetir não chama o fornecedor de novo", async () => {
  const body = { tableSessionId: SID, idempotencyKey: KEY };
  const approved = setup({ begun: { status: "completed", providerRef: "r1" } });
  const a = await handleTapCharge(req(body), approved);
  assertEquals((await a.json()).approved, true);
  const started = setup({ begun: { providerRef: "r1", sdkPayload: { token: "antigo" } } });
  const b = await handleTapCharge(req(body), started);
  assertEquals((await b.json()).sdkPayload, { token: "antigo" });
  const failed = setup({ begun: { status: "failed" } });
  const c = await handleTapCharge(req(body), failed);
  assertEquals(c.status, 409);
  assertEquals((await c.json()).error, "charge_failed");
  for (const d of [approved, started, failed]) assertEquals(d.calls.some((x) => x.fn === "startCharge"), false);
});

Deno.test("guarda a referência do fornecedor e leva o motivo da retirada da taxa", async () => {
  const d = setup();
  await handleTapCharge(req({ tableSessionId: SID, idempotencyKey: KEY, waiveFee: true, reason: "Cliente reclamou" }), d);
  assertEquals(d.calls.find((c) => c.fn === "service_tap_started")?.args.p_provider_ref, "r1");
  assertEquals(d.calls.find((c) => c.fn === "service_tap_begin")?.args.p_reason, "Cliente reclamou");
});

Deno.test("webhook: aprovado confirma com o valor, e estorno vai pela mesma fronteira", async () => {
  const ok = setup({ event: { reference: PAY, eventId: "e1", approved: true, amountCents: 5000, tariffCents: 100 } });
  assertEquals((await handleTapWebhook(new Request("http://x", { method: "POST" }), ok)).status, 200);
  assertEquals(ok.calls.find((c) => c.fn === "service_tap_result")?.args.p_approved, true);
  const refund = setup({ event: { reference: PAY, eventId: "e2", approved: true, refund: "partial", amountCents: null, tariffCents: null } });
  await handleTapWebhook(new Request("http://x", { method: "POST" }), refund);
  assertEquals(refund.calls.find((c) => c.fn === "service_payment_apply_event")?.args.p_gateway_status, "partially_refunded");
  assertEquals(refund.calls.some((c) => c.fn === "service_tap_result"), false);
});

