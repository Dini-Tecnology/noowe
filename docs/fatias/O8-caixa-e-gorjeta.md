# O8 — Caixa e gorjeta

**Objetivo:** caixa em centavos, auditado e ligado a pagamentos; rateio de gorjeta.
**Depende de:** O3 e **respostas 8–11** · **Spec:** aditivo §4, §5, §7.3 · **ADRs:** 029, 010, 004 · **Invariantes:** 1, 4, 8

## Critérios de aceite
1. Caixa em `bigint`; abertura com fundo de troco; sangria e reforço com motivo e responsável, auditados.
2. Pagamentos digitais conciliam sozinhos; dinheiro lançado pelo garçom quita a parcela e a comanda.
3. Fechamento cego compara contado e esperado; quebra acima do limite vai ao Dono.
4. Soma das parcelas continua igual ao total em qualquer modo (teste de propriedade do ADR-001).
5. Fechamento do dia bloqueia com comanda aberta, gera o rateio e envia o resumo ao Dono.
