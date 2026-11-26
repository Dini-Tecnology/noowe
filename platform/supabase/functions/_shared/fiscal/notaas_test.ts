import { assert, assertEquals, assertMatch, assertNotEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildNotaasNfce, NotaasClient, notaasIdempotencyKey } from "./notaas.ts";
import type { EmitInput } from "./types.ts";

const item = {
  productCode: "m1", description: "Pizza", quantity: 3, grossCents: 10000, discountCents: 0, feeCents: 0,
  ncm: "21069090", cfop: "5102", unit: "un", icmsOrigin: "0", icmsCst: "102", pisCst: "49", cofinsCst: "49",
};
const input: EmitInput = {
  ref: "s-1", cnpj: "12345678000123", items: [item], payments: [{ method: "pix", cents: 10000 }],
  issuedAt: new Date("2026-11-02T15:00:00Z"),
};
const credentials = { token: "ntaas_tok", environment: "homologation" as const };
const ID = "6f1c2b8e-0000-4000-8000-000000000001";

type Call = { url: string; init: RequestInit };
// Respostas em fila, na ordem das chamadas; a última se repete.
function fakeFetch(replies: [number, unknown][], calls: Call[] = []) {
  return ((url: string, init: RequestInit) => {
    calls.push({ url, init });
    const [status, body] = replies[Math.min(calls.length - 1, replies.length - 1)];
    return Promise.resolve(new Response(typeof body === "string" ? body : JSON.stringify(body), { status }));
  }) as unknown as typeof fetch;
}
const noSleep = () => Promise.resolve();
const client = (replies: [number, unknown][], calls: Call[] = []) => new NotaasClient(fakeFetch(replies, calls), noSleep);

const ISSUED = {
  invoiceId: ID, status: "issued", tpAmb: 2, chaveAcesso: "NFe35261112345678000123650010000000121743484310",
  numero: 12, serie: 1, protocolo: "135260000000001", pdfUrl: "/api/v1/nfe/invoices/x/danfe", xmlUrl: "https://cdn.notaas.com.br/x.xml",
  qrCode: "https://www.homologacao.nfce.fazenda.sp.gov.br/qrcode?p=3526", urlChave: "https://www.nfce.fazenda.sp.gov.br/consulta",
};

Deno.test("emissão: chave de API no header, modelo 65 e chave de idempotência estável", async () => {
  const calls: Call[] = [];
  await client([[202, { invoiceId: ID }], [200, ISSUED]], calls).emit(credentials, input);
  const headers = calls[0].init.headers as Record<string, string>;
  assertEquals(calls[0].url, "https://platform.notaas.com.br/api/v1/nfe/emitir");
  assertEquals(headers["x-api-key"], "ntaas_tok");
  assertEquals(JSON.parse(calls[0].init.body as string).modelo, 65);
  assertMatch(headers["Idempotency-Key"], /^s-1:[0-9a-f]{16}$/);
  assertEquals(headers["Idempotency-Key"], await notaasIdempotencyKey("s-1", buildNotaasNfce(input)));
});

Deno.test("idempotência: hora de emissão não entra no corpo; corpo corrigido muda a chave", async () => {
  const later = buildNotaasNfce({ ...input, issuedAt: new Date("2026-11-02T18:00:00Z") });
  assertEquals(await notaasIdempotencyKey("s-1", later), await notaasIdempotencyKey("s-1", buildNotaasNfce(input)));
  const fixed = buildNotaasNfce({ ...input, items: [{ ...item, ncm: "19059090" }] });
  assertNotEquals(await notaasIdempotencyKey("s-1", fixed), await notaasIdempotencyKey("s-1", buildNotaasNfce(input)));
});

Deno.test("aceita e autorizada na espera: número, chave só com dígitos, QR Code e ID do emissor", async () => {
  const calls: Call[] = [];
  const result = await client([[202, { invoiceId: ID }], [200, { status: "processing" }], [200, ISSUED]], calls).emit(credentials, input);
  assert(result.outcome === "authorized");
  assertEquals(result.providerRef, ID);
  assertEquals(result.accessKey, "35261112345678000123650010000000121743484310");
  assertEquals(result.number, "12");
  assertEquals(result.qrCodeUrl, ISSUED.qrCode);
  assertEquals(result.danfeUrl, "https://platform.notaas.com.br/api/v1/nfe/invoices/x/danfe");
  assertEquals(result.contingency, false);
  assertEquals(calls[1].url, `https://platform.notaas.com.br/api/v1/nfe/invoices/${ID}/status`);
});

Deno.test("aceita e ainda na fila depois da espera volta como pending com o ID", async () => {
  const result = await client([[202, { invoiceId: ID }], [200, { status: "queued" }]]).emit(credentials, input);
  assertEquals(result, { outcome: "pending", providerRef: ID });
});

Deno.test("aceita e a consulta cai: o ID não se perde", async () => {
  const result = await client([[202, { invoiceId: ID }], [503, "down"]]).emit(credentials, input);
  assertEquals(result, { outcome: "pending", providerRef: ID });
});

Deno.test("rejeição da SEFAZ vem no status error, com código e motivo", async () => {
  const result = await client([[202, { invoiceId: ID }], [200, { status: "error", cStat: 778, xMotivo: "NCM inexistente" }]]).emit(credentials, input);
  assertEquals(result, { outcome: "rejected", providerRef: ID, errorCode: "778", errorMessage: "NCM inexistente" });
});

Deno.test("409 da idempotência, 429, 5xx e rede têm saídas próprias", async () => {
  assertEquals((await client([[409, { error: "conflito" }]]).emit(credentials, input)).outcome, "already_processed");
  assertEquals((await client([[429, {}]]).emit(credentials, input)).outcome, "transient");
  assertEquals((await client([[500, "boom"]]).emit(credentials, input)).outcome, "transient");
  const offline = new NotaasClient((() => Promise.reject(new Error("offline"))) as unknown as typeof fetch, noSleep);
  assertEquals((await offline.emit(credentials, input)).outcome, "transient");
});

Deno.test("erro de cadastro ou de créditos precisa de gente", async () => {
  const credits = await client([[403, { error: "Créditos esgotados", errorCode: "CREDIT_LIMIT" }]]).emit(credentials, input);
  assertEquals(credits, { outcome: "rejected", errorCode: "CREDIT_LIMIT", errorMessage: "Créditos esgotados" });
  assertEquals((await client([[422, { error: "Certificado ausente" }]]).emit(credentials, input)).outcome, "rejected");
  assertEquals((await client([[401, "x"]]).emit(credentials, input)).outcome, "rejected");
});

Deno.test("projeto em produção com configuração de homologação nunca vira nota autorizada", async () => {
  const result = await client([[200, { ...ISSUED, tpAmb: 1 }]]).consult(credentials, ID);
  assertEquals(result.outcome, "rejected");
  assert(result.outcome === "rejected" && result.errorCode === "environment_mismatch");
});

Deno.test("status cancelado ou novo nunca vira nota autorizada; 404 é não encontrada", async () => {
  assertEquals((await client([[200, { status: "cancelled" }]]).consult(credentials, ID)).outcome, "rejected");
  assertEquals((await client([[200, { status: "algo_novo" }]]).consult(credentials, ID)).outcome, "rejected");
  assertEquals((await client([[404, {}]]).consult(credentials, ID)).outcome, "not_found");
});

Deno.test("sem QR Code no status, lê QR, consulta e contingência do XML", async () => {
  const { qrCode: _q, urlChave: _u, ...bare } = ISSUED;
  const xml = "<nfeProc><NFe><infNFe><ide><tpEmis>9</tpEmis></ide></infNFe><infNFeSupl><qrCode><![CDATA[https://qr.sp/?p=1|2]]></qrCode>" +
    "<urlChave>https://consulta.sp</urlChave></infNFeSupl></NFe></nfeProc>";
  const calls: Call[] = [];
  const result = await client([[200, bare], [200, xml]], calls).consult(credentials, ID);
  assert(result.outcome === "authorized");
  assertEquals(result.qrCodeUrl, "https://qr.sp/?p=1|2");
  assertEquals(result.consultUrl, "https://consulta.sp");
  assertEquals(result.contingency, true);
  assertMatch(calls[1].url, /\/xml$/);
});

Deno.test("corpo em reais só na borda, com desconto, taxa e CSOSN", () => {
  const body = buildNotaasNfce({
    ...input,
    items: [{ ...item, grossCents: 1999, quantity: 1, discountCents: 200, feeCents: 180 }],
    payments: [{ method: "pix", cents: 1000 }, { method: "credit_card", cents: 979 }],
  }) as { items: Record<string, unknown>[]; pagamentos: Record<string, unknown>[] };
  const line = body.items[0];
  assertEquals(line.valorTotal, 19.99);
  assertEquals(line.desconto, 2);
  assertEquals(line.outrasDespesas, 1.8);
  assertEquals(line.csosn, "102");
  assertEquals("cst" in line, false);
  assertEquals(body.pagamentos, [{ tipoPagamento: "17", valor: 10 }, { tipoPagamento: "03", valor: 9.79 }]);
  assertEquals("dataEmissao" in body, false);
});

Deno.test("item sem desconto nem taxa não leva esses campos; regime normal usa CST", () => {
  const body = buildNotaasNfce({ ...input, items: [{ ...item, icmsCst: "00" }] }) as { items: Record<string, unknown>[] };
  assertEquals("desconto" in body.items[0], false);
  assertEquals("outrasDespesas" in body.items[0], false);
  assertEquals(body.items[0].cst, "00");
  assertEquals(body.items[0].valorUnitario, 33.3333333333);
});

Deno.test("forma de pagamento desconhecida não vira código fiscal; vales têm o tipo certo", () => {
  assertThrows(() => buildNotaasNfce({ ...input, payments: [{ method: "cheque_moeda", cents: 1 }] }), RangeError);
  const body = buildNotaasNfce({
    ...input,
    payments: [{ method: "voucher_refeicao", cents: 100 }, { method: "voucher_alimentacao", cents: 100 }, { method: "tap_card", cents: 9800 }],
  }) as { pagamentos: Record<string, unknown>[] };
  assertEquals(body.pagamentos.map((p) => p.tipoPagamento), ["11", "10", "03"]);
});

Deno.test("CPF na nota: com CPF ou CNPJ vai o destinatário; sem ele, consumidor não identificado", () => {
  assertEquals((buildNotaasNfce({ ...input, consumerDocument: "529.982.247-25" }) as Record<string, unknown>).dest, { cpf: "52998224725" });
  assertEquals((buildNotaasNfce({ ...input, consumerDocument: "11222333000181" }) as Record<string, unknown>).dest, { cnpj: "11222333000181" });
  for (const none of [null, undefined, "", "123"]) {
    assertEquals("dest" in buildNotaasNfce({ ...input, consumerDocument: none }), false);
  }
});

Deno.test("cancelamento: consulta, envia o motivo e só vale quando a Notaas diz cancelada", async () => {
  const calls: Call[] = [];
  const result = await client([[200, { status: "issued" }], [202, {}], [200, { status: "issued" }], [200, { status: "cancelled" }]], calls)
    .cancel(credentials, ID, "Estorno ao cliente: prato errado");
  assertEquals(result.outcome, "cancelled");
  assertEquals(calls[1].url, "https://platform.notaas.com.br/api/v1/nfe/cancelar");
  assertEquals(JSON.parse(calls[1].init.body as string), { invoiceId: ID, motivo: "Estorno ao cliente: prato errado" });
});

Deno.test("cancelamento já feito não reenvia; ainda em processamento tenta de novo; fora do prazo vai para gente", async () => {
  const calls: Call[] = [];
  assertEquals((await client([[200, { status: "cancelled" }]], calls).cancel(credentials, ID, "x")).outcome, "cancelled");
  assertEquals(calls.length, 1);
  assertEquals((await client([[200, { status: "issued" }], [202, {}], [200, { status: "issued" }]]).cancel(credentials, ID, "x")).outcome, "transient");
  assertEquals(
    await client([[200, { status: "issued" }], [422, { error: "Prazo de cancelamento expirado" }]]).cancel(credentials, ID, "x"),
    { outcome: "rejected", errorMessage: "Prazo de cancelamento expirado" },
  );
  assertEquals((await client([[503, "down"]]).cancel(credentials, ID, "x")).outcome, "transient");
});
