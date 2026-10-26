import { AsaasError } from "../_shared/payments/asaas.ts";
import { bearer, json, mapRpcError, saoPauloDate, type PaymentDeps } from "../_shared/payments/deps.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DOCUMENT = /^(\d{11}|\d{14})$/;

// Cria (ou retoma) a cobrança de um pedido no Asaas. A confirmação NUNCA sai daqui:
// o status final só chega pelo webhook (invariante 6).
export async function handleCreate(req: Request, deps: PaymentDeps): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const user = await deps.getUser(bearer(req));
  if (!user) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => null);
  const purpose = body?.purpose;
  const method = body?.method;
  if ((purpose !== "order" && purpose !== "bill_share") || !UUID.test(body?.targetId ?? "") || !UUID.test(body?.idempotencyKey ?? "")
    || (method !== "pix" && method !== "credit_card")) {
    return json({ error: "invalid_request" }, 400);
  }
  // Cartão (F6): "salvar este cartão" (consentimento) ou "usar um cartão salvo", nunca os dois.
  const saveCard = body?.saveCard === true;
  const paymentMethodId: string | null = body?.paymentMethodId == null ? null : String(body.paymentMethodId);
  if ((saveCard || paymentMethodId !== null) && method !== "credit_card") return json({ error: "invalid_request" }, 400);
  if (paymentMethodId !== null && (!UUID.test(paymentMethodId) || saveCard)) return json({ error: "invalid_request" }, 400);
  const remoteIp = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "";
  if (paymentMethodId !== null && !remoteIp) return json({ error: "invalid_request" }, 400);
  const document = typeof body?.payerCpfCnpj === "string" ? body.payerCpfCnpj.replace(/\D/g, "") : "";

  // A gorjeta da parcela é em centavos e o servidor valida o teto; o valor da parcela nunca vem do app.
  const tip = body?.tipCents == null ? null : Number(body.tipCents);
  if (tip !== null && (!Number.isSafeInteger(tip) || tip < 0)) return json({ error: "invalid_request" }, 400);
  const reserved = purpose === "bill_share"
    ? await deps.rpc("service_pay_share", {
      p_user_id: user.id, p_share_id: body.targetId, p_method: method, p_tip_cents: tip, p_idempotency_key: body.idempotencyKey,
    })
    : await deps.rpc("service_payment_reserve_order", {
      p_user_id: user.id, p_order_id: body.targetId, p_payment_method: method, p_idempotency_key: body.idempotencyKey,
    });
  if (reserved.error) {
    const mapped = mapRpcError(reserved.error.code);
    if (mapped.status === 500) console.error("payments-create reserve error:", reserved.error);
    return json({ error: mapped.error }, mapped.status);
  }
  const r = reserved.data;
  if (r.alreadyPaid) return json({ status: "confirmed", orderId: r.orderId, alreadyPaid: true });
  const view = (extra: Record<string, unknown> = {}) => json({
    paymentId: r.paymentId, status: r.status, method: r.method, amountCents: r.amountCents,
    expiresAt: r.expiresAt, checkoutUrl: r.checkoutUrl ?? null,
    pix: r.pixPayload ? { payload: r.pixPayload, expiresAt: r.expiresAt } : null, ...extra,
  });
  if (r.providerRef) return view({ idempotentReplay: true });

  if (method === "credit_card") {
    const options = await deps.rpc("service_payment_set_card_options", {
      p_payment_id: r.paymentId, p_user_id: user.id, p_save_card: saveCard, p_payment_method_id: paymentMethodId,
    });
    if (options.error) {
      if (options.error.code === "P0002") return json({ error: "card_not_found" }, 404);
      console.error("payments-create card options error:", options.error);
      return json({ error: "internal_error" }, 500);
    }
  }

  const secrets = await deps.rpc("service_payment_account_secrets", { p_account_id: r.paymentAccountId });
  const apiKey: string | undefined = secrets.data?.apiKey;
  if (secrets.error || !apiKey) {
    console.error("payments-create secrets error:", secrets.error);
    return json({ error: "payments_unavailable" }, 409);
  }

  try {
    const customerRow = await deps.rpc("service_payment_customer", { p_account_id: r.paymentAccountId, p_user_id: user.id });
    let customerId: string | undefined = customerRow.data?.providerCustomerId;
    if (!customerId) {
      if (!DOCUMENT.test(document)) return json({ error: "payer_document_required" }, 422);
      const created = await deps.provider.createCustomer(apiKey, {
        name: customerRow.data?.name ?? "Cliente NOOWE", cpfCnpj: document,
        email: customerRow.data?.email, mobilePhone: customerRow.data?.phone, externalReference: user.id,
      });
      customerId = created.id;
      await deps.rpc("service_payment_save_customer", {
        p_account_id: r.paymentAccountId, p_user_id: user.id, p_provider_customer_id: customerId,
      });
    }

    // Cartão salvo: o token só existe no servidor e só vale para o mesmo usuário e a mesma subconta.
    let creditCardToken: string | null = null;
    if (paymentMethodId !== null) {
      const stored = await deps.rpc("service_payment_card_token", {
        p_user_id: user.id, p_payment_method_id: paymentMethodId, p_account_id: r.paymentAccountId,
      });
      creditCardToken = typeof stored.data === "string" && stored.data ? stored.data : null;
      if (!creditCardToken) return json({ error: "card_not_found" }, 404);
    }

    // Se uma tentativa anterior caiu depois do Asaas responder, a cobrança já existe.
    let charge = await deps.provider.findChargeByExternalRef(apiKey, r.paymentId);
    if (!charge) {
      const returnUrl = deps.env("PAYMENT_RETURN_URL");
      charge = await deps.provider.createCharge(apiKey, {
        customer: customerId, billingType: method === "pix" ? "PIX" : "CREDIT_CARD",
        valueCents: r.amountCents, dueDate: saoPauloDate(deps.now?.() ?? new Date()),
        externalReference: r.paymentId, description: purpose === "bill_share" ? "Conta da mesa NOOWE" : "Pedido NOOWE",
        split: deps.env("NOOWE_ASAAS_WALLET_ID") && r.platformFeeCents > 0
          ? { walletId: deps.env("NOOWE_ASAAS_WALLET_ID")!, feeCents: r.platformFeeCents } : null,
        successUrl: returnUrl ? `${returnUrl}?pid=${r.paymentId}` : null,
        creditCardToken, remoteIp: creditCardToken ? remoteIp : null,
      });
    }

    let pixPayload: string | null = null;
    let pixExpires: string | null = r.expiresAt;
    if (method === "pix") {
      const pix = await deps.provider.getPixQrCode(apiKey, charge.id);
      pixPayload = pix.payload;
      pixExpires = r.expiresAt ?? pix.expirationDate ?? null;
    }
    const attached = await deps.rpc("service_payment_attach_provider", {
      p_payment_id: r.paymentId, p_provider_ref: charge.id, p_checkout_url: charge.invoiceUrl ?? null,
      p_pix_payload: pixPayload, p_expires_at: pixExpires,
    });
    if (attached.error) throw new Error(`attach: ${attached.error.message}`);
    return json({
      paymentId: r.paymentId, status: "pending", method, amountCents: r.amountCents, expiresAt: pixExpires,
      checkoutUrl: creditCardToken ? null : charge.invoiceUrl ?? null,
      pix: pixPayload ? { payload: pixPayload, expiresAt: pixExpires } : null,
      ...(creditCardToken ? { savedCard: true } : {}),
    });
  } catch (err) {
    console.error("payments-create provider error:", err instanceof AsaasError ? { status: err.status, body: err.body } : err);
    await deps.rpc("service_payment_mark_failed", { p_payment_id: r.paymentId, p_error: (err as Error).message });
    // A cobrança segue `creating`: repetir com a mesma chave retoma de onde parou.
    return json({ error: "provider_unavailable", retryable: true, paymentId: r.paymentId }, 502);
  }
}
