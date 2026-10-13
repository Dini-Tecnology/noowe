# ADR-016 — Casual Dining abre a mesa pelo QR, sem reserva

**Status:** PROVISÓRIO (2026-10-13). Origem: bug do Teste 4 da validação ("Reserva necessária" ao escanear o QR
no Casual) e a regra de produto do Casual: o QR da mesa é a chave de entrada.
**Substitui parcialmente:** ADR-008, na parte "vale para Fine e Casual" da trava de origem da sessão.
**Impacta:** Fatia G1 (critério 3), UC-01, `private.table_check_in`, fila do maître (ADR-007)
**Regras isoladas em função nomeada:** `private.check_in_requires_booking` (quem exige reserva/fila para abrir a
mesa), `private.walk_in_needs_host_approval` (fila ativa vira decisão do maître); a lotação segue em
`private.table_session_capacity_check`.

## Questão

A spec se contradizia. O texto do Casual (§4, §3.4, critério de aceite do QR em dois toques) diz que ler o QR faz
o check-in, abre a sessão e habilita o convite; UC-01, o fluxograma e o ADR-008 exigiam reserva ou chamada da fila
também no Casual. A implementação seguiu a segunda leitura e barrava todo walk-in.

## Decisão

1. **Fine Dining:** continua exigindo reserva confirmada ou chamada da fila (`reservation_required`).
2. **Casual Dining:** o QR abre a mesa sem reserva. O primeiro a ler vira anfitrião; quem lê depois **entra na sessão
   existente** (invariante 3), sem exigir reserva ou fila.
3. **Tamanho do grupo:** quem abre a mesa informa quantas pessoas são (`table_sessions.declared_party_size`). Acima de
   `tables.seats` (com `enforce_table_capacity`), a abertura vira solicitação ao maître.
4. **Fila ativa:** se há grupos `waiting` na fila virtual, um walk-in sem reserva nem chamada **não abre a mesa
   sozinho**: vira solicitação ao maître. Quem tem reserva ou foi chamado passa direto.
5. **Solicitação de abertura** (`capacity_requests.request_kind = 'open'`, sem sessão): o maître libera
   (`walk_in_liberado`, `cadeira_extra`, `crianca_colo`) ou recusa; a decisão grava `audit_logs` na mesma transação.
   Liberada, o cliente abre a mesa por `customer_check_in_approved` (pela notificação) ou reescaneando o QR, uma vez
   só e dentro do TTL da configuração.
6. A trava do banco `session_needs_entry_origin` (ADR-008) vale **só para o Fine**.

### Fine Dining no mesmo check-in (regra de produto de 2026-10-13)

7. O tamanho do grupo vem da reserva ou da fila (`party_size`); o app **não pergunta** quantas pessoas
   (`customer_resolve_service_qr.asksPartySize = false`).
8. Grupo maior que a mesa **não entra**: o check-in é recusado (P0011) até a recepção juntar ou trocar a
   mesa. Não existe solicitação de "cadeira extra" no Fine; vale também para quem entra numa mesa já lotada.
9. Convidado que aceitou o convite da reserva (`reservation_guests`) tem associação válida com a mesa: seu
   scan entra na sessão do titular, inclusive depois do check-in dele (reserva `seated`).

### Quick Service

10. QR de mesa em restaurante só de retirada é recusado com motivo próprio (P0012); o pedido é pelo app ou
    pelo QR de balcão (ADR-013).

Regras isoladas: `private.check_in_party_from_entry`, `private.over_capacity_blocks_check_in` (lidas da
policy, hoje `reservation_required`).

## Consequências

- A ocupação continua sendo a soma de `seat_count`; o tamanho declarado só vale na abertura.
- O atalho de mesa de teste do emulador continua dispensando as travas de entrada.
- Revisar com o time: o comportamento de fila ativa (item 4) e o teto de "acima de seats" para grupos grandes.
