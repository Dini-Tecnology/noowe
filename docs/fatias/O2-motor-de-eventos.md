# O2 — Motor de eventos e tarefas

**Objetivo:** cada ação do cliente ou da equipe gera estado, tarefa e aviso ao cliente, com log.
**Depende de:** O1 · **Spec:** aditivo §1.2 e Catálogo de eventos · **ADRs:** 022, 023 · **Invariantes:** 8, 9, 10

## Entregáveis
- **Banco:** `domain_events`, `staff_tasks`, `private.emit_event`, `private.engine_tick` com `pg_cron`; regras do catálogo; `approvals` com auditoria, aviso e bloqueio de autoaprovação.
- **Servidor:** push com retentativa; ação direta na notificação (aprovar, concluir, assumir).

## Critérios de aceite
1. Cada evento do catálogo cria a tarefa para o responsável e para o Gerente, uma só linha.
2. Quem conclui primeiro fecha para os dois; segunda conclusão é recusada sem erro de tela.
3. Tarefa repetida para quem acumula funções chega uma vez só.
4. Aprovações chegam ao mesmo tempo a Gerente e Dono.
5. Sem Gerente em turno, a tarefa vai aos gerentes ativos e ao Dono.
6. `engine_tick` expira reserva, fila e aceite do Quick sem ninguém abrir tela.
7. Reenvio do mesmo evento não gera segunda tarefa nem segundo aviso.
8. RLS: outro estabelecimento não lê eventos nem tarefas (inclusive por Realtime).
- **Ficou fora:** `Fechamento do dia` (O8), lista de tarefas na tela (O4) e roteamento só para os escalados (O5). `Mesa liberada` só vira tarefa com gente esperando na fila.
