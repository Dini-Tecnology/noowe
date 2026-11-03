# M5 — Créditos NOOWE Pay

**Objetivo:** quanto mais o restaurante recebe pelo app, mais crédito abate da mensalidade.
**Depende de:** M2, M4 · **Spec:** aditivo item D · **ADRs:** 031

Entrega também a consulta interna de créditos gerados, usados, expirados e a liberar.

## Critérios de aceite
1. Índice = pago pelo app (cartão e Pix) ÷ faturamento registrado; vale fora dos dois lados; Tap só com o parâmetro ligado.
2. Faixa e volume mínimo vêm da tabela; percentual incide sobre o preço mensal de tabela.
3. Fechamento do mês desconta estornos e contestações.
4. Crédito libera duas faturas depois, abate até 30% de cada fatura, vale só para a mensalidade e expira no prazo do plano.
5. Não vira dinheiro, não passa entre unidades e some ao cancelar.
6. Tela mostra índice em tempo real, previsão, quanto falta para a próxima faixa, saldo, a liberar, a expirar e extrato.
7. Gerente vê índice e faixa, nunca valores em R$; Dono recebe as notificações do item D.
8. Razão imutável, separado da compensação de M2.
