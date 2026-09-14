# ADR-007 — Exceção de lotação e contagem de assentos

**Status:** ACEITO (2026-09-14) — default mantido; escolha delegada pelo responsável do produto à recomendação técnica do plano de aderência
**Origem:** spec §8.1, sétima decisão em aberto ("se crianças de colo contam como assento e
quem pode aprovar exceções")
**Impacta:** Fatia G1 (check-in), Fatia G2 (capacidade)

## Questão

`occupiedSeats` conta pessoas ou lugares ocupados? Uma criança de colo ocupa assento? Quem
aprova quando estoura?

## Decisão proposta

**`seat_count` é por participante e default 1; criança de colo entra com `seat_count = 0`.**

1. `session_participants.seat_count` (inteiro, default 1). Criança de colo, `0`.
2. `occupied_seats` da sessão é `SUM(seat_count)` dos participantes ativos — não a contagem de
   linhas.
3. A verificação continua sendo `occupied_seats + novo_seat_count <= tables.seats`.
4. **Toda entrada acima da capacidade gera solicitação, sempre.** Não existe caminho em que o
   sistema aprove sozinho, nem quando `seat_count = 0`. O que muda com o `seat_count` é o
   cálculo, não a existência da aprovação.
5. Motivo tipado na aprovação: `crianca_colo`, `cadeira_extra`, `juncao_mesas`,
   `troca_de_mesa`, `recusado`.
6. `capacity_override_roles` default `['maitre','gerente']`. O garçom **não** aprova por
   default — ele vê a solicitação, mas a decisão de lotação é de quem controla o mapa de salão.

## Por quê

Tratar criança de colo como `seat_count = 0` em vez de "não é participante" mantém a pessoa
visível na mesa: ela precisa aparecer para o garçom (cadeirão, cardápio kids, alergia — spec
§4.4 modo família) mesmo não ocupando assento. Removê-la da contagem apagando-a do modelo
perderia isso.

Manter a aprovação obrigatória mesmo com `seat_count = 0` é o que sustenta o critério de aceite
da spec §4.6: "o grupo nunca ultrapassa a capacidade da mesa sem decisão explícita da recepção,
registrada em auditoria".

## Consequências

- A UI de convite precisa perguntar o `seat_count` de forma humana ("essa pessoa vai ocupar um
  lugar?"), não pedir um número.
- A solicitação pendente tem TTL: sem resposta em N minutos, o convidado vê uma tela explicando
  que precisa falar com a recepção — nunca uma espera infinita numa tela de carregamento.
