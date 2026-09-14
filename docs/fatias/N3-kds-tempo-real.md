# N3 — KDS e tempo real

**Objetivo:** cozinha e bar operando por fila de tickets, com o app do cliente refletindo cada
mudança na hora.
**Depende de:** N2
**Spec:** §2.1 (camada KDS), §2.5 (eventos), §7.3 (resiliência)
**Arquitetura:** `docs/arquitetura/02-realtime-e-rls.md`

## Entregáveis

**Banco**
- Publicação Realtime nas tabelas de pedido e item, com RLS por estação já testada (F1)

**Servidor**
- Canais `establishment:{id}:station:{sid}` e `session:{id}`
- Fila de mutações offline com replay idempotente (spec §7.3)

**KDS**
- Fila de tickets por estação, com timer por ticket e prioridade
- Baixa de item pela estação; tela de expedição que mostra a convergência do pedido
- Reroteamento de carga entre estações (spec §5.3, papel do chef)

**App do cliente**
- Status por item em tempo real; push quando o item fica pronto

## Critérios de aceite

1. O status por item no app reflete a mudança feita na estação **em tempo real**, sem
   recarregar (spec §3.6).
2. A estação do bar não recebe eventos de itens da cozinha (spec §7.3, canais por estação).
3. Com a rede caindo no salão, a comanda é mantida localmente e sincroniza ao reconectar, sem
   duplicar pedido (spec §3.5, §7.3).
4. Pedido pago com KDS offline entra na produção quando o KDS reconecta, **preservando a ordem
   de chegada** (spec §5.5).
5. A tela de expedição só libera um pedido quando ele está `ready` por convergência.

## Fora de escopo

KDS Analytics e SLA por etapa (Fase 4, fatia P2).
