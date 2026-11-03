# ADR-032 — Saldo único da comanda e taxa ou gorjeta opcional

**Status:** ACEITO (2026-11-03); pendências 17 e 18 respondidas.
**Origem:** [`aditivo-comercial-e-pagamentos`](../spec/aditivo-comercial-e-pagamentos.md), itens 1, 4 e A.
**Substitui:** `split_fixed_remainder` e o `redistribute_unpaid` do ADR-010; a ordem de cálculo de `04-calculo-financeiro`
na parte "taxa dentro do total". **Resolve:** pendências 8 e 16.
**Impacta:** fatia G5 (reescreve parte da G3), teste de propriedade do ADR-001, `CLAUDE.md` (invariante 4).
**Regras isoladas em função nomeada (a criar):** `private.session_consumption_balance`, `private.fee_or_tip_mode`, `private.adjust_to_balance`.

## Decisão

1. **A comanda tem um saldo único de consumo.** As quatro formas só abatem dele e podem ser combinadas enquanto houver saldo.
2. **Taxa ou gorjeta é por pagamento**, calculada sobre o consumo daquele pagamento, com o cupom já descontado. Por
   tipo de serviço o restaurante usa uma das duas, nunca ambas. Quem retira a taxa, retira só da própria parte.
3. **A invariante muda de objeto.** Como a taxa virou opcional por pessoa, o "total da conta" deixa de ser um número
   fixo. O que precisa fechar exatamente é o consumo: `soma do consumo pago = consumo total`. Sem centavo perdido nem
   criado, em qualquer combinação. **A invariante 4 do `CLAUDE.md` precisa ser reescrita assim**; o teste de propriedade
   passa a cobrir combinações de formas e retirada de taxa.
4. **"Conta já quitada" só com saldo zero.** Parcela aberta de outra pessoa não trava ninguém, só parcela paga ou em
   pagamento. Item pago em "Meus itens" ou "Por item" fica travado.
5. **Reserva durante o pagamento:** o valor sai do saldo ao entrar no pagamento e volta se falhar ou expirar.
   O prazo do Pix é parâmetro (hoje `pix_expiry_min`, 15; o aditivo fala em 10).
6. **Quem sai sem pagar** deixa a parte para o titular, que é avisado. Hoje o abandono redistribui entre os demais.

## O que o código de hoje muda

- `bill_shares.amount_cents = base_cents + service_fee_cents` continua valendo por parcela, mas `service_fee_cents` passa
  a poder ser zero por escolha, com registro.
- `private.session_totals` calcula `fee_all` sobre a conta inteira e o valor fixo reparte entre base e taxa. Precisa
  mudar para o saldo de consumo.
- `restaurant_model_configs.service_fee_bps` e `tip_presets_bps` passam a valer por serviço, com o modo taxa ou gorjeta.
- `fixed_amount` hoje recusa valor acima do saldo; passa a ajustar e mostrar o valor ajustado antes de confirmar.
- Testes 35 e 36 mudam. O caso que falha no 36 (pendência 16) deixa de ser recusa.

## Consequências

- Mexe em dinheiro e na comanda em uso: exige migração das parcelas abertas e janela de deploy sem comanda em fechamento.
- Fiscal (ADR-030): taxa fora da nota por padrão continua valendo; cupom entra como desconto na nota.

## Respostas às pendências 17 e 18

- **Valor fixo é o total que sai do cartão.** O servidor separa consumo e taxa e o app mostra antes de confirmar
  ("R$ 45,45 de consumo + R$ 4,55 de taxa"). Sem taxa, o valor é só consumo. Gorjeta em percentual segue a mesma conta;
  gorjeta em valor livre entra por cima do valor fixo, mostrada à parte.
- **Partes iguais dividem o consumo.** A taxa é de cada um: em R$ 300 entre 3 com taxa de 10%, quem retirou paga R$ 100,
  e os outros, R$ 110.
