import { assert, assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildFocusNfce, focusBaseUrl, focusIssuedAt, FocusNfeClient } from "./focus.ts";
import type { EmitInput } from "./types.ts";

const item = {
  productCode: "m1", description: "Pizza", quantity: 3, grossCents: 10000, discountCents: 0, feeCents: 0,
  ncm: "21069090", cfop: "5102", unit: "un", icmsOrigin: "0", icmsCst: "102", pisCst: "49", cofinsCst: "49",
};
const input: EmitInput = {
  ref: "s-1", cnpj: "12345678000123", items: [item], payments: [{ method: "pix", cents: 10000 }],
  issuedAt: new Date("2026-11-02T15:00:00Z"),
};
const credentials = { token: "tok", environment: "homologation" as const };

function fakeFetch(status: number, body: unknown, calls: { url: string; init: RequestInit }[] = []) {
  return ((url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(new Response(typeof body === "string" ? body : JSON.stringify(body), { status }));
  }) as unknown as typeof fetch;
}

const AUTHORIZED = {
  status: "autorizado", status_sefaz: "100", chave_nfe: "NFe41190612345678000123650010000000121743484310",
  numero: "12", serie: "1", protocolo: "232260176682690",
  caminho_danfe: "/notas_fiscais_consumidor/NFe411.html", caminho_xml_nota_fiscal: "/arquivos/x-nfe.xml",
  qrcode_url: "http://www.fazenda.pr.gov.br/nfce/qrcode/?p=411", url_consulta_nf: "http://www.fazenda.pr.gov.br/nfce/consulta",
};

Deno.test("autenticação é Basic com o token como usuário e senha vazia", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  await new FocusNfeClient(fakeFetch(201, AUTHORIZED, calls)).emit(credentials, input);
  assertEquals((calls[0].init.headers as Record<string, string>).Authorization, `Basic ${btoa("tok:")}`);
  assertEquals(calls[0].url, "https://homologacao.focusnfe.com.br/v2/nfce?ref=s-1");
});

Deno.test("ambiente desconhecido falha fechado: nunca adivinha entre teste e produção", () => {
  assertEquals(focusBaseUrl("production"), "https://api.focusnfe.com.br");
  assertThrows(() => focusBaseUrl("staging"));
});

Deno.test("nota autorizada traz número, chave só com dígitos e URLs absolutas", async () => {
  const result = await new FocusNfeClient(fakeFetch(201, AUTHORIZED)).emit(credentials, input);
  assert(result.outcome === "authorized");
  assertEquals(result.accessKey, "41190612345678000123650010000000121743484310");
  assertEquals(result.number, "12");
  assertEquals(result.danfeUrl, "https://homologacao.focusnfe.com.br/notas_fiscais_consumidor/NFe411.html");
  assertEquals(result.contingency, false);
});

Deno.test("contingência offline continua autorizada e fica marcada", async () => {
  const result = await new FocusNfeClient(fakeFetch(201, { ...AUTHORIZED, contingencia_offline: true })).emit(credentials, input);
  assert(result.outcome === "authorized");
  assertEquals(result.contingency, true);
});

Deno.test("rejeição da SEFAZ vem com HTTP 201 e não é autorização", async () => {
  const result = await new FocusNfeClient(fakeFetch(201, { status: "erro_autorizacao", status_sefaz: "704", mensagem_sefaz: "Rejeição" })).emit(credentials, input);
  assertEquals(result, { outcome: "rejected", errorCode: "704", errorMessage: "Rejeição" });
});

Deno.test("erros transitórios voltam para a fila", async () => {
  for (const [status, body] of [[500, "boom"], [429, {}], [422, { codigo: "pending_operation", mensagem: "em processamento" }]] as const) {
    const result = await new FocusNfeClient(fakeFetch(status, body)).emit(credentials, input);
    assertEquals(result.outcome, "transient");
  }
  const network = await new FocusNfeClient((() => Promise.reject(new Error("offline"))) as unknown as typeof fetch).emit(credentials, input);
  assertEquals(network.outcome, "transient");
});

Deno.test("erro de cadastro precisa de gente, inclusive 401 em texto puro", async () => {
  const validation = await new FocusNfeClient(fakeFetch(422, { codigo: "empresa_nao_configurada", mensagem: "x" })).emit(credentials, input);
  assertEquals(validation.outcome, "rejected");
  const denied = await new FocusNfeClient(fakeFetch(401, "HTTP Basic: Access denied")).emit(credentials, input);
  assertEquals(denied.outcome, "rejected");
});

Deno.test("referência já usada e consulta sem nota têm saídas próprias", async () => {
  const used = await new FocusNfeClient(fakeFetch(422, { codigo: "already_processed", mensagem: "x" })).emit(credentials, input);
  assertEquals(used.outcome, "already_processed");
  const missing = await new FocusNfeClient(fakeFetch(404, { codigo: "nao_encontrado" })).consult(credentials, "s-1");
  assertEquals(missing.outcome, "not_found");
});

Deno.test("status novo ou cancelado nunca vira nota autorizada", async () => {
  const result = await new FocusNfeClient(fakeFetch(200, { status: "cancelado" })).consult(credentials, "s-1");
  assertEquals(result.outcome, "rejected");
});

Deno.test("corpo usa os nomes da API atual, em reais só na borda", () => {
  const body = buildFocusNfce({
    ...input,
    items: [{ ...item, grossCents: 1999, quantity: 1, discountCents: 200, feeCents: 180 }],
    payments: [{ method: "pix", cents: 1000 }, { method: "credit_card", cents: 979 }],
  }) as { items: Record<string, unknown>[]; formas_pagamento: Record<string, unknown>[]; data_emissao: string };
  const line = body.items[0];
  assertEquals(line.codigo_ncm, "21069090");
  assertEquals(line.valor_bruto, 19.99);
  assertEquals(line.valor_desconto, 2);
  assertEquals(line.valor_outras_despesas, 1.8);
  assertEquals(body.formas_pagamento.map((p) => p.forma_pagamento), ["17", "03"]);
  assertEquals(body.formas_pagamento[1].tipo_integracao, "2");
  assertEquals(body.data_emissao, "2026-11-02T12:00:00-03:00");
});

Deno.test("item sem desconto nem taxa não leva esses campos", () => {
  const body = buildFocusNfce(input) as { items: Record<string, unknown>[] };
  assertEquals("valor_desconto" in body.items[0], false);
  assertEquals("valor_outras_despesas" in body.items[0], false);
  assertEquals(body.items[0].valor_unitario_comercial, 33.3333333333);
});

Deno.test("forma de pagamento desconhecida não vira código fiscal", () => {
  assertThrows(() => buildFocusNfce({ ...input, payments: [{ method: "cheque_moeda", cents: 1 }] }));
});

Deno.test("horário de emissão usa o fuso de São Paulo", () => {
  assertEquals(focusIssuedAt(new Date("2026-01-01T02:30:00Z")), "2025-12-31T23:30:00-03:00");
});

Deno.test("vale declara o tipo certo, e aproximação tem código", () => {
  const body = buildFocusNfce({
    ...input,
    payments: [{ method: "voucher_refeicao", cents: 100 }, { method: "voucher_alimentacao", cents: 100 }, { method: "tap_card", cents: 9800 }],
  }) as { formas_pagamento: Record<string, unknown>[] };
  assertEquals(body.formas_pagamento.map((p) => p.forma_pagamento), ["11", "10", "03"]);
});

Deno.test("CPF na nota: com CPF ou CNPJ vai o destinatário; sem ele, consumidor não identificado", () => {
  const withCpf = buildFocusNfce({ ...input, consumerDocument: "529.982.247-25" }) as Record<string, unknown>;
  assertEquals(withCpf.cpf_destinatario, "52998224725");
  assertEquals("cnpj_destinatario" in withCpf, false);
  const withCnpj = buildFocusNfce({ ...input, consumerDocument: "11222333000181" }) as Record<string, unknown>;
  assertEquals(withCnpj.cnpj_destinatario, "11222333000181");
  for (const none of [null, undefined, "", "123"]) {
    const body = buildFocusNfce({ ...input, consumerDocument: none }) as Record<string, unknown>;
    assertEquals("cpf_destinatario" in body || "cnpj_destinatario" in body, false);
    assertEquals(body.indicador_inscricao_estadual_destinatario, "9");
  }
});
