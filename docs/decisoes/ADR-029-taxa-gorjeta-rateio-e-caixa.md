# ADR-029 — Taxa ou gorjeta, rateio, retenção e caixa

**Status:** ACEITO em parte (2026-11-03): retenção, rateio e permissões, conforme `aditivo-comercial-e-pagamentos` itens 2 e G.
Taxa ou gorjeta foi para o ADR-032. **Ainda bloqueado:** pendências 10, 11b, 19, 20 e 27 em `PENDENCIAS-perfis-workflows.md`.
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

## Decisão

- **Retenção:** de 0% até o teto do regime tributário (campo novo no Perfil), padrão 0%, com o teto na tabela de parâmetros.
- **Rateio:** igualitário (padrão), por pontos ou por horas. Quem acumula funções entra pela função escalada no turno
  (ADR-025). Taxa de serviço e gorjeta entram juntas na apuração.
- **Mudança vale do próximo dia operacional**, nunca retroativa, com autor, antes e depois.
- **O app calcula e informa; não paga.** Fechamento do dia gera extrato "Minha gorjeta" e relatório para a folha.
- A tela avisa para confirmar com o contador e a convenção coletiva. O app não valida a convenção.
- Valor em centavos, `bigint`; toda ação de caixa grava `audit_log` na mesma transação (invariantes 1 e 8).

## Provisório, até as pendências

- Limite de quebra: **só o Dono** (pendência 19, que o item G do aditivo deixou em dúvida).
- Cobrança de no-show e pré-autorização ficam **ocultas** na Central até haver suporte do provedor (pendência 10).
- Tap to Pay: a tela não deve afirmar cobrança enquanto não houver fornecedor (pendência 11b).

## Consequências

- O8 depende de O3, O2 (aprovações) e das pendências acima.
- `tip_allocation` (ADR-010) sai, substituído pelo modo de rateio.
