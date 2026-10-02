# ADR-015 — Vários donos por restaurante e vários restaurantes por dono

**Status:** ACEITO (2026-10-01). Pedido do cliente na rodada de validação de 27/09 (retorno de 29/09):
"um restaurante pode ter mais de 1 dono e 1 dono pode ser dono de vários restaurantes; não pode ser uma trava".
**Origem:** testes manuais no app do restaurante (equipe e cadastro)
**Impacta:** equipe e cadastro de restaurante (app do restaurante), RLS e RPCs de equipe, `create_my_restaurant`
**Regras isoladas em função nomeada:** `private.user_roles_owner_guard` (quem pode conceder/revogar dono e o
mínimo de um dono), `private.user_roles_owner_after` (efeitos e auditoria), `assignableRoles` / `canManageMember`
(o que a tela oferece)

## Questão

O banco nunca impediu (`user_roles` é único por usuário + restaurante + papel), mas três travas de aplicação
impediam o uso real: o seletor de função e as RPCs de equipe não tratavam "dono" como atribuível;
`create_my_restaurant` devolvia o primeiro restaurante de quem já era dono em vez de criar outro (e o app
então sobrescrevia o endereço dele); e não havia caminho no app para quem já tinha restaurante cadastrar outro.
Além disso, as RPCs de equipe (`security definer`) deixavam um **gerente** conceder ou revogar o papel de dono.

## Decisão

- **Qualquer dono ativo** adiciona outro dono (vinculando uma conta que já existe) e pode remover outro dono.
  Gerente nunca concede, altera ou remove dono. O dono não altera nem remove o próprio vínculo.
- A regra mora em **trigger em `user_roles`**, e não nas RPCs, para valer em qualquer caminho de escrita
  (RPC, RLS, SQL direto): só dono (ou admin do app) muda dono; o restaurante **nunca fica sem dono ativo**;
  a saída de um dono passa `restaurants.owner_id` para outro dono ativo e desativa o papel de dono em
  `profile_roles` (`has_restaurant_role` também lê essas duas fontes — sem isso, quem saiu manteria acesso).
- Conceder e revogar dono gravam `audit_logs` (autor, motivo, antes/depois) na mesma transação (invariante 8).
- Remoções em cascata (restaurante ou conta apagados) e o trigger que cria o papel de dono no restaurante novo
  não passam pelos guardas (`pg_trigger_depth() > 1`); escritas sem usuário (migration, service role) também não.
- `create_my_restaurant` cria **um restaurante novo a cada chamada**. A idempotência (invariante 10) vem de
  `p_request_id`, que o app gera uma vez por abertura da tela; a mesma chave devolve o mesmo restaurante.
  Coluna `restaurants.creation_request_id` com índice único `(owner_id, creation_request_id)`.
- Dono cadastra outro restaurante pelo app (Conta → "Cadastrar novo restaurante", ou pelo seletor de
  restaurantes); o novo vira o restaurante em uso. Quem é gerente e dono do mesmo restaurante entra como dono.
- A edge function `create-staff-user` **não** cria donos: ela grava com a service role, sem usuário no banco,
  e o dono precisa passar pelo trilho com auditoria. Um novo dono é vinculado depois de ter conta.

## Consequências

- Remover o último dono é recusado com mensagem clara; para sair de um restaurante, outro dono precisa existir.
- A política `restaurants_delete_owner` passa a aceitar qualquer dono, não só o de `owner_id`.
- App antigo (sem `p_request_id`) continua funcionando: a chave é opcional, só perde a proteção contra
  duplo envio.
