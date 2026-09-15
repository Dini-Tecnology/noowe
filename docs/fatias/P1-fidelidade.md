# P1 — Fidelidade: pontos, níveis e selos

**Objetivo:** os três mecanismos de fidelidade coexistindo no mesmo registro, como a spec pede.
**Depende de:** N4
**Spec:** §2.2 (`LoyaltyAccount`), §3.4, §4.4, §5.4, §7.1 (`loyalty_mode`)
**ADRs:** 005 (momento do crédito)

## Entregáveis

**Banco**
- `loyalty_accounts`: `points`, `tier`, `stamps`, no mesmo registro (spec §2.2)
- `loyalty_transactions` referenciando `bill_share_id` **ou** `order_id`, nunca a sessão
- Índice único: um `bill_share` gera no máximo um crédito

**Servidor**
- Crédito por parcela paga, sobre a base **sem** taxa e **sem** gorjeta (ADR-005)
- Em Quick Service, selo creditado na **retirada**, não no pagamento (ADR-005)
- Estorno de parcela estorna os pontos na mesma transação
- Catálogo de recompensas por estabelecimento

**App**
- Tela de fidelidade: pontos, nível, resgate; cartão de selos com progresso

## Critérios de aceite

1. Numa conta dividida entre 4 pessoas, cada uma recebe pontos proporcionais **ao que pagou**.
2. Participante sem conta não acumula, e seus pontos não são redistribuídos.
3. Taxa de serviço e gorjeta **não** geram pontos.
4. O selo é creditado uma única vez por pedido concluído (spec §5.6).
5. Estorno de uma parcela remove os pontos correspondentes.
6. `loyalty_mode` da unidade decide quais mecanismos aparecem no app.

## Fora de escopo

Campanhas e promoções segmentadas (P2).
