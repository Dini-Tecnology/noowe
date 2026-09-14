# E2 — Fila virtual e consumo durante a espera

**Objetivo:** a porta de entrada padrão de Casual Dining, e o fallback controlado de Fine.
**Depende de:** F3, N2
**Spec:** §4.4 ("lista de espera inteligente"), §3.4, §4.2 (etapa 4)
**ADRs:** 002 (tolerâncias)

## Entregáveis

**Banco**
- `queue_entries`: `party_size`, `preferences jsonb` (área, mesa infantil, acessibilidade),
  `position`, `called_at`, `tolerance_expires_at`
- Vínculo de pedidos feitos na espera ao `queue_entry`, para migração posterior à comanda

**Servidor**
- Motor de posição: recálculo contínuo conforme mesas são liberadas (spec §4.4)
- Evento `queue.position_changed` e push ao chegar a vez
- Tolerância e queda de posição (ADR-002); segunda perda sai da fila (spec §4.5)
- **Migração de consumo:** itens pedidos na espera entram na comanda da mesa quando ela é
  atribuída, sem relançamento (spec §4.6)

**App**
- Entrar na fila remotamente, antes de chegar ao restaurante
- Acompanhar posição em tempo real; pedir bebidas e entradas durante a espera

**Painel**
- Fluxo de salão: fila, estimativa, chamada do próximo grupo

## Critérios de aceite

1. A posição na fila muda no app **sem recarregar a tela** e dispara push quando a mesa fica
   pronta (spec §4.6).
2. Itens pedidos durante a espera aparecem na comanda da mesa após a alocação, **sem
   relançamento** (spec §4.6).
3. Grupo que não se apresenta cai para a próxima posição e, na segunda vez, sai da fila com
   aviso no app (spec §4.5).
4. Grupo que desiste após consumir na espera tem o consumo convertido em conta de balcão e
   permanece cobrável (spec §4.5).
5. Em Fine Dining, a fila só oferece posição quando não há mesa compatível com o tamanho do
   grupo (spec §3.4).

## Fora de escopo

O check-in em si (G1). A junção de mesas para festas (C1).
