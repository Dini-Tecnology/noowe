# ADR-025 — Várias funções por pessoa e permissões reduzidas

**Status:** PROVISÓRIO (2026-11-01). Origem: aditivo §6 e §7.3 (Equipe).
**Complementa:** ADR-015 (vários donos e restaurantes). **Impacta:** fatia O3, `user_roles`, `shifts`, `pickRestaurantRole`, `RestaurantTabBar`.
**Regras isoladas em função nomeada:** `private.user_effective_roles`, `private.role_permission_set`, `pickRestaurantRoles` (app), `private.assert_not_self_approval`.

## Decisão

1. O schema já admite várias linhas em `user_roles` por restaurante; o app passa a usar **todas** (hoje só a de maior
   precedência), com uma **função principal** que define a tela de abertura.
2. Painel unificado: tarefas de todas as funções com etiqueta e filtro; abas sem repetição; permissões somadas.
3. Escala por pessoa **e por função**: `shifts` ganha função, área e estação. Só quem está escalado como Garçom entra
   na atribuição de mesa; o rateio usa a função escalada.
4. Regras: ninguém aprova o próprio pedido; caixa fechado por quem recebeu dinheiro avisa o Dono; tarefa repetida
   chega uma vez só (`dedupe_key`, ADR-022).
5. Só o Dono concede ou altera as funções Dono e Gerente, em qualquer caminho. O gatilho do ADR-015 só cobria Dono: um
   Gerente criava outro Gerente pelas RPCs e pela função de borda. `private.user_roles_grant_guard` fecha isso, e toda
   mudança de função vai para `audit_logs`.
6. **Recepcionista** é o perfil Maître com permissões reduzidas (sem aprovar reserva nem isentar no-show), definidas
   pelo Dono ou Gerente em `role_permission_overrides`, com RLS correspondente no servidor.
7. Balcão do Quick: aba extra por padrão; substitui "Ao Vivo" do Garçom só sem serviço de mesa (pendência 5).
8. Novo membro entra por convite por e-mail ou link, sem senha provisória (`staff_invites`). A função de borda
   `create-staff-user` fica publicada só para versões antigas do app, e a tela não oferece mais.

## Consequências

- O app só esconde; quem barra é a RLS/RPC. Toda permissão reduzida precisa de teste no banco.

## Decisões provisórias da implementação (04/11/2026)

A spec não define estes pontos. Cada um está isolado e entra na lista de pendências para o Pedro (40 a 45).

- **Etiqueta e filtro:** como a aba de tarefas é da O4, quem acumula funções vê um painel simples na tela inicial. Quem tem
  uma função não vê mudança. Concluir e assumir na tela ficam para a O4.
- **"Isentar no-show":** a taxa está oculta (resposta 10), então hoje a permissão só barra reverter um no-show.
- **Recepcionista:** não aprova nem recusa reserva, porque a linha do PDF diz "aprovar, recusar".
- **Gerente e outro Gerente:** o texto só diz "concede". Só o Dono altera ou inativa um Gerente, e o Gerente também não altera
  a própria função de Gerente.
- **Convite:** vale 7 dias (`noowe_billing_settings.staff_invite_days`). Com e-mail, só para quem confirmou esse e-mail; sem e-mail, o código
  serve para quem o tiver. Quem convidou precisa ainda ter a função na hora do aceite.
- **Função principal:** define só a tela de abertura; o Dono pode ter outra principal. Dono e Gerente definem, dentro do que
  cada um pode conceder.
- **Inativar e reativar:** valem para a pessoa inteira na unidade. Tirar uma função é na edição e apaga a linha.
- **Quem não pode alterar uma função da pessoa não mexe nas outras:** um Gerente não dá funções ao Dono, a outro Gerente nem a si
  mesmo, e não troca a principal deles.
- **Duas funções no mesmo horário:** uma linha de escala por função, com sobreposição permitida; área e estação são opcionais.
- **Aviso de caixa:** avisa o Dono quando quem lançou dinheiro desde a abertura fecha o caixa. Lê o log do motor em
  `private.cash_closed_by_receiver`; a O8 troca a fonte e precisa seguir chamando essa função.
- **Fica para depois:** Maître e Chef verem a escala (matriz do PDF) e a aba Balcão (O7).

