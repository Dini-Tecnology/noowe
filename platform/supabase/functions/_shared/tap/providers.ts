import type { TapProvider } from "./types.ts";

// Nenhum fornecedor contratado ainda (resposta 11). Quando houver, entra aqui, com as credenciais em segredo.
const PROVIDERS: Record<string, (env: (name: string) => string | undefined) => TapProvider> = {};

export function tapProviderFor(name: string | null | undefined, env: (name: string) => string | undefined): TapProvider | null {
  const factory = name ? PROVIDERS[name] : undefined;
  return factory ? factory(env) : null;
}
