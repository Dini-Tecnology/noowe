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

### Confirmado no sandbox em 02/11/2026 (itens 1, 2 e 8)

**Item 1 — criação da subconta**
- `POST /v3/accounts` com a chave da conta raiz aceita `webhooks[]`, inclusive URL com query string. A resposta traz `id`, `walletId` e `apiKey`, e levou 5,6 s.
- `authToken` precisa de pelo menos 32 caracteres. O Asaas não o devolve: `GET /v3/webhooks` só informa `hasAuthToken`.
- E-mail repetido é recusado (400). **O mesmo CNPJ com outro e-mail cria uma segunda subconta**, então repetir o cadastro pode gerar conta órfã. Por isso `payments-account` consulta `GET /v3/accounts?cpfCnpj=` antes do POST.
- `GET /v3/myAccount/status` (`general`) e `GET /v3/myAccount/documents` (`onboardingUrl`) respondem com a chave da subconta.
- **O sandbox aprova tudo na hora:** `general` já vem `APPROVED` e `onboardingUrl` vem `null`. O caminho pendente com link segue sem observação real; ele foi coberto só por testes. Validar no primeiro cadastro de produção.
- A entrega do cabeçalho `asaas-access-token` não foi observada, porque o sandbox não alcança o ambiente local. Vale o que diz a documentação.

**Item 2 — split**
- A tarifa do Asaas sai da subconta que emite a cobrança, e a NOOWE recebe o `fixedValue` inteiro. Numa cobrança Pix de R$ 100,00 com split de R$ 5,00: tarifa de R$ 0,99, restaurante com R$ 94,01, NOOWE com R$ 5,00.
- `fixedValue` acima do valor líquido é recusado (400) já na criação da cobrança. Exemplo: Pix de R$ 5,00 tem líquido de R$ 4,01 no sandbox. As tarifas de produção precisam ser conferidas.

**Item 8 — apiKey**
- Só volta no POST. `GET /v3/accounts` e `GET /v3/accounts/{id}` trazem `apiKey: null`.
- `/v3/accounts/{id}/accessTokens` responde 400 sem whitelist de IPs configurada. A documentação diz que a gestão de chaves só existe em janela temporária e com whitelist, então **não contamos com rotação nem com recuperação**. Se a chave se perder, o caso vira atendimento.

### Cadastro da conta de recebimento (`payments-account`)

- A conta só vira `active` por `service_payment_account_apply_status`, com `general` reconsultado no Asaas. O corpo do webhook nunca decide.
- `private.platform_fee_bps()` lê `private.payment_platform_config`. Sem linha nessa tabela, o cadastro não começa. O valor é da NOOWE e fica fora do alcance do restaurante, por isso não está em configuração do estabelecimento. **Decisão pendente:** qual é a comissão.
- A chave raiz fica em `ASAAS_ROOT_API_KEY`, nos segredos das Edge Functions. Só `payments-account` a usa.
- O cadastro aceita só CNPJ. Restaurante em CPF exigiria `birthDate` e uma nova decisão.

## Consequências

- `gateway_transactions` continua sendo o livro-razão (equivale ao `payments` da spec).
- Pagamento tardio nunca levanta erro no webhook: vira `completed` + estorno enfileirado.
- Estorno automático de pagamento tardio conflita com N4 #5 (aprovação registrada): decisão humana pendente.
