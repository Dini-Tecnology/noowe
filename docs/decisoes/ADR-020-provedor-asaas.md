# ADR-020 — Asaas como provedor de pagamento

**Status:** PROVISÓRIO — decisões de produto tomadas em 22/10/2026; itens do spike ainda não confirmados
**Origem:** fatias N4 (pagamento) e G3 (divisão de conta)
**Impacta:** N4, G3, Q1, S1

## Decisão

- **PSP:** Asaas (API v3). PIX e cartão no app do cliente.
- **Recebimento:** direto ao restaurante. Cada restaurante tem uma subconta Asaas; a comissão da NOOWE
  é cobrada por `split[{walletId, fixedValue}]` em cada cobrança. A comissão
  (`platform_fee_bps`) é parâmetro do banco, não constante de código.
- **Cartão:** digitado na página hospedada do Asaas (`invoiceUrl`), aberta com `expo-web-browser`.
  Nenhum dado de cartão passa pelo app nem pelo backend (fora do escopo PCI). Sem cartão salvo.
- **Apple Pay / Google Pay:** o Asaas não oferece no checkout online; só no Asaas Tap (NFC no celular
  do garçom). Entra na fase P6, atrás do adapter `PaymentProvider`.
- **Confirmação:** somente por webhook (invariante 6). O retorno do navegador não confirma nada.
- **Segredos:** `apiKey` da subconta no Supabase Vault; do token de webhook guarda-se só o `sha256`.

## Spike a confirmar no sandbox (nada abaixo está verificado)

1. `POST /v3/accounts` com `webhooks[]` e `authToken` (cabeçalho `asaas-access-token`); fluxo de KYC e `onboardingUrl`.
2. Split com `walletId`: quem paga a tarifa do Asaas; `fixedValue` ≤ valor líquido?
3. Valor mínimo de cobrança por método (afeta parcelas pequenas na divisão igual).
4. Validade do QR PIX (`dueDate` × minutos) e comportamento de `DELETE /v3/payments/{id}` + webhook tardio.
5. `callback.successUrl` exige domínio cadastrado na subconta? A página hospedada oferece carteiras?
6. **Asaas Tap:** como amarrar a transação ao nosso `externalReference` e se ela chega por webhook.
7. Existe cabeçalho de idempotência? Se não, recuperar por `GET /v3/payments?externalReference=`.
8. A `apiKey` da subconta só é devolvida na criação? Existe rotação?
9. CPF/CNPJ do pagador é obrigatório para criar o customer? (decisão LGPD associada)

## Consequências

- `gateway_transactions` continua sendo o livro-razão (equivale ao `payments` da spec).
- Pagamento tardio nunca levanta erro no webhook: vira `completed` + estorno enfileirado.
- Estorno automático de pagamento tardio conflita com N4 #5 (aprovação registrada): decisão humana pendente.
