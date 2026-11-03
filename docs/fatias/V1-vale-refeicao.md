# V1 — Vale-refeição

**Objetivo:** vale abate o saldo como qualquer meio, e o restaurante escolhe quais aceita.
**Depende de:** G5, M2 · **Spec:** aditivo item I · **ADRs:** 031

Hoje só a primeira entrega é viável: online depende do Asaas, e aproximação depende do fornecedor do Tap.

## Critérios de aceite
1. Na maquininha da casa: o garçom registra na comanda, sem taxa NOOWE, e entra no caixa como "maquininha – vale".
2. O Dono escolhe quais vales aceita.
3. Vale fica fora do índice de créditos, nos dois lados.
4. Abate o saldo na conta dividida e no pagamento misto (vale no consumo e cartão na gorjeta).
5. **Quando houver provedor:** taxa da linha "vale", nunca acima do teto, e repasse dentro do prazo legal.
