# ADR-004 — Reversão de pagamento parcial e reabertura de conta

**Status:** PROVISÓRIO — envolve dinheiro. Não aprovado na rodada de decisões de 2026-09-14; revisão humana obrigatória antes da Onda 3 (fatia G3)
**Origem:** spec §8.1, quarta decisão em aberto
**Impacta:** Fatia G3 (split), Fatia N4 (pagamento e fiscal)

## Questão

Um participante já pagou a parte dele. A mesa precisa ser reaberta (item esquecido, cortesia
aplicada depois, erro de lançamento). O que acontece com o que já foi pago?

## Decisão proposta

**Nada é estornado automaticamente. O pagamento já feito permanece como crédito da sessão.**

1. A sessão volta de `billing` para `open`, com `reopened_at` e registro em `audit_log`.
2. As `bill_shares` já quitadas permanecem com status `paid` e continuam abatendo o total.
3. O novo saldo é `total_cents - sum(paid_shares)` e é redistribuído apenas entre os
   participantes ainda não quitados.
4. Se o novo total ficar **menor** que o já pago, a diferença **não** vira estorno automático:
   gera uma pendência de estorno na fila de aprovações do gerente.

Estorno e cancelamento fiscal só acontecem por fluxo próprio, com aprovação registrada
(spec §7.4).

## Por quê

Estorno automático em reabertura de conta é um vetor de fraude óbvio (reabrir, reduzir, estornar)
e produz descasamento fiscal: o documento já foi emitido no fechamento. Manter o pagamento como
crédito preserva a rastreabilidade — cada centavo tem uma transação e uma decisão humana atrás
dele.

## Consequências

- `table_sessions` precisa de contagem de reaberturas; mais de N reaberturas na mesma sessão é
  sinal operacional que merece alerta ao gerente.
- Fechamento fiscal precisa ser distinguido de fechamento de sessão: a nota é emitida no
  saldo zero, e uma reabertura posterior exige nota complementar ou cancelamento, nunca
  reescrita silenciosa.
- **Ponto que precisa de decisão humana:** a política de estorno quando o cliente já foi
  embora e o valor é a favor dele. Hoje o default deixa a pendência aberta indefinidamente.
