# ADR-011 — Convite para a mesa por @username, com aceite

**Status:** ACEITO (2026-09-26). Pedido do responsável do produto; as quatro escolhas abaixo foram
confirmadas por ele.
**Origem:** pedido de produto; é aditivo à spec §2.6 (GuestLink)
**Impacta:** Fatia G2 (convite e capacidade), Fatia G1 (sessão de mesa), Fatia F3 (configuração)
**Fatia:** [G2b](../fatias/G2b-convite-por-username.md)

## Questão

A spec §2.6 define três formas de entrar numa sessão de mesa: o QR físico, o link de convite e o
código curto. Nas três, **quem recebe entra direto**. O produto pediu uma forma nova:

- todo usuário tem um identificador público único (`@bruno-de-castro`);
- quem está na mesa convida outra pessoa pelo @;
- **o convidado precisa aceitar** antes de ser vinculado à comanda.

## Decisão

**O convite por @ é um canal a mais. Ele convive com o link e com o QR e não substitui nenhum dos
dois.**

Escolhas do responsável do produto:

| Tema | Escolha |
|---|---|
| Link de convite atual | Continua. Na UI, o @ é o caminho principal |
| Como o usuário ganha o @ | Gerado a partir do nome no cadastro (e para as contas antigas); editável no perfil |
| Quem pode convidar | Qualquer participante da mesa que tenha conta (acompanhante não) |
| Aceite acima da lotação | Vira solicitação para a recepção (invariante 7, ADR-007) |

### Username

- Formato: `^[a-z0-9]+(-[a-z0-9]+)*$`, com 3 a 30 caracteres. O valor é guardado já normalizado, e
  por isso um `UNIQUE` simples já dá unicidade sem diferenciar maiúsculas.
  - Esses limites são de **formato** do identificador, não regra de negócio parametrizável. Ficam
    na CHECK constraint `profiles_username_format`.
- Geração: `private.generate_unique_username`.
  - Parte do nome sem acento. Colisão vira `-2`, `-3`… Sem nome, usa a parte local do e-mail; sem
    nenhum dos dois, `usuario-xxxxxx`.
  - Palavras reservadas ficam em `private.reserved_usernames`.
- É **estável**: não acompanha mudanças posteriores do nome.
- Só muda pela RPC `customer_set_my_username`. O trigger `profiles_guard_username` recusa UPDATE
  direto via REST, porque a política `profiles_update_own` permitiria.

### Convite

- Estados:
  - `pending`;
  - `awaiting_capacity`: o convidado aceitou, mas a mesa estourou;
  - `accepted`;
  - `declined`: recusado pelo convidado;
  - `cancelled`;
  - `expired`;
  - `capacity_rejected`: recusado pela recepção, que é diferente da recusa do convidado.
- `closed_reason` explica os encerramentos que não vieram de uma resposta:
  - `inviter_cancelled`, `inviter_left`, `session_closed`, `feature_disabled`;
  - `ttl`, `capacity_ttl`;
  - `joined_otherwise`, `joined_other_table`.
- **Envio idempotente.** Um índice único parcial permite só um convite em aberto por (sessão,
  convidado); reenviar devolve o mesmo convite.
- **Aceite idempotente e dentro da sessão existente** (invariante 3). O aceite trava o convite, a
  sessão e a linha de `tables`, o que serializa aceites concorrentes numa mesa quase cheia.
- **Aceitar e recusar devolvem `{status}` em vez de levantar erro.** Um `raise` desfaria a gravação
  da expiração preguiçosa, e não há `pg_cron`.
  - As exceções são falha de autenticação, convite alheio (`P0002`) e saldo em aberto em outra mesa
    (`P0004`). Nesses casos o convite continua `pending` de propósito.
- **Convidado em outra mesa:** vale a mesma regra do QR. Com saldo em aberto lá, `P0004`; sem
  saldo, sai de lá e entra aqui. Quem convida não fica sabendo da outra mesa.
- **Ciclo de vida por trigger:**
  - quem convidou saiu: convites pendentes dele caem com `inviter_left`;
  - a sessão deixou de estar ativa: tudo em aberto expira com `session_closed`;
  - o convidado entrou por QR ou link: o convite da mesma mesa vira `accepted/joined_otherwise`.
- **Privacidade da busca:**
  - busca só por **prefixo do @**, nunca por nome, e só quem está numa mesa ativa com o recurso
    ligado pode buscar;
  - devolve apenas @, nome curto ("Bruno C.") e avatar, nunca e-mail ou telefone;
  - exclui contas inativas, contas em exclusão e contas sem papel `customer`;
  - para quem não pode receber convite, o erro é sempre o mesmo `P0002` genérico.
- **Anti-spam:** limite de convites em aberto por mesa, de envios por hora por pessoa e carência
  depois de uma recusa.

### Parametrização (`restaurant_model_configs`)

| Coluna | Default | Uso |
|---|---|---|
| `user_invite_enabled` | `true` | Capability `userInvite` (modelos com mesa) |
| `user_invite_ttl_min` | 30 | Validade do convite |
| `user_invite_max_pending_per_session` | 10 | Convites em aberto por mesa |
| `user_invite_max_per_inviter_hour` | 20 | Envios por pessoa por hora |
| `user_invite_redecline_cooldown_min` | 60 | Carência depois de uma recusa |
| `user_search_min_chars` | 3 | Mínimo de caracteres da busca |
| `user_search_limit` | 10 | Máximo de resultados da busca |
| `capacity_request_ttl_min` | 15 | Espera máxima pela decisão da recepção |

### Lotação (ADR-007)

- `table_session_participants.seat_count` tem default 1. Acompanhantes também contam.
- A regra está isolada em `private.table_session_capacity_check`, e a fatia G2 vai reaproveitá-la
  no QR e no link.
- A tabela `capacity_requests` foi criada com o mínimo necessário:
  - toda a equipe da unidade vê as solicitações;
  - decide quem está em `capacity_override_roles`, mais o owner;
  - as decisões possíveis agora são `cadeira_extra`, `crianca_colo` e `recusado`. Troca e junção de
    mesa ficam para a G2.
- Toda decisão grava autor, motivo e horário em `audit_logs` na mesma transação (invariante 8).

## Por quê

- **Aceite explícito.** O link coloca na comanda quem o recebe, inclusive se ele for repassado a
  outra pessoa. Com o @, o convidado confirma antes de entrar, e quem convida vê a resposta.
- **Canal aditivo.** Manter o link e o QR preserva a §2.6 e a jornada de quem ainda não tem conta
  (ADR-006).

## Consequências e divergências registradas

- O link (`customer_join_table_invite`) e o QR (`customer_open_table_session`) **ainda não passam
  pela checagem de lotação** nem pelo `seat_count`. É uma divergência conhecida da §2.6 e do
  invariante 7, e fica para a fatia G2. O convite por @ já cumpre essas regras.
- `customer_leave_table_session` passou a delegar para `private.leave_table_session_as(sessão,
  usuário)`, porque a recepção precisa tirar o convidado da mesa antiga ao aprovar a entrada. O
  comportamento é o mesmo e está coberto pelo teste `08_simulated_table_checkout.sql`.
- O app só mostra o recurso quando a capability `userInvite` vem do servidor. Um servidor anterior a
  esta mudança devolve um contrato sem a chave. Nesse caso o parser do cliente rejeita **o contrato
  inteiro** (fail closed), e todas as capabilities ficam desligadas, não só esta. **Ordem de deploy
  obrigatória: banco antes do app.**
