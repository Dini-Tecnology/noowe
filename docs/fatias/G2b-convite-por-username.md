# G2b — Convite para a mesa por @username, com aceite

**Objetivo:** todo usuário tem um `@username` único. Quem está na mesa convida pelo @, e o
convidado **aceita ou recusa** antes de entrar na comanda.
**Depende de:** G1
**Spec:** aditivo à §2.6. Invariantes 3, 7, 8, 9 e 10
**ADRs:** [011](../decisoes/ADR-011-convite-por-username.md) (esta decisão), 007 (lotação)

## Entregáveis

**Banco** (`platform/supabase/migrations/20260928*`)
- `100000_user_invite_enums`: tipos de notificação e enums de estado.
- `101000_profile_username`:
  - `profiles.username` (único, formato fixo), geração automática e backfill;
  - trigger de guarda contra UPDATE direto;
  - RPCs `customer_check_username_availability` e `customer_set_my_username`.
- `102000_table_session_user_invites`:
  - tabelas `table_session_user_invites` e `capacity_requests`, com RLS e publicadas no Realtime;
  - coluna `seat_count`;
  - capability `userInvite` e as colunas de configuração;
  - RPCs do cliente: buscar, enviar, cancelar, aceitar, recusar, listar recebidos, consultar por
    id e listar os convites da mesa;
  - triggers de ciclo de vida.
- `103000_staff_capacity_requests`: `restaurant_list_capacity_requests` e
  `restaurant_resolve_capacity_request`.

**App do cliente**
- Perfil: campo "Seu @" com checagem de disponibilidade. O @ aparece no card do perfil, e o toque
  longo compartilha.
- `components/table/InviteToTableSheet.tsx`:
  - aba "Por @usuário", com busca por prefixo, estado de cada pessoa e a lista dos convites da mesa
    (quem enviou pode cancelar os seus);
  - aba "Por link".
- A sheet abre a partir de Cart (Fine), Fechar Conta e Comanda (Casual), sempre condicionada a
  `guestLink || userInvite`.
- `components/table/IncomingTableInviteBanner.tsx` na Home:
  - Aceitar ou Recusar, com contagem regressiva;
  - estado "aguardando a recepção", com a opção de desistir.
- Notificações: Aceitar ou Recusar só enquanto o convite ainda aceita resposta; depois disso, o
  estado final.
- O toque no push de convite abre Notificações.

**App da equipe**
- "Lotação" no painel do Maître (com contador).
- Tela `CapacityRequestsScreen`:
  - "Aprovar · cadeira extra", "Aprovar · criança de colo" e "Recusar", com observação opcional;
  - o garçom só visualiza.

## Critérios de aceite → testes

| # | Critério | Teste |
|---|---|---|
| 1 | Todo usuário tem @ único, gerado do nome, sem acento, com sufixo em colisão; nunca gera palavra reservada | `tests/11_profile_username.sql` |
| 2 | O @ só muda pela RPC; UPDATE direto é recusado; unicidade não diferencia maiúsculas | `11_profile_username.sql`, `production.usernameProfile.test.tsx` |
| 3 | Só quem está numa mesa ativa busca, só por prefixo do @, sem expor e-mail ou telefone, sem contas inativas ou sem papel `customer` | `12_table_user_invites.sql` §1 |
| 4 | Envio: não convida a si mesmo nem quem já está na mesa; reenvio devolve o mesmo convite (idempotente); notificação e push para o convidado | `12` §2, `production.inviteToTableSheet.test.tsx` |
| 5 | Limites por mesa, por hora e carência depois de recusa vêm da configuração | `12` §2 e §4 |
| 6 | Restaurante sem o recurso: servidor recusa (`P0009`) e o app esconde o botão | `12` §2, `production.inviteEntryPoints.test.tsx` |
| 7 | Aceite entra **na mesma sessão** (invariante 3), é idempotente, avisa quem convidou e fica auditado | `12` §3, `production.incomingTableInvite.test.tsx` |
| 8 | Recusa e cancelamento são idempotentes; convite recusado ou cancelado não entra | `12` §4 |
| 9 | Convite expira pela validade configurada, mesmo sem ninguém consultar antes (expiração preguiçosa gravada) | `12` §5 |
| 10 | Convidado com saldo em outra mesa: `P0004` e o convite continua pendente; sem saldo, troca de mesa depois de confirmar | `12` §6, `production.incomingTableInvite.test.tsx` |
| 11 | Quem convidou saiu, a sessão encerrou ou o convidado entrou pelo QR: o convite se resolve sozinho | `12` §7 |
| 12 | Aceite acima da lotação vira solicitação pendente e auditada, nunca recusa muda nem aprovação automática (invariante 7) | `13_capacity_requests.sql` §1 |
| 13 | Só `capacity_override_roles` + owner decidem; o garçom vê sem decidir; equipe de outro restaurante não vê | `13` §2, `apps/restaurant/src/__tests__/capacityRequests.test.tsx` |
| 14 | Decisão grava autor, motivo, antes e depois em `audit_logs` na mesma transação (invariante 8) | `13` §3 e §4 |
| 15 | Aprovação pela recepção coloca o convidado na mesa e o app o leva ao cardápio via Realtime | `13` §3, `production.incomingTableInvite.test.tsx` |
| 16 | Tabelas novas com RLS e sem escrita direta pelo cliente (invariante 9) | `12` §8, `01_sweep_rls.sql` |

## Fora de escopo

- Checagem de lotação para o link e o QR (fatia G2).
- Aprovação por troca ou junção de mesa (G2/C1).
- Push para a equipe quando surge uma solicitação: a tela atualiza por Realtime.
