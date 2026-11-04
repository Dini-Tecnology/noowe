# Cálculo financeiro — centavos, taxas e os 4 modos de divisão

Fonte: spec §3.4, §4.4, §7.2. Decisão de arredondamento: ADR-001.

## Regra zero

**Todo valor cobrado é calculado no servidor.** O app React Native exibe, nunca decide. Um
total enviado pelo cliente é sempre recalculado e comparado; divergência é erro, não ajuste.

Motivo: o consumo pago precisa bater com o consumo total ao centavo. Isso é impossível de garantir
se N celulares calculam em paralelo sobre estados que podem estar dessincronizados.

## O saldo único (ADR-032)

A comanda tem **um saldo de consumo**. As quatro formas só abatem dele e podem ser combinadas:

```
saldo = Σ consumo dos itens − Σ base_cents das parcelas pagas ou em pagamento
```

Taxa de serviço ou gorjeta **não fazem parte do saldo**: são de cada pagamento, por cima do consumo.
Como a taxa é opcional por pessoa, não existe um "total com taxa" da conta. O que precisa fechar exatamente é
`soma do consumo pago = consumo total`, e a comanda só encerra com o saldo em zero.

| Regra | Função |
|---|---|
| Quanto falta | `private.session_consumption_balance` |
| Taxa ou gorjeta da casa | `private.fee_or_tip_mode`; `private.session_fee_bps` devolve 0 em modo gorjeta |
| Valor acima do saldo | `private.adjust_to_balance` |
| Consumo dentro de um valor | `private.split_out_of_total` |
| A parcela ainda cabe na conta | `private.share_fits_balance` |
| Reserva vencida | `private.bill_hold_sweep`, no tick do motor |

- **Parcela aberta** é só uma intenção: não reserva nada nem trava item de ninguém.
- **Reserva:** o valor sai do saldo ao entrar no pagamento (`pending_payment`). Falhou ou expirou, volta. O prazo é
  `pix_expiry_min` ou `card_hold_min`. Dois pagamentos ao mesmo tempo disputam a trava da sessão, então nunca abatem além do saldo.
- **Trava de item:** só parcela paga ou em pagamento de "Meus itens" ou "Por item" trava item. Parcela aberta que ficou com um item já
  pago por outra pessoa não pode mais ser paga: o servidor pede para refazer (P0012).
- **Pagamento tardio:** se a confirmação chega depois de a reserva cair e a conta não comporta mais, o valor entra em estorno.
- **Presencial:** dinheiro, maquininha e Pix na mesa abatem do mesmo saldo (`restaurant_record_bill_payment`), com o valor do servidor.

## Ordem de cálculo (não inverter)

```
1. subtotal_cents     = Σ (unit_price_cents × qty) + extras
2. desconto           = cupom / pontos / desconto de combo   ← aplicado sobre o SUBTOTAL
3. base_cents         = subtotal_cents − desconto
4. por pagamento, sobre o consumo daquele pagamento, uma das duas (nunca as duas na mesma conta):
   service_fee_cents  = round(consumo × service_fee_bps), retirável pela própria pessoa, com registro
   tip_cents          = sugerida em % ou em valor livre
5. cobrado            = consumo + taxa + gorjeta
```

**Valor fixo é o total que sai do cartão:** o consumo sai de dentro dele. `R$ 50` a 10% dá `R$ 45,45 + R$ 4,55`; sem taxa, é tudo
consumo. Gorjeta em percentual segue a mesma conta; gorjeta em valor livre entra por cima, à parte.
**Partes iguais:** o consumo é igual para todos e a taxa é de cada um (R$ 300 entre 3: R$ 100 para quem retirou, R$ 110 para os outros).

Fidelidade acumula sobre `base_cents`, não sobre `total_cents` — não se pontua taxa nem
gorjeta (ADR-005).

## Os 4 modos de divisão

A spec descreve os modos duas vezes com nomes diferentes (§3.4 e §4.4). **São os mesmos quatro
modos** e devem ter uma implementação só:

| Modo canônico | Nome em §3.4 | Nome em §4.4 | Regra |
|---|---|---|---|
| `by_owner` | Individual | Meus itens | Cada um paga os itens com seu `participant_id`; itens sem dono são rateados entre todos |
| `equal` | Igual | Igual | Saldo ÷ participantes não quitados, resíduo distribuído (ADR-001). Com número de pessoas ajustado, quem confirma paga a própria parte, e o resto segue no saldo |
| `by_item` | Seletivo | Por item | Participante assume itens específicos, inclusive de terceiros; um item pode ser rateado entre vários |
| `fixed_amount` | Valor fixo | Valor fixo | Participante define o total a pagar; acima do saldo, é ajustado e mostrado antes de confirmar; o restante fica no saldo |

O destino da gorjeta segue sendo política da unidade ([ADR-010](../decisoes/ADR-010-regras-de-fechamento-por-unidade.md)). O destino do
restante do valor fixo deixou de existir: com o saldo único, ele simplesmente fica no saldo (ADR-032).

## Assinaturas server-side

```
rpc split_preview(session_id, mode, params)  -> parcelas propostas, sem gravar
rpc split_commit (session_id, mode, params)  -> grava bill_shares, valida soma do consumo <= saldo
rpc pay_share    (share_id, method, idempotency_key) -> inicia cobrança
```

`split_preview` é o que a UI chama a cada interação de arrastar item. `split_commit` é a única
porta de gravação, e valida a invariante da soma antes de persistir.

## Testes obrigatórios (property-based)

Estes não são testes de exemplo — são propriedades que valem para toda entrada:

1. Para qualquer `total_cents ≥ 0` e qualquer `N ≥ 1`: `sum(split_equal(total, N)) == total`.
2. Para qualquer `total_cents` e `N`: `max(parcelas) − min(parcelas) ≤ 1`.
3. `split_out_of_total(total, bps)`: consumo + o que vem por cima é exatamente o total.
4. Qualquer combinação das 4 formas, com taxa retirada e pagamentos que falham no meio, em contas aleatórias: consumo pago = consumo total ao
   fechar; pago + em pagamento nunca passa do consumo; nenhum item coberto além do valor; `amount = base + taxa`; nunca taxa com gorjeta; repetir o
   evento do provedor não abate de novo (`tests/36_bill_shares_flow.sql`).
5. Um teste por critério da fatia G5 em `tests/59_g5_saldo_unico.sql`. Concorrência real pede duas conexões: lá a reserva é conferida em sequência.

Sugestão de ferramenta: `fast-check` no TypeScript, ou `pgTAP` para as RPCs.
