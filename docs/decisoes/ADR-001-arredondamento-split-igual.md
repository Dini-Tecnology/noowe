# ADR-001 — Arredondamento na divisão igual

**Status:** ACEITO (2026-09-14) — default mantido; escolha delegada pelo responsável do produto à recomendação técnica do plano de aderência
**Origem:** spec §8.1, primeira decisão em aberto
**Impacta:** Fatia G3 (split e pagamento parcial), Fatia N4 (pagamento)

## Questão

Ao dividir igualmente um total que não é divisível pelo número de participantes, para onde vai
o centavo residual? A spec pergunta: "sobra vai para o primeiro pagante ou é distribuída em
centavos?"

## Decisão proposta

**Distribuir os centavos residuais, um por participante, em ordem determinística de
`joined_at`.** Ninguém paga mais que 1 centavo a mais que os demais.

```
total_cents = 10001, participantes = 3
base = 10001 / 3 = 3333  (divisão inteira)
resto = 10001 % 3 = 2
parcelas = [3334, 3334, 3333]   // os 2 primeiros por joined_at recebem +1
soma = 10001 ✅
```

## Por que não "sobra para o primeiro pagante"

Porque "primeiro pagante" não é determinístico: depende de quem abriu a tela de fechamento
primeiro, o que muda a cada recálculo e produz valores diferentes para a mesma conta em
momentos diferentes. Além disso, com um grupo grande a sobra pode chegar a N-1 centavos
concentrados numa pessoa só, e o valor exibido a ela deixaria de bater com o dos demais sem
explicação visível na interface.

`joined_at` é estável, já existe em `session_participants` e produz sempre o mesmo resultado.

## Consequências

- A regra vive numa única função server-side, `split_equal(total_cents, participant_ids[])`.
  Trocar a política depois é mudar essa função e mais nada.
- Exige teste de propriedade: para qualquer `total_cents` e qualquer N, `sum(parcelas) == total_cents`
  e `max(parcelas) - min(parcelas) <= 1`.
- Vale também para o rateio de itens compartilhados no modo Individual.

## Aberto para revisão

Se o time preferir a política do documento original ("arredondando para cima na última casa",
citada em spec §4.4), ela **cria** dinheiro: 3 × 3334 = 10002 ≠ 10001. Nesse caso é preciso
decidir se o restaurante absorve a diferença como desconto ou se ela vira arredondamento a
maior cobrado do cliente — o que tem implicação fiscal.
