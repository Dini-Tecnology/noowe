# ADR-023 — Agendador com pg_cron

**Status:** ACEITO (2026-11-01) — escolha do responsável do produto nesta sessão.
**Substitui:** o trecho "não há pg_cron" dos ADR-011, ADR-013 (§2.3, lembretes) e ADR-021 (consequências).
**Impacta:** fatia O2, `private.reservation_expire_sweep`, `private.queue_expire_sweep`, `private.quick_service_sweep`, `private.session_idle_sweep`.
**Regras isoladas em função nomeada:** `private.engine_tick`.

## Questão

Expirações (no-show, chamado da fila, aceite do Quick, comanda parada) rodam hoje só quando alguém abre uma tela, e
só no escopo do cliente que abriu. O motor precisa de eventos por tempo: alerta na metade da tolerância, "não confirmada"
em 24 h, pedido agendado entrando no KDS na hora certa.

## Decisão

- Habilitar `pg_cron` com um tick por minuto chamando `private.engine_tick()`, no próprio Postgres, na mesma
  transação do estado e do `audit_log`.
- `engine_tick` chama as varreduras existentes em escopo **global** (todos os restaurantes) e cada regra por tempo do
  motor. Cada varredura continua idempotente, então chamar também de forma preguiçosa (como hoje) segue seguro.
- O job só avança estado e emite eventos; push continua pela Edge Function.

## Consequências

- Lembretes de retirada deixam de depender do app aberto (ADR-013, ponto em aberto 3).
- Ativar a extensão no projeto Supabase de produção é ação humana (documentar em `ACOES_HUMANAS_PUBLICACAO.md`).
- Testes pgTAP chamam `engine_tick` direto, sem esperar o relógio.
