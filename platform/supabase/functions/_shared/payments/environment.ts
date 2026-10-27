// O ambiente do Asaas (sandbox ou produção) é definido pela própria chave da subconta:
// chaves de sandbox têm `_hmlg_`, as de produção `_prod_`. Assim cada restaurante usa a URL
// do seu ambiente e promover alguém a produção não exige trocar nenhum segredo.
// Chave irreconhecível falha fechada: nunca adivinhamos entre cobrar de verdade ou de teste.
export function asaasBaseUrlForKey(apiKey: string, env: (name: string) => string | undefined): string {
  const environment = apiKey.includes("_hmlg_") ? "SANDBOX" : apiKey.includes("_prod_") ? "PRODUCTION" : null;
  if (!environment) throw new Error("Chave do Asaas sem ambiente reconhecível (esperado _hmlg_ ou _prod_)");
  const name = `ASAAS_${environment}_API_BASE_URL`;
  const url = env(name)?.trim();
  if (!url || !/^https:\/\//.test(url)) throw new Error(`${name} não configurado (esperado uma URL https)`);
  return url.replace(/\/+$/, "");
}
