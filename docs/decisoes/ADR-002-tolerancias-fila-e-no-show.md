# ADR-002 — Tolerâncias de fila e no-show

**Status:** ACEITO (2026-09-14) — defaults mantidos como ponto de partida, por delegação à recomendação técnica; recalibrar com dados de operação (ver Consequências)
**Origem:** spec §8.1, segunda decisão em aberto
**Impacta:** Fatia E1 (reservas), Fatia E2 (fila virtual)

## Questão

A spec diz que as tolerâncias são "configuráveis por estabelecimento" mas não define valores.
Sem default, cada tela inventa o seu.

## Decisão proposta

Três parâmetros distintos em `establishment_config`, com estes defaults:

| Parâmetro | Default | O que acontece ao estourar |
|---|---|---|
| `queue_call_tolerance_min` | 8 min | Grupo cai para a próxima posição, com aviso no app |
| `queue_second_call_behavior` | `drop` | Na segunda perda, sai da fila (spec §4.5) |
| `reservation_no_show_min` | 15 min | Mesa liberada automaticamente para a fila (spec §3.5) |

## Por quê

8 minutos é o intervalo em que um cliente notificado por push consegue se apresentar se já
estiver no local ou nas imediações — que é a premissa da fila virtual. Abaixo disso a fila
descarta grupos legítimos; acima, o giro de mesa trava esperando quem não vem.

15 minutos para no-show de reserva é a prática corrente em serviço à mesa e dá margem para
atraso de trânsito sem sacrificar a mesa do turno.

Os dois **precisam ser parâmetros separados**: a tolerância da fila é medida em minutos de
espera ativa com o cliente já mobilizado; a da reserva é medida contra um horário marcado com
antecedência. Unificá-las num único número é o erro fácil aqui.

## Consequências

- O contador precisa ser server-side. Timer no cliente é manipulável e dessincroniza.
- Ao estourar, o evento é `queue.position_changed` ou `reservation.status_changed` — a mesa não
  é liberada por um job silencioso sem notificar o cliente.
- Estes valores serão recalibrados com dados reais; a fatia E2 deve registrar tempo real de
  apresentação por chamada para permitir essa calibração.
