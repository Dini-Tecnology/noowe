# ADR-026 — Atribuição automática de mesa e garçom

**Status:** PROVISÓRIO (2026-11-01). Origem: aditivo §2.
**Complementa:** ADR-016, ADR-018, ADR-007. **Impacta:** fatia O5, `tables`, `tables.assigned_waiter_id`, `shifts`, check-in, fila, reserva.
**Regras isoladas em função nomeada:** `private.pick_table` (mesa), `private.pick_waiter` (garçom), `private.waiter_assignment_mode`, `private.reassign_tables_on_shift_end`.

## Decisão

- **Áreas:** tabela própria `floor_areas` no lugar de `tables.section` texto livre; restaurante com uma área só age
  como área única. Mesa ganha `combinable`, `accessible` e posição na planta.
- **Mesa, sempre automática:** só mesas Livres e sem conflito com reservas futuras (mesa fica livre pelo tempo médio
  da refeição); na área pedida, ou na com mais mesas compatíveis; a menor que comporta; respeita cadeirinha e
  acessibilidade; mesa provisória na confirmação da reserva e redistribuição no início do turno; grupo grande junta
  combináveis da mesma área (ADR-018) e avisa o Maître; desempate pelo garçom com menos pessoas no turno.
  Capacidade lida só de `private.table_effective_seats`.
- **Garçom, sempre automático**, modo escolhido por Dono ou Gerente: seções fixas ou rodízio por área. Em ambos:
  só escalados como Garçom; nunca outra área havendo garçom livre na mesma; limite de mesas por garçom com área
  vizinha avisando o Maître; garçom preferido do cliente tem prioridade; no fim do turno as mesas abertas passam a
  outro da área, com aviso aos dois.
- Quem grava `assigned_waiter_id` passa a ser só `pick_waiter` e os ajustes manuais (Maître, Gerente), auditados.
- QR em mesa reservada nos próximos X min: bloqueia e sugere a fila; mantém o item 4 do ADR-016 enquanto a mesa
  estiver segurada (pendência 13).

## Consequências

- Capacidade do restaurante deixa de ser digitada: é a soma das mesas (corrige 30 × 26 já na fatia O0).
- Garçom em "Minhas Mesas" só vê as dele (RLS), o que depende desta fatia.
