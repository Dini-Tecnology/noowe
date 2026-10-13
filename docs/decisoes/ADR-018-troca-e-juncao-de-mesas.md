# ADR-018 — Troca e junção de mesas

**Status:** PROVISÓRIO (2026-10-14). Origem: regra de produto do check-in por QR (Fine: grupo maior que a
mesa só entra depois de a recepção juntar ou trocar a mesa) e as fatias G2 e C1.
**Impacta:** G2 (exceção de lotação por troca ou junção), C1 (`tables.merged_into_id`), check-in por QR,
link, código e acompanhante, mapa de mesas, Lotação e Reservas do app da equipe.
**Regras isoladas em função nomeada:** `private.table_effective_seats` (única fonte de capacidade),
`private.table_session_headcount`, `private.merged_child_status_after_close`, `private.table_layout_roles`.

## Decisão

1. **Junção de um nível.** Uma mesa filha aponta para a principal (`tables.merged_into_id`). A principal não
   é filha de ninguém. Sessão, reserva, solicitação e `tableId` da visita usam sempre a principal.
2. **Capacidade efetiva** = soma dos `seats` do grupo. Toda checagem lê essa função: QR (Fine e Casual),
   abertura de sessão, link, código, acompanhante, check-in da recepção, solicitação e mapa de mesas.
3. **QR de mesa filha** leva à sessão da principal (uma conta por grupo). O banco recusa sessão ativa em
   mesa filha (P0013) como rede de segurança, igual ao índice de uma sessão por mesa.
4. **Status** da filha acompanha a principal e não muda à mão. A junção termina sozinha quando a sessão
   da principal fecha (pagar, fechar, sair, abandonar); a filha vai para `cleaning`.
5. **Troca de mesa:** move a sessão, os pedidos, a reserva, as solicitações pendentes e os chamados
   abertos; a origem vai para `cleaning`, o destino para `occupied`. `table_sessions.previous_table_id`
   faz o QR da mesa antiga devolver a visita atual (`tableMoved`) em vez de abrir outra sessão.
   Grupo unido não troca: desfaz-se a junção antes (P0014).
6. **Quem reorganiza:** os mesmos papéis que decidem lotação (`capacity_override_roles` e o dono).
7. **Resolução da lotação:** `restaurant_resolve_capacity_request` aceita `troca_de_mesa` (1 mesa) e
   `juncao_mesas` (1 ou mais) com `p_table_ids`, na mesma transação, com `audit_log`.
8. **Mesa da reserva** (`restaurant_assign_reservation_table`): só mesa principal; o grupo tem de caber
   (P0015), senão junta-se antes.
9. **Erros:** P0013 mesa unida a outra · P0014 destino indisponível · P0015 não cabe ("N lugares para M").
10. **Locks (sem deadlock):** `private.lock_floor` (advisory; exclusivo para reorganizar, compartilhado em
    check-in e abertura de sessão) → solicitação → sessão → mesas ordenadas por id.

## Consequências

- Uma junção é uma conta só. Conta dividida por mesa fica para G3.
- O aviso ao cliente da troca é a notificação `table_moved`, que o app escuta em tempo real.
- Revisar com o time: o status da filha ao fechar (`cleaning`), a contagem de pessoas para trocar
  (`greatest(ocupados, declarado, guest_count)`) e se o garçom deve poder trocar mesa.
