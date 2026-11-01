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
5. Só o Dono concede as funções Dono e Gerente (já garantido por trigger no ADR-015).
6. **Recepcionista** é o perfil Maître com permissões reduzidas (sem aprovar reserva nem isentar no-show), definidas
   pelo Dono ou Gerente em `role_permission_overrides`, com RLS correspondente no servidor.
7. Balcão do Quick: aba extra por padrão; substitui "Ao Vivo" do Garçom só sem serviço de mesa (pendência 5).
8. Novo membro entra por convite por e-mail ou link, sem senha provisória.

## Consequências

- O app só esconde; quem barra é a RLS/RPC. Toda permissão reduzida precisa de teste no banco.
