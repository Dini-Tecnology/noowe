# M2 — Taxa NOOWE Pay, split e extrato

**Objetivo:** o restaurante paga uma taxa só por meio de pagamento; a NOOWE recebe a diferença para a tarifa do Asaas.
**Depende de:** M1, N4, spike do ADR-031, respostas 21 e 22 · **Spec:** aditivo itens 5–8 · **ADRs:** 031, 020 · **Invariantes:** 1, 2, 10

## Critérios de aceite
1. Split = taxa × valor pago − tarifa, calculado no servidor em centavos; o exemplo de R$ 110 no crédito dá R$ 3,84, R$ 0,06 e R$ 106,16.
2. A taxa incide sobre consumo + taxa de serviço ou gorjeta.
3. Tarifa acima da taxa: split zero e lançamento no razão de compensação.
4. Extrato do Dono mostra valor pago, taxa e líquido por pagamento; gateway e margem não saem em nenhuma RPC do app.
5. Cliente não vê a taxa em nenhuma tela; Gerente não a vê por pagamento.
6. Relatório de gorjetas separa a parte da taxa referente à gorjeta.
7. Dinheiro e maquininha da casa não geram taxa.
8. Estorno segue a regra da resposta 21.
9. A cobrança guarda a taxa e a tarifa aplicadas, lidas de `private.noowe_pay_rate_bps`; meio sem taxa definida (`null`) é recusado.
10. `private.payment_platform_config`, `private.platform_fee_bps()` e `restaurant_payment_accounts.platform_fee_bps` saem do fluxo, e o cadastro de subconta deixa de depender deles.
11. Consulta interna de diferenças a compensar, e `private.noowe_report_payment_margin` passa a trazer taxa e tarifa.
