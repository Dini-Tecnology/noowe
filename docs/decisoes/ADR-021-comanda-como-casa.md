# ADR-021 — A comanda é a casa do cliente

**Status:** PROVISÓRIO (2026-10-25). Origem: retorno do cliente de 25/10 (áudio e documento "Conceito"),
a partir de um teste do QR Code na Parrilaria Noowe e no BRNDev Restaurant.
**Impacta:** G1 (sessão, QR, check-in), G2 e G2b (entrada e saída da mesa), G3 (fechamento), E1 (reservas),
E2 (fila), S1 (alerta da equipe), navegação do app cliente, mapa de mesas e configuração do app da equipe.
**Substitui/Complementa:** complementa o ADR-002 (tolerâncias passam a ser usadas de fato) e o ADR-016;
**substitui** o item "sai de lá e entra aqui" do ADR-011, o critério 8 da G2 e o trecho de `spec:175`
(sair da mesa com saldo).
**Regras isoladas em função nomeada:** `private.assert_single_active_session`,
`private.participant_open_balance_cents`, `private.reservation_check_in_window`,
`private.queue_presentation_deadline`, `private.session_idle_since`.

## Questão

QR, Reserva e Fila são hoje fluxos separados, e a comanda não é o ponto de retorno do app: o banner da
mesa leva à página do restaurante, toda entrada cai no cardápio e o "voltar" depende do histórico.
O cliente definiu que a comanda é o estado em que o cliente vive dentro do restaurante.

## Decisão

1. **A comanda é o destino de retorno.** Enquanto ativa, todo caminho leva a ela: Home, barra fixa
   "Voltar à comanda", página do restaurante, push, reabertura do app e novo escaneamento. O "voltar" de
   cardápio, status, chamado e conta retorna à comanda, nunca à página do restaurante.
2. **QR, Reserva e Fila são portas.** Todas terminam na mesma tela de boas-vindas e depois na comanda.
3. **A comanda ativa vem do servidor** (vínculo cliente–mesa), nunca do histórico de navegação.
4. **Uma comanda ativa por cliente.** Com comanda ativa, o servidor recusa QR de outra mesa, convite,
   entrada na fila e check-in de reserva. Mensagem: "Você já está na {mesa} da {restaurante}. Encerre a
   comanda para continuar." *(Substitui o ADR-011: não há mais troca silenciosa de mesa.)*
5. **Restaurante fechado:** QR e Fila ficam desabilitados com "Abre às HH:MM"; só Reservar fica ativo; a
   lotação não é exibida.
6. **Sair da mesa** só sem consumo ou com a parte da pessoa paga. Com saldo, o botão vira "Pagar minha
   parte". *(Substitui `spec:175` e G2 crit. 8. O código já bloqueava; o saldo passa a ser por pessoa
   e a considerar `bill_shares`.)*
7. **Encerramento:** automático com a conta 100% paga; manual pelo restaurante com **motivo obrigatório** e
   auditoria na mesma transação. **Nunca por tempo.** Comanda parada gera alerta à equipe, que decide.
   *(Remove o auto-encerramento de 6 horas.)*
8. **Reserva:** check-in disponível `reservation_check_in_lead_min` (5) antes do horário até a tolerância de
   atraso do restaurante (`reservation_no_show_min`). Passada a tolerância, a reserva expira e o cliente
   pode entrar na fila. Check-in sem mesa pronta fica em espera curta.
9. **Fila:** a comanda abre quando o cliente se apresenta dentro de `queue_call_tolerance_min`. Mantém o
   ADR-002: a primeira falta recua uma posição, a segunda tira da fila.
10. **Entrada em mesa ocupada** continua sem aprovação do anfitrião; acima de `tables.seats` vira
    solicitação ao maître (invariante 7).
11. **Valores** (5 min, tolerâncias, tempo de alerta) vivem em `restaurant_model_configs`, não no código.

## Por quê

O cliente precisa ter um único lugar para acompanhar pedido e conta. Um estado "estou numa experiência"
persistido no servidor evita comportamentos diferentes entre push, link, reinstalação e outro celular.

## Consequências

- A fatia [G4](../fatias/G4-comanda-casa.md) reúne o trabalho; cada critério vira teste.
- Testes pgTAP 08, 12, 25 e 26, que esperam a troca de mesa, mudam.
- Não há pg_cron: expirações e alerta de comanda parada são varreduras preguiçosas.
- Revisar com o time: o texto exato das mensagens, o comportamento da reserva futura em outro restaurante
  enquanto há comanda ativa (permitida) e a espera curta após check-in sem mesa pronta.
