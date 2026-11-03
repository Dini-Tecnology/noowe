# M6 — Códigos promocionais NOOWE

**Objetivo:** a equipe NOOWE cria códigos para a assinatura, e o Dono aplica.
**Depende de:** M4, M5 · **Spec:** aditivo item E · **ADRs:** 031

## Critérios de aceite
1. Tipos: meses de isenção, percentual por N meses e valor fixo por N meses.
2. Respeita validade, limite de usos, planos, mensal ou anual, só novos e um código por restaurante por vez.
3. Isenção total não gera crédito; desconto parcial gera, e o crédito entra depois do código, com limite de 30% e piso de fatura.
4. A tela mostra até quando vale e quanto o restaurante paga depois.
5. Só o Dono aplica; aplicar duas vezes não duplica o benefício.
6. Um código pode combinar fases: o de fundador dá 6 meses grátis e 50% no restante do primeiro ano, com as regras na tabela.
7. O código pode marcar a categoria "Parceiro Fundador" no restaurante, e essa categoria continua registrada depois que o benefício acaba.
8. Código de fundador dispensa o período de teste e vale para restaurante que já está ativo.
