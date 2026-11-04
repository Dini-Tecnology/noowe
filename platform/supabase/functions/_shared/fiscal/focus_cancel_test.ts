import { assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { FocusNfeClient } from "./focus.ts";

Deno.test("cancelamento: envia a justificativa e só vale com a resposta de cancelado", async () => {
  let sent: { url: string; init: RequestInit } | null = null;
  const client = new FocusNfeClient((async (url: string, init: RequestInit) => {
    sent = { url, init };
    return new Response(JSON.stringify({ status: "cancelado" }), { status: 200 });
  }) as unknown as typeof fetch);
  const result = await client.cancel({ token: "t", environment: "homologation" }, "s-1", "Estorno ao cliente: prato errado");
  assertEquals(result.outcome, "cancelled");
  assertEquals(sent!.init.method, "DELETE");
  assertMatch(sent!.url, /\/v2\/nfce\/s-1$/);
  assertEquals(JSON.parse(sent!.init.body as string), { justificativa: "Estorno ao cliente: prato errado" });
});

Deno.test("cancelamento: recusa da SEFAZ é definitiva; queda do serviço tenta de novo", async () => {
  const refused = new FocusNfeClient((async () => new Response(JSON.stringify({ status: "erro_cancelamento", mensagem_sefaz: "Prazo de cancelamento superior" }), { status: 200 })) as unknown as typeof fetch);
  const down = new FocusNfeClient((async () => new Response("erro", { status: 503 })) as unknown as typeof fetch);
  assertEquals(await refused.cancel({ token: "t", environment: "homologation" }, "s-1", "x"), { outcome: "rejected", errorMessage: "Prazo de cancelamento superior" });
  assertEquals((await down.cancel({ token: "t", environment: "homologation" }, "s-1", "x")).outcome, "transient");
});
