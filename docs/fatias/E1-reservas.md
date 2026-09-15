# E1 — Reservas

**Objetivo:** a porta de entrada controlada de Fine Dining, e a opcional de Casual.
**Depende de:** F3
**Spec:** §3.4 ("reserva e chegada"), §3.2 (etapa 10), §4.4
**ADRs:** 002 (no-show), 008 (política com janela)

## Entregáveis

**Banco**
- `reservations`: `party_size`, `scheduled_at`, `status` (confirmed/seated/waiting/cancelled),
  `phone`, `notes`, `occasion`, `confirmation_code`
- Validação `party_size <= tables.seats` na alocação, ou soma das mesas juntadas (spec §3.4)

**Servidor**
- `reservation_policy` avaliada por janela (ADR-008)
- Job de no-show: após `reservation_no_show_min`, libera a mesa para a fila (spec §3.5)

**App**
- Criar reserva, receber código de confirmação, convidar amigos, compartilhar link da jornada
  (o link em si é G2 — aqui só o ponto de partida)

**Painel (maitre)**
- Agenda, confirmação, registro de restrições, preparação da alocação (spec §3.3)

## Critérios de aceite

1. Reserva com `party_size` maior que a mesa alocada **não permite check-in**; o maitre precisa
   realocar ou juntar mesas antes (spec §2.6).
2. Estados seguem `confirmed → seated | waiting | cancelled`; o check-in muda a mesa para
   `occupied` (spec §3.4).
3. No-show libera a mesa automaticamente após a tolerância configurada, com evento
   `reservation.status_changed` e push ao cliente — nunca em silêncio (spec §3.5).
4. Com `reservation_required` ativo, não existe caminho de consumo sem reserva ou posição de
   fila registrada (spec §3.6).

## Fora de escopo

Check-in propriamente dito (G1) e o convite por link (G2).
