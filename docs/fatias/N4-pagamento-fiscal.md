# N4 — Pagamento e fiscal

**Objetivo:** cobrar de forma idempotente, emitir documento fiscal e fechar o ciclo.
**Depende de:** N2, F2
**Spec:** §7.4, §2.5 (`payment.completed`), §5.4 (pagamento antecipado)
**ADRs:** 004 (reabertura), 005 (fidelidade)

## Entregáveis

**Banco**
- `payments` com `provider`, `provider_ref`, `amount_cents`, `status`, `idempotency_key`
- Índice único de idempotência (F2)

**Servidor**
- Integração de pagamento: PIX, cartão, carteiras digitais, carteira NOOWE, TAP to Pay
  (spec §7.4)
- **Webhook do provedor é a fonte da verdade.** A tela de sucesso do app não confirma nada.
- Emissão fiscal (NFC-e) vinculada ao encerramento da conta
- Fluxo próprio de estorno e cancelamento fiscal, com aprovação e registro (spec §7.4)

**App**
- Tela de pagamento, recibo digital exportável e compartilhável

## Critérios de aceite

1. Reenvio da mesma intenção de pagamento não gera segunda cobrança.
2. `payment.completed` só é emitido a partir do webhook confirmado, nunca do retorno da UI.
3. Em Quick Service, **nenhum pedido entra em produção sem pagamento confirmado** (spec §5.6).
4. Emissão fiscal acontece no encerramento da conta e o recibo fica disponível no app.
5. Estorno exige aprovação registrada com autor, motivo e horário.
6. Falha do provedor deixa o pedido num estado recuperável, nunca em cobrado-sem-pedido nem
   pedido-sem-cobrança.

## Fora de escopo

Divisão de conta (G3) — aqui o pagamento é de um valor único, já determinado.
