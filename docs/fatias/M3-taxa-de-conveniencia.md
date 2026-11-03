# M3 — Taxa de conveniência

**Objetivo:** Quick e agendado cobram uma taxa explícita da NOOWE, nunca na conta do salão.
**Depende de:** M1, M2, Q1 · **Ligar depende de:** contador da NOOWE (pendência 38) · **Spec:** aditivo item B · **ADRs:** 031, 013 · **Invariantes:** 2, 6

Valor lido de `private.convenience_fee_cents` e copiado para o pedido. Entrega também a consulta interna de receita de conveniência.

## Critérios de aceite
1. A linha aparece só nos fluxos parametrizados; nunca em comanda de Fine ou Casual.
2. Fica fora da base de taxa, gorjeta, cupom e fidelidade, e fora da nota do restaurante.
3. Vai 100% no split, somada ao split da taxa NOOWE Pay.
4. Com "Pagar pelos meus clientes" (só o Dono), o cliente não vê a taxa e o valor sai do restaurante.
5. O total conferido no servidor inclui a taxa; valor vindo do app é ignorado.
6. Com a taxa em R$ 0 ou desligada no parâmetro, a linha não aparece e o split não muda; ligar não exige nova versão do app.
7. A mecânica do split manda o valor direto à carteira NOOWE, sem passar pelo saldo disponível do restaurante.
