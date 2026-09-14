# G3 — Divisão de conta e pagamento parcial

**Objetivo:** os quatro modos de divisão, com soma exata e mesa que só fecha em saldo zero.
**Depende de:** G2, N4
**Spec:** §3.4 ("fechamento e divisão"), §4.4 ("comanda por pessoa e divisão")
**Arquitetura:** `docs/arquitetura/04-calculo-financeiro.md`
**ADRs:** 001 (arredondamento), 004 (reabertura), 005 (fidelidade), 006 (saldo de anônimo)

> A spec descreve os modos **duas vezes**, com nomes diferentes em §3.4 e §4.4. São os mesmos
> quatro. A tabela de correspondência e a divergência real entre as duas seções estão em
> `04-calculo-financeiro.md` — leia antes de implementar.

## Entregáveis

**Banco**
- `bill_shares` com `participant_id`, `mode`, `amount_cents`, `tip_cents`, `status`, `payment_id`
- Verificação transacional no fechamento: `sum(shares pagos) == total da sessão`

**Servidor**
- `split_preview(session_id, mode, params)` — sem gravar, chamada a cada interação da UI
- `split_commit(session_id, mode, params)` — única porta de gravação, valida a soma
- `pay_share(share_id, method, idempotency_key)`
- Os quatro modos: `by_owner`, `equal`, `by_item`, `fixed_amount`
- Taxa de serviço sobre o subtotal; gorjeta sugerida sobre a própria parte, sempre editável,
  atribuída ao garçom responsável (spec §3.4)

**App**
- Escolha entre pagar sozinho ou dividir; compartilhado é o padrão com mais de um convidado
- Interface de **arrastar itens** para cada pessoa, com item compartilhável entre várias
  (spec §4.2 etapa 8)
- Marca pago / não pago por participante, visível a todos e ao garçom

## Critérios de aceite

1. Os quatro modos produzem soma **exatamente** igual ao total da conta, sem centavos perdidos
   (spec §3.6) — teste de propriedade, não de exemplo. Ver `04-calculo-financeiro.md`.
2. `max(parcela) − min(parcela) ≤ 1` no modo `equal` (ADR-001).
3. Pagamentos parciais mantêm a mesa em `billing`; o encerramento só ocorre com **saldo zero**
   (spec §3.6).
4. Convidado que abandona o pagamento devolve o valor ao pool, redistribuído entre os não pagos
   (spec §3.5).
5. Taxa e gorjeta são exibidas de forma destacada **antes** da confirmação (spec §3.4).
6. Reabertura de conta não estorna automaticamente o já pago (ADR-004).
7. Cliente que sai sem pagar deixa a mesa em `billing` com alerta ao gerente e saldo em aberto
   (spec §3.5).
8. Pontos creditados por parcela paga, sobre a base sem taxa nem gorjeta (ADR-005).

## Fora de escopo

Modos de conta de festa — conta única, por mesa, individual (C1).
