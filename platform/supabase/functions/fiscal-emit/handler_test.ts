import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { EmitInput, FiscalProvider, FiscalResult } from "../_shared/fiscal/types.ts";
import { type FiscalDeps, handleFiscalEmit } from "./handler.ts";

const DOC = "11111111-1111-4111-8111-111111111111";
const AUTHORIZED: FiscalResult = {
  outcome: "authorized", accessKey: "4119", number: "12", series: "1", protocol: "p",
  qrCodeUrl: "http://qr", danfeUrl: "http://danfe", xmlUrl: "http://xml", consultUrl: "http://c", contingency: false,
};
const JOB = {
  claimed: true, documentId: DOC, ref: `s-${DOC}`, attempt: 1, environment: "homologation", token: "tok", cnpj: "123",
  items: [{ grossCents: 100 }], payments: [{ method: "pix", cents: 100 }], totalCents: 100,
};

function setup(options: { claim?: unknown; emit?: FiscalResult | Error; consult?: FiscalResult; recordError?: boolean } = {}) {
  const records: Record<string, unknown>[] = [];
  const emits: EmitInput[] = [];
  const consults: string[] = [];
  const provider: FiscalProvider = {
    emit: (_c, input) => {
      emits.push(input);
      if (options.emit instanceof Error) return Promise.reject(options.emit);
      return Promise.resolve(options.emit ?? AUTHORIZED);
    },
    consult: (_c, ref) => { consults.push(ref); return Promise.resolve(options.consult ?? { outcome: "not_found" }); },
  };
  const deps: FiscalDeps = {
    provider,
    env: (name) => name === "SUPABASE_SERVICE_ROLE_KEY" ? "service" : undefined,
    rpc: (fn, args) => {
      if (fn === "service_fiscal_claim") return Promise.resolve({ data: options.claim ?? JOB, error: null });
      records.push(args);
      if (options.recordError) return Promise.resolve({ data: null, error: { message: "db down" } });
      return Promise.resolve({ data: { status: args.p_outcome === "authorized" ? "authorized" : "pending" }, error: null });
    },
  };
  return { deps, records, emits, consults };
}

function request(token = "service", body: unknown = { documentId: DOC }) {
  return new Request("http://x/fiscal-emit", { method: "POST", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
}

Deno.test("só a service role aciona a emissão", async () => {
  const { deps, emits } = setup();
  assertEquals((await handleFiscalEmit(request("anon-key"), deps)).status, 401);
  assertEquals(emits.length, 0);
});

Deno.test("JWT com papel de cliente não aciona; papel de serviço aciona", async () => {
  const jwt = (role: string) => `x.${btoa(JSON.stringify({ role }))}.y`;
  const client = setup();
  assertEquals((await handleFiscalEmit(request(jwt("authenticated")), client.deps)).status, 401);
  assertEquals(client.emits.length, 0);
  const service = setup();
  assertEquals((await handleFiscalEmit(request(jwt("service_role")), service.deps)).status, 200);
  assertEquals(service.emits.length, 1);
});

Deno.test("identificador inválido não chega ao banco", async () => {
  const { deps } = setup();
  assertEquals((await handleFiscalEmit(request("service", { documentId: "x" }), deps)).status, 400);
});

Deno.test("documento fora de hora ou bloqueado não chama o emissor", async () => {
  const { deps, emits, records } = setup({ claim: { claimed: false, blocked: "fiscal_config_missing" } });
  const response = await handleFiscalEmit(request(), deps);
  assertEquals(await response.json(), { ok: true, skipped: "fiscal_config_missing" });
  assertEquals(emits.length, 0);
  assertEquals(records.length, 0);
});

Deno.test("nota autorizada grava número e chave", async () => {
  const { deps, records } = setup();
  const response = await handleFiscalEmit(request(), deps);
  assertEquals(await response.json(), { ok: true, status: "authorized" });
  assertEquals(records[0].p_outcome, "authorized");
  assertEquals((records[0].p_result as Record<string, unknown>).number, "12");
});

Deno.test("primeira tentativa não consulta antes de enviar", async () => {
  const { deps, consults, emits } = setup();
  await handleFiscalEmit(request(), deps);
  assertEquals(consults.length, 0);
  assertEquals(emits[0].ref, `s-${DOC}`);
});

Deno.test("retentativa adota a nota que o timeout anterior autorizou, sem reenviar", async () => {
  const { deps, emits, records } = setup({ claim: { ...JOB, attempt: 2 }, consult: AUTHORIZED });
  await handleFiscalEmit(request(), deps);
  assertEquals(emits.length, 0);
  assertEquals(records[0].p_outcome, "authorized");
});

Deno.test("referência já usada busca o resultado na consulta", async () => {
  const { deps, records } = setup({ emit: { outcome: "already_processed" }, consult: AUTHORIZED });
  await handleFiscalEmit(request(), deps);
  assertEquals(records[0].p_outcome, "authorized");
});

Deno.test("referência já usada sem nota na consulta volta para a fila", async () => {
  const { deps, records } = setup({ emit: { outcome: "already_processed" } });
  await handleFiscalEmit(request(), deps);
  assertEquals(records[0].p_outcome, "transient");
});

Deno.test("falha do emissor fica recuperável", async () => {
  const { deps, records } = setup({ emit: new Error("offline") });
  const response = await handleFiscalEmit(request(), deps);
  assertEquals(response.status, 200);
  assertEquals(records[0].p_outcome, "transient");
});

Deno.test("rejeição da SEFAZ é registrada com o código", async () => {
  const { deps, records } = setup({ emit: { outcome: "rejected", errorCode: "704", errorMessage: "Rejeição" } });
  await handleFiscalEmit(request(), deps);
  assertEquals(records[0].p_outcome, "rejected");
  assertEquals((records[0].p_result as Record<string, unknown>).errorCode, "704");
});

Deno.test("dado que não vira nota não entra em retentativa", async () => {
  const { deps, records } = setup({ emit: new RangeError("Forma de pagamento sem código fiscal") });
  await handleFiscalEmit(request(), deps);
  assertEquals(records[0].p_outcome, "rejected");
});

Deno.test("falha ao gravar responde erro para a varredura retomar", async () => {
  const { deps } = setup({ recordError: true });
  assertEquals((await handleFiscalEmit(request(), deps)).status, 500);
});

Deno.test("token do restaurante não aparece na resposta", async () => {
  const { deps } = setup();
  const text = await (await handleFiscalEmit(request(), deps)).text();
  assertEquals(text.includes("tok"), false);
});

Deno.test("o CPF na nota do banco chega à emissão; sem ele, vai nulo", async () => {
  const withCpf = setup({ claim: { ...JOB, consumerDocument: "52998224725" } });
  await handleFiscalEmit(request(), withCpf.deps);
  assertEquals(withCpf.emits[0].consumerDocument, "52998224725");
  const without = setup();
  await handleFiscalEmit(request(), without.deps);
  assertEquals(without.emits[0].consumerDocument, null);
});
