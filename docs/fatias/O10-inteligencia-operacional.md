# O10 — Inteligência operacional

**Objetivo:** ritmo da cozinha, previsão de liberação, espera que aprende, meta de giro, etiquetas de cliente.
**Depende de:** O5–O7 · **Spec:** aditivo §4

## Critérios de aceite
1. Fila do KDS acima do limite segura chamadas da fila e reduz reservas da faixa seguinte; Chef e Gerente são avisados.
2. Mesa com conta pedida mostra "libera em ~X min" e a fila usa a previsão.
3. A estimativa da fila usa a permanência real por dia, horário e tamanho de grupo.
4. Só se oferecem horários que respeitam a duração média por tamanho de grupo.
5. Cliente recebe etiquetas automáticas (VIP, alergias, aniversário, sem visita há X dias).
