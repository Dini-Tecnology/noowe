import { AsaasError, asaasMessage } from "../_shared/payments/asaas.ts";
import { bearer, json, type PaymentDeps } from "../_shared/payments/deps.ts";
import { onlyDigits, validTaxDocument } from "../_shared/payments/document.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Carteira de cartões do cliente (QA PAG-02). O número e o CVV vão direto ao Asaas e nunca são gravados nem logados:
// guardamos só token, bandeira, final e validade. O token é da subconta do restaurante (restaurantId), igual ao F6.
export async function handleCards(req: Request, deps: PaymentDeps): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const user = await deps.getUser(bearer(req));
  if (!user) return json({ error: "unauthorized" }, 401);
  const body = await req.json().catch(() => null);
  const action = body?.action;

  if (action === "remove" || action === "set_default") {
    if (!UUID.test(body?.cardId ?? "")) return json({ error: "invalid_request" }, 400);
    const done = await deps.rpc(action === "remove" ? "service_payment_remove_card" : "service_payment_set_default_card",
      { p_user_id: user.id, p_card_id: body.cardId });
    if (done.error?.code === "P0002") return json({ error: "card_not_found" }, 404);
    if (done.error) { console.error("payments-cards", action, "error:", done.error.message); return json({ error: "internal_error" }, 500); }
    return json({ ok: true });
  }
  if (action !== "add" || !UUID.test(body?.restaurantId ?? "")) return json({ error: "invalid_request" }, 400);

  const card = validCard(body.card, deps.now?.() ?? new Date());
  if (!card) return json({ error: "card_invalid", message: "Confira os dados do cartão." }, 422);
  const holder = validHolder(body.holder);
  if (!holder) return json({ error: "holder_invalid", message: "Confira CPF, CEP, número do endereço e telefone do titular." }, 422);
  const remoteIp = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "";
  if (!remoteIp) return json({ error: "invalid_request" }, 400);

  const account = await deps.rpc("service_payment_card_account", { p_restaurant_id: body.restaurantId });
  const accountId: string | null = typeof account.data === "string" ? account.data : null;
  if (account.error || !accountId) return json({ error: "payments_unavailable" }, 409);
  const secrets = await deps.rpc("service_payment_account_secrets", { p_account_id: accountId });
  const apiKey: string | undefined = secrets.data?.apiKey;
  if (secrets.error || !apiKey) return json({ error: "payments_unavailable" }, 409);

  let token;
  try {
    const customerRow = await deps.rpc("service_payment_customer", { p_account_id: accountId, p_user_id: user.id });
    let customerId: string | undefined = customerRow.data?.providerCustomerId;
    const email = customerRow.data?.email ?? "";
    if (!customerId) {
      customerId = (await deps.provider.createCustomer(apiKey, {
        name: customerRow.data?.name ?? card.holderName, cpfCnpj: holder.cpf, email, mobilePhone: holder.phone, externalReference: user.id,
      })).id;
      await deps.rpc("service_payment_save_customer", { p_account_id: accountId, p_user_id: user.id, p_provider_customer_id: customerId });
    }
    token = await deps.provider.tokenizeCard(apiKey, {
      customer: customerId, remoteIp,
      creditCard: { holderName: card.holderName, number: card.number, expiryMonth: String(card.month).padStart(2, "0"), expiryYear: String(card.year), ccv: card.ccv },
      holderInfo: { name: card.holderName, email, cpfCnpj: holder.cpf, postalCode: holder.postalCode, addressNumber: holder.addressNumber, phone: holder.phone },
    });
  } catch (err) {
    // Só o status: o corpo da requisição tem o número do cartão.
    console.error("payments-cards tokenize error:", err instanceof AsaasError ? { status: err.status } : (err as Error).name);
    if (err instanceof AsaasError && err.status === 400) {
      return json({ error: "card_invalid", message: asaasMessage(err) ?? "O cartão não foi aceito. Confira os dados ou use outro cartão." }, 422);
    }
    return json({ error: "provider_unavailable", retryable: true }, 502);
  }

  const last4 = onlyDigits(token?.creditCardNumber).slice(-4) || card.number.slice(-4);
  const saved = await deps.rpc("service_payment_add_card", {
    p_user_id: user.id, p_account_id: accountId, p_token: token?.creditCardToken ?? null, p_brand: token?.creditCardBrand ?? null,
    p_last4: last4, p_exp_month: card.month, p_exp_year: card.year,
  });
  if (saved.error) { console.error("payments-cards save error:", saved.error.code); return json({ error: "internal_error" }, 500); }
  return json({ card: saved.data });
}

function luhn(n: string): boolean {
  let sum = 0;
  for (let i = 0; i < n.length; i++) {
    let d = Number(n[n.length - 1 - i]);
    if (i % 2) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

function validCard(c: any, now: Date) {
  const number = onlyDigits(c?.number);
  const ccv = onlyDigits(c?.ccv);
  const holderName = typeof c?.holderName === "string" ? c.holderName.trim().slice(0, 100) : "";
  const month = Number(c?.expiryMonth);
  let year = Number(c?.expiryYear);
  if (year < 100) year += 2000;
  if (!holderName || number.length < 13 || number.length > 19 || !luhn(number) || !/^\d{3,4}$/.test(ccv)) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year)) return null;
  if (year * 12 + month < now.getUTCFullYear() * 12 + now.getUTCMonth() + 1) return null;
  return { number, ccv, holderName, month, year };
}

function validHolder(h: any) {
  const cpf = onlyDigits(h?.cpf);
  const postalCode = onlyDigits(h?.postalCode);
  const addressNumber = typeof h?.addressNumber === "string" ? h.addressNumber.trim().slice(0, 20) : String(h?.addressNumber ?? "").trim();
  const phone = onlyDigits(h?.phone);
  if (!validTaxDocument(cpf) || postalCode.length !== 8 || !addressNumber || phone.length < 10 || phone.length > 11) return null;
  return { cpf, postalCode, addressNumber, phone };
}
