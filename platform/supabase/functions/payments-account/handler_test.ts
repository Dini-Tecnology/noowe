import { test } from "node:test";
import assert from "node:assert/strict";
import { handleAccount } from "./handler.ts";
import { AsaasError } from "../_shared/payments/asaas.ts";
import { sha256Hex } from "../_shared/payments/crypto.ts";
import { pendingOnboardingUrl } from "../_shared/payments/account-status.ts";
import type { PaymentDeps } from "../_shared/payments/deps.ts";

const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const RESTAURANT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ACCT = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const API_KEY = "$aact_hmlg_subconta_secreta";

const form = {
  name: "Bistrô Teste", email: "dono@bistro.test", cnpj: "11.222.333/0001-81", companyType: "LIMITED",
  mobilePhone: "(11) 98765-0000", incomeCents: 5_000_000, address: "Av. Paulista", addressNumber: "1000",
  province: "Bela Vista", postalCode: "01310-100",
};

function setup(over: {
  begun?: any; beginError?: any; existing?: any; createError?: any; attachErrors?: number; current?: any; general?: string;
  statusThrows?: boolean; env?: Record<string, string | undefined>;
} = {}) {
  const calls: { fn: string; args: any }[] = [];
  const created: any[] = [];
  let attachErrors = over.attachErrors ?? 0;
  const deps: PaymentDeps = {
    rpc: async (fn, args) => {
      calls.push({ fn, args });
      if (fn === "service_payment_account_begin") {
        if (over.beginError) return { data: null, error: over.beginError };
        return { data: over.begun ?? { accountId: ACCT, status: "creating", providerAccountId: null, alreadyCreated: false }, error: null };
      }
      if (fn === "service_payment_account_attach") {
        if (attachErrors-- > 0) return { data: null, error: { code: "XX000", message: "vault" } };
        return { data: { accountId: ACCT, status: "pending_kyc", providerAccountId: "acc_1", onboardingUrl: null }, error: null };
      }
      if (fn === "service_payment_account_for_user") return { data: over.current ?? null, error: over.current === "denied" ? { code: "42501", message: "x" } : null };
      if (fn === "service_payment_account_secrets") return { data: { apiKey: API_KEY }, error: null };
      if (fn === "service_payment_account_apply_status") {
        return { data: { accountId: ACCT, status: args.p_general === "APPROVED" ? "active" : "pending_kyc", providerAccountId: "acc_1", onboardingUrl: args.p_onboarding_url }, error: null };
      }
      return { data: null, error: null };
    },
    getUser: async (t) => (t === "tok" ? { id: USER } : null),
    provider: {
      findAccountByDocument: async () => over.existing ?? null,
      createAccount: async (key: string, input: any) => {
        created.push({ key, input });
        if (over.createError) throw over.createError;
        return { id: "acc_1", walletId: "wallet_1", apiKey: API_KEY };
      },
      getAccountStatus: async () => {
        if (over.statusThrows) throw new AsaasError(0, null, "rede");
        return { general: over.general ?? "PENDING" };
      },
      listAccountDocuments: async () => [{ id: "d1", status: "NOT_SENT", onboardingUrl: "https://asaas.test/onboarding/1" }],
    } as any,
    env: (name) => ({
      ASAAS_ROOT_API_KEY: "$aact_hmlg_raiz", SUPABASE_URL: "https://proj.supabase.co/", NOOWE_WEBHOOK_ALERT_EMAIL: "ops@noowe.test", ...over.env,
    } as Record<string, string | undefined>)[name],
  };
  return { deps, calls, created };
}

function req(body: any, token = "tok", method = "POST") {
  return new Request("https://f/payments-account", {
    method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });
}
const startBody = { action: "start", restaurantId: RESTAURANT, account: form };

test("método, JWT, restaurante e ação inválidos são recusados", async () => {
  const { deps, created } = setup();
  assert.equal((await handleAccount(req(startBody, "tok", "GET"), deps)).status, 405);
  assert.equal((await handleAccount(req(startBody, "ruim"), deps)).status, 401);
  assert.equal((await handleAccount(req({ ...startBody, restaurantId: "x" }), deps)).status, 400);
  assert.equal((await handleAccount(req({ action: "apagar", restaurantId: RESTAURANT }), deps)).status, 400);
  assert.equal(created.length, 0);
});

test("formulário inválido aponta os campos e nem chega ao banco", async () => {
  const { deps, calls } = setup();
  const res = await handleAccount(req({ ...startBody, account: { ...form, cnpj: "123", email: "sem-arroba", incomeCents: 10.5 } }), deps);
  assert.equal(res.status, 400);
  assert.deepEqual((await res.json()).fields, ["email", "cnpj", "incomeCents"]);
  assert.equal(calls.length, 0);
});

test("quem não é dono recebe 403 e o Asaas não é chamado", async () => {
  const { deps, created } = setup({ beginError: { code: "42501", message: "Só o dono" } });
  assert.equal((await handleAccount(req(startBody), deps)).status, 403);
  assert.equal(created.length, 0);
});

test("ambiente sem chave raiz: 503 antes de reservar a conta", async () => {
  const { deps, calls } = setup({ env: { ASAAS_ROOT_API_KEY: undefined } });
  assert.equal((await handleAccount(req(startBody), deps)).status, 503);
  assert.equal(calls.length, 0);
});

test("cadastro: do token só o sha256 vai ao banco, a chave vai para o attach e não volta ao app", async () => {
  const { deps, calls, created } = setup();
  const res = await handleAccount(req(startBody), deps);
  const raw = await res.text();
  assert.equal(res.status, 200);

  const authToken: string = created[0].input.webhook.authToken;
  assert.ok(authToken.length >= 32, "o Asaas exige ao menos 32 caracteres");
  const begin = calls.find((c) => c.fn === "service_payment_account_begin")!;
  assert.equal(begin.args.p_webhook_token_hash, await sha256Hex(authToken));
  assert.ok(!JSON.stringify(calls).includes(authToken), "o token puro não vai a nenhuma RPC");

  const attach = calls.find((c) => c.fn === "service_payment_account_attach")!;
  assert.equal(attach.args.p_api_key, API_KEY);
  assert.equal(attach.args.p_wallet_id, "wallet_1");
  assert.equal(attach.args.p_webhook_token_hash, await sha256Hex(authToken), "fica o hash do token que o Asaas recebeu");

  assert.ok(!raw.includes(API_KEY) && !raw.includes(authToken) && !raw.includes("wallet_1"));
  const body = JSON.parse(raw);
  assert.equal(body.status, "pending_kyc");
  assert.equal(body.onboardingUrl, "https://asaas.test/onboarding/1");
});

test("o POST usa a chave raiz, o webhook da conta e os dados normalizados", async () => {
  const { deps, created } = setup();
  await handleAccount(req(startBody), deps);
  const { key, input } = created[0];
  assert.equal(key, "$aact_hmlg_raiz");
  assert.equal(input.cpfCnpj, "11222333000181");
  assert.equal(input.mobilePhone, "11987650000");
  assert.equal(input.postalCode, "01310100");
  assert.equal(input.incomeCents, 5_000_000);
  assert.equal(input.webhook.url, `https://proj.supabase.co/functions/v1/payments-webhook-asaas?acct=${ACCT}`);
  assert.equal(input.webhook.email, "ops@noowe.test");
  assert.ok(input.webhook.events.includes("ACCOUNT_STATUS_GENERAL_APPROVAL_APPROVED"));
  assert.ok(input.webhook.events.includes("PAYMENT_RECEIVED"));
});

test("repetir o cadastro já criado não chama o POST de novo", async () => {
  const { deps, created } = setup({ begun: { accountId: ACCT, status: "pending_kyc", providerAccountId: "acc_1", alreadyCreated: true } });
  const res = await handleAccount(req(startBody), deps);
  assert.equal(res.status, 200);
  assert.equal(created.length, 0);
});

test("CNPJ que já tem subconta não gera outra: 409", async () => {
  const { deps, created } = setup({ existing: { id: "acc_antiga" } });
  const res = await handleAccount(req(startBody), deps);
  assert.equal(res.status, 409);
  assert.equal((await res.json()).error, "provider_account_exists");
  assert.equal(created.length, 0);
});

test("recusa do Asaas (400) devolve a mensagem; falha de rede pede nova tentativa", async () => {
  const rejected = setup({ createError: new AsaasError(400, { errors: [{ description: "CEP inválido." }] }, "400") });
  const res = await handleAccount(req(startBody), rejected.deps);
  assert.equal(res.status, 422);
  assert.equal((await res.json()).message, "CEP inválido.");

  const down = setup({ createError: new AsaasError(0, null, "rede") });
  const res2 = await handleAccount(req(startBody), down.deps);
  assert.equal(res2.status, 502);
  assert.equal((await res2.json()).retryable, true);
  assert.ok(!down.calls.some((c) => c.fn === "service_payment_account_attach"));
});

test("attach insiste antes de desistir, porque a chave não volta", async () => {
  const flaky = setup({ attachErrors: 2 });
  assert.equal((await handleAccount(req(startBody), flaky.deps)).status, 200);
  assert.equal(flaky.calls.filter((c) => c.fn === "service_payment_account_attach").length, 3);

  const dead = setup({ attachErrors: 10 });
  const res = await handleAccount(req(startBody), dead.deps);
  assert.equal(res.status, 500);
  assert.equal((await res.json()).error, "account_attach_failed");
});

test("status: sem conta, com permissão negada, e reconsulta aplicada", async () => {
  const none = setup();
  assert.equal((await (await handleAccount(req({ action: "status", restaurantId: RESTAURANT }), none.deps)).json()).status, "none");

  const denied = setup({ current: "denied" });
  assert.equal((await handleAccount(req({ action: "status", restaurantId: RESTAURANT }), denied.deps)).status, 403);

  const current = { accountId: ACCT, status: "pending_kyc", providerAccountId: "acc_1", onboardingUrl: null };
  const approved = setup({ current, general: "APPROVED" });
  const body = await (await handleAccount(req({ action: "status", restaurantId: RESTAURANT }), approved.deps)).json();
  assert.equal(body.status, "active");
  const apply = approved.calls.find((c) => c.fn === "service_payment_account_apply_status")!;
  assert.equal(apply.args.p_general, "APPROVED");
  assert.equal(apply.args.p_actor_id, USER);
});

test("status: Asaas fora do ar mantém a situação do banco e avisa", async () => {
  const current = { accountId: ACCT, status: "pending_kyc", providerAccountId: "acc_1", onboardingUrl: "https://a/1" };
  const { deps, calls } = setup({ current, statusThrows: true });
  const body = await (await handleAccount(req({ action: "status", restaurantId: RESTAURANT }), deps)).json();
  assert.equal(body.status, "pending_kyc");
  assert.equal(body.stale, true);
  assert.ok(!calls.some((c) => c.fn === "service_payment_account_apply_status"));
});

test("link de onboarding: só de documento pendente e só https", () => {
  assert.equal(pendingOnboardingUrl([{ id: "1", status: "APPROVED", onboardingUrl: "https://a/1" }]), null);
  assert.equal(pendingOnboardingUrl([{ id: "1", status: "NOT_SENT", onboardingUrl: "javascript:alert(1)" }]), null);
  assert.equal(pendingOnboardingUrl([{ id: "1", status: "NOT_SENT", onboardingUrl: null }, { id: "2", status: "NOT_SENT", onboardingUrl: "https://a/2" }]), "https://a/2");
});
