# Cálculo financeiro — centavos, taxas e os 4 modos de divisão

Fonte: spec §3.4, §4.4, §7.2. Decisão de arredondamento: ADR-001.

## Regra zero

**Todo valor cobrado é calculado no servidor.** O app React Native exibe, nunca decide. Um
total enviado pelo cliente é sempre recalculado e comparado; divergência é erro, não ajuste.

Motivo: os critérios de aceite da spec (§3.6, §4.6) exigem que a soma das parcelas bata com o
total ao centavo. Isso é impossível de garantir se N celulares calculam em paralelo sobre
estados que podem estar dessincronizados.

## Ordem de cálculo (não inverter)

```
1. subtotal_cents     = Σ (unit_price_cents × qty) + extras
2. desconto           = cupom / pontos / desconto de combo   ← aplicado sobre o SUBTOTAL
3. base_cents         = subtotal_cents − desconto
4. service_fee_cents  = round(base_cents × service_fee_pct)  ← spec §4.4: sobre o subtotal
5. total_cents        = base_cents + service_fee_cents
6. gorjeta            = sugerida sobre a parte de cada um, sempre editável, FORA do total acima
```

Fidelidade acumula sobre `base_cents`, não sobre `total_cents` — não se pontua taxa nem
gorjeta (ADR-005).

## Os 4 modos de divisão

A spec descreve os modos duas vezes com nomes diferentes (§3.4 e §4.4). **São os mesmos quatro
modos** e devem ter uma implementação só:

| Modo canônico | Nome em §3.4 | Nome em §4.4 | Regra |
|---|---|---|---|
| `by_owner` | Individual | Meus itens | Cada um paga os itens com seu `participant_id`; itens sem dono são rateados entre todos |
| `equal` | Igual | Igual | Total restante ÷ participantes não quitados, resíduo distribuído (ADR-001) |
| `by_item` | Seletivo | Por item | Participante assume itens específicos, inclusive de terceiros; um item pode ser rateado entre vários |
| `fixed_amount` | Valor fixo | Valor fixo | Participante define um valor; o destino do restante segue `split_fixed_remainder` |

As seções §3.4 e §4.4 divergem em duas regras que mudam dinheiro: o destino do restante no valor
fixo ("redistribuído entre os demais" × "permanece na conta da mesa") e o destino da gorjeta
(garçom responsável × equipe). As duas são **política da unidade**, com o default de cada seção,
e não modos novos — ver [ADR-010](../decisoes/ADR-010-regras-de-fechamento-por-unidade.md). Isso
substitui a decisão anterior deste documento, que adotava só §4.4 e deixava o Fine Dining fora
da spec.

## Assinaturas server-side

```
rpc split_preview(session_id, mode, params)  -> parcelas propostas, sem gravar
rpc split_commit (session_id, mode, params)  -> grava bill_shares, valida soma == total
rpc pay_share    (share_id, method, idempotency_key) -> inicia cobrança
```

`split_preview` é o que a UI chama a cada interação de arrastar item. `split_commit` é a única
porta de gravação, e valida a invariante da soma antes de persistir.

## Testes obrigatórios (property-based)

Estes não são testes de exemplo — são propriedades que valem para toda entrada:

1. Para qualquer `total_cents ≥ 0` e qualquer `N ≥ 1`: `sum(split_equal(total, N)) == total`.
2. Para qualquer `total_cents` e `N`: `max(parcelas) − min(parcelas) ≤ 1`.
3. Para qualquer conjunto de itens: `sum(by_owner) == total`, independentemente de quantos itens
   estejam sem dono.
4. Sequência de `fixed_amount` até esgotar o total nunca produz parcela negativa nem soma > total.
5. `split_commit` seguido de reabertura e novo `split_commit` mantém `sum(paid) ≤ total` (ADR-004).

Sugestão de ferramenta: `fast-check` no TypeScript, ou `pgTAP` para as RPCs.
