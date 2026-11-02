import { AsaasError } from "../_shared/payments/asaas.ts";
import { syncAccountStatus } from "../_shared/payments/account-status.ts";
import { sha256Hex } from "../_shared/payments/crypto.ts";
import { bearer, json, mapRpcError, type PaymentDeps, type RpcResult } from "../_shared/payments/deps.ts";
import { ACCOUNT_WEBHOOK_EVENTS } from "../_shared/payments/events.ts";
import type { AsaasAccount, AsaasCompanyType } from "../_shared/payments/types.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COMPANY_TYPES: AsaasCompanyType[] = ["MEI", "LIMITED", "INDIVIDUAL", "ASSOCIATION"];
const ATTACH_ATTEMPTS = 3;

function digits(value: unknown): string {
  return typeof value === "string" ? value.replace(/\D/g, "") : "";
}
function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseAccount(raw: any) {
  const account = {
    name: text(raw?.name), email: text(raw?.email), cpfCnpj: digits(raw?.cnpj), companyType: raw?.companyType as AsaasCompanyType,
    mobilePhone: digits(raw?.mobilePhone), incomeCents: Number(raw?.incomeCents),
    address: text(raw?.address), addressNumber: text(raw?.addressNumber), province: text(raw?.province), postalCode: digits(raw?.postalCode),
  };
  const invalid = [
    !account.name && "name", !EMAIL.test(account.email) && "email", account.cpfCnpj.length !== 14 && "cnpj",
    !COMPANY_TYPES.includes(account.companyType) && "companyType",
    (account.mobilePhone.length < 10 || account.mobilePhone.length > 11) && "mobilePhone",
    (!Number.isSafeInteger(account.incomeCents) || account.incomeCents <= 0) && "incomeCents",
    !account.address && "address", !account.addressNumber && "addressNumber", !account.province && "province",
    account.postalCode.length !== 8 && "postalCode",
  ].filter(Boolean) as string[];
  return { account, invalid };
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// O que o app vê. Nunca inclui apiKey, carteira nem token.
function view(account: any, extra: Record<string, unknown> = {}): Response {
  return json({ accountId: account.accountId, status: account.status, onboardingUrl: account.onboardingUrl ?? null, ...extra });
}

function rpcFailure(label: string, error: NonNullable<RpcResult["error"]>): Response {
  const mapped = mapRpcError(error.code);
  if (mapped.status === 500) console.error(`payments-account ${label} error:`, error);
  return json({ error: mapped.error }, mapped.status);
}

// Tenta atualizar pela consulta ao Asaas; sem resposta, devolve o que o banco sabe.
async function withFreshStatus(deps: PaymentDeps, account: any, actorId: string): Promise<Response> {
  if (!account.providerAccountId) return view(account);
  const secrets = await deps.rpc("service_payment_account_secrets", { p_account_id: account.accountId });
  const apiKey: string | undefined = secrets.data?.apiKey;
  if (secrets.error || !apiKey) {
    console.error("payments-account secrets error:", secrets.error);
    return view(account, { stale: true });
  }
  try {
    const synced = await syncAccountStatus(deps, account.accountId, apiKey, actorId);
    if (synced.error) throw new Error(synced.error.message);
    return view(synced.data);
  } catch (err) {
    console.error("payments-account status error:", err instanceof AsaasError ? { status: err.status } : (err as Error).message);
    return view(account, { stale: true });
  }
}

async function start(body: any, userId: string, deps: PaymentDeps): Promise<Response> {
  const { account, invalid } = parseAccount(body?.account);
  if (invalid.length) return json({ error: "invalid_request", fields: invalid }, 400);

  const rootKey = deps.env("ASAAS_ROOT_API_KEY");
  const supabaseUrl = deps.env("SUPABASE_URL");
  const alertEmail = deps.env("NOOWE_WEBHOOK_ALERT_EMAIL");
  if (!rootKey || !supabaseUrl || !alertEmail) {
    console.error("payments-account: ASAAS_ROOT_API_KEY, SUPABASE_URL ou NOOWE_WEBHOOK_ALERT_EMAIL ausente");
    return json({ error: "payments_not_configured" }, 503);
  }

  // Do token fica só o hash, gravado antes de o Asaas conhecer o token: o primeiro evento
  // pode chegar enquanto o POST ainda não terminou.
  const authToken = randomToken();
  const tokenHash = await sha256Hex(authToken);
  const begun = await deps.rpc("service_payment_account_begin", {
    p_user_id: userId, p_restaurant_id: body.restaurantId, p_webhook_token_hash: tokenHash,
  });
  if (begun.error) return rpcFailure("begin", begun.error);
  if (begun.data.error) return json({ error: begun.data.error }, 503);
  if (begun.data.alreadyCreated) return withFreshStatus(deps, begun.data, userId);
  const accountId: string = begun.data.accountId;

  let created: AsaasAccount;
  try {
    // O Asaas aceita duas subcontas com o mesmo CNPJ e a chave da primeira não volta nunca
    // mais. Se já existe, um POST novo só criaria uma conta órfã: isso vira atendimento.
    const existing = await deps.provider.findAccountByDocument(rootKey, account.cpfCnpj);
    if (existing) {
      console.error("payments-account: CNPJ já tem subconta", { accountId, providerAccountId: existing.id });
      return json({ error: "provider_account_exists" }, 409);
    }
    created = await deps.provider.createAccount(rootKey, {
      ...account,
      webhook: {
        url: `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/payments-webhook-asaas?acct=${accountId}`,
        email: alertEmail, authToken, events: ACCOUNT_WEBHOOK_EVENTS,
      },
    });
  } catch (err) {
    // A mensagem do Asaas pode trazer e-mail ou CNPJ: vai para o dono, não para o log.
    const status = err instanceof AsaasError ? err.status : 0;
    console.error("payments-account create error:", { accountId, status });
    if (status === 400) {
      const errors = (err as AsaasError).body as { errors?: { description?: string }[] } | null;
      const message = errors?.errors?.map((e) => e.description).filter(Boolean).join(" ") || null;
      return json({ error: "provider_rejected", message }, 422);
    }
    return json({ error: "provider_unavailable", retryable: true }, 502);
  }

  // A chave só existe nesta resposta: insiste antes de desistir, e nunca a registra em log.
  let attached: RpcResult = { data: null, error: { message: "not attempted" } };
  for (let attempt = 0; attempt < ATTACH_ATTEMPTS && attached.error; attempt++) {
    attached = await deps.rpc("service_payment_account_attach", {
      p_account_id: accountId, p_user_id: userId, p_provider_account_id: created.id,
      p_wallet_id: created.walletId, p_api_key: created.apiKey, p_webhook_token_hash: tokenHash,
    });
  }
  if (attached.error) {
    console.error("payments-account attach error:", { accountId, providerAccountId: created.id, code: attached.error.code });
    return json({ error: "account_attach_failed" }, 500);
  }
  return withFreshStatus(deps, attached.data, userId);
}

// Cadastro da conta de recebimento Asaas. A conta só vira `active` pelo status reconsultado no
// Asaas; a apiKey e o token do webhook nunca saem desta função.
export async function handleAccount(req: Request, deps: PaymentDeps): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const user = await deps.getUser(bearer(req));
  if (!user) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => null);
  if (!UUID.test(body?.restaurantId ?? "")) return json({ error: "invalid_request" }, 400);
  if (body.action === "start") return start(body, user.id, deps);
  if (body.action !== "status") return json({ error: "invalid_request" }, 400);

  const current = await deps.rpc("service_payment_account_for_user", { p_user_id: user.id, p_restaurant_id: body.restaurantId });
  if (current.error) return rpcFailure("read", current.error);
  if (!current.data) return json({ accountId: null, status: "none", onboardingUrl: null });
  return withFreshStatus(deps, current.data, user.id);
}
