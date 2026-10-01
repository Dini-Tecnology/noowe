# G2 — Convite por link e validação de capacidade

**Objetivo:** o motor que a spec chama de coração da jornada em grupo — quem está na mesa, como
alguém entra, e até quantos cabem.
**Depende de:** G1
**Spec:** §2.6 inteira (entidades, como o convite funciona, regras de capacidade, eventos, UC-01..06)
**ADRs:** 006 (convidado sem conta), 007 (assentos e exceção)

> **Já entregue pela fatia [G2b](G2b-convite-por-username.md) (ADR-011):**
> - `capacity_requests` mínima, com `source = 'user_invite'`;
> - `table_session_participants.seat_count`;
> - a regra única `private.table_session_capacity_check`;
> - a tela "Lotação" no app da equipe, com aprovação por cadeira extra ou criança de colo e recusa.
>
> **Ainda falta aqui:**
> - passar o link e o QR por essa mesma checagem (hoje entram sem checar lotação, divergência
>   registrada no ADR-011);
> - ampliar `source`;
> - resolver por troca ou junção de mesa.

## Entregáveis

**Banco**
- `guest_links` com `token_hash`, `short_code_hash`, `expires_at`, `max_uses`, `uses`, `revoked_at`
- `capacity_requests` com motivo tipado e `expires_at`
- `session_participants.seat_count` (ADR-007)

**Servidor**
- Edge Function de entrada por código curto, com **rate limit** (5 tentativas, backoff) — a
  tabela nunca é exposta a `select` direto (spec §7.2)
- `occupied_seats = SUM(seat_count)` dos participantes ativos
- Entrada automática enquanto `occupied_seats < capacity`; ao atingir, gera `capacity_request`
- Eventos: `guest_link.created`, `participant.joined`, `participant.join_blocked`,
  `participant.left`

**App (anfitrião)**
- Gerar convite: link, QR na tela do próprio celular, código de 6 dígitos
- **Aviso explícito** de que o anfitrião responde pelo saldo não pago de convidados sem conta
  (ADR-006)

**App (convidado)**
- Abrir link, autenticar ou entrar com nome, escolher o próprio nome na mesa
- Convite expirado abre **tela explicativa**, nunca sessão nova (spec §2.6)

**Painel (maitre)**
- Fila de exceções de lotação: aprovar, trocar mesa, juntar mesas ou recusar

## Critérios de aceite

1. O link compartilhado pelo titular coloca o convidado **na mesma comanda**, sem criar nova
   sessão (spec §3.6).
2. Ler o QR físico produz exatamente o mesmo resultado do link (spec §2.6).
3. Tentativa de entrada acima da capacidade gera exceção para o maitre e **nunca entra em
   silêncio** (spec §3.6, §4.6).
4. A decisão do maitre fica registrada em auditoria com autor, motivo e horário (UC-05).
5. Todo item pedido carrega `participant_id` (spec §2.6) — é a pré-condição de G3.
6. Convite expira ao encerrar a conta, ao ser revogado pelo anfitrião, ou após
   `guest_link_ttl_min`.
7. Força bruta no código de 6 dígitos é bloqueada após 5 tentativas; tentativas ficam
   registradas.
8. Convidado que sai antes do pagamento: o saldo volta para a mesa e fica sinalizado ao garçom
   (spec §2.6).
9. Gerar o convite a partir da mesa leva **no máximo dois toques** (spec §4.6).

## Fora de escopo

Os modos de divisão (G3). Junção de mesas para festas (C1) — aqui só a troca/junção como
resolução de exceção.
