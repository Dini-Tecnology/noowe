# ADR-022 — Motor de eventos e tarefas

**Status:** PROVISÓRIO (2026-11-01). Origem: avaliação de perfis de 28/10 (`docs/spec/aditivo-perfis-e-workflows.md`, §1.2 e "Catálogo de eventos").
**Impacta:** fatia O2 (motor), O4 (painéis), notificações, `approvals`, app do restaurante.
**Regras isoladas em função nomeada:** `private.emit_event`, `private.task_audience` (quem recebe junto), `private.task_push_policy` (o que vira push), `private.manager_fallback_roles`.

## Questão

Hoje nada gera tarefa: reserva, fila, chamado e pedido pronto não avisam o perfil responsável. Não existem tabela de
tarefas, log de eventos nem agendador. Existem `notifications` + `send-push-notification`, `audit_logs` e `approvals`.

## Decisão

1. **Eventos no banco, na mesma transação da ação.** `domain_events` é append-only, com RLS por restaurante e chave de
   idempotência (invariante 10). `private.emit_event` é o único ponto de entrada.
2. **Uma linha por tarefa, não por pessoa.** `staff_tasks` guarda o responsável, os papéis que enxergam, `dedupe_key`
   (índice único parcial entre tarefas abertas), prioridade, origem e quem concluiu. Isso entrega "quem agir primeiro
   conclui", "some da tela dos dois" e "chega uma vez só" para quem acumula funções.
3. **A tarefa fecha pelo ato de domínio** (item entregue, mesa liberada), e a conclusão manual usa
   `update ... where status = 'open'` para resolver a concorrência.
4. **Gerente recebe toda tarefa na tela.** Push só para aprovações, atrasos e tarefa sem responsável
   (`private.task_push_policy`); o restante é lista, para não gerar centenas de pushes numa noite cheia.
5. **Sem subida de nível por tempo.** Sem Gerente em turno, a tarefa vai a todos os gerentes ativos e ao Dono.
6. **Reaproveita** `notifications` e `send-push-notification`, com retentativa; `approvals` ganha efeitos reais,
   auditoria, bloqueio de autoaprovação e valor em centavos. `capacity_requests` continua à parte (invariante 7).
7. **Auditoria.** Todo ajuste manual (trocar mesa, trocar garçom) grava `audit_log` com autor, motivo e horário, e o
   motor segue sozinho a partir dele (invariante 8).
8. `staff_tasks`, `approvals` e movimentos de caixa entram na publicação Realtime com teste de RLS entre
   estabelecimentos (invariante 9).

## Consequências

- O catálogo de eventos (PDF p.14–16) vira tabela de regras no servidor; valores em `restaurant_model_configs`/`policies`.
- Pendências 6 e 7 em `PENDENCIAS-perfis-workflows.md`.
