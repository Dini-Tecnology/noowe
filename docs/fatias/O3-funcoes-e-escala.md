# O3 — Várias funções e escala

**Objetivo:** uma pessoa acumula funções com principal; escala por pessoa e por função; permissões reduzidas.
**Depende de:** O2 · **Spec:** aditivo §6, §7.3 · **ADRs:** 025, 015

## Critérios de aceite
1. A pessoa com duas funções vê o painel unificado, com etiqueta e filtro, e abas sem repetição.
2. Permissões são a soma das funções e valem na RLS, não só na tela.
3. Ninguém aprova o próprio pedido; caixa fechado por quem recebeu dinheiro avisa o Dono.
4. Só o Dono concede Dono e Gerente.
5. Recepcionista (Maître reduzido) não aprova reserva nem isenta no-show.
6. Escala registra pessoa, função, área e estação; novo membro entra por convite.
