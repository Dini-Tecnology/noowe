# ADR-029 — Taxa ou gorjeta, rateio, retenção e caixa

**Status:** PROVISÓRIO (2026-11-01). **Bloqueado para implementação:** pendências 8, 9, 10 e 11 em
`PENDENCIAS-perfis-workflows.md`. Nenhuma regra desta decisão mexe em dinheiro antes da resposta do autor.
**Ajusta:** ADR-010 e `docs/arquitetura/04-calculo-financeiro.md`. **Impacta:** fatia O8, N4, G3, caixa.
**Regras isoladas em função nomeada (a criar):** `private.fee_or_tip_mode`, `private.tip_split_rule`, `private.tip_retention_bps`, `private.cash_break_limit_cents`.

## O que o documento pede

- Taxa de serviço **ou** gorjeta, uma por serviço, sempre opcional para o cliente.
- Regra de rateio (igualitário, por pontos por função ou por horas) e percentual retido (até 20% no Simples, 33% nos demais).
- Caixa: fundo de troco, sangria (sugerida acima do limite) e reforço com motivo e responsável, acerto do garçom,
  fechamento cego, quebra acima do limite vai ao Dono, fechamento do dia (bloqueado com comanda aberta).

## Fatos do código que condicionam

- O caixa atual é `numeric`, sem auditoria e sem ligação com pagamentos (`restaurant_record_payment` não lança movimento).
- Pagamento em dinheiro não quita `bill_shares` (`private.reserve_share_payment` aceita só Pix e cartão).
- Gorjeta existe em três lugares (`bill_shares.tip_cents`, `orders.tip_amount`, `public.tips`).
- `tip_allocation = team_pool` só registra o tipo; não há rateio.
- O adapter do Asaas não tem autorização/captura e não há integração de NFC/terminal.

## Decisão provisória

- Quebra de caixa e política de no-show: **só o Dono** define (pendência 1).
- Valor em centavos, `bigint`; toda ação de caixa grava `audit_log` na mesma transação (invariantes 1 e 8); a soma das
  parcelas continua igual ao total (invariante 4) e o teste de propriedade do ADR-001 segue valendo.
- Taxa dentro do total e gorjeta fora, como hoje, até o autor responder o item 8.
- Cobrança de no-show e pré-autorização ficam **ocultas** na Central até haver suporte do provedor.
- Tap to Pay: a tela não deve afirmar cobrança; fica registrada a pendência 11.

## Consequências

- Esta fatia (O8) só começa depois das respostas 8–11 e de O3.
