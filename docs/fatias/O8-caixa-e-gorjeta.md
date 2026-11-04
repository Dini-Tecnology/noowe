# O8 — Caixa e gorjeta

**Objetivo:** caixa em centavos, auditado e ligado a pagamentos; rateio de gorjeta.
**Depende de:** O2, O3, G5 · **Spec:** aditivo §4, §5, §7.3; `aditivo-comercial-e-pagamentos` itens 2, 3 e G · **ADRs:** 029, 004, 032 · **Invariantes:** 1, 4, 8

## Critérios de aceite
1. Caixa em `bigint`; abertura com fundo de troco; sangria e reforço com motivo e responsável, auditados.
2. Pagamentos digitais conciliam sozinhos; dinheiro lançado pelo garçom quita a parcela e a comanda.
3. Fechamento cego compara contado e esperado; quebra acima do limite vai ao Dono.
4. Soma do consumo pago continua igual ao consumo total em qualquer modo (ADR-032).
5. Fechamento do dia bloqueia com comanda aberta, gera o rateio e envia o resumo ao Dono.
6. Retenção de 0% até o teto do regime; rateio igualitário, por pontos ou por horas; mudança vale do próximo dia operacional.
7. Cada funcionário vê só o próprio extrato em "Minha gorjeta"; o relatório para a folha sai no fechamento; o app não paga gorjeta.
8. Reabrir comanda paga e estornar exigem motivo e aprovação, sem estorno automático; ninguém aprova o próprio pedido.
9. Maquininha da casa e dinheiro são registrados na comanda, sem taxa NOOWE, e abatem o saldo.
10. O limite de quebra só o Dono altera; fundo de troco e limite para sugerir sangria, Dono e Gerente.
11. Maître vê consumo, saldo e quem pagou na mesa que está cobrando; não vê caixa, outras mesas em detalhe nem taxas.
12. O dia operacional vai de um fechamento do dia ao seguinte; sem caixa aberto, vira no horário configurado (padrão 6h), definido por Dono e Gerente.
13. Sem fechamento até a virada, Gerente e Dono recebem alerta, e nada fecha sozinho.
14. Maquininha da casa registra a forma (crédito, débito, Pix ou vale) como pagamento externo, fora do índice dos créditos; dinheiro segue a pendência 36.
15. O fechamento continua chamando `private.cash_closed_by_receiver` (O3): caixa fechado por quem recebeu dinheiro fica registrado e avisa o Dono. Quando o dinheiro passar a quitar parcela, a função muda de fonte.
