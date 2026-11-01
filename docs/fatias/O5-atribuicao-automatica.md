# O5 — Atribuição automática de mesa e garçom

**Objetivo:** mesa e garçom são atribuídos sozinhos; Maître e Gerente só corrigem.
**Depende de:** O3 · **Spec:** aditivo §2 · **ADRs:** 026, 018, 007 · **Invariantes:** 3, 7, 8

## Critérios de aceite
1. Só mesas Livres e sem conflito com reservas futuras são candidatas, na área pedida e a menor que comporta.
2. Cadeirinha e acessibilidade são respeitadas; grupo grande junta combináveis e avisa o Maître.
3. Em seções fixas, a mesa vai ao dono da seção; em rodízio, ao da área com menos pessoas.
4. Só garçom escalado entra; nunca outra área havendo garçom livre; limite de mesas com aviso ao Maître.
5. Garçom preferido do cliente tem prioridade; no fim do turno as mesas passam a outro da área.
6. Trocas manuais gravam `audit_log` e o sistema segue a partir delas.
7. Entrada acima de `tables.seats` continua virando solicitação ao Maître.
