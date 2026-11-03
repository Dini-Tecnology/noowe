# G5 — Saldo único e taxa ou gorjeta opcional

**Objetivo:** a comanda tem um saldo de consumo; as quatro formas abatem dele e podem ser combinadas, com taxa ou gorjeta por pagamento.
**Depende de:** G3, G4 · **Spec:** `aditivo-comercial-e-pagamentos` itens 1, 4 e A · **ADRs:** 032, 001 · **Invariantes:** 2, 4, 10

## Entregáveis
- **Banco:** saldo de consumo; modo taxa ou gorjeta por serviço; taxa retirável por parcela, com registro; reserva durante o pagamento; ajuste ao saldo. Sai `split_fixed_remainder`.
- **Apps:** linha "Taxa de serviço (opcional)" retirável; gorjeta com sugestões ou valor livre; "Restam só R$ X nesta conta"; garçom desmarca a taxa na cobrança presencial.
- **Docs:** invariante 4 do `CLAUDE.md` e `04-calculo-financeiro` reescritos.

## Critérios de aceite
1. A soma do consumo pago é igual ao consumo total em qualquer combinação das quatro formas, com ou sem taxa retirada (teste de propriedade).
2. Depois de valor fixo ou partes iguais, "Meus itens" e "Por item" continuam disponíveis, limitados ao saldo.
3. Item pago em "Meus itens" ou "Por item" fica travado; parcela só aberta de outra pessoa não trava.
4. Valor acima do saldo é ajustado e mostrado antes de confirmar; com saldo zero, "Esta conta já está quitada".
5. Dois pagamentos simultâneos nunca abatem mais que o saldo; falhou ou expirou, o valor volta.
6. Restaurante nunca cobra taxa e gorjeta na mesma conta; quem retira a taxa retira só da própria parte.
7. Quick: gorjeta opcional, sem pré-seleção.
8. Pagamento misto abate do mesmo saldo; a comanda só encerra com saldo zero.
9. Quem sai sem pagar deixa a parte para o titular, que é avisado ao abrir a comanda.
10. Retirar a taxa grava autor, motivo e horário.
11. Valor fixo é o total que sai do cartão: o app mostra a separação entre consumo e taxa antes de confirmar; sem taxa, é só consumo.
12. Gorjeta em percentual segue a mesma conta do valor fixo; gorjeta em valor livre entra por cima, mostrada à parte.
13. Em partes iguais, o consumo é igual para todos e a taxa é de cada um (R$ 300 entre 3: R$ 100 para quem retirou, R$ 110 para os outros).
