# P3 — Cupons do restaurante

**Objetivo:** criar um cupom em menos de um minuto; o cliente e o garçom aplicam, e o servidor valida.
**Depende de:** G5, P2, O3 · **Spec:** aditivo item F · **ADRs:** 032 · **Invariantes:** 1, 2, 8

A tabela `promotions` existe, com dinheiro em `numeric` e campos que não cobrem as regras: reconciliar antes de criar outra.

## Critérios de aceite
1. Criação em 3 passos, com a regra em uma frase e modelos prontos.
2. O servidor valida serviço, escopo, dia, horário, mínimo, público e limites; a mensagem diz por que não vale.
3. Um cupom por pessoa por conta; na conta dividida vale só para a parte de quem aplicou.
4. Cupom automático entra sozinho quando a regra bate.
5. Desconto entra antes de taxa ou gorjeta, sai como desconto na nota, e a taxa NOOWE Pay incide sobre o valor pago.
6. Limite de usos não estoura com aplicações simultâneas.
7. Depois do primeiro uso, só validade e limite podem mudar.
8. Envio por notificação só a quem aceitou ofertas.
9. Criam Dono e Gerente; aplicam Garçom (mesas dele), Maître e Gerente; a cozinha não vê desconto.
