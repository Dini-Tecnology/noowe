# ADR-010 — Regras de fechamento que diferem entre Fine e Casual

**Status:** ACEITO (2026-09-14) — opção "política por unidade" escolhida pelo responsável do produto
**Origem:** spec §3.4 × §4.4 e §4.2 (etapa 9); tarefa T-X-22
**Impacta:** Fatia G3 (split e pagamento parcial), Fatia F3 (configuração), Fatia S1 (cobrança na mesa)
**Substitui:** o parágrafo "Adotar §4.4" de `docs/arquitetura/04-calculo-financeiro.md`

## Questão

As seções de Fine Dining (§3.4) e Casual Dining (§4.4) descrevem o fechamento da conta com regras
que não coincidem. Implementar uma delas para os dois modelos deixa o outro fora do documento.
Ramificar por modelo no código viola a regra estrutural do `CLAUDE.md`.

## O que realmente difere

Comparando frase a frase, dois pontos mudam o valor devido ou o destino do dinheiro. Os demais são
a mesma regra escrita de outro jeito.

| Tema | Fine (§3.4) | Casual (§4.4, §4.2) | Muda dinheiro? |
|---|---|---|---|
| Valor fixo | o restante é redistribuído entre os demais | o restante permanece na conta da mesa | **Sim** |
| Destino da gorjeta | atribuída ao garçom responsável pela mesa | atribuída à equipe (§4.2, etapa 9) | **Sim** |
| Divisão igual | total restante ÷ convidados ainda não pagos | total com taxa e gorjeta ÷ participantes | Não. Com pagamento parcial, "total ÷ participantes" só fecha a soma (§4.6) lido como saldo restante ÷ quem não pagou; e a gorjeta é por parte (§4.4) |
| Individual / Meus itens | itens compartilhados são rateados | cada um paga o que consumiu | Não. No Casual todo item tem dono (§4.2, etapa 7), então não há item a ratear |
| Seletivo / Por item | o convidado assume itens, inclusive de terceiros | arrastar itens para cada pessoa, com item compartilhado | Não. O mesmo `by_item` atende as duas interfaces |

## Decisão

**Os quatro modos continuam com uma implementação só. As duas diferenças reais viram parâmetros da
unidade, com o default de cada seção.**

| Parâmetro | Valores | Default em Fine | Default em Casual |
|---|---|---|---|
| `split_fixed_remainder` | `redistribute_unpaid` · `keep_on_table` | `redistribute_unpaid` | `keep_on_table` |
| `tip_allocation` | `table_waiter` · `team_pool` | `table_waiter` | `team_pool` |

- `redistribute_unpaid`: quando alguém paga valor fixo, o saldo restante é recalculado entre os
  participantes que ainda não pagaram, com a regra de centavos do ADR-001.
- `keep_on_table`: o saldo restante fica em aberto na mesa, visível a todos, até alguém escolher
  `equal`, `by_owner` ou `by_item`.
- Cada regra vive numa função server-side única, lida da configuração — nunca por comparação com
  `service_type`.

## Por quê

O responsável do produto escolheu, em 14/09/2026, que os dois modelos sigam o documento por inteiro.
Parametrizar só as diferenças que mudam dinheiro evita parâmetros que não alteram nenhum centavo e
mantém pequeno o espaço de casos do teste de propriedade de G3.

## Consequências

- `docs/arquitetura/03-config-service-model.md` ganha os dois parâmetros.
- O teste de propriedade de T-G3-07 roda os quatro modos com as duas políticas de
  `split_fixed_remainder`, sempre com `sum(parcelas) == total`.
- `keep_on_table` precisa de um estado visível de "saldo da mesa sem dono" para o garçom e para os
  participantes (§4.4: "parcelas em aberto ficam visíveis").
- `team_pool` exige um destino contábil para a gorjeta que não é um garçom. Ele alimenta o relatório
  de gorjetas por equipe (§8, Fase 4 do Casual).
