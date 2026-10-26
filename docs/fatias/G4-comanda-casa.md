# G4 — Comanda como casa do cliente

**Objetivo:** a comanda é o estado central da experiência. QR, Reserva e Fila são portas de entrada;
o app sempre leva de volta à comanda enquanto ela estiver ativa.
**Depende de:** G1, G2, G3, E1, E2, S1
**Spec:** aditivo à §2. Invariantes 3, 7, 8 e 10
**ADRs:** [021](../decisoes/ADR-021-comanda-como-casa.md) (esta decisão), 002, 011, 016, 018

## Entregáveis

**Banco** (`platform/supabase/migrations/2026102512*`)
- `private.assert_single_active_session`, usada em QR, convite (link, código e @), fila e check-in de reserva.
- `revoke` de `customer_open_table_session`; remoção do auto-encerramento de 6 horas.
- `private.participant_open_balance_cents` e `customer_my_table_balance`; a saída da mesa passa a usá-los.
- `customer_get_active_visit` devolve modelo, nomes, `billingStatus` e solicitação pendente.
- `restaurant_close_table_session(p_session_id, p_reason)` com motivo, `ended_at`, `log_audit` e aviso ao cliente.
- `restaurant_open_table_session` recusa mesa com sessão ativa.
- Janela de check-in da reserva, expiração preguiçosa, prazo de apresentação da fila.
- `restaurant_get_tables` com origem da sessão e `idleSince`; varredura de comanda parada.
- Colunas `reservation_check_in_lead_min` e `session_idle_alert_min`; `restaurant_update_room_policy`.

**App do cliente:** `navigation/comanda.ts`, `TableWelcome`, `ActiveTableBar`, estados da página do restaurante,
"Pagar minha parte", retomada no cold start e via push, cartões de reserva e fila.

**App da equipe:** chip de origem, selo de parada, motivo ao encerrar, status e valor pago por pessoa, política do salão.

## Critérios de aceite

1. Tocar na mesa na Home ou na barra fixa abre a comanda, não a página do restaurante.
2. O "voltar" de cardápio, pedido, chamado e conta retorna à comanda.
3. Com comanda ativa aqui, a página do restaurante esconde as três portas e mostra "Ver minha comanda".
4. Reabrir o app, tocar em push e reescanear a mesma mesa levam à comanda ativa.
5. Com comanda ativa, QR de outra mesa, convite, fila e check-in de reserva são recusados no servidor.
6. Restaurante fechado: QR e Fila desabilitados com "Abre às HH:MM", só Reservar ativo, sem lotação.
7. Sair da mesa é bloqueado com saldo em aberto da pessoa (inclusive considerando `bill_shares`) e vira "Pagar minha parte".
8. A comanda nunca encerra por tempo; comanda parada gera alerta único à equipe.
9. Encerramento manual exige motivo e grava `audit_log` na mesma transação.
10. Check-in da reserva abre 5 min antes e fecha ao fim da tolerância; depois a reserva expira.
11. A fila abre a comanda só se o cliente se apresentar dentro da tolerância; carrega os pedidos da espera.
12. O mapa de mesas mostra a origem (QR, reserva com nome, fila) e a mesa só fica livre ao encerrar.
13. Sem internet, a comanda continua visível e nenhum pedido é perdido ou duplicado.
