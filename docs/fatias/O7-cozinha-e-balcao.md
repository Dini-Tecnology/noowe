# O7 — Cozinha, Expedição e Balcão

**Objetivo:** KDS roteado e escalonado, Expedição opcional e Balcão do Quick.
**Depende de:** O1, O2 · **Spec:** aditivo §3, §5 · **ADRs:** 028, 013 · **Invariante:** 6

## Critérios de aceite
1. Cada item é roteado à estação certa e gravado em `order_items.station_id`.
2. O item mais demorado dispara primeiro e a mesa recebe tudo junto; Fine segura os cursos seguintes.
3. Com Expedição ligada o Chef libera a mesa inteira; desligada, o prato vai direto ao garçom.
4. Cozinheiro vê só a estação dele, em ordem de disparo, com alergias e cronômetro; Barman vê o destino da bebida.
5. Item indisponível em um toque some do app do cliente e avisa os garçons das mesas afetadas.
6. Quick: pedido pago entra em produção; pedido "Pronto" avisa o cliente; retirada valida o QR.
7. Pedido agendado entra no KDS na hora certa.
