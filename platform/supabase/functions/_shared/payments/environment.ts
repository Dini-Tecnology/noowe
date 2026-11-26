// O ambiente do Asaas (sandbox ou produção) é definido pela própria chave da subconta:
// chaves de sandbox têm `_hmlg_`, as de produção `_prod_`. Assim cada restaurante usa a URL
// do seu ambiente e promover alguém a produção não exige trocar nenhum segredo.
// Chave irreconhecível falha fechada: nunca adivinhamos entre cobrar de verdade ou de teste.
export type AsaasEnvironment = "sandbox" | "production";

export function asaasKeyEnvironment(apiKey: string): AsaasEnvironment | null {
  return apiKey.includes("_hmlg_") ? "sandbox" : apiKey.includes("_prod_") ? "production" : null;
}

export function asaasBaseUrlForKey(apiKey: string, env: (name: string) => string | undefined): string {
  const environment = asaasKeyEnvironment(apiKey)?.toUpperCase();
  if (!environment) throw new Error("Chave do Asaas sem ambiente reconhecível (esperado _hmlg_ ou _prod_)");
  const name = `ASAAS_${environment}_API_BASE_URL`;
  const url = env(name)?.trim();
  if (!url || !/^https:\/\//.test(url)) throw new Error(`${name} não configurado (esperado uma URL https)`);
  return url.replace(/\/+$/, "");
}

// RV-18: a chave só cobra no ambiente que a subconta espera (restaurant_payment_accounts.environment).
// Sem ambiente esperado conhecido, também recusa: restaurante real nunca cobra com chave de teste, nem o contrário.
export function environmentMatches(apiKey: string, expected: unknown): boolean {
  const actual = asaasKeyEnvironment(apiKey);
  return actual !== null && actual === expected;
}

// RV-01: o provedor do Pix é parâmetro NOOWE (noowe_billing_settings.pix_provider). Só o Asaas existe.
export const SUPPORTED_PIX_PROVIDERS = ["asaas"] as const;
export function pixProviderSupported(name: unknown): boolean {
  return (SUPPORTED_PIX_PROVIDERS as readonly unknown[]).includes(name);
}
